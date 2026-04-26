import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  const buildUser = () => ({
    id: 'user-1',
    name: 'Grace Wanjiku',
    phone: '+254700000001',
    email: 'grace@example.com',
    username: 'grace',
    role: 'worker',
    companyName: null,
    county: 'Nairobi',
    organisationId: null,
    permissions: {},
    password: 'hashed',
    isActive: true,
  });

  const createRedisMock = () => {
    const store = new Map<string, string>();
    return {
      store,
      get: jest.fn(async (key: string) => store.get(key) ?? null),
      set: jest.fn(async (key: string, value: string) => {
        store.set(key, value);
        return 'OK';
      }),
      incr: jest.fn(async (key: string) => {
        const next = Number(store.get(key) ?? '0') + 1;
        store.set(key, String(next));
        return next;
      }),
      expire: jest.fn(async () => 1),
      del: jest.fn(async (...keys: string[]) => {
        keys.flat().forEach((key) => store.delete(key));
        return keys.length;
      }),
    };
  };

  const createService = () => {
    const usersService = {
      findByIdentifier: jest.fn(),
      findById: jest.fn(),
      findByPhone: jest.fn(),
      findByEmail: jest.fn(),
      generateUsername: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    };
    const agentsService = {
      findByUserId: jest.fn(),
      createForUser: jest.fn(),
      findAll: jest.fn(),
    };
    const planLimits = {
      checkAgentLimit: jest.fn(),
    };
    const notificationService = {
      sendSms: jest.fn(),
      sendEmail: jest.fn(),
    };
    const orgsService = {
      create: jest.fn(),
    };
    const jwtService = {
      sign: jest.fn().mockImplementation((payload: any, options?: any) => {
        if (options?.secret) {
          return `refresh:${payload.jti}`;
        }
        return `access:${payload.sub}`;
      }),
      verify: jest.fn(),
    } as unknown as JwtService;
    const configService = {
      get: jest.fn((key: string) => {
        const values: Record<string, string> = {
          JWT_SECRET: 'access-secret',
          JWT_REFRESH_SECRET: 'refresh-secret',
          JWT_REFRESH_EXPIRES_IN: '30d',
        };
        return values[key];
      }),
      getOrThrow: jest.fn((key: string) => {
        const values: Record<string, string> = {
          JWT_REFRESH_SECRET: 'refresh-secret',
        };
        return values[key];
      }),
    } as unknown as ConfigService;
    const auditService = {
      record: jest.fn(),
    };
    const redis = createRedisMock();

    const service = new AuthService(
      usersService as any,
      agentsService as any,
      planLimits as any,
      notificationService as any,
      orgsService as any,
      jwtService,
      configService,
      auditService as any,
      redis as any,
    );

    return {
      service,
      usersService,
      notificationService,
      jwtService,
      redis,
    };
  };

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('stores password reset OTPs in Redis instead of process memory', async () => {
    const { service, usersService, notificationService, redis } = createService();
    usersService.findByIdentifier.mockResolvedValue(buildUser());
    notificationService.sendSms.mockResolvedValue(undefined);
    notificationService.sendEmail.mockResolvedValue(undefined);

    await service.forgotPassword('grace@example.com');

    expect(redis.set).toHaveBeenCalledTimes(2);
    expect(redis.set).toHaveBeenNthCalledWith(
      1,
      expect.stringMatching(/^auth:otp:code:\d{6}$/),
      'user-1',
      'EX',
      900,
    );
    expect(redis.set).toHaveBeenNthCalledWith(
      2,
      'auth:otp:user:user-1',
      expect.stringMatching(/^\d{6}$/),
      'EX',
      900,
    );
    expect(notificationService.sendSms).toHaveBeenCalled();
  });

  it('rotates refresh sessions when exchanging a refresh token', async () => {
    const { service, usersService, jwtService, redis } = createService();
    const user = buildUser();
    usersService.findById.mockResolvedValue(user);
    redis.store.set('auth:refresh:old-session', 'user-1');
    (jwtService.verify as jest.Mock).mockReturnValue({
      sub: 'user-1',
      type: 'refresh',
      jti: 'old-session',
    });

    const result = await service.refresh('refresh-token');

    expect(redis.del).toHaveBeenCalledWith('auth:refresh:old-session');
    expect(redis.set).toHaveBeenCalledWith(
      expect.stringMatching(/^auth:refresh:/),
      'user-1',
      'EX',
      2592000,
    );
    expect(result.access_token).toBe('access:user-1');
    expect(result.refresh_token).toMatch(/^refresh:/);
  });
});
