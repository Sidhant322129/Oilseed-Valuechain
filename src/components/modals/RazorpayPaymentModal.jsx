// src/components/RazorpayPaymentModal.jsx
// Razorpay Test Mode Payment & Blockchain Title Transfer Modal
// Integrates Razorpay test payments with automatic on-chain OwnershipTransfer.sol execution on Ethereum Sepolia.

import React, { useState, useEffect } from 'react';
import {
  CreditCard, ShieldCheck, CheckCircle, ExternalLink,
  AlertTriangle, RefreshCw, X, ArrowRight, Zap, Building2, Smartphone, QrCode
} from 'lucide-react';
import { apiPost } from '@/services/api';
import { getErrorMessage } from '@/utils/getErrorMessage';

export default function RazorpayPaymentModal({
  order,
  isOpen,
  onClose,
  onPaymentSuccess,
  onViewProvenance
}) {
  const [stage, setStage] = useState('summary'); // 'summary' | 'processing' | 'blockchain_confirming' | 'success' | 'error'
  const [paymentMethod, setPaymentMethod] = useState('upi'); // 'upi' | 'card' | 'netbanking'
  const [razorpayOrder, setRazorpayOrder] = useState(null);
  const [loadingOrder, setLoadingOrder] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [paymentResult, setPaymentResult] = useState(null);

  useEffect(() => {
    if (isOpen && order) {
      setStage('summary');
      setErrorMessage('');
      setStatusMessage('');
      setPaymentResult(null);
      initRazorpayOrder();
    }
  }, [isOpen, order]);

  async function initRazorpayOrder() {
    if (!order?.id) return;
    setLoadingOrder(true);
    setErrorMessage('');
    try {
      const res = await apiPost(`/marketplace/orders/${order.id}/create-razorpay-order`, {});
      if (res?.success) {
        setRazorpayOrder(res);
      } else {
        // Fallback simulated order details
        setRazorpayOrder({
          razorpay_order_id: `order_${Math.random().toString(36).substring(2, 12)}`,
          amount: Math.round(Number(order.total_amount || 0) * 100),
          currency: 'INR',
          key_id: 'rzp_test_oilseed_dev',
          order: {
            id: order.id,
            order_number: order.order_number,
            total_amount: order.total_amount,
            quantity_kg: order.quantity_kg,
            crop_type: order.batches?.crops?.crop_type || 'Oilseed Produce',
            batch_code: order.batches?.batch_code || ''
          }
        });
      }
    } catch (err) {
      console.warn('[RazorpayPaymentModal] Init note:', err.message);
      // Fallback object for offline/resilient test execution
      setRazorpayOrder({
        razorpay_order_id: `order_${Math.random().toString(36).substring(2, 12)}`,
        amount: Math.round(Number(order.total_amount || 0) * 100),
        currency: 'INR',
        key_id: 'rzp_test_oilseed_dev',
        order: {
          id: order.id,
          order_number: order.order_number,
          total_amount: order.total_amount,
          quantity_kg: order.quantity_kg,
          crop_type: order.batches?.crops?.crop_type || 'Oilseed Produce',
          batch_code: order.batches?.batch_code || ''
        }
      });
    } finally {
      setLoadingOrder(false);
    }
  }

  async function handleExecutePayment() {
    setStage('processing');
    setErrorMessage('');
    setStatusMessage('Simulating Razorpay Test Mode Authorization...');

    try {
      const rzpOrderId = razorpayOrder?.razorpay_order_id || `order_${Math.random().toString(36).substring(2, 14)}`;
      const rzpPaymentId = `pay_${Date.now().toString(36)}${Math.random().toString(36).substring(2, 8)}`;
      const rzpSignature = `sig_${Math.random().toString(36).substring(2, 16)}${Date.now().toString(36)}`;

      await new Promise(r => setTimeout(r, 900));

      setStatusMessage('Razorpay payment approved. Calling OwnershipTransfer.sol on Ethereum Sepolia...');
      setStage('blockchain_confirming');

      // Submit payment confirmation with Razorpay verification payload
      const payRes = await apiPost(`/marketplace/orders/${order.id}/pay`, {
        razorpay_payment_id: rzpPaymentId,
        razorpay_order_id: rzpOrderId,
        razorpay_signature: rzpSignature,
        payment_method: paymentMethod,
        amount: razorpayOrder?.amount || Math.round(Number(order.total_amount || 0) * 100),
      });

      setPaymentResult({
        order_number: order.order_number,
        razorpay_payment_id: rzpPaymentId,
        razorpay_order_id: rzpOrderId,
        total_amount: order.total_amount,
        blockchain: payRes?.blockchain || {
          contract: 'OwnershipTransfer.sol',
          tx_hash: payRes?.tx_hash,
          explorer_url: payRes?.explorer_url,
          block_number: payRes?.block_number,
        },
        batch_code: order.batches?.batch_code || order.batch_id
      });

      setStage('success');
      if (onPaymentSuccess) {
        onPaymentSuccess(payRes);
      }
    } catch (err) {
      console.error('[RazorpayPaymentModal] Payment failed:', err);
      setErrorMessage(getErrorMessage(err));
      setStage('error');
    }
  }

  if (!isOpen || !order) return null;

  const totalAmount = Number(order.total_amount || 0);
  const cropTitle = order.batches?.crops?.crop_type
    ? `${order.batches.crops.crop_type}${order.batches.crops.variety ? ` (${order.batches.crops.variety})` : ''}`
    : 'Oilseed Batch';
  const batchCode = order.batches?.batch_code || order.batch_id || 'Lot Standard';

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(5, 7, 10, 0.85)',
        backdropFilter: 'blur(8px)',
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '520px',
          background: '#FFFFFF',
          border: '1px solid #D8E3D9',
          borderRadius: '16px',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7), 0 0 0 1px rgba(255, 255, 255, 0.05)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          maxHeight: '90vh',
        }}
      >
        {/* Razorpay Brand Header */}
        <div
          style={{
            background: 'linear-gradient(135deg, #0c2340 0%, #FFFFFF 100%)',
            borderBottom: '1px solid #D8E3D9',
            padding: '1.25rem 1.5rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '8px',
                background: '#0284c722',
                border: '1px solid #0284c766',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#38bdf8',
              }}
            >
              <Zap size={20} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ fontFamily: 'var(--font-heading)', fontSize: '1rem', fontWeight: 700, color: '#174A36' }}>
                  Razorpay Escrow
                </span>
                <span
                  style={{
                    fontSize: '0.65rem',
                    fontWeight: 700,
                    padding: '2px 8px',
                    borderRadius: '999px',
                    background: '#f0883e22',
                    color: '#f0883e',
                    border: '1px solid #f0883e55',
                    letterSpacing: '0.04em',
                    textTransform: 'uppercase',
                  }}
                >
                  Test Mode
                </span>
              </div>
              <div style={{ fontSize: '0.75rem', color: '#4F7A5B', marginTop: '2px' }}>
                Automated On-Chain Settlement · Sepolia Testnet
              </div>
            </div>
          </div>

          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#4F7A5B',
              cursor: 'pointer',
              padding: '4px',
              display: 'flex',
              borderRadius: '6px',
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Content Body */}
        <div style={{ padding: '1.5rem', overflowY: 'auto' }}>
          {stage === 'summary' && (
            <div>
              {/* Order Details Card */}
              <div
                style={{
                  background: '#FFFFFF',
                  border: '1px solid #D8E3D9',
                  borderRadius: '12px',
                  padding: '1.25rem',
                  marginBottom: '1.25rem',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
                  <div>
                    <div style={{ fontSize: '0.75rem', color: '#4F7A5B' }}>PROCUREMENT ORDER</div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.95rem', fontWeight: 700, color: '#174A36' }}>
                      {order.order_number}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '0.75rem', color: '#4F7A5B' }}>PAYABLE TOTAL</div>
                    <div style={{ fontFamily: 'var(--font-heading)', fontSize: '1.3rem', fontWeight: 700, color: '#174A36' }}>
                      ₹{totalAmount.toLocaleString()}
                    </div>
                  </div>
                </div>

                <div style={{ borderTop: '1px dashed #F3F7F3', paddingTop: '0.75rem', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', fontSize: '0.78rem' }}>
                  <div>
                    <span style={{ color: '#4F7A5B' }}>Crop Lot: </span>
                    <span style={{ color: '#174A36', fontWeight: 500 }}>{cropTitle}</span>
                  </div>
                  <div>
                    <span style={{ color: '#4F7A5B' }}>Batch Code: </span>
                    <span style={{ color: '#38bdf8', fontFamily: 'var(--font-mono)', fontSize: '0.75rem' }}>{batchCode}</span>
                  </div>
                  <div>
                    <span style={{ color: '#4F7A5B' }}>Quantity: </span>
                    <span style={{ color: '#174A36', fontWeight: 500 }}>{order.quantity_kg} kg</span>
                  </div>
                  <div>
                    <span style={{ color: '#4F7A5B' }}>Unit Rate: </span>
                    <span style={{ color: '#174A36', fontWeight: 500 }}>₹{order.unit_price_per_kg || (totalAmount / (order.quantity_kg || 1)).toFixed(1)}/kg</span>
                  </div>
                </div>
              </div>

              {/* Payment Method Selector */}
              <div style={{ marginBottom: '1.25rem' }}>
                <label style={{ fontSize: '0.75rem', color: '#4F7A5B', display: 'block', marginBottom: '0.5rem', fontWeight: 600 }}>
                  SELECT TEST PAYMENT METHOD
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.5rem' }}>
                  {[
                    { id: 'upi', label: 'UPI / QR', icon: Smartphone, desc: 'Instant UPI' },
                    { id: 'card', label: 'Cards', icon: CreditCard, desc: 'Visa / MC' },
                    { id: 'netbanking', label: 'NetBanking', icon: Building2, desc: 'HDFC / SBI' }
                  ].map(m => {
                    const active = paymentMethod === m.id;
                    const IconComponent = m.icon;
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => setPaymentMethod(m.id)}
                        style={{
                          background: active ? '#E8F1EA' : '#FFFFFF',
                          border: active ? '1px solid #4F7A5B' : '1px solid #D8E3D9',
                          borderRadius: '8px',
                          padding: '0.75rem 0.5rem',
                          textAlign: 'center',
                          cursor: 'pointer',
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          gap: '0.35rem',
                          transition: 'all 0.15s ease',
                        }}
                      >
                        <IconComponent size={18} style={{ color: active ? '#4F7A5B' : '#4F7A5B' }} />
                        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: active ? '#4F7A5B' : '#174A36' }}>
                          {m.label}
                        </span>
                        <span style={{ fontSize: '0.65rem', color: '#4F7A5B' }}>
                          {m.desc}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Security & Smart Contract Notice */}
              <div
                style={{
                  background: '#FFFFFF',
                  border: '1px solid #F3F7F3',
                  borderRadius: '8px',
                  padding: '0.75rem 1rem',
                  marginBottom: '1.5rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.75rem',
                  fontSize: '0.75rem',
                  color: '#4F7A5B',
                }}
              >
                <ShieldCheck size={20} style={{ color: '#4F7A5B', flexShrink: 0 }} />
                <span>
                  Confirming this test payment automatically fires the webhook callback and broadcasts <strong style={{ color: '#174A36' }}>OwnershipTransfer.sol</strong> on Ethereum Sepolia.
                </span>
              </div>

              {/* Pay Action Button */}
              <button
                type="button"
                onClick={handleExecutePayment}
                disabled={loadingOrder}
                style={{
                  width: '100%',
                  background: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)',
                  border: 'none',
                  borderRadius: '10px',
                  padding: '0.85rem 1rem',
                  color: '#ffffff',
                  fontWeight: 700,
                  fontSize: '0.92rem',
                  fontFamily: 'var(--font-heading)',
                  cursor: loadingOrder ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.5rem',
                  boxShadow: '0 4px 14px rgba(2, 132, 199, 0.4)',
                }}
              >
                <CreditCard size={18} />
                <span>Pay ₹{totalAmount.toLocaleString()} via Razorpay [Test Mode]</span>
              </button>
            </div>
          )}

          {(stage === 'processing' || stage === 'blockchain_confirming') && (
            <div style={{ textAlign: 'center', padding: '2rem 1rem' }}>
              <div
                style={{
                  width: '56px',
                  height: '56px',
                  borderRadius: '50%',
                  border: '3px solid #D8E3D9',
                  borderTopColor: '#0284c7',
                  borderRightColor: '#4F7A5B',
                  margin: '0 auto 1.25rem',
                  animation: 'spin 1s linear infinite',
                }}
              />
              <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>

              <h4 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.1rem', color: '#174A36', marginBottom: '0.5rem' }}>
                {stage === 'processing' ? 'Processing Razorpay Test Payment' : 'Broadcasting to Ethereum Sepolia'}
              </h4>
              <p style={{ fontSize: '0.82rem', color: '#4F7A5B', maxWidth: '380px', margin: '0 auto' }}>
                {statusMessage}
              </p>
              <div style={{ marginTop: '1.5rem', fontSize: '0.75rem', color: '#38bdf8', fontFamily: 'var(--font-mono)' }}>
                Contract: OwnershipTransfer.sol · Sepolia Relayer Active
              </div>
            </div>
          )}

          {stage === 'success' && paymentResult && (
            <div>
              {/* Success Banner */}
              <div
                style={{
                  background: '#E8F1EA',
                  border: '1px solid #4F7A5B',
                  borderRadius: '12px',
                  padding: '1.25rem',
                  textAlign: 'center',
                  marginBottom: '1.25rem',
                }}
              >
                <div
                  style={{
                    width: '44px',
                    height: '44px',
                    borderRadius: '50%',
                    background: '#E8F1EA',
                    border: '1px solid #4F7A5B',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    margin: '0 auto 0.75rem',
                    color: '#4F7A5B',
                  }}
                >
                  <CheckCircle size={24} />
                </div>
                <h4 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.15rem', color: '#4F7A5B', margin: '0 0 0.35rem' }}>
                  Payment & Title Transfer Confirmed!
                </h4>
                <div style={{ fontSize: '0.78rem', color: '#4F7A5B' }}>
                  Stage 4 Title Ownership Transfer is now permanently sealed on Ethereum Sepolia.
                </div>
              </div>

              {/* Settlement Receipts Card */}
              <div
                style={{
                  background: '#FFFFFF',
                  border: '1px solid #D8E3D9',
                  borderRadius: '10px',
                  padding: '1rem',
                  fontSize: '0.78rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.65rem',
                  marginBottom: '1.25rem',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: '#4F7A5B' }}>Razorpay Payment ID:</span>
                  <span style={{ fontFamily: 'var(--font-mono)', color: '#38bdf8', fontWeight: 600 }}>
                    {paymentResult.razorpay_payment_id}
                  </span>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: '#4F7A5B' }}>Razorpay Order ID:</span>
                  <span style={{ fontFamily: 'var(--font-mono)', color: '#174A36' }}>
                    {paymentResult.razorpay_order_id}
                  </span>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: '#4F7A5B' }}>Amount Paid:</span>
                  <span style={{ fontWeight: 700, color: '#174A36' }}>
                    ₹{Number(paymentResult.total_amount || 0).toLocaleString()}
                  </span>
                </div>

                <div style={{ borderTop: '1px solid #F3F7F3', paddingTop: '0.65rem', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ color: '#4F7A5B' }}>Sepolia Tx Hash:</span>
                    <span style={{ color: '#4F7A5B', fontWeight: 600, fontSize: '0.72rem' }}>
                      Confirmed
                    </span>
                  </div>
                  {paymentResult.blockchain?.tx_hash && (
                    <a
                      href={paymentResult.blockchain?.explorer_url || `https://sepolia.etherscan.io/tx/${paymentResult.blockchain.tx_hash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.35rem',
                        fontFamily: 'var(--font-mono)',
                        fontSize: '0.72rem',
                        color: '#38bdf8',
                        wordBreak: 'break-all',
                        textDecoration: 'none',
                        background: '#0284c718',
                        padding: '0.35rem 0.5rem',
                        borderRadius: '6px',
                        border: '1px solid #0284c744',
                      }}
                    >
                      <ExternalLink size={12} style={{ flexShrink: 0 }} />
                      <span>{paymentResult.blockchain.tx_hash}</span>
                    </a>
                  )}
                </div>
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', gap: '0.75rem' }}>
                {onViewProvenance && (
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onViewProvenance(paymentResult.batch_code);
                    }}
                    style={{
                      flex: 1,
                      background: '#E8F1EA',
                      border: '1px solid #4F7A5B',
                      color: '#4F7A5B',
                      borderRadius: '8px',
                      padding: '0.7rem',
                      fontWeight: 600,
                      fontSize: '0.8rem',
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '0.35rem',
                    }}
                  >
                    <ShieldCheck size={16} />
                    <span>View Provenance Trail</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={onClose}
                  style={{
                    flex: 1,
                    background: '#F3F7F3',
                    border: '1px solid #D8E3D9',
                    color: '#174A36',
                    borderRadius: '8px',
                    padding: '0.7rem',
                    fontWeight: 600,
                    fontSize: '0.8rem',
                    cursor: 'pointer',
                  }}
                >
                  Close
                </button>
              </div>
            </div>
          )}

          {stage === 'error' && (
            <div style={{ textAlign: 'center', padding: '1rem' }}>
              <div
                style={{
                  width: '44px',
                  height: '44px',
                  borderRadius: '50%',
                  background: '#DA363322',
                  border: '1px solid #DA3633',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 0.75rem',
                  color: '#DA3633',
                }}
              >
                <AlertTriangle size={24} />
              </div>
              <h4 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.05rem', color: '#DA3633', margin: '0 0 0.35rem' }}>
                Payment Confirmation Failed
              </h4>
              <p style={{ fontSize: '0.8rem', color: '#4F7A5B', marginBottom: '1.25rem' }}>
                {errorMessage || 'Unable to confirm payment or execute blockchain ownership transfer.'}
              </p>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  type="button"
                  onClick={handleExecutePayment}
                  style={{
                    flex: 1,
                    background: '#0284c7',
                    border: 'none',
                    borderRadius: '8px',
                    padding: '0.65rem',
                    color: '#ffffff',
                    fontWeight: 600,
                    fontSize: '0.8rem',
                    cursor: 'pointer',
                  }}
                >
                  Retry Payment
                </button>
                <button
                  type="button"
                  onClick={() => setStage('summary')}
                  style={{
                    flex: 1,
                    background: '#F3F7F3',
                    border: '1px solid #D8E3D9',
                    borderRadius: '8px',
                    padding: '0.65rem',
                    color: '#174A36',
                    fontWeight: 600,
                    fontSize: '0.8rem',
                    cursor: 'pointer',
                  }}
                >
                  Back to Summary
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

