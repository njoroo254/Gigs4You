import { Injectable, ExecutionContext } from '@nestjs/common';
import { ThrottlerGuard, ThrottlerOptions } from '@nestjs/throttler';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';

// Safaricom production callback IP ranges (Daraja B2C / STK callback sources)
const MPESA_STATIC_IPS = new Set([
  '196.201.214.200',
  '196.201.214.206',
  '196.201.213.114',
  '196.201.214.207',
  '196.201.214.208',
  '196.201.213.44',
  '196.201.214.55',
  '196.201.214.98',
]);

export const THROTTLE_TIER = {
  UNAUTH: 'unauth',
  AUTH:   'auth',
  ADMIN:  'admin',
} as const;

@Injectable()
export class AppThrottlerGuard extends ThrottlerGuard {
  private allowedIps: Set<string>;

  constructor(
    options: any,
    storageService: any,
    reflector: Reflector,
    private readonly config: ConfigService,
  ) {
    super(options, storageService, reflector);

    // Merge static Safaricom IPs with any extra IPs from env (comma-separated)
    const extra = (this.config.get<string>('MPESA_CALLBACK_IPS') ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    this.allowedIps = new Set([...MPESA_STATIC_IPS, ...extra]);
  }

  protected async shouldSkip(context: ExecutionContext): Promise<boolean> {
    // Let the parent handle @SkipThrottle() decorator checks
    if (await super.shouldSkip(context)) return true;

    const req = context.switchToHttp().getRequest();
    const ip  = this.clientIp(req);
    return this.allowedIps.has(ip);
  }

  async handleRequest(
    context:     ExecutionContext,
    limit:       number,
    ttl:         number,
    throttler:   ThrottlerOptions,
    getTracker:  (req: any) => Promise<string>,
    generateKey: (ctx: ExecutionContext, tracker: string, name: string) => string,
  ): Promise<boolean> {
    const req  = context.switchToHttp().getRequest();
    const role = req.user?.role as string | undefined;
    const tier = this.resolveTier(role);

    // Skip every throttler whose name doesn't match this request's tier.
    // This is how we apply exactly one rule per request without extra Redis keys.
    if (throttler.name !== tier) return true;

    return super.handleRequest(context, limit, ttl, throttler, getTracker, generateKey);
  }

  private resolveTier(role?: string): string {
    if (!role) return THROTTLE_TIER.UNAUTH;
    if (role === 'super_admin' || role === 'admin') return THROTTLE_TIER.ADMIN;
    return THROTTLE_TIER.AUTH;
  }

  private clientIp(req: any): string {
    // Respect X-Forwarded-For set by a trusted reverse proxy
    const forwarded = req.headers['x-forwarded-for'];
    if (forwarded) {
      return (Array.isArray(forwarded) ? forwarded[0] : forwarded)
        .split(',')[0]
        .trim();
    }
    return req.ip ?? req.connection?.remoteAddress ?? '';
  }
}
