import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { UserRole } from '../../users/user.entity';

// Role hierarchy — higher index = more permissions
const ROLE_HIERARCHY: Record<string, number> = {
  [UserRole.WORKER]:      0,  // Freelancer — lowest hierarchy, no org
  [UserRole.AGENT]:       1,
  [UserRole.EMPLOYER]:    2,
  [UserRole.SUPERVISOR]:  3,
  [UserRole.MANAGER]:     4,
  [UserRole.ADMIN]:       5,
  [UserRole.SUPER_ADMIN]: 6,
};

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles || requiredRoles.length === 0) return true;

    const { user } = context.switchToHttp().getRequest();
    if (!user) throw new ForbiddenException('Not authenticated');

    // Super admin bypasses all role checks
    if (user.role === UserRole.SUPER_ADMIN) return true;

    const hasRole = requiredRoles.includes(user.role);
    if (!hasRole) {
      throw new ForbiddenException(
        `Access denied. Required: ${requiredRoles.join(' or ')}. Your role: ${user.role}`
      );
    }
    return true;
  }
}
