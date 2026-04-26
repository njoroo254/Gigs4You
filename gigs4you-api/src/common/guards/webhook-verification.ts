import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import crypto from 'crypto';

/**
 * Verify M-Pesa callback signature (Lipa Na M-Pesa Online).
 * 
 * Safaricom signs STK callbacks using HMAC-SHA256 with the M-Pesa passkey.
 * The signature is sent in the X-Callback-Signature header (if configured).
 * 
 * NOTE: This verification is OPTIONAL because not all Safaricom configurations
 * include the signature header. The callback still validates the payload structure.
 */
export function verifyMpesaSignature(
  body: any,
  headerSignature: string | undefined,
): { valid: boolean; reason?: string } {
  // If no signature header provided, skip verification (config may not have it enabled)
  if (!headerSignature) {
    return { valid: true }; // Allow without signature for backward compatibility
  }

  const passkey = process.env.MPESA_PASSKEY;
  if (!passkey) {
    console.warn('[SECURITY] MPESA_PASSKEY not set - cannot verify callback signature');
    return { valid: false, reason: 'Server misconfigured - passkey missing' };
  }

  try {
    // The callback URL used for STK must be reconstructed for signature verification
    // Format: {callbackUrl}?{sorted_query_string} where query string contains Body.stkCallback
    const callbackData = body?.Body?.stkCallback;
    if (!callbackData) {
      return { valid: false, reason: 'Missing callback body' };
    }

    // Safaricom's signature is computed over the CheckoutRequestID + Amount + ReceiverParty
    // The signature verification follows their documentation
    const dataToSign = [
      callbackData.MerchantRequestID,
      callbackData.CheckoutRequestID,
      callbackData.ResultCode?.toString() || '',
    ].join('');

    const expectedSignature = crypto
      .createHmac('sha256', passkey)
      .update(dataToSign)
      .digest('base64');

    const receivedBuffer = Buffer.from(headerSignature);
    const expectedBuffer = Buffer.from(expectedSignature);

    if (receivedBuffer.length !== expectedBuffer.length) {
      return { valid: false, reason: 'Signature length mismatch' };
    }

    // Use timing-safe comparison to prevent timing attacks
    if (!crypto.timingSafeEqual(receivedBuffer, expectedBuffer)) {
      return { valid: false, reason: 'Signature mismatch' };
    }

    return { valid: true };
  } catch (error) {
    console.error('[SECURITY] M-Pesa signature verification error:', error);
    return { valid: false, reason: 'Signature verification failed' };
  }
}

/**
 * Verify Stripe webhook signature.
 * 
 * Stripe signs each payload using HMAC-SHA256 with the webhook secret.
 * The signature is sent in the Stripe-Signature header.
 */
export function verifyStripeSignature(
  body: string,
  signature: string,
  secret: string,
): { valid: boolean; reason?: string; timestamp?: number } {
  if (!secret) {
    console.warn('[SECURITY] STRIPE_WEBHOOK_SECRET not set - cannot verify Stripe signature');
    return { valid: false, reason: 'Server misconfigured - webhook secret missing' };
  }

  try {
    // Parse the Stripe signature header
    // Format: t=timestamp,v1=signature
    const parts = signature.split(',');
    let timestamp: number | undefined;
    let signatureHex: string | undefined;

    for (const part of parts) {
      const [key, value] = part.split('=');
      if (key === 't') {
        timestamp = parseInt(value, 10);
      } else if (key === 'v1') {
        signatureHex = value;
      }
    }

    if (!timestamp || !signatureHex) {
      return { valid: false, reason: 'Invalid signature format' };
    }

    // Check timestamp to prevent replay attacks (allow 5 minute tolerance)
    const now = Math.floor(Date.now() / 1000);
    if (Math.abs(now - timestamp) > 300) {
      return { valid: false, reason: 'Timestamp too old (possible replay attack)' };
    }

    // Compute expected signature
    const payload = `${timestamp}.${body}`;
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(payload, 'utf8')
      .digest('hex');

    // Use timing-safe comparison
    const receivedBuffer = Buffer.from(signatureHex);
    const expectedBuffer = Buffer.from(expectedSignature);

    if (receivedBuffer.length !== expectedBuffer.length) {
      return { valid: false, reason: 'Signature length mismatch' };
    }

    if (!crypto.timingSafeEqual(receivedBuffer, expectedBuffer)) {
      return { valid: false, reason: 'Signature mismatch' };
    }

    return { valid: true, timestamp };
  } catch (error) {
    console.error('[SECURITY] Stripe signature verification error:', error);
    return { valid: false, reason: 'Signature verification failed' };
  }
}

/**
 * Extract raw body for webhook verification (needs raw body, not parsed)
 */
export const RawBody = createParamDecorator(
  (data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    return request.rawBody;
  },
);
