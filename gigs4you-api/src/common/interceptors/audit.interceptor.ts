import {
  Injectable, NestInterceptor, ExecutionContext,
  CallHandler, Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { AuditService } from '../../audit/audit.service';

// URL-segment → entity type mapping (longest prefix wins)
const ENTITY_MAP: Array<[RegExp, string]> = [
  [/^\/api\/v\d+\/users/,          'User'],
  [/^\/api\/v\d+\/agents/,         'Agent'],
  [/^\/api\/v\d+\/tasks/,          'Task'],
  [/^\/api\/v\d+\/jobs/,           'Job'],
  [/^\/api\/v\d+\/wallet/,         'Wallet'],
  [/^\/api\/v\d+\/organisations/,  'Organisation'],
  [/^\/api\/v\d+\/billing/,        'Billing'],
  [/^\/api\/v\d+\/disputes/,       'Dispute'],
  [/^\/api\/v\d+\/verification/,   'KYC'],
  [/^\/api\/v\d+\/notifications/,  'Notification'],
  [/^\/api\/v\d+\/reports/,        'Report'],
  [/^\/api\/v\d+\/audit/,          'AuditLog'],
  [/^\/api\/v\d+\/auth/,           'Auth'],
  [/^\/api\/v\d+\/skills/,         'Skill'],
  [/^\/api\/v\d+\/applications/,   'Application'],
  [/^\/api\/v\d+\/gps/,            'GPS'],
];

// Fields that must never appear in audit details
const REDACTED_FIELDS = new Set([
  'password', 'currentPassword', 'newPassword', 'confirmPassword',
  'token', 'refreshToken', 'accessToken', 'secret', 'apiKey',
  'pin', 'otp', 'mpin',
]);

// Paths skipped entirely — never worth auditing
const SKIP_PATHS = ['/health', '/api/v1/health'];

const METHOD_ACTION: Record<string, string> = {
  POST:   'CREATE',
  PATCH:  'UPDATE',
  PUT:    'UPDATE',
  DELETE: 'DELETE',
};

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  private readonly log = new Logger(AuditInterceptor.name);

  constructor(private readonly audit: AuditService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const req    = context.switchToHttp().getRequest();
    const method = req.method as string;
    const action = METHOD_ACTION[method];

    if (!action) return next.handle();                       // GET / HEAD / OPTIONS
    if (SKIP_PATHS.some((p) => req.path?.startsWith(p))) return next.handle();

    const startedAt = Date.now();

    return next.handle().pipe(
      tap({
        next: (responseBody) => {
          const res = context.switchToHttp().getResponse();
          if (res.statusCode >= 400) return;   // don't audit failed requests

          const user     = req.user;
          const entity   = this.resolveEntity(req.path ?? '');
          const entityId = this.resolveEntityId(req.path ?? '', responseBody);

          // Fire-and-forget — never let audit block the response
          this.audit
            .record({
              userId:   user?.userId ?? user?.id ?? user?.sub,
              userRole: user?.role,
              orgId:    user?.orgId ?? user?.organisationId,
              action,
              entity,
              entityId,
              details: {
                path:        req.path,
                body:        this.sanitize(req.body),
                durationMs:  Date.now() - startedAt,
              },
              ip: this.resolveIp(req),
            })
            .catch((err) =>
              this.log.error(`Audit write failed: ${(err as Error).message}`),
            );
        },
      }),
    );
  }

  private resolveEntity(path: string): string {
    for (const [pattern, name] of ENTITY_MAP) {
      if (pattern.test(path)) return name;
    }
    // Fallback: capitalise the second path segment (e.g. /api/v1/foo → Foo)
    const seg = path.split('/').filter(Boolean)[2];
    return seg ? seg.charAt(0).toUpperCase() + seg.slice(1) : 'Unknown';
  }

  private resolveEntityId(
    path: string,
    body: any,
  ): string | undefined {
    // Try the last UUID-looking segment in the path
    const parts = path.split('/').filter(Boolean);
    for (let i = parts.length - 1; i >= 0; i--) {
      if (/^[0-9a-f-]{36}$/i.test(parts[i])) return parts[i];
    }
    // Fall back to common ID fields in the response body
    if (body && typeof body === 'object') {
      return body.id ?? body.userId ?? body.agentId ?? undefined;
    }
    return undefined;
  }

  private sanitize(body: any): any {
    if (!body || typeof body !== 'object') return body;
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(body)) {
      out[k] = REDACTED_FIELDS.has(k) ? '[REDACTED]' : v;
    }
    return out;
  }

  private resolveIp(req: any): string {
    const forwarded = req.headers?.['x-forwarded-for'];
    if (forwarded) {
      return (Array.isArray(forwarded) ? forwarded[0] : forwarded)
        .split(',')[0].trim();
    }
    return req.ip ?? '';
  }
}
