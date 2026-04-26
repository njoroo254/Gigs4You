/**
 * EncryptionService — AES-256-GCM symmetric encryption for PII fields.
 *
 * Encryption format (base64-encoded, colon-delimited):
 *   iv:ciphertext:authTag
 *
 * The key is read from PII_ENCRYPTION_KEY (32-byte hex string = 64 hex chars).
 * Startup will throw if the key is absent or malformed in production.
 *
 * Blind-index helper: HMAC-SHA-256 of the plaintext with a separate key
 * (PII_HMAC_KEY) allows equality lookups on encrypted columns without
 * decrypting or using deterministic encryption.
 */

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES   = 16;
const TAG_BYTES  = 16;

@Injectable()
export class EncryptionService implements OnModuleInit {
  private readonly log = new Logger(EncryptionService.name);

  private encKey!: Buffer;
  private hmacKey!: Buffer;
  private ready = false;

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    const encHex  = this.config.get<string>('PII_ENCRYPTION_KEY') || '';
    const hmacHex = this.config.get<string>('PII_HMAC_KEY')        || '';

    const isProduction = this.config.get('NODE_ENV') === 'production';

    if (!encHex || !hmacHex) {
      if (isProduction) {
        throw new Error(
          'PII_ENCRYPTION_KEY and PII_HMAC_KEY are required in production. ' +
          'Generate them with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"',
        );
      }
      this.log.warn('PII_ENCRYPTION_KEY / PII_HMAC_KEY not set — PII fields stored in plaintext (dev mode)');
      return;
    }

    const validHex = (s: string) => s.length === 64 && /^[0-9a-f]+$/i.test(s);

    if (!validHex(encHex) || !validHex(hmacHex)) {
      if (isProduction) {
        throw new Error(
          'PII_ENCRYPTION_KEY and PII_HMAC_KEY must each be 64 hex characters (32 bytes). ' +
          'Generate with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"',
        );
      }
      // In dev/test — bad format keys mean the env was copied from the example without being
      // replaced. Fall back to plaintext mode rather than crashing the dev server.
      this.log.warn(
        'PII_ENCRYPTION_KEY / PII_HMAC_KEY are set but invalid (placeholder values?). ' +
        'Falling back to dev plaintext mode. Replace with 64-char hex strings.',
      );
      return;
    }

    this.encKey  = Buffer.from(encHex,  'hex');
    this.hmacKey = Buffer.from(hmacHex, 'hex');
    this.ready   = true;
    this.log.log('PII encryption initialised (AES-256-GCM)');
  }

  /**
   * Encrypt a plaintext PII value.
   * Returns the original value unchanged when encryption is not configured.
   */
  encrypt(plaintext: string | null | undefined): string | null {
    if (plaintext == null) return null;
    if (!this.ready) return plaintext;  // dev mode — pass-through

    const iv         = randomBytes(IV_BYTES);
    const cipher     = createCipheriv(ALGORITHM, this.encKey, iv);
    const encrypted  = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag        = cipher.getAuthTag();

    return [
      iv.toString('base64'),
      encrypted.toString('base64'),
      tag.toString('base64'),
    ].join(':');
  }

  /**
   * Decrypt a value that was encrypted with encrypt().
   * Returns the original value unchanged in dev mode (no key configured).
   */
  decrypt(ciphertext: string | null | undefined): string | null {
    if (ciphertext == null) return null;
    if (!this.ready) return ciphertext;  // dev mode — pass-through

    // If the value doesn't look encrypted (no colons), it's plaintext from before migration.
    if (!ciphertext.includes(':')) return ciphertext;

    try {
      const parts = ciphertext.split(':');
      if (parts.length !== 3) throw new Error('Unexpected ciphertext format');

      const [ivB64, encB64, tagB64] = parts;
      const iv        = Buffer.from(ivB64,  'base64');
      const encrypted = Buffer.from(encB64, 'base64');
      const tag       = Buffer.from(tagB64, 'base64');

      const decipher = createDecipheriv(ALGORITHM, this.encKey, iv);
      decipher.setAuthTag(tag);
      return decipher.update(encrypted) + decipher.final('utf8');
    } catch (err) {
      this.log.error('Decryption failed — returning null to avoid exposing corrupted data');
      return null;
    }
  }

  /**
   * HMAC-SHA-256 blind index for encrypted field equality lookups.
   * Always returns the same output for the same input (deterministic).
   * Returns null in dev mode so plaintext lookups still work.
   */
  blindIndex(value: string | null | undefined): string | null {
    if (value == null) return null;
    if (!this.ready) return null;  // dev mode — the field itself is plaintext

    return createHmac('sha256', this.hmacKey)
      .update(value.toLowerCase().trim())   // normalise before hashing
      .digest('hex');
  }
}
