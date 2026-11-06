// src/services/ipfs.service.js
// Service for pinning quality reports and soil certificates to IPFS via Pinata Cloud.
// Zero simulation fallback: Enforces authentic Pinata credentials and verifies CID gateway resolution.

/**
 * Pins payload to Pinata Cloud and verifies server-side availability on gateway.
 * @param {Object} payload - The assay/certificate data to pin as JSON.
 * @param {Object} metadata - Pinata metadata (name, batchId, customAttributes).
 * @returns {Promise<{ success: boolean, ipfsCID: string, pinSize: number, timestamp: string, gatewayUrl: string, verified: boolean }>}
 */
export async function pinToIPFS(payload, metadata = {}) {
  const pinataJwt = process.env.PINATA_JWT;
  const pinataApiKey = process.env.PINATA_API_KEY;
  const pinataSecretApiKey = process.env.PINATA_SECRET_API_KEY;

  if (!pinataJwt && (!pinataApiKey || !pinataSecretApiKey)) {
    const missingErr = new Error(
      'PINATA_JWT (or PINATA_API_KEY + PINATA_SECRET_API_KEY) is not configured in backend/.env. ' +
      'Cannot pin certificate to IPFS without valid Pinata credentials.'
    );
    missingErr.code = 'PINATA_CREDENTIALS_MISSING';
    throw missingErr;
  }

  const dataToPin = {
    pinataContent: payload,
    pinataMetadata: {
      name: metadata.name || `Oilseed_Certificate_${Date.now()}`,
      keyvalues: {
        batchId: metadata.batchId || 'UNKNOWN',
        timestamp: new Date().toISOString(),
        ...metadata.customAttributes
      }
    }
  };

  const headers = { 'Content-Type': 'application/json' };
  if (pinataJwt) {
    headers['Authorization'] = `Bearer ${pinataJwt}`;
  } else {
    headers['pinata_api_key'] = pinataApiKey;
    headers['pinata_secret_api_key'] = pinataSecretApiKey;
  }

  console.log(`[IPFS Pinata] Posting payload to https://api.pinata.cloud/pinning/pinJSONToIPFS for batch "${metadata.batchId || 'UNKNOWN'}"...`);
  const response = await fetch('https://api.pinata.cloud/pinning/pinJSONToIPFS', {
    method: 'POST',
    headers,
    body: JSON.stringify(dataToPin)
  });

  const rawBody = await response.text();
  console.log(`[IPFS Pinata] Response status: ${response.status} ${response.statusText}`);

  if (!response.ok) {
    const pinErr = new Error(`Pinata API returned HTTP ${response.status} (${response.statusText}): ${rawBody}`);
    pinErr.code = 'PINATA_API_ERROR';
    pinErr.status = response.status;
    pinErr.rawBody = rawBody;
    throw pinErr;
  }

  let result;
  try {
    result = JSON.parse(rawBody);
  } catch (parseErr) {
    throw new Error(`Failed to parse Pinata API JSON response: ${rawBody}`);
  }

  const ipfsCID = result.IpfsHash;
  const gatewayUrl = `https://gateway.pinata.cloud/ipfs/${ipfsCID}`;

  console.log(`[IPFS Pinata] Successfully pinned to Pinata! CID: ${ipfsCID}`);
  console.log(`[IPFS Pinata] Verifying gateway resolution server-side at ${gatewayUrl}...`);

  // Server-side gateway verification check
  let gatewayResolved = false;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const gwCheck = await fetch(gatewayUrl, { method: 'HEAD', signal: AbortSignal.timeout(8000) });
      if (gwCheck.ok) {
        gatewayResolved = true;
        console.log(`[IPFS Pinata] Verified: Gateway resolved CID with HTTP ${gwCheck.status}`);
        break;
      } else {
        console.warn(`[IPFS Pinata] Gateway check attempt ${attempt}/3 returned HTTP ${gwCheck.status}, retrying in 2s...`);
      }
    } catch (gwErr) {
      console.warn(`[IPFS Pinata] Gateway check attempt ${attempt}/3 failed: ${gwErr.message}`);
    }
    await new Promise(r => setTimeout(r, 2000));
  }

  return {
    success: true,
    ipfsCID,
    pinSize: result.PinSize,
    timestamp: result.Timestamp,
    gatewayUrl,
    verified: gatewayResolved
  };
}
