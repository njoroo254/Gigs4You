import { Injectable, UnauthorizedException, ForbiddenException, Inject } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '../users/users.service';
import { OrganisationsService } from '../organisations/organisations.service';
import { UserRole } from '../users/user.entity';
import { REDIS_CLIENT } from '../common/redis.provider';
import type Redis from 'ioredis';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private readonly usersService: UsersService,
    private readonly orgsService: OrganisationsService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get('JWT_SECRET'),
    });
  }

  async validate(payload: any) {
    const userId = payload.sub;

    // ── 0. Reject denylisted access tokens (post-logout) ─────────────────
    if (payload?.jti) {
      const denied = await this.redis.exists(`auth:denylist:${payload.jti}`);
      if (denied) throw new UnauthorizedException('Token has been revoked.');
    }

    // ── 1. Verify the user still exists and is active ─────────────────────
    let user: any;
    try {
      user = await this.usersService.findById(userId);
    } catch {
      throw new UnauthorizedException('Account not found.');
    }

    if (!user.isActive) {
      throw new UnauthorizedException(
        'Your account has been deactivated. Contact support.',
      );
    }

    // ── 2. Verify the organisation is active (non-super_admin only) ───────
    const orgId = payload.orgId || user.organisationId;
    if (orgId && user.role !== UserRole.SUPER_ADMIN) {
      try {
        const org = await this.orgsService.findById(orgId);
        if (!org.isActive) {
          throw new ForbiddenException(
            'Your organisation is inactive. Contact your super-administrator.',
          );
        }
      } catch (err: any) {
        // Re-throw ForbiddenException as-is; swallow NotFoundException (org deleted)
        if (err instanceof ForbiddenException) throw err;
      }
    }

    return {
      id:     user.id,
      userId: user.id,
      jti:    payload.jti,
      email:  user.email,
      phone:  user.phone,
      role:   user.role,
      name:   user.name,
      orgId,
    };
  }
}
