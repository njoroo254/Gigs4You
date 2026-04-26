import { SetMetadata } from '@nestjs/common';

/**
 * Documents that this controller method enforces org-level data isolation.
 * Applied automatically by the OrgScopeInterceptor for required roles;
 * use this decorator explicitly on endpoints where org scoping is critical
 * so code reviewers and the audit report can verify coverage.
 */
export const EnforceOrgScope = () => SetMetadata('org_scoped', true);
