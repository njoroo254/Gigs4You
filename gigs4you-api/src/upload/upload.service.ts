import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { v4 as uuid } from 'uuid';
import { createDependencyFailure } from '../common/errors/dependency-failure';

export type UploadBucket = 'avatars' | 'task-photos' | 'kyc-documents' | 'attachments' | 'org-documents';

const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const ALLOWED_DOC_TYPES   = ['image/jpeg', 'image/png', 'application/pdf'];
const MAX_IMAGE_BYTES      = 5  * 1024 * 1024;  // 5 MB
const MAX_DOC_BYTES        = 10 * 1024 * 1024;  // 10 MB

@Injectable()
export class UploadService {
  private s3: S3Client;
  private bucket: string;
  private endpoint: string;
  private publicBase: string;

  constructor(private config: ConfigService) {
    this.bucket    = config.get('S3_BUCKET')    || 'gigs4you';
    this.endpoint  = config.get('S3_ENDPOINT')  || 'http://localhost:9000';
    this.publicBase= config.get('S3_PUBLIC_URL')|| `${this.endpoint}/${this.bucket}`;

    this.s3 = new S3Client({
      endpoint:          this.endpoint,
      region:            config.get('S3_REGION') || 'us-east-1',
      credentials: {
        accessKeyId:     config.get('S3_ACCESS_KEY')    || 'minioadmin',
        secretAccessKey: config.get('S3_SECRET_KEY')    || 'minioadmin',
      },
      forcePathStyle: true,   // required for MinIO
    });
  }

  private storageTarget(key?: string): string {
    return key
      ? `${this.endpoint}/${this.bucket}/${key}`
      : `${this.endpoint}/${this.bucket}`;
  }

  // ── Upload a file buffer to S3/MinIO ────────────────────────────────
  async upload(params: {
    buffer:      Buffer;
    mimetype:    string;
    originalName?: string;
    bucket:      UploadBucket;
    folder?:     string;
  }): Promise<{ url: string; key: string }> {
    const { buffer, mimetype, originalName, bucket } = params;

    // Validate
    this.validateFile(buffer, mimetype, bucket);

    const ext    = this.mimeToExt(mimetype);
    const folder = params.folder || bucket;
    const key    = `${folder}/${uuid()}${ext}`;

    try {
      await this.s3.send(new PutObjectCommand({
        Bucket:      this.bucket,
        Key:         key,
        Body:        buffer,
        ContentType: mimetype,
        // Public buckets: avatars, task-photos
        // Private buckets: kyc-documents
        ACL: bucket === 'kyc-documents' ? 'private' : 'public-read',
        Metadata: originalName ? { originalName } : {},
      }));
    } catch (error) {
      throw createDependencyFailure(
        'Object storage',
        `upload ${bucket} asset`,
        this.storageTarget(key),
        error,
      );
    }

    const url = bucket === 'kyc-documents'
      ? await this.getSignedDownloadUrl(key)
      : `${this.publicBase}/${key}`;

    return { url, key };
  }

  // ── Get a signed URL for private documents (15 min expiry) ─────────
  async getSignedDownloadUrl(key: string, expiresIn = 900): Promise<string> {
    const cmd = new GetObjectCommand({ Bucket: this.bucket, Key: key });
    return getSignedUrl(this.s3, cmd, { expiresIn });
  }

  // ── Delete a file ───────────────────────────────────────────────────
  async delete(key: string): Promise<void> {
    try {
      await this.s3.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
    } catch (error) {
      throw createDependencyFailure(
        'Object storage',
        'delete uploaded asset',
        this.storageTarget(key),
        error,
      );
    }
  }

  // ── Extract key from a full URL ─────────────────────────────────────
  extractKey(url: string): string | null {
    try {
      const u = new URL(url);
      // Remove leading slash and bucket name
      return u.pathname.replace(`/${this.bucket}/`, '').replace(/^\//, '');
    } catch { return null; }
  }

  // ── Validate file ───────────────────────────────────────────────────
  private validateFile(buffer: Buffer, mimetype: string, bucket: UploadBucket) {
    const isDoc = bucket === 'kyc-documents';
    const allowed = isDoc ? ALLOWED_DOC_TYPES : ALLOWED_IMAGE_TYPES;
    const maxBytes = isDoc ? MAX_DOC_BYTES : MAX_IMAGE_BYTES;

    if (!allowed.includes(mimetype)) {
      throw new BadRequestException(
        `File type '${mimetype}' not allowed. Allowed: ${allowed.join(', ')}`
      );
    }
    if (buffer.length > maxBytes) {
      throw new BadRequestException(
        `File too large. Max size: ${maxBytes / 1024 / 1024} MB`
      );
    }
    if (buffer.length === 0) {
      throw new BadRequestException('File is empty');
    }
  }

  private mimeToExt(mime: string): string {
    const map: Record<string, string> = {
      'image/jpeg': '.jpg', 'image/png': '.png',
      'image/webp': '.webp', 'image/gif': '.gif',
      'application/pdf': '.pdf',
    };
    return map[mime] || '';
  }
}
