import {
  Injectable, CanActivate, ExecutionContext, ForbiddenException,
} from '@nestjs/common';

/**
 * TenancyGuard — attach to any route where cross-org data leakage is a risk.
 * Reads organisationId from the JWT payload (set by JwtStrategy) and compares
 * it against a :orgId route param or ?orgId query param.
 *
 * Super-admin bypasses this guard entirely.
 */
@Injectable()
export class TenancyGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const req    = ctx.switchToHttp().getRequest();
    const user   = req.user;
    if (!user) return false;
    if (user.role === 'super_admin') return true; // SA sees all orgs

    const paramOrgId = req.params?.organisationId || req.params?.orgId;
    const queryOrgId = req.query?.orgId;
    const requestedOrg = paramOrgId || queryOrgId;

    // If no org is being requested specifically, allow (service layer scopes)
    if (!requestedOrg) return true;

    if (user.orgId !== requestedOrg) {
      throw new ForbiddenException('You do not have access to this organisation\'s data.');
    }
    return true;
  }
}
