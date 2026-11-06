// backend/src/services/sms.service.js
// Fast2SMS integration service for automated agronomic alerts and pest warnings.

import axios from 'axios';

/**
 * Sends a real-time SMS alert to a farmer using Fast2SMS API.
 * 
 * @param {Object} params
 * @param {string} params.phoneNumber - Farmer 10-digit mobile number
 * @param {string} params.diseaseName - Detected disease or pest name
 * @param {number} params.confidenceScore - Diagnosis confidence percentage
 * @param {string} params.treatment - Organic / immediate remediation advice
 * @param {string} [params.riskLevel='HIGH'] - Severity level (CRITICAL / HIGH / MEDIUM)
 * @returns {Promise<{ success: boolean, messageId?: string, error?: string }>}
 */
export async function sendPestAlertSMS({ phoneNumber, diseaseName, confidenceScore, treatment, riskLevel = 'HIGH' }) {
  const apiKey = process.env.FAST2SMS_API_KEY;

  if (!apiKey) {
    console.warn('[sms.service] FAST2SMS_API_KEY not configured. Simulating SMS dispatch.');
    return {
      success: false,
      simulated: true,
      error: 'FAST2SMS_API_KEY_NOT_CONFIGURED',
      message: `[Simulated] SMS would be sent to ${phoneNumber}: [OILSEED ALERT] Pest: ${diseaseName} (${confidenceScore}% conf). Remedy: ${treatment}`,
    };
  }

  // Clean phone number (extract 10 digits)
  const cleanPhone = String(phoneNumber || '').replace(/\D/g, '').slice(-10);
  if (!cleanPhone || cleanPhone.length !== 10) {
    console.warn(`[sms.service] Invalid phone number provided: ${phoneNumber}`);
    return { success: false, error: 'INVALID_PHONE_NUMBER' };
  }

  const alertMessage = `[OILSEED SHIELD ALERT - ${riskLevel}]\nDetected: ${diseaseName} (${confidenceScore}% conf).\nAction: ${treatment.slice(0, 80)}...\nInspect field immediately.`;

  try {
    const response = await axios.post(
      'https://www.fast2sms.com/dev/bulkV2',
      {
        route: 'q',
        message: alertMessage,
        language: 'english',
        flash: 0,
        numbers: cleanPhone,
      },
      {
        headers: {
          authorization: apiKey,
          'Content-Type': 'application/json',
        },
        timeout: 10000,
      }
    );

    if (response.data && response.data.return) {
      console.log(`[sms.service] ✅ Fast2SMS alert sent successfully to ${cleanPhone}`);
      return {
        success: true,
        messageId: response.data.request_id || response.data.message?.[0],
        data: response.data,
      };
    } else {
      console.warn(`[sms.service] Fast2SMS returned response:`, response.data);
      return {
        success: false,
        error: response.data?.message || 'SMS delivery rejected',
      };
    }
  } catch (err) {
    console.error('[sms.service] Fast2SMS dispatch error:', err.response?.data || err.message);
    return {
      success: false,
      error: err.response?.data?.message || err.message,
    };
  }
}
