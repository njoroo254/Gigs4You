import { Injectable, Scope, Inject, ForbiddenException } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { Request } from 'express';

// Roles that must always have an organisationId in their JWT
const ORG_REQUIRED_ROLES = new Set(['admin', 'manager', 'supervisor', 'agent']);

@Injectable({ scope: Scope.REQUEST })
export class OrgContextService {
  private readonly user: any;

  constructor(@Inject(REQUEST) request: Request) {
    this.user = (request as any).user ?? null;
  }

  /** Returns the caller's organisationId, or undefined for super_admin (sees all). */
  getOrgId(): string | undefined {
    return this.user?.orgId ?? undefined;
  }

  getRole(): string | undefined {
    return this.user?.role;
  }

  isSuperAdmin(): boolean {
    return this.user?.role === 'super_admin';
  }

  /**
   * Returns the org filter to apply to a query:
   * - super_admin: returns undefined (no filter — sees all orgs)
   * - all others:  returns their orgId (scoped to own org)
   *
   * Throws ForbiddenException if an org-required role has no orgId (misconfigured JWT).
   */
  scopedOrgId(): string | undefined {
    if (this.isSuperAdmin()) return undefined;
    const orgId = this.getOrgId();
    if (!orgId && ORG_REQUIRED_ROLES.has(this.user?.role ?? '')) {
      throw new ForbiddenException('Organisation context is required for your role');
    }
    return orgId;
  }
}
