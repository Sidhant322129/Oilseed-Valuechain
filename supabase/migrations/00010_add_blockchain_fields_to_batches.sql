-- Migration 00010: Add blockchain verification and provenance columns to batches
ALTER TABLE public.batches 
ADD COLUMN IF NOT EXISTS tx_hash TEXT,
ADD COLUMN IF NOT EXISTS tx_status TEXT DEFAULT 'pending',
ADD COLUMN IF NOT EXISTS block_number BIGINT;

COMMENT ON COLUMN public.batches.tx_hash IS 'Ethereum Sepolia transaction hash for BatchRecord.createBatch on-chain anchor';
COMMENT ON COLUMN public.batches.tx_status IS 'On-chain state of batch registration: pending, submitted, confirmed, or failed';
COMMENT ON COLUMN public.batches.block_number IS 'Mined Ethereum Sepolia block number';
