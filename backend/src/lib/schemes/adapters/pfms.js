// backend/src/lib/schemes/adapters/pfms.js
// Mock PFMS (Public Financial Management System) payment adapter.
//
// Interface contract:
//   Input:  { amount, farmerId, applicationId }
//   Output: { success: boolean, txn_ref: string | null, error?: string }
//
// Set PFMS_SIMULATE_FAILURE=true to test failure paths.
// This mock is swappable for real PFMS/NACH API without touching business logic.

const SIMULATE_FAILURE = process.env.PFMS_SIMULATE_FAILURE === 'true';
const MOCK_DELAY_MS    = parseInt(process.env.PFMS_MOCK_DELAY_MS || '250', 10);

/**
 * Simulate PFMS bank transfer for DBT payment.
 * @param {{ amount: number, farmerId: string, applicationId: string }} params
 * @returns {Promise<{ success: boolean, txn_ref: string | null, error?: string }>}
 */
export async function mockPfmsAdapter({ amount, farmerId, applicationId }) {
  // Simulate network latency
  await new Promise(resolve => setTimeout(resolve, MOCK_DELAY_MS));

  if (SIMULATE_FAILURE) {
    return {
      success: false,
      txn_ref: null,
      error: '[MOCK] PFMS payment gateway simulated failure (PFMS_SIMULATE_FAILURE=true)',
    };
  }

  // Generate a realistic-looking PFMS transaction reference
  const txn_ref = `PFMS-DBT-${new Date().getFullYear()}-${Date.now().toString(36).toUpperCase()}-${applicationId.slice(0, 8).toUpperCase()}`;

  return {
    success: true,
    txn_ref,
    gateway: 'PFMS_MOCK_v1',
    timestamp: new Date().toISOString(),
    amount_credited: amount,
  };
}
