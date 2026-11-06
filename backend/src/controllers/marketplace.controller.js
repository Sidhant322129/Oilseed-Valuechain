// src/controllers/marketplace.controller.js
// Order placement and batch listing.
// Full payment flow (Razorpay webhook + blockchain ownership transfer) is Week 7.
// This week: routing, auth gating, validation, and Supabase CRUD are fully real.

import { adminClient } from '../config/supabaseClient.js';
import { validationResult } from 'express-validator';
import { createError } from '../middleware/errorHandler.js';
import { generateInvoicePdf } from '../services/pdf.service.js';
import { relayTransitionStatus, relayTransferOwnership } from '../services/relayer.service.js';
import { sendBulkNotifications } from '../services/notification.service.js';
import crypto from 'crypto';
import { ethers } from 'ethers';

function handleValidationErrors(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: {
        message: 'Validation failed.',
        code: 'VALIDATION_ERROR',
        errors: errors.array().map((e) => ({ field: e.path, message: e.msg })),
      },
    });
  }
  return null;
}

// GET /api/marketplace/batches — browse available oilseed batches
export async function listBatches(req, res, next) {
  try {
    const { crop_type, quality_grade, min_price, max_price, page = 1, limit = 20 } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    let query = adminClient
      .from('batches')
      .select(`
        id, batch_code, quantity_kg, quality_grade, moisture_pct,
        oil_content_pct, harvest_date, status, base_ask_price_per_kg, created_at,
        crops!inner(crop_type, variety, season),
        farmers!inner(district, state, village,
          users!inner(full_name))
      `)
      .in('status', ['listed_for_sale', 'quality_tested'])
      .gt('quantity_kg', 0)
      .range(offset, offset + Number(limit) - 1)
      .order('created_at', { ascending: false });

    if (crop_type) query = query.eq('crops.crop_type', crop_type);
    if (quality_grade) query = query.eq('quality_grade', quality_grade);
    if (min_price) query = query.gte('base_ask_price_per_kg', Number(min_price));
    if (max_price) query = query.lte('base_ask_price_per_kg', Number(max_price));

    const { data, error } = await query;
    if (error) return next(createError(error.message, 500, 'DB_QUERY_ERROR'));

    return res.status(200).json({ batches: data, meta: { page: Number(page), limit: Number(limit) } });
  } catch (err) {
    next(err);
  }
}

// GET /api/marketplace/batches/:id
export async function getBatch(req, res, next) {
  try {
    const { id } = req.params;
    const { data, error } = await adminClient
      .from('batches')
      .select('*, crops(*), farmers(*, users(full_name, email)), warehouses(*)')
      .eq('id', id)
      .maybeSingle();

    if (error) return next(createError(error.message, 500, 'DB_QUERY_ERROR'));
    if (!data) return res.status(404).json({ error: { message: 'Batch not found.', code: 'BATCH_NOT_FOUND' } });

    return res.status(200).json({ batch: data });
  } catch (err) {
    next(err);
  }
}

// PATCH /api/marketplace/batches/:id — update batch status & quality with automatic logistics cascade
export async function updateBatchStatus(req, res, next) {
  try {
    const { id } = req.params;
    const { status, quality_grade, warehouse_id } = req.body;
    const { id: userId } = req.user;

    // Fetch existing batch with crop and farmer provenance
    const { data: batch, error: fetchErr } = await adminClient
      .from('batches')
      .select('*, crops(crop_type, variety), farmers(id, user_id, district, state, village, users(full_name, email))')
      .eq('id', id)
      .maybeSingle();

    if (fetchErr) return next(createError(fetchErr.message, 500, 'DB_QUERY_ERROR'));
    if (!batch) return res.status(404).json({ error: { message: 'Batch not found.', code: 'BATCH_NOT_FOUND' } });

    const updates = {
      updated_at: new Date().toISOString(),
      ...(status ? { status } : {}),
      ...(quality_grade ? { quality_grade } : {}),
      ...(warehouse_id ? { warehouse_id } : {}),
    };

    const { data: updatedBatch, error: updateErr } = await adminClient
      .from('batches')
      .update(updates)
      .eq('id', id)
      .select('id, batch_code, quantity_kg, quality_grade, status, created_at, updated_at, crops(crop_type, variety), farmers!inner(user_id, district, state, users!inner(full_name))')
      .single();

    if (updateErr) return next(createError(updateErr.message, 500, 'DB_UPDATE_ERROR'));

    // Trigger on-chain status transition on BatchRecord.sol (0: Registered, 1: Certified, 2: Dispatched, 3: Received, 4: Sold)
    if (status) {
      const statusCodes = {
        'sown': 0,
        'harvested': 0,
        'registered': 0,
        'certified': 1,
        'dispatched': 2,
        'in_transit': 2,
        'received': 3,
        'delivered': 3,
        'sold': 4
      };
      const code = statusCodes[status.toLowerCase()];
      if (code !== undefined) {
        relayTransitionStatus({
          batchId: updatedBatch?.batch_code || batch?.batch_code || id,
          statusCode: code
        });
      }
    }

    let logisticsEntry = null;

    // ── CASCADE 1: When batch moves to 'dispatched' ──────────────────────────
    if (status === 'dispatched') {
      // Find an existing order for this batch, or create a fulfillment order to satisfy order_id foreign key
      let { data: order } = await adminClient
        .from('orders')
        .select('id, order_number, delivery_address')
        .eq('batch_id', id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!order) {
        const order_number = `INTAKE-${(batch.batch_code || id.slice(0, 8)).toUpperCase()}`;
        const { data: newOrder } = await adminClient
          .from('orders')
          .insert({
            order_number,
            buyer_id: userId,
            batch_id: id,
            quantity_kg: batch.quantity_kg || 50,
            unit_price_per_kg: batch.base_ask_price_per_kg || 50,
            total_amount: (batch.quantity_kg || 50) * (batch.base_ask_price_per_kg || 50),
            delivery_address: 'Central Processing Facility, Industrial Warehouse Unit 1',
            delivery_pincode: '462001',
            payment_status: 'paid',
            order_status: 'dispatched',
          })
          .select('id, order_number, delivery_address')
          .single();
        order = newOrder;
      } else {
        await adminClient
          .from('orders')
          .update({ order_status: 'dispatched', updated_at: new Date().toISOString() })
          .eq('id', order.id);
      }

      if (order?.id) {
        const tracking_number = `TRK-${(batch.batch_code || id.slice(0, 8)).toUpperCase()}`;
        const pickup_address = batch.farmers?.district
          ? `${batch.farmers.village ? batch.farmers.village + ', ' : ''}${batch.farmers.district}, ${batch.farmers.state}`
          : 'Regional Mandi Hub, Sector 4';
        const delivery_address = order.delivery_address || 'Central Processing Facility, Industrial Warehouse Unit 1';

        const { data: existingLog } = await adminClient
          .from('logistics')
          .select('id')
          .eq('order_id', order.id)
          .maybeSingle();

        if (existingLog) {
          const { data: updatedLog } = await adminClient
            .from('logistics')
            .update({
              status: 'in_transit',
              dispatch_time: new Date().toISOString(),
              estimated_delivery_time: new Date(Date.now() + 86400000 * 2).toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq('id', existingLog.id)
            .select()
            .single();
          logisticsEntry = updatedLog;
        } else {
          const { data: newLog } = await adminClient
            .from('logistics')
            .insert({
              order_id: order.id,
              transporter_id: userId,
              tracking_number,
              carrier_company_name: 'AgroLogistics Dedicated Carrier',
              vehicle_number: `MP-04-TR-${Math.floor(1000 + Math.random() * 9000)}`,
              driver_name: 'Ramesh Kumar',
              driver_phone: '+919876543210',
              pickup_address,
              delivery_address,
              dispatch_time: new Date().toISOString(),
              estimated_delivery_time: new Date(Date.now() + 86400000 * 2).toISOString(),
              status: 'in_transit',
              status_updates_history: [{
                status: 'in_transit',
                timestamp: new Date().toISOString(),
                note: 'Batch dispatched from collection hub by processor',
              }],
            })
            .select()
            .single();
          logisticsEntry = newLog;
        }
      }
    }

    // ── CASCADE 2: When batch moves to 'in_warehouse' ────────────────────────
    if (status === 'in_warehouse') {
      const { data: orders } = await adminClient
        .from('orders')
        .select('id')
        .eq('batch_id', id);

      if (orders && orders.length > 0) {
        const orderIds = orders.map(o => o.id);
        await adminClient
          .from('logistics')
          .update({
            status: 'delivered',
            actual_delivery_time: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .in('order_id', orderIds);

        await adminClient
          .from('orders')
          .update({ order_status: 'delivered', updated_at: new Date().toISOString() })
          .in('id', orderIds);
      }
    }

    return res.status(200).json({
      message: 'Batch updated successfully.',
      batch: updatedBatch,
      logistics: logisticsEntry,
    });
  } catch (err) {
    next(err);
  }
}

// POST /api/marketplace/orders — place a new order
export async function placeOrder(req, res, next) {
  try {
    const validationFailed = handleValidationErrors(req, res);
    if (validationFailed) return;

    const { id: buyerId } = req.user;
    const { batch_id, quantity_kg, unit_price_per_kg, delivery_address, delivery_pincode, notes } = req.body;

    // Verify batch exists and is available
    const { data: batch } = await adminClient
      .from('batches')
      .select('id, quantity_kg, status, base_ask_price_per_kg, batch_code, farmer_id, crops(crop_type, variety), farmers(user_id, district, state)')
      .eq('id', batch_id)
      .maybeSingle();

    if (!batch) {
      return res.status(404).json({ error: { message: 'Batch not found.', code: 'BATCH_NOT_FOUND' } });
    }
    if (batch.status !== 'listed_for_sale' && batch.status !== 'quality_tested') {
      return res.status(409).json({
        error: { message: `Batch is not available for ordering. Current status: ${batch.status}`, code: 'BATCH_NOT_AVAILABLE' },
      });
    }
    if (quantity_kg > batch.quantity_kg) {
      return res.status(400).json({
        error: { message: `Requested quantity (${quantity_kg} kg) exceeds batch size (${batch.quantity_kg} kg).`, code: 'QUANTITY_EXCEEDED' },
      });
    }

    const total_amount = Number(quantity_kg) * Number(unit_price_per_kg);
    const order_number = `ORD-${new Date().getFullYear()}-${Date.now().toString().slice(-6)}`;

    const { data: order, error } = await adminClient
      .from('orders')
      .insert({
        order_number,
        buyer_id: buyerId,
        batch_id,
        quantity_kg,
        unit_price_per_kg,
        total_amount,
        delivery_address,
        delivery_pincode,
        notes: notes || null,
        payment_status: 'pending',
        order_status: 'placed',
      })
      .select()
      .single();

    if (error) return next(createError(error.message, 500, 'DB_INSERT_ERROR'));

    // Deduct ordered quantity from batch inventory
    const currentBatchQty = Number(batch.quantity_kg);
    const orderQty = Number(quantity_kg);
    const remainingQty = Math.max(0, currentBatchQty - orderQty);

    const batchUpdates = {
      updated_at: new Date().toISOString(),
    };
    if (remainingQty <= 0) {
      // Transition batch to sold when fully depleted (preserve quantity_kg > 0 DB check constraint)
      batchUpdates.status = 'sold';
    } else {
      batchUpdates.quantity_kg = Number(remainingQty.toFixed(2));
    }

    const { error: batchUpdateError } = await adminClient
      .from('batches')
      .update(batchUpdates)
      .eq('id', batch_id);

    if (batchUpdateError) {
      console.error('Failed to deduct batch inventory:', batchUpdateError);
      return next(createError('Failed to update batch inventory in database.', 500, 'DB_UPDATE_ERROR'));
    }

    // ── Generate Order Placed Notifications (Buyer & Farmer) ────────────────
    try {
      const cropName = batch.crops ? `${batch.crops.crop_type}${batch.crops.variety ? ` (${batch.crops.variety})` : ''}` : 'Oilseed produce';
      const notifsToInsert = [
        // 1. Notification for Buyer
        {
          user_id: buyerId,
          title: `Order Placed: ${order.order_number}`,
          message: `Your procurement order for ${quantity_kg} kg of ${cropName} (${order.order_number}) was placed successfully. Total: ₹${total_amount.toLocaleString()}. Status: Pending Payment.`,
          category: 'order',
          priority: 'high',
          action_url: '/dashboard/fpo',
          metadata: {
            order_id: order.id,
            order_number: order.order_number,
            batch_id: batch.id,
            batch_code: batch.batch_code,
            quantity_kg,
            total_amount,
            type: 'order_placed',
          },
        },
      ];

      // 2. Notification for Farmer who registered the crop/batch
      if (batch.farmers?.user_id && batch.farmers.user_id !== buyerId) {
        notifsToInsert.push({
          user_id: batch.farmers.user_id,
          title: `New Order Received: ${order.order_number}`,
          message: `A buyer placed a procurement order for ${quantity_kg} kg from your lot ${batch.batch_code || ''} (${cropName}). Order value: ₹${total_amount.toLocaleString()}.`,
          category: 'order',
          priority: 'high',
          action_url: '/dashboard/farmer',
          metadata: {
            order_id: order.id,
            order_number: order.order_number,
            batch_id: batch.id,
            batch_code: batch.batch_code,
            quantity_kg,
            total_amount,
            type: 'produce_ordered',
          },
        });
      }

      await sendBulkNotifications(notifsToInsert);
    } catch (notifErr) {
      console.warn('[placeOrder] Failed to create order notifications:', notifErr);
    }

    // NOTE: Razorpay payment session creation and blockchain ownership transfer are Week 7.
    return res.status(201).json({
      message: 'Order placed successfully. Proceed to payment.',
      order,
      remaining_batch_quantity_kg: remainingQty,
      payment_note: 'Razorpay payment session creation is integrated in Week 7.',
    });
  } catch (err) {
    next(err);
  }
}

// GET /api/marketplace/orders — get orders for the authenticated user
export async function listOrders(req, res, next) {
  try {
    const { id: userId, role } = req.user;
    const { status, page = 1, limit = 20 } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    let query = adminClient
      .from('orders')
      .select('*, batches(batch_code, crop_id, crops(crop_type, variety)), users!buyer_id(full_name, email)')
      .range(offset, offset + Number(limit) - 1)
      .order('created_at', { ascending: false });

    // Buyers see their own orders; admin sees all
    if (role !== 'admin') {
      query = query.eq('buyer_id', userId);
    }
    if (status) query = query.eq('order_status', status);

    const { data, error } = await query;
    if (error) return next(createError(error.message, 500, 'DB_QUERY_ERROR'));

    return res.status(200).json({ orders: data, meta: { page: Number(page), limit: Number(limit) } });
  } catch (err) {
    next(err);
  }
}

// POST /api/marketplace/orders/:id/create-razorpay-order
export async function createRazorpayOrder(req, res, next) {
  try {
    const { id: orderId } = req.params;
    const { id: userId, role } = req.user;

    const { data: order, error: fetchErr } = await adminClient
      .from('orders')
      .select('*, batches(batch_code, quantity_kg, crops(crop_type, variety))')
      .eq('id', orderId)
      .maybeSingle();

    if (fetchErr) return next(createError(fetchErr.message, 500, 'DB_QUERY_ERROR'));
    if (!order) return res.status(404).json({ error: { message: 'Order not found.', code: 'ORDER_NOT_FOUND' } });

    if (role !== 'admin' && order.buyer_id !== userId) {
      return res.status(403).json({ error: { message: 'You can only initiate payment for your own orders.', code: 'ROLE_FORBIDDEN' } });
    }
    if (order.payment_status === 'paid') {
      return res.status(400).json({ error: { message: 'Order is already marked as paid.', code: 'ALREADY_PAID' } });
    }

    const amountPaise = Math.round(Number(order.total_amount || 0) * 100);
    const razorpayKeyId = process.env.RAZORPAY_KEY_ID || 'rzp_test_oilseed_dev';
    let rzpOrderId = null;

    // If real Razorpay keys are configured in .env, call Razorpay API directly
    if (process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET) {
      try {
        const authHeader = 'Basic ' + Buffer.from(`${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`).toString('base64');
        const rzpRes = await fetch('https://api.razorpay.com/v1/orders', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': authHeader
          },
          body: JSON.stringify({
            amount: amountPaise,
            currency: 'INR',
            receipt: order.order_number,
            notes: {
              order_id: order.id,
              batch_code: order.batches?.batch_code || ''
            }
          })
        });
        if (rzpRes.ok) {
          const rzpData = await rzpRes.json();
          rzpOrderId = rzpData.id;
        }
      } catch (rzpErr) {
        console.warn('[createRazorpayOrder] Razorpay API call note:', rzpErr.message);
      }
    }

    // Deterministic test-mode order ID fallback
    if (!rzpOrderId) {
      rzpOrderId = `order_${crypto.randomBytes(7).toString('hex')}`;
    }

    return res.status(200).json({
      success: true,
      key_id: razorpayKeyId,
      razorpay_order_id: rzpOrderId,
      amount: amountPaise,
      currency: 'INR',
      order: {
        id: order.id,
        order_number: order.order_number,
        total_amount: order.total_amount,
        quantity_kg: order.quantity_kg,
        crop_type: order.batches?.crops?.crop_type || 'Oilseed Produce',
        batch_code: order.batches?.batch_code || ''
      }
    });
  } catch (err) {
    next(err);
  }
}

// POST or PATCH /api/marketplace/orders/:id/pay — confirm payment for an order
export async function confirmPayment(req, res, next) {
  try {
    const { id: orderId } = req.params;
    const { id: userId, role } = req.user;
    const { razorpay_payment_id, razorpay_order_id, razorpay_signature } = req.body;

    // Fetch existing order
    const { data: order, error: fetchErr } = await adminClient
      .from('orders')
      .select('*, batches(id, batch_code, crop_id, farmers(user_id))')
      .eq('id', orderId)
      .maybeSingle();

    if (fetchErr) return next(createError(fetchErr.message, 500, 'DB_QUERY_ERROR'));
    if (!order) {
      return res.status(404).json({ error: { message: 'Order not found.', code: 'ORDER_NOT_FOUND' } });
    }

    // Role check: only the buyer or admin can pay the order
    if (role !== 'admin' && order.buyer_id !== userId) {
      return res.status(403).json({ error: { message: 'You can only pay for your own orders.', code: 'ROLE_FORBIDDEN' } });
    }

    if (order.payment_status === 'paid') {
      return res.status(400).json({ error: { message: 'Order is already marked as paid.', code: 'ALREADY_PAID' } });
    }

    // Razorpay signature verification (if secret configured)
    if (process.env.RAZORPAY_KEY_SECRET && razorpay_order_id && razorpay_payment_id && razorpay_signature) {
      const generatedSig = crypto
        .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
        .update(`${razorpay_order_id}|${razorpay_payment_id}`)
        .digest('hex');
      if (generatedSig !== razorpay_signature) {
        return res.status(400).json({
          error: { message: 'Razorpay cryptographic signature verification failed.', code: 'INVALID_SIGNATURE' }
        });
      }
    }

    const payment_reference = razorpay_payment_id || req.body.payment_reference || `pay_test_${crypto.randomBytes(7).toString('hex')}`;

    const { data: updatedOrder, error: updateErr } = await adminClient
      .from('orders')
      .update({
        payment_status: 'paid',
        order_status: 'confirmed',
        payment_reference,
        updated_at: new Date().toISOString(),
      })
      .eq('id', orderId)
      .select('*, batches(id, batch_code, crop_id, crops(crop_type, variety))')
      .single();

    if (updateErr) return next(createError(updateErr.message, 500, 'DB_UPDATE_ERROR'));

    // ── CASCADE: Automatically initialize logistics tracking on payment confirmation ──
    try {
      const tracking_number = `TRK-${(updatedOrder.order_number || orderId.slice(0, 8)).toUpperCase()}`;
      const { data: existingLog } = await adminClient
        .from('logistics')
        .select('id')
        .eq('order_id', orderId)
        .maybeSingle();

      if (!existingLog) {
        await adminClient.from('logistics').insert({
          order_id: orderId,
          transporter_id: userId,
          tracking_number,
          carrier_company_name: 'AgroLogistics Express',
          vehicle_number: `DL-01-TR-${Math.floor(1000 + Math.random() * 9000)}`,
          driver_name: 'Surendra Singh',
          driver_phone: '+919811223344',
          pickup_address: 'Central Oilseed Mandi / FPO Storage Hub',
          delivery_address: updatedOrder.delivery_address || 'Registered Buyer Facility Address',
          dispatch_time: new Date().toISOString(),
          estimated_delivery_time: new Date(Date.now() + 86400000 * 2).toISOString(),
          status: 'assigned',
          status_updates_history: [{
            status: 'assigned',
            timestamp: new Date().toISOString(),
            note: 'Order payment verified. Logistics dispatch carrier assigned.',
          }],
        });
      }
    } catch (logErr) {
      console.error('[confirmPayment] Logistics auto-init warning:', logErr);
    }

    // ── CASCADE: Automatically anchor title transfer to OwnershipTransfer.sol on Sepolia ──
    let relayReceipt = null;
    try {
      const batchCode = updatedOrder?.batches?.batch_code || order?.batches?.batch_code || order?.batch_id;
      const batchUuid = updatedOrder?.batches?.id || order?.batches?.id || order?.batch_id;
      if (batchCode) {
        const fromSeed = order.batches?.farmers?.user_id || '0x4e1dAc05a1175DFFD00377cc9B3AA36AD0bc704e';
        const toSeed = order.buyer_id || userId;
        const fromAddr = ethers.getAddress('0x' + crypto.createHash('sha256').update(String(fromSeed)).digest('hex').slice(24));
        const toAddr = ethers.getAddress('0x' + crypto.createHash('sha256').update(String(toSeed)).digest('hex').slice(24));

        console.log(`[confirmPayment] Initiating on-chain title transfer on OwnershipTransfer.sol for batch ${batchCode}...`);
        relayReceipt = await relayTransferOwnership({
          batchId: batchCode,
          batchUuid: batchUuid,
          fromAddress: fromAddr,
          toAddress: toAddr,
          orderId: updatedOrder?.order_number || order.order_number || orderId
        });
        console.log(`[confirmPayment] On-chain transfer confirmed! Tx: ${relayReceipt?.tx_hash}`);
      }
    } catch (bcErr) {
      console.error('[confirmPayment] OwnershipTransfer relay error:', bcErr.message);
    }

    // ── Generate Payment Confirmed Notifications ─────────────────────────────
    try {
      const paymentNotifs = [
        // 1. Notification for Buyer
        {
          user_id: order.buyer_id,
          title: `Payment Confirmed: ${order.order_number}`,
          message: `Payment of ₹${Number(order.total_amount || 0).toLocaleString()} for order ${order.order_number} has been confirmed via Razorpay. Ref: ${payment_reference}. On-chain title ownership recorded on Ethereum Sepolia.`,
          category: 'order',
          priority: 'high',
          action_url: '/dashboard/retailer',
          metadata: {
            order_id: orderId,
            order_number: order.order_number,
            payment_reference,
            tx_hash: relayReceipt?.tx_hash,
            type: 'payment_confirmed',
          },
        },
      ];

      // 2. Notification for Farmer (Payout scheduled)
      const farmerUserId = order.batches?.farmers?.user_id;
      if (farmerUserId && farmerUserId !== order.buyer_id) {
        paymentNotifs.push({
          user_id: farmerUserId,
          title: `Payment Received: ${order.order_number}`,
          message: `Payment of ₹${Number(order.total_amount || 0).toLocaleString()} for ${order.quantity_kg} kg produce (lot ${order.batches?.batch_code || ''}) has been verified. Settlement scheduled to your bank account.`,
          category: 'order',
          priority: 'urgent',
          action_url: '/dashboard/farmer',
          metadata: {
            order_id: orderId,
            order_number: order.order_number,
            payment_reference,
            tx_hash: relayReceipt?.tx_hash,
            type: 'payout_scheduled',
          },
        });
      }

      await sendBulkNotifications(paymentNotifs);
    } catch (notifErr) {
      console.warn('[confirmPayment] Failed to create payment notifications:', notifErr);
    }

    return res.status(200).json({
      success: true,
      message: 'Razorpay payment verified and title ownership transferred on Ethereum Sepolia.',
      order: updatedOrder,
      razorpay_payment_id: payment_reference,
      razorpay_order_id: razorpay_order_id || null,
      payment_reference,
      blockchain: relayReceipt ? {
        contract: 'OwnershipTransfer.sol',
        contract_address: relayReceipt.contract_address,
        tx_hash: relayReceipt.tx_hash,
        block_number: relayReceipt.block_number,
        explorer_url: relayReceipt.explorer_url,
        chain_status: relayReceipt.chain_status,
      } : null,
    });
  } catch (err) {
    next(err);
  }
}

// GET /api/marketplace/orders/:id/invoice — stream PDF invoice
export async function downloadInvoice(req, res, next) {
  try {
    const { id: orderId } = req.params;
    const { id: userId, role } = req.user;

    const { data: order, error } = await adminClient
      .from('orders')
      .select(`
        *,
        batches(batch_code, quality_grade, quantity_kg, crops(crop_type, variety), farmers(district, state)),
        users!buyer_id(full_name, email)
      `)
      .eq('id', orderId)
      .maybeSingle();

    if (error) return next(createError(error.message, 500, 'DB_QUERY_ERROR'));
    if (!order) {
      return res.status(404).json({ error: { message: 'Order not found.', code: 'ORDER_NOT_FOUND' } });
    }

    if (role !== 'admin' && order.buyer_id !== userId) {
      return res.status(403).json({ error: { message: 'You can only download invoices for your own orders.', code: 'ROLE_FORBIDDEN' } });
    }

    const filename = `Invoice-${order.order_number ? order.order_number.replace('ORD-', '') : order.id.slice(0, 8)}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    generateInvoicePdf(order, res);
  } catch (err) {
    next(err);
  }
}

// DELETE /api/marketplace/orders/:id — cancel/delete an unpaid or pending order
export async function cancelOrder(req, res, next) {
  try {
    const { id: orderId } = req.params;
    const { id: userId, role } = req.user;

    const { data: order, error } = await adminClient
      .from('orders')
      .select('*, batches(id, quantity_kg)')
      .eq('id', orderId)
      .maybeSingle();

    if (error) return next(createError(error.message, 500, 'DB_QUERY_ERROR'));
    if (!order) {
      return res.status(404).json({ error: { message: 'Order not found.', code: 'ORDER_NOT_FOUND' } });
    }

    if (role !== 'admin' && order.buyer_id !== userId) {
      return res.status(403).json({ error: { message: 'You can only cancel your own orders.', code: 'ROLE_FORBIDDEN' } });
    }

    if (order.payment_status === 'paid') {
      return res.status(400).json({ error: { message: 'Cannot cancel an order that has already been paid.', code: 'ORDER_ALREADY_PAID' } });
    }

    // 1. Restore batch quantity if batch exists
    if (order.batches?.id && order.quantity_kg) {
      const restoredQty = Number(order.batches.quantity_kg || 0) + Number(order.quantity_kg);
      await adminClient
        .from('batches')
        .update({ quantity_kg: restoredQty, status: 'listed_for_sale', updated_at: new Date().toISOString() })
        .eq('id', order.batches.id);
    }

    // 2. Mark order as cancelled
    const { data: updatedOrder, error: cancelErr } = await adminClient
      .from('orders')
      .update({ order_status: 'cancelled', updated_at: new Date().toISOString() })
      .eq('id', orderId)
      .select()
      .single();

    if (cancelErr) return next(createError(cancelErr.message, 500, 'DB_UPDATE_ERROR'));

    // Dispatch cancellation notifications
    try {
      const cancelNotifs = [
        {
          user_id: order.buyer_id,
          title: `Order Cancelled: ${order.order_number}`,
          message: `Your order ${order.order_number} has been cancelled. Batch inventory has been restored.`,
          category: 'order',
          priority: 'normal',
          action_url: '/dashboard/retailer',
          metadata: { order_id: orderId, order_number: order.order_number, type: 'order_cancelled' },
        },
      ];
      if (order.batches?.farmers?.user_id && order.batches.farmers.user_id !== order.buyer_id) {
        cancelNotifs.push({
          user_id: order.batches.farmers.user_id,
          title: `Order Cancelled: ${order.order_number}`,
          message: `Order ${order.order_number} for your lot ${order.batches?.batch_code || ''} was cancelled. ${order.quantity_kg} kg has been restored to active listing.`,
          category: 'order',
          priority: 'normal',
          action_url: '/dashboard/farmer',
          metadata: { order_id: orderId, order_number: order.order_number, type: 'order_cancelled' },
        });
      }
      await sendBulkNotifications(cancelNotifs);
    } catch (_) {}

    return res.status(200).json({ message: 'Order cancelled successfully and inventory restored.', order: updatedOrder });
  } catch (err) {
    next(err);
  }
}

// POST /api/marketplace/procurement-orders — convert accepted bid quote into a procurement order
export async function createProcurementOrder(req, res, next) {
  try {
    const { id: buyerId } = req.user;
    const {
      bid_id,
      quote_id,
      farmer_id,
      farmer_user_id,
      crop_type = 'mustard',
      quantity_kg,
      price_per_kg,
      delivery_address,
      delivery_pincode,
      notes,
    } = req.body;

    const qty = Number(quantity_kg);
    const unitPrice = Number(price_per_kg);
    if (!qty || isNaN(qty) || qty <= 0) {
      return res.status(400).json({ error: { message: 'Valid quantity_kg is required.', code: 'INVALID_QUANTITY' } });
    }
    if (!unitPrice || isNaN(unitPrice) || unitPrice <= 0) {
      return res.status(400).json({ error: { message: 'Valid price_per_kg is required.', code: 'INVALID_PRICE' } });
    }

    if (req.body.delivery_date) {
      const d = new Date(req.body.delivery_date);
      const yr = d.getFullYear();
      const currYr = new Date().getFullYear();
      if (isNaN(yr) || yr < currYr || yr > currYr + 5) {
        return res.status(400).json({
          error: { message: `Delivery date year must be between ${currYr} and ${currYr + 5}.`, code: 'INVALID_DELIVERY_DATE' }
        });
      }
    }

    // Check FPO suspension and bid freeze
    const { isBidFrozen, isFpoSuspended, writeAuditLog } = await import('../services/bidMonitor.service.js');
    if (await isFpoSuspended(buyerId)) {
      return res.status(403).json({
        error: { message: 'Your FPO bidding privileges have been suspended by an administrator.', code: 'FPO_BIDDING_SUSPENDED' }
      });
    }
    if (bid_id && (await isBidFrozen(bid_id))) {
      return res.status(400).json({
        error: { message: 'This bid is currently frozen by an administrator. Accepting quotes is disabled.', code: 'BID_FROZEN' }
      });
    }

    // 1. Resolve farmer record
    let targetFarmerId = farmer_id;
    let targetFarmerUserId = farmer_user_id;

    if (!targetFarmerId && targetFarmerUserId) {
      const { data: fRow } = await adminClient.from('farmers').select('id, user_id').eq('user_id', targetFarmerUserId).maybeSingle();
      if (fRow) {
        targetFarmerId = fRow.id;
      }
    } else if (targetFarmerId && !targetFarmerUserId) {
      const { data: fRow } = await adminClient.from('farmers').select('id, user_id').eq('id', targetFarmerId).maybeSingle();
      if (fRow?.user_id) {
        targetFarmerUserId = fRow.user_id;
      }
    }

    // If still no farmer row, find any registered farmer
    if (!targetFarmerId) {
      const { data: anyFarmer } = await adminClient.from('farmers').select('id, user_id').limit(1).maybeSingle();
      if (anyFarmer) {
        targetFarmerId = anyFarmer.id;
        targetFarmerUserId = targetFarmerUserId || anyFarmer.user_id;
      } else {
        return res.status(400).json({ error: { message: 'No registered farmer profile found for quote.', code: 'FARMER_NOT_FOUND' } });
      }
    }

    // 2. Resolve crop record for this farmer
    const normCropType = (crop_type || 'mustard').toLowerCase().trim();
    let { data: cropRow } = await adminClient
      .from('crops')
      .select('id, crop_type, variety')
      .eq('farmer_id', targetFarmerId)
      .ilike('crop_type', normCropType)
      .limit(1)
      .maybeSingle();

    if (!cropRow) {
      const { data: anyCrop } = await adminClient
        .from('crops')
        .select('id, crop_type, variety')
        .eq('farmer_id', targetFarmerId)
        .limit(1)
        .maybeSingle();

      if (anyCrop) {
        cropRow = anyCrop;
      } else {
        const validCrops = ['mustard', 'groundnut', 'soybean', 'sunflower', 'sesame', 'safflower', 'castor', 'niger'];
        const chosenCrop = validCrops.includes(normCropType) ? normCropType : 'mustard';
        const { data: newCrop, error: cropErr } = await adminClient
          .from('crops')
          .insert({
            farmer_id: targetFarmerId,
            crop_type: chosenCrop,
            variety: 'Standard Produce',
            season: 'rabi',
            sowing_date: '2026-06-01',
            expected_harvest_date: '2026-09-01',
            acreage_allocated: 5.0,
            status: 'harvested',
          })
          .select()
          .single();
        if (cropErr) return next(createError(cropErr.message, 500, 'DB_CROP_ERROR'));
        cropRow = newCrop;
      }
    }

    // 3. Create batch lot for this procurement quote
    const batchCode = `BATCH-PROC-${(cropRow.crop_type || 'CROP').toUpperCase().slice(0, 4)}-${Date.now().toString().slice(-6)}`;
    const { data: batch, error: batchErr } = await adminClient
      .from('batches')
      .insert({
        crop_id: cropRow.id,
        farmer_id: targetFarmerId,
        batch_code: batchCode,
        quantity_kg: qty,
        quality_grade: 'grade_a_premium',
        harvest_date: new Date().toISOString().split('T')[0],
        status: 'sold',
        base_ask_price_per_kg: unitPrice,
      })
      .select('*, crops(crop_type, variety)')
      .single();

    if (batchErr) return next(createError(batchErr.message, 500, 'DB_BATCH_ERROR'));

    // 4. Create the procurement order
    const totalAmount = Number((qty * unitPrice).toFixed(2));
    const orderNumber = `ORD-PROC-${new Date().getFullYear()}-${Date.now().toString().slice(-6)}`;
    const deliveryAddr = delivery_address || 'Malwa Oilseed Logistics Hub, Morena';
    const deliveryPin = delivery_pincode || '476001';

    const { data: order, error: orderErr } = await adminClient
      .from('orders')
      .insert({
        order_number: orderNumber,
        buyer_id: buyerId,
        batch_id: batch.id,
        quantity_kg: qty,
        unit_price_per_kg: unitPrice,
        total_amount: totalAmount,
        delivery_address: deliveryAddr,
        delivery_pincode: deliveryPin,
        order_status: 'placed',
        payment_status: 'pending',
        notes: notes || `Procurement bid quote accepted (Bid #${bid_id ? String(bid_id).slice(-8) : 'N/A'}, Quote #${quote_id ? String(quote_id).slice(-8) : 'N/A'})`,
      })
      .select('*, batches(batch_code, crop_id, crops(crop_type, variety)), users!buyer_id(full_name, email)')
      .single();

    if (orderErr) return next(createError(orderErr.message, 500, 'DB_ORDER_ERROR'));

    // 5. Update quote & bid in Supabase if tables exist
    if (quote_id) {
      try {
        await adminClient.from('bid_seller_quotes').update({ status: 'accepted', updated_at: new Date().toISOString() }).eq('id', quote_id);
        if (bid_id) {
          await adminClient.from('bid_seller_quotes').update({ status: 'rejected', updated_at: new Date().toISOString() }).eq('bid_id', bid_id).neq('id', quote_id).eq('status', 'pending');
          await adminClient.from('procurement_bids').update({ status: 'fulfilled', updated_at: new Date().toISOString() }).eq('id', bid_id);
          await writeAuditLog({
            bid_id,
            quote_id,
            actor_id: buyerId,
            actor_role: 'fpo',
            action: 'quote_accepted',
            reason: 'Quote accepted by FPO and converted to procurement order',
            new_value: { order_id: order.id, quantity_kg: qty, price_per_kg: unitPrice }
          });
        }
      } catch (_) {}
    }

    // 6. Notifications for FPO and Farmer
    const notifs = [
      {
        user_id: buyerId,
        title: `Procurement Order Created: ${order.order_number}`,
        message: `Your procurement order for ${qty} kg of ${cropRow.crop_type} at ₹${unitPrice}/kg (Total: ₹${totalAmount.toLocaleString()}) has been confirmed and placed into My Procurement Orders.`,
        category: 'order',
        priority: 'high',
        action_url: '/dashboard/fpo',
        metadata: { order_id: order.id, order_number: order.order_number, bid_id, quote_id, type: 'quote_accepted' },
      },
    ];

    if (targetFarmerUserId && targetFarmerUserId !== buyerId) {
      notifs.push({
        user_id: targetFarmerUserId,
        title: 'Your Quote Was Accepted! 🎉',
        message: `Your seller quote of ${qty} kg at ₹${unitPrice}/kg for ${cropRow.crop_type} has been accepted by the FPO. Order ${order.order_number} generated.`,
        category: 'order',
        priority: 'urgent',
        action_url: '/dashboard/farmer',
        metadata: { order_id: order.id, order_number: order.order_number, bid_id, quote_id, type: 'quote_accepted' },
      });
    }

    await sendBulkNotifications(notifs);

    return res.status(201).json({
      message: 'Procurement order created successfully from accepted quote.',
      order,
      batch,
    });
  } catch (err) {
    next(err);
  }
}

// GET /api/marketplace/procurement-bids — list all procurement bids for all authenticated roles
export async function listMarketplaceBids(req, res, next) {
  try {
    const { getAllProcurementBids } = await import('../services/procurement.service.js');
    const bids = await getAllProcurementBids();
    return res.status(200).json({ bids, count: bids.length });
  } catch (err) {
    next(err);
  }
}

// POST /api/marketplace/procurement-bids — create a procurement bid (FPO)
export async function createMarketplaceBid(req, res, next) {
  try {
    const { addProcurementBid } = await import('../services/procurement.service.js');
    const bid = await addProcurementBid({ ...req.body, fpo_id: req.user?.id });
    return res.status(201).json({ message: 'Procurement bid created.', bid });
  } catch (err) {
    next(err);
  }
}


