import { BadRequestException } from '@nestjs/common';
import { WalletService } from './wallet.service';
import { TransactionStatus, TransactionType } from './wallet.entity';

describe('WalletService', () => {
  const makeWallet = (overrides: Record<string, unknown> = {}) => ({
    id: 'wallet-1',
    agentId: 'agent-1',
    balance: 1000,
    pendingBalance: 0,
    totalEarned: 1000,
    totalWithdrawn: 0,
    currency: 'KES',
    mpesaPhone: null,
    ...overrides,
  });

  const makeTx = (overrides: Record<string, unknown> = {}) => ({
    id: 'tx-1',
    walletId: 'wallet-1',
    type: TransactionType.CREDIT,
    amount: 500,
    description: 'Test payment',
    status: TransactionStatus.COMPLETED,
    reference: 'TXN-2026-ABCDE',
    jobId: null,
    mpesaPhone: null,
    mpesaConversationId: null,
    createdAt: new Date(),
    ...overrides,
  });

  const makeFraudService = () => ({
    assertSafe: jest.fn().mockResolvedValue({
      score: 0,
      flags: [],
      shouldFlag: false,
      shouldBlock: false,
    }),
    scoreWithdrawal: jest.fn(),
  });

  const createBuilder = (result = { affected: 1 }) => ({
    update: jest.fn().mockReturnThis(),
    set: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    execute: jest.fn().mockResolvedValue(result),
  });

  const buildService = (options: {
    wallet?: Record<string, unknown>;
    txById?: Record<string, unknown> | null;
    pendingWithdrawal?: Record<string, unknown> | null;
    reserveResult?: { affected: number };
    settleResult?: { affected: number };
  } = {}) => {
    const wallet = makeWallet(options.wallet);
    const txById = options.txById ? makeTx(options.txById) : null;
    const pendingWithdrawal = options.pendingWithdrawal ? makeTx(options.pendingWithdrawal) : null;
    const builderResults = [
      options.reserveResult ?? { affected: 1 },
      options.settleResult ?? { affected: 1 },
      { affected: 1 },
    ];
    const builders: Array<ReturnType<typeof createBuilder>> = [];

    const walletRepo = {
      findOne: jest.fn().mockImplementation(async (query?: any) => {
        if (query?.where?.agentId) return wallet;
        if (query?.where?.id) return wallet;
        return wallet;
      }),
      create: jest.fn().mockImplementation((payload: any) => ({ ...wallet, ...payload })),
      save: jest.fn().mockImplementation(async (payload: any) => payload),
      update: jest.fn().mockResolvedValue(undefined),
      find: jest.fn().mockResolvedValue([wallet]),
      increment: jest.fn().mockResolvedValue(undefined),
      createQueryBuilder: jest.fn().mockImplementation(() => {
        const builder = createBuilder(builderResults[builders.length] ?? { affected: 1 });
        builders.push(builder);
        return builder;
      }),
    };

    const txRepo = {
      findOne: jest.fn().mockImplementation(async (query?: any) => {
        if (query?.where?.id) return txById;
        if (query?.where?.walletId && query?.where?.status === TransactionStatus.PENDING && query?.where?.type === TransactionType.DEBIT) {
          return pendingWithdrawal;
        }
        return null;
      }),
      create: jest.fn().mockImplementation((payload: any) => ({ id: 'tx-1', ...payload })),
      save: jest.fn().mockImplementation(async (payload: any) => payload),
      update: jest.fn().mockResolvedValue(undefined),
      find: jest.fn().mockResolvedValue(txById ? [txById] : []),
    };

    const redis = {
      set: jest.fn().mockResolvedValue('OK'),
      del: jest.fn().mockResolvedValue(1),
    };

    const pushService = {
      notifyPaymentReceivedByAgentId: jest.fn().mockResolvedValue(undefined),
    };

    const notificationService = {
      notifyPaymentReceived: jest.fn().mockResolvedValue(undefined),
    };

    const notificationsService = {
      notifyPayment: jest.fn(),
      notifyRefund: jest.fn(),
    };

    const auditService = {
      record: jest.fn().mockResolvedValue(undefined),
    };

    const service = new WalletService(
      walletRepo as any,
      txRepo as any,
      { findOne: jest.fn().mockResolvedValue(null) } as any,
      { createQueryRunner: jest.fn() } as any,
      undefined as any,
      pushService as any,
      notificationService as any,
      notificationsService as any,
      auditService as any,
      undefined as any,
      makeFraudService() as any,
      redis as any,
    );

    return {
      service,
      walletRepo,
      txRepo,
      redis,
      builders,
      wallet,
    };
  };

  afterEach(() => jest.clearAllMocks());

  describe('getOrCreate', () => {
    it('returns an existing wallet when found', async () => {
      const { service, wallet } = buildService();
      const result = await service.getOrCreate('agent-1');
      expect(result).toBe(wallet);
    });

    it('creates a wallet when none exists', async () => {
      const newWallet = makeWallet({ balance: 0, pendingBalance: 0 });
      const walletRepo = {
        findOne: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockReturnValue(newWallet),
        save: jest.fn().mockResolvedValue(newWallet),
      };

      const service = new WalletService(
        walletRepo as any,
        {} as any,
        {} as any,
        { createQueryRunner: jest.fn() } as any,
        undefined as any,
        undefined as any,
        undefined as any,
        undefined as any,
        undefined as any,
        undefined as any,
        makeFraudService() as any,
        { set: jest.fn(), del: jest.fn() } as any,
      );

      const result = await service.getOrCreate('agent-1');

      expect(walletRepo.create).toHaveBeenCalledWith({ agentId: 'agent-1', balance: 0, pendingBalance: 0 });
      expect(result).toBe(newWallet);
    });
  });

  describe('creditAgent', () => {
    it('increments balance and total earned, then records a completed credit', async () => {
      const { service, walletRepo, txRepo, wallet } = buildService();

      await service.creditAgent('agent-1', 300, 'Task payment', 'job-42');

      expect(walletRepo.increment).toHaveBeenNthCalledWith(1, { id: wallet.id }, 'balance', 300);
      expect(walletRepo.increment).toHaveBeenNthCalledWith(2, { id: wallet.id }, 'totalEarned', 300);
      expect(txRepo.create).toHaveBeenCalledWith(expect.objectContaining({
        type: TransactionType.CREDIT,
        amount: 300,
        description: 'Task payment',
        status: TransactionStatus.COMPLETED,
        jobId: 'job-42',
      }));
    });
  });

  describe('requestWithdrawal', () => {
    it('rejects withdrawals below KES 10', async () => {
      const { service } = buildService();
      await expect(service.requestWithdrawal('agent-1', 5, '+254700000001'))
        .rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects withdrawals above available balance', async () => {
      const { service } = buildService({ wallet: { balance: 100 } });
      await expect(service.requestWithdrawal('agent-1', 500, '+254700000001'))
        .rejects.toBeInstanceOf(BadRequestException);
    });

    it('reserves funds before creating a pending debit and auto-completes in dev mode', async () => {
      const { service, txRepo, walletRepo, redis } = buildService({
        wallet: { balance: 500, pendingBalance: 0, totalWithdrawn: 0 },
        txById: { type: TransactionType.DEBIT, status: TransactionStatus.PENDING, amount: 100 },
      });

      await service.requestWithdrawal('agent-1', 100, '+254700000001');

      expect(redis.set).toHaveBeenCalledWith('wallet:withdraw:wallet-1', '1', 'EX', 30, 'NX');
      expect(txRepo.create).toHaveBeenCalledWith(expect.objectContaining({
        type: TransactionType.DEBIT,
        amount: 100,
        status: TransactionStatus.PENDING,
        mpesaPhone: '+254700000001',
      }));
      expect(walletRepo.update).toHaveBeenCalledWith('wallet-1', { mpesaPhone: '+254700000001' });
      expect(txRepo.update).toHaveBeenCalledWith('tx-1', { status: TransactionStatus.COMPLETED });
      expect(redis.del).toHaveBeenCalledWith('wallet:withdraw:wallet-1');
    });

    it('rejects a second in-flight withdrawal for the same wallet', async () => {
      const { service } = buildService({
        pendingWithdrawal: { type: TransactionType.DEBIT, status: TransactionStatus.PENDING, amount: 50 },
      });

      await expect(service.requestWithdrawal('agent-1', 100, '+254700000001'))
        .rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('failTransaction', () => {
    it('releases reserved debit funds and marks the transaction failed', async () => {
      const { service, txRepo, builders } = buildService({
        txById: { type: TransactionType.DEBIT, status: TransactionStatus.PENDING, amount: 120 },
      });

      await service.failTransaction('tx-1', 'M-Pesa timeout');

      expect(builders).toHaveLength(1);
      expect(txRepo.update).toHaveBeenCalledWith('tx-1', expect.objectContaining({
        status: TransactionStatus.FAILED,
      }));
    });
  });
});
