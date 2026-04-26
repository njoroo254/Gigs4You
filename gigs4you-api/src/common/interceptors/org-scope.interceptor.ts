import {
  Injectable, NestInterceptor, ExecutionContext, CallHandler,
  Logger, ForbiddenException,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { Reflector } from '@nestjs/core';

export const ORG_SCOPED_KEY = 'org_scoped';

// Roles where org isolation is mandatory — a missing orgId is a misconfiguration
const ORG_REQUIRED_ROLES = new Set(['admin', 'manager', 'supervisor', 'agent']);

@Injectable()
export class OrgScopeInterceptor implements NestInterceptor {
  private readonly log = new Logger('OrgScope');

  constructor(private reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const user = request?.user;

    if (!user) return next.handle(); // unauthenticated — let auth guards handle

    const { role, orgId, userId } = user;

    if (role === 'super_admin') return next.handle(); // super_admin is exempt

    if (ORG_REQUIRED_ROLES.has(role) && !orgId) {
      this.log.error(
        `CRITICAL: user ${userId} has role "${role}" but no orgId in JWT — ` +
        `request blocked. Check token issuance in auth.service.ts signToken().`,
      );
      throw new ForbiddenException('Organisation context is required for your role');
    }

    return next.handle();
  }
}
