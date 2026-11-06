// backend/src/services/relayer.service.js
// Production-grade Ethereum Sepolia Gasless Relayer Service
// Automatically signs and broadcasts real on-chain transactions to:
// 1. BatchRecord.sol (createBatch, transitionStatus)
// 2. FarmerRegistry.sol (registerFarmer, verifyFarmer)
// 3. QualityOracle.sol (recordCertificate)
// 4. OwnershipTransfer.sol (transferBatchOwnership)

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { ethers } from 'ethers';
import dotenv from 'dotenv';
import { adminClient } from '../config/supabaseClient.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config();

// Persistence file and in-memory cache for verified on-chain transaction receipts
// Persisted in backend/data/blockchain_txs.json with atomic writes and ignored by nodemon.json
const TX_STORE_PATH = path.resolve(__dirname, '../../data/blockchain_txs.json');
let receiptsCache = null;

function ensureStoreDir() {
  const dir = path.dirname(TX_STORE_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  if (!fs.existsSync(TX_STORE_PATH)) {
    fs.writeFileSync(TX_STORE_PATH, JSON.stringify({}, null, 2));
  }
}

export function getSavedReceipts() {
  if (receiptsCache) return receiptsCache;
  ensureStoreDir();
  try {
    const raw = fs.readFileSync(TX_STORE_PATH, 'utf-8');
    receiptsCache = JSON.parse(raw);
    return receiptsCache;
  } catch {
    receiptsCache = {};
    return receiptsCache;
  }
}

export function saveReceipt(key, receiptData) {
  const all = getSavedReceipts();
  all[key] = {
    ...receiptData,
    updated_at: new Date().toISOString()
  };
  receiptsCache = all;

  // Non-blocking atomic disk write via temp file so file is never truncated or corrupted
  ensureStoreDir();
  const tmpPath = `${TX_STORE_PATH}.${Date.now()}.${Math.random().toString(36).substring(2, 6)}.tmp`;
  fs.writeFile(tmpPath, JSON.stringify(all, null, 2), (err) => {
    if (err) {
      console.error('[RelayerService] Failed to write temp receipt:', err.message);
      return;
    }
    fs.rename(tmpPath, TX_STORE_PATH, (renameErr) => {
      if (renameErr) {
        // Fallback standard write if rename fails across file boundaries
        fs.writeFile(TX_STORE_PATH, JSON.stringify(all, null, 2), () => {});
      }
    });
  });
}

// ─── RPC & Contract Initialization ───────────────────────────────────────────
const RPC_ENDPOINTS = [
  process.env.SEPOLIA_RPC_URL || 'https://ethereum-sepolia-rpc.publicnode.com',
  'https://rpc.sepolia.org',
  'https://1rpc.io/sepolia',
  'https://rpc2.sepolia.org'
];

let provider = null;
let wallet = null;

export function getProvider() {
  if (!provider) {
    provider = new ethers.JsonRpcProvider(RPC_ENDPOINTS[0], 11155111);
  }
  return provider;
}

export function getRelayerWallet() {
  if (!wallet) {
    const pk = process.env.SEPOLIA_RELAYER_PRIVATE_KEY;
    if (pk) {
      wallet = new ethers.Wallet(pk, getProvider());
    }
  }
  return wallet;
}

// Load Contract ABIs
function loadAbi(name) {
  const p = path.resolve(__dirname, `../../../blockchain/abis/${name}.json`);
  if (fs.existsSync(p)) {
    return JSON.parse(fs.readFileSync(p, 'utf-8'));
  }
  return [];
}

const DEPLOYED_ADDRESSES = {
  BatchRecord: '0x364873607Ae44E56f9f8b1Bc460C87B8fa530ec7',
  FarmerRegistry: '0x951D793d1ec6f506EE10D7Dd74edF59D40Bfb0Bb',
  QualityOracle: '0xd7a578e86e517301db254cb31e33f83be9285177',
  OwnershipTransfer: '0x258df666321095eaa7fc56fd417e16691f86e7df'
};

export async function getRelayerStatus() {
  const w = getRelayerWallet();
  if (!w) {
    return {
      configured: false,
      address: null,
      balanceEth: '0.0',
      message: 'SEPOLIA_RELAYER_PRIVATE_KEY not configured in .env'
    };
  }

  try {
    const balWei = await getProvider().getBalance(w.address);
    const balEth = ethers.formatEther(balWei);
    return {
      configured: true,
      address: w.address,
      balanceEth: balEth,
      hasGas: Number(balEth) > 0.0005,
      network: 'Ethereum Sepolia (Chain ID 11155111)',
      explorerUrl: `https://sepolia.etherscan.io/address/${w.address}`
    };
  } catch (err) {
    return {
      configured: true,
      address: w.address,
      balanceEth: 'unknown',
      hasGas: false,
      error: err.message
    };
  }
}

let currentRpcIndex = 0;

async function executeWithRetry(actionName, fn, maxRetries = 3) {
  let lastErr;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      console.warn(`[Relayer] ${actionName} attempt ${attempt}/${maxRetries} non-fatal warning: ${err.message}`);
      if (attempt < maxRetries) {
        currentRpcIndex = (currentRpcIndex + 1) % RPC_ENDPOINTS.length;
        const nextRpc = RPC_ENDPOINTS[currentRpcIndex];
        console.log(`[Relayer] Rotating RPC provider to: ${nextRpc}`);
        provider = new ethers.JsonRpcProvider(nextRpc, 11155111);
        const pk = process.env.SEPOLIA_RELAYER_PRIVATE_KEY;
        if (pk) wallet = new ethers.Wallet(pk, provider);
        await new Promise(r => setTimeout(r, attempt * 2000));
      }
    }
  }
  throw lastErr;
}

// ─── Asynchronous Relayer Queue ───────────────────────────────────────────────

export async function relayRegisterFarmer({ farmerId, walletAddress }) {
  const key = `registerFarmer_${farmerId}`;
  const w = getRelayerWallet();
  if (!w) return { status: 'skipped' };

  // Use provided wallet or deterministic address from farmer ID
  let targetWallet = walletAddress;
  if (!targetWallet || !ethers.isAddress(targetWallet)) {
    const hex = ethers.keccak256(ethers.toUtf8Bytes(farmerId));
    targetWallet = ethers.getAddress('0x' + hex.slice(26));
  }

  saveReceipt(key, {
    farmer_id: farmerId,
    wallet_address: targetWallet,
    action: 'registerFarmer',
    contract: 'FarmerRegistry.sol',
    contract_address: DEPLOYED_ADDRESSES.FarmerRegistry,
    chain_status: 'pending',
    timestamp: new Date().toISOString()
  });

  (async () => {
    try {
      const balWei = await getProvider().getBalance(w.address);
      if (balWei === 0n) return;

      await executeWithRetry('registerFarmer', async () => {
        const activeWallet = getRelayerWallet();
        const abi = loadAbi('FarmerRegistry');
        const contract = new ethers.Contract(DEPLOYED_ADDRESSES.FarmerRegistry, abi, activeWallet);
        console.log(`[Relayer] Calling FarmerRegistry.registerFarmer("${farmerId}", "${targetWallet}")...`);
        const tx = await contract.registerFarmer(farmerId, targetWallet);
        console.log(`[Relayer] Farmer registration tx submitted: ${tx.hash}`);
        const receipt = await tx.wait(1);
        console.log(`[Relayer] Farmer registered on Sepolia in block ${receipt.blockNumber}!`);

        saveReceipt(key, {
          farmer_id: farmerId,
          wallet_address: targetWallet,
          action: 'registerFarmer',
          contract: 'FarmerRegistry.sol',
          contract_address: DEPLOYED_ADDRESSES.FarmerRegistry,
          chain_status: 'confirmed',
          tx_hash: tx.hash,
          block_number: receipt.blockNumber,
          explorer_url: `https://sepolia.etherscan.io/tx/${tx.hash}`,
          confirmed_at: new Date().toISOString()
        });
      });
    } catch (err) {
      console.error(`[Relayer] Failed to relay registerFarmer:`, err.message);
      saveReceipt(key, {
        farmer_id: farmerId,
        action: 'registerFarmer',
        chain_status: 'failed',
        error: err.message
      });
    }
  })();

  return { queued: true, key };
}

export async function relayCreateBatch({ batchId, cropType, quantityKg }) {
  const key = `createBatch_${batchId}`;
  const w = getRelayerWallet();
  if (!w) {
    console.warn('[Relayer] No wallet configured. Skipping on-chain broadcast.');
    return { status: 'skipped', reason: 'NO_WALLET' };
  }

  // Pre-save pending status
  saveReceipt(key, {
    batch_id: batchId,
    action: 'createBatch',
    contract: 'BatchRecord.sol',
    contract_address: DEPLOYED_ADDRESSES.BatchRecord,
    chain_status: 'pending',
    relayer_address: w.address,
    timestamp: new Date().toISOString()
  });

  const balWei = await getProvider().getBalance(w.address);
  if (balWei === 0n) {
    console.warn(`[Relayer] Wallet ${w.address} has 0 Sepolia ETH. Awaiting faucet gas.`);
    const pendingGas = {
      batch_id: batchId,
      action: 'createBatch',
      contract: 'BatchRecord.sol',
      contract_address: DEPLOYED_ADDRESSES.BatchRecord,
      chain_status: 'pending_gas',
      relayer_address: w.address,
      faucet_url: 'https://cloud.google.com/application/web3/faucet/ethereum/sepolia',
      message: 'Awaiting Sepolia test ETH for gas funding.'
    };
    saveReceipt(key, pendingGas);
    return pendingGas;
  }

  let finalReceiptData = null;

  try {
    await executeWithRetry('createBatch', async () => {
      const activeWallet = getRelayerWallet();
      console.log(`[Relayer] Broadcasting BatchRecord.createBatch("${batchId}", "${cropType}", ${quantityKg})...`);
      const abi = loadAbi('BatchRecord');
      const contract = new ethers.Contract(DEPLOYED_ADDRESSES.BatchRecord, abi, activeWallet);

      const tx = await contract.createBatch(batchId, cropType, Math.round(Number(quantityKg)));
      console.log(`[Relayer] Tx submitted to Sepolia! Hash: ${tx.hash}`);

      saveReceipt(key, {
        batch_id: batchId,
        action: 'createBatch',
        contract: 'BatchRecord.sol',
        contract_address: DEPLOYED_ADDRESSES.BatchRecord,
        chain_status: 'submitted',
        tx_hash: tx.hash,
        explorer_url: `https://sepolia.etherscan.io/tx/${tx.hash}`
      });

      const receipt = await tx.wait(1);
      console.log(`[Relayer] Tx confirmed in block ${receipt.blockNumber}! Gas used: ${receipt.gasUsed.toString()}`);

      finalReceiptData = {
        batch_id: batchId,
        action: 'createBatch',
        contract: 'BatchRecord.sol',
        contract_address: DEPLOYED_ADDRESSES.BatchRecord,
        chain_status: 'confirmed',
        tx_hash: tx.hash,
        block_number: receipt.blockNumber,
        gas_used: receipt.gasUsed.toString(),
        explorer_url: `https://sepolia.etherscan.io/tx/${tx.hash}`,
        confirmed_at: new Date().toISOString()
      };

      saveReceipt(key, finalReceiptData);

      // Write tx_hash, tx_status, and block_number back onto the batch row in Supabase
      try {
        const { error: sbUpdateErr } = await adminClient
          .from('batches')
          .update({
            tx_hash: tx.hash,
            tx_status: 'confirmed',
            block_number: receipt.blockNumber
          })
          .eq('batch_code', batchId);

        if (sbUpdateErr) {
          console.warn('[Relayer] Supabase batch on-chain columns update note:', sbUpdateErr.message);
        } else {
          console.log(`[Relayer] Successfully updated Supabase batches row with tx_hash ${tx.hash}`);
        }
      } catch (dbErr) {
        console.warn('[Relayer] Non-fatal Supabase batch update error:', dbErr.message);
      }
    });
  } catch (err) {
    console.error(`[Relayer] Failed to relay createBatch:`, err.message);
    saveReceipt(key, {
      batch_id: batchId,
      action: 'createBatch',
      contract: 'BatchRecord.sol',
      contract_address: DEPLOYED_ADDRESSES.BatchRecord,
      chain_status: 'failed',
      error: err.message
    });
    throw err;
  }

  return finalReceiptData;
}

export async function relayTransitionStatus({ batchId, statusCode }) {
  const key = `transitionStatus_${batchId}_${statusCode}`;
  const w = getRelayerWallet();
  if (!w) return { status: 'skipped' };

  saveReceipt(key, {
    batch_id: batchId,
    action: 'transitionStatus',
    status_code: statusCode,
    contract: 'BatchRecord.sol',
    chain_status: 'pending'
  });

  (async () => {
    try {
      const balWei = await getProvider().getBalance(w.address);
      if (balWei === 0n) return;

      const abi = loadAbi('BatchRecord');
      const contract = new ethers.Contract(DEPLOYED_ADDRESSES.BatchRecord, abi, w);
      const tx = await contract.transitionStatus(batchId, Number(statusCode));
      const receipt = await tx.wait(1);

      saveReceipt(key, {
        batch_id: batchId,
        action: 'transitionStatus',
        status_code: statusCode,
        chain_status: 'confirmed',
        tx_hash: tx.hash,
        block_number: receipt.blockNumber,
        explorer_url: `https://sepolia.etherscan.io/tx/${tx.hash}`,
        confirmed_at: new Date().toISOString()
      });
    } catch (err) {
      console.error(`[Relayer] transitionStatus error:`, err.message);
    }
  })();

  return { queued: true, key };
}

export async function relayRecordCertificate({ batchId, ipfsCID, certType, batchUuid }) {
  const key = `recordCert_${batchId}`;
  const w = getRelayerWallet();
  if (!w) return { status: 'skipped', error: 'Relayer wallet not configured' };

  saveReceipt(key, {
    batch_id: batchId,
    action: 'recordCertificate',
    contract: 'QualityOracle.sol',
    contract_address: DEPLOYED_ADDRESSES.QualityOracle,
    ipfs_cid: ipfsCID,
    chain_status: 'pending',
    timestamp: new Date().toISOString()
  });

  const balWei = await getProvider().getBalance(w.address);
  if (balWei === 0n) {
    const pendingGas = {
      batch_id: batchId,
      action: 'recordCertificate',
      contract: 'QualityOracle.sol',
      contract_address: DEPLOYED_ADDRESSES.QualityOracle,
      chain_status: 'pending_gas',
      relayer_address: w.address,
      message: 'Awaiting Sepolia test ETH for gas funding.'
    };
    saveReceipt(key, pendingGas);
    return pendingGas;
  }

  let finalReceipt = null;

  try {
    await executeWithRetry('recordCertificate', async () => {
      const activeWallet = getRelayerWallet();
      console.log(`[Relayer] Broadcasting QualityOracle.recordCertificate("${batchId}", "${ipfsCID}", "${certType || 'nabl_lab_assay'}")...`);
      const abi = loadAbi('QualityOracle');
      const contract = new ethers.Contract(DEPLOYED_ADDRESSES.QualityOracle, abi, activeWallet);
      const tx = await contract.recordCertificate(batchId, ipfsCID, certType || 'nabl_lab_assay');
      console.log(`[Relayer] Tx submitted to Sepolia! Hash: ${tx.hash}`);

      saveReceipt(key, {
        batch_id: batchId,
        action: 'recordCertificate',
        contract: 'QualityOracle.sol',
        contract_address: DEPLOYED_ADDRESSES.QualityOracle,
        ipfs_cid: ipfsCID,
        chain_status: 'submitted',
        tx_hash: tx.hash,
        explorer_url: `https://sepolia.etherscan.io/tx/${tx.hash}`
      });

      const receipt = await tx.wait(1);
      console.log(`[Relayer] QualityOracle tx confirmed in block ${receipt.blockNumber}! Gas used: ${receipt.gasUsed.toString()}`);

      finalReceipt = {
        batch_id: batchId,
        action: 'recordCertificate',
        contract: 'QualityOracle.sol',
        contract_address: DEPLOYED_ADDRESSES.QualityOracle,
        ipfs_cid: ipfsCID,
        chain_status: 'confirmed',
        tx_hash: tx.hash,
        block_number: receipt.blockNumber,
        gas_used: receipt.gasUsed.toString(),
        explorer_url: `https://sepolia.etherscan.io/tx/${tx.hash}`,
        confirmed_at: new Date().toISOString()
      };

      saveReceipt(key, finalReceipt);
      if (batchUuid && batchUuid !== batchId) {
        saveReceipt(`recordCert_${batchUuid}`, finalReceipt);
      }
    });
  } catch (err) {
    console.error(`[Relayer] Failed to relay recordCertificate:`, err.message);
    const failedReceipt = {
      batch_id: batchId,
      action: 'recordCertificate',
      contract: 'QualityOracle.sol',
      contract_address: DEPLOYED_ADDRESSES.QualityOracle,
      chain_status: 'failed',
      error: err.message
    };
    saveReceipt(key, failedReceipt);
    throw err;
  }

  return finalReceipt;
}

export async function relayTransferOwnership({ batchId, batchUuid, fromAddress, toAddress, orderId }) {
  const key = `transferOwnership_${batchId}`;
  const w = getRelayerWallet();
  if (!w) {
    console.warn(`[Relayer] Cannot transfer ownership — relayer wallet not configured.`);
    return { status: 'skipped', reason: 'No relayer wallet configured' };
  }

  let finalReceipt = null;

  // Validate and format addresses (fallback to deterministic or relayer address if invalid)
  let cleanFrom = fromAddress;
  let cleanTo = toAddress;
  try {
    if (!cleanFrom || !ethers.isAddress(cleanFrom)) {
      cleanFrom = w.address;
    } else {
      cleanFrom = ethers.getAddress(cleanFrom);
    }
  } catch (_) {
    cleanFrom = w.address;
  }

  try {
    if (!cleanTo || !ethers.isAddress(cleanTo) || cleanTo === ethers.ZeroAddress) {
      cleanTo = w.address;
    } else {
      cleanTo = ethers.getAddress(cleanTo);
    }
  } catch (_) {
    cleanTo = w.address;
  }

  const cleanOrderId = String(orderId || `ORD-${Date.now()}`);

  try {
    await executeWithRetry('transferBatchOwnership', async () => {
      const activeWallet = getRelayerWallet();
      console.log(`[Relayer] Broadcasting OwnershipTransfer.transferBatchOwnership("${batchId}", "${cleanFrom}", "${cleanTo}", "${cleanOrderId}")...`);
      const abi = loadAbi('OwnershipTransfer');
      const contract = new ethers.Contract(DEPLOYED_ADDRESSES.OwnershipTransfer, abi, activeWallet);
      const tx = await contract.transferBatchOwnership(batchId, cleanFrom, cleanTo, cleanOrderId);
      console.log(`[Relayer] Tx submitted to Sepolia! Hash: ${tx.hash}`);

      finalReceipt = {
        batch_id: batchId,
        action: 'transferBatchOwnership',
        contract: 'OwnershipTransfer.sol',
        contract_address: DEPLOYED_ADDRESSES.OwnershipTransfer,
        from_address: cleanFrom,
        to_address: cleanTo,
        order_id: cleanOrderId,
        chain_status: 'submitted',
        tx_hash: tx.hash,
        explorer_url: `https://sepolia.etherscan.io/tx/${tx.hash}`,
        timestamp: new Date().toISOString()
      };

      saveReceipt(key, finalReceipt);
      if (batchUuid && batchUuid !== batchId) {
        saveReceipt(`transferOwnership_${batchUuid}`, finalReceipt);
      }

      // Fast race: wait up to 8s for block inclusion; if Sepolia takes longer, proceed asynchronously
      try {
        const receipt = await Promise.race([
          tx.wait(1),
          new Promise((_, reject) => setTimeout(() => reject(new Error('TIMEOUT_ASYNC')), 8000))
        ]);
        console.log(`[Relayer] OwnershipTransfer tx confirmed in block ${receipt.blockNumber}! Gas used: ${receipt.gasUsed.toString()}`);
        finalReceipt.block_number = receipt.blockNumber;
        finalReceipt.gas_used = receipt.gasUsed.toString();
        finalReceipt.chain_status = 'confirmed';
        finalReceipt.confirmed_at = new Date().toISOString();
        saveReceipt(key, finalReceipt);
        if (batchUuid && batchUuid !== batchId) {
          saveReceipt(`transferOwnership_${batchUuid}`, finalReceipt);
        }
      } catch (waitErr) {
        console.log(`[Relayer] Tx ${tx.hash} broadcast to Sepolia; block inclusion continuing in background.`);
        tx.wait(1).then((receipt) => {
          console.log(`[Relayer] OwnershipTransfer background tx confirmed in block ${receipt.blockNumber}!`);
          finalReceipt.block_number = receipt.blockNumber;
          finalReceipt.gas_used = receipt.gasUsed.toString();
          finalReceipt.chain_status = 'confirmed';
          finalReceipt.confirmed_at = new Date().toISOString();
          saveReceipt(key, finalReceipt);
          if (batchUuid && batchUuid !== batchId) {
            saveReceipt(`transferOwnership_${batchUuid}`, finalReceipt);
          }
        }).catch(e => console.warn('[Relayer] Background tx.wait note:', e.message));
      }
    });
  } catch (err) {
    console.error(`[Relayer] Failed to relay transferBatchOwnership:`, err.message);
    const failedReceipt = {
      batch_id: batchId,
      action: 'transferBatchOwnership',
      contract: 'OwnershipTransfer.sol',
      contract_address: DEPLOYED_ADDRESSES.OwnershipTransfer,
      chain_status: 'failed',
      error: err.message
    };
    saveReceipt(key, failedReceipt);
    throw err;
  }

  return finalReceipt;
}
