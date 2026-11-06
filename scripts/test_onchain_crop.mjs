// scripts/test_onchain_crop.mjs
import { relayCreateBatch, getSavedReceipts, getRelayerStatus } from '../backend/src/services/relayer.service.js';

async function main() {
  const status = await getRelayerStatus();
  console.log('Relayer Status:', status);

  if (!status.hasGas) {
    console.error('Wallet does not have sufficient gas!');
    process.exit(1);
  }

  const batchId = `BATCH-LIVE-${Date.now().toString().slice(-4)}`;
  console.log(`\nRegistering real crop batch: ${batchId} on Sepolia...`);

  await relayCreateBatch({
    batchId,
    cropType: 'Mustard',
    quantityKg: 750
  });

  console.log('Waiting for mining confirmation on Sepolia (this takes ~12-15 seconds)...');
  for (let i = 0; i < 40; i++) {
    await new Promise(r => setTimeout(r, 2000));
    const receipts = getSavedReceipts();
    const cur = receipts[`createBatch_${batchId}`];
    if (cur?.tx_hash) {
      console.log(`[Status: ${cur.chain_status}] Tx Hash: ${cur.tx_hash}`);
      if (cur.chain_status === 'confirmed') {
        console.log('\n======================================================');
        console.log('🎉 SUCCESS! TRANSACTION MINED & CONFIRMED ON SEPOLIA!');
        console.log('Block Number: ', cur.block_number);
        console.log('Gas Used:     ', cur.gas_used);
        console.log('Tx Hash:      ', cur.tx_hash);
        console.log('Etherscan URL:', cur.explorer_url);
        console.log('======================================================');
        process.exit(0);
      }
    }
  }

  console.log('Timeout waiting for confirmation.');
  process.exit(0);
}

main().catch(console.error);
