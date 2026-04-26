import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import axios from 'axios';
import { ConfigService } from '@nestjs/config';
import { createDependencyFailure } from '../common/errors/dependency-failure';

@Injectable()
export class MpesaService {
  private readonly logger = new Logger(MpesaService.name);

  constructor(private config: ConfigService) {}

  private throwMpesaError(error: any, operation: string, target: string): never {
    const message = error?.response?.data?.errorMessage;
    if (message && error?.response?.status && error.response.status < 500) {
      throw new BadRequestException(message);
    }

    this.logger.error(
      `M-Pesa dependency failure during ${operation} (${target}): ${error?.message || 'unknown error'}`,
    );
    throw createDependencyFailure('M-Pesa Daraja', operation, target, error);
  }

  // ── Get OAuth token from Daraja ───────────────────
  private async getToken(): Promise<string> {
    const key    = this.config.get('MPESA_CONSUMER_KEY');
    const secret = this.config.get('MPESA_CONSUMER_SECRET');
    const env    = this.config.get('MPESA_ENV') || 'sandbox';
    const baseUrl = env === 'production'
      ? 'https://api.safaricom.co.ke'
      : 'https://sandbox.safaricom.co.ke';

    try {
      const credentials = Buffer.from(`${key}:${secret}`).toString('base64');
      const target = `${baseUrl}/oauth/v1/generate?grant_type=client_credentials`;
      const res = await axios.get(target, {
        headers: { Authorization: `Basic ${credentials}` },
        timeout: 15_000,
      });
      return res.data.access_token;
    } catch (err: any) {
      if (err?.response?.status && err.response.status < 500) {
        throw new BadRequestException('Could not authenticate with M-Pesa. Check Daraja credentials.');
      }
      this.throwMpesaError(err, 'request OAuth token', `${baseUrl}/oauth/v1/generate`);
    }
  }

  private get baseUrl(): string {
    const env = this.config.get('MPESA_ENV') || 'sandbox';
    return env === 'production'
      ? 'https://api.safaricom.co.ke'
      : 'https://sandbox.safaricom.co.ke';
  }

  // ── B2C — Pay a single agent ──────────────────────
  async b2cPayment(params: {
    phone:         string;   // e.g. 254712345678
    amount:        number;   // KES
    commandId:     string;   // 'BusinessPayment' | 'SalaryPayment'
    remarks:       string;
    occasion?:     string;
  }): Promise<any> {
    const token = await this.getToken();
    const shortCode = this.config.get('MPESA_SHORTCODE');
    const initiatorName = this.config.get('MPESA_INITIATOR_NAME');
    const securityCredential = this.config.get('MPESA_SECURITY_CREDENTIAL');
    const callbackUrl = this.config.get('MPESA_B2C_RESULT_URL') || 'https://your-domain.com/api/v1/mpesa/b2c-result';

    // Sanitise phone — ensure 254XXXXXXXXX format
    const phone = params.phone.replace(/^0/, '254').replace(/^\+/, '');

    const payload = {
      InitiatorName:      initiatorName,
      SecurityCredential: securityCredential,
      CommandID:          params.commandId || 'BusinessPayment',
      Amount:             Math.round(params.amount),
      PartyA:             shortCode,
      PartyB:             phone,
      Remarks:            params.remarks,
      QueueTimeOutURL:    callbackUrl,
      ResultURL:          callbackUrl,
      Occasion:           params.occasion || '',
    };

    try {
      const target = `${this.baseUrl}/mpesa/b2c/v3/paymentrequest`;
      const res = await axios.post(target, payload, {
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        timeout: 20_000,
      });
      return res.data;
    } catch (err: any) {
      this.throwMpesaError(err, 'send B2C payment', `${this.baseUrl}/mpesa/b2c/v3/paymentrequest`);
    }
  }

  // ── STK Push — request payment FROM customer ─────
  async stkPush(params: {
    phone:       string;
    amount:      number;
    accountRef:  string;
    description: string;
  }): Promise<any> {
    const token = await this.getToken();
    const shortCode = this.config.get('MPESA_SHORTCODE');
    const passkey   = this.config.get('MPESA_PASSKEY');
    const callbackUrl = this.config.get('MPESA_STK_CALLBACK_URL') || 'https://your-domain.com/api/v1/mpesa/stk-callback';

    const timestamp = new Date().toISOString().replace(/[-:T.Z]/g, '').slice(0, 14);
    const password  = Buffer.from(`${shortCode}${passkey}${timestamp}`).toString('base64');
    const phone     = params.phone.replace(/^0/, '254').replace(/^\+/, '');

    const payload = {
      BusinessShortCode: shortCode,
      Password:          password,
      Timestamp:         timestamp,
      TransactionType:   'CustomerPayBillOnline',
      Amount:            Math.round(params.amount),
      PartyA:            phone,
      PartyB:            shortCode,
      PhoneNumber:       phone,
      CallBackURL:       callbackUrl,
      AccountReference:  params.accountRef,
      TransactionDesc:   params.description,
    };

    try {
      const target = `${this.baseUrl}/mpesa/stkpush/v1/processrequest`;
      const res = await axios.post(target, payload, {
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        timeout: 20_000,
      });
      return res.data;
    } catch (err: any) {
      this.throwMpesaError(err, 'initiate STK push', `${this.baseUrl}/mpesa/stkpush/v1/processrequest`);
    }
  }

  // ── Transaction Status query (for reconciliation) ──
  async queryTransactionStatus(params: {
    transactionId?:            string;   // mpesaRef — M-Pesa receipt number
    originatorConversationId?: string;   // mpesaConversationId
    remarks?:                  string;
  }): Promise<any> {
    const token = await this.getToken();
    const shortCode = this.config.get('MPESA_SHORTCODE');
    const initiatorName = this.config.get('MPESA_INITIATOR_NAME');
    const securityCredential = this.config.get('MPESA_SECURITY_CREDENTIAL');
    const resultUrl = this.config.get('MPESA_TX_STATUS_RESULT_URL')
      || 'https://your-domain.com/api/v1/mpesa/tx-status-result';

    const payload = {
      Initiator:                 initiatorName,
      SecurityCredential:        securityCredential,
      CommandID:                 'TransactionStatusQuery',
      TransactionID:             params.transactionId || '',
      OriginatorConversationID:  params.originatorConversationId || '',
      PartyA:                    shortCode,
      IdentifierType:            '4',
      ResultURL:                 resultUrl,
      QueueTimeOutURL:           resultUrl,
      Remarks:                   params.remarks || 'Reconciliation status check',
      Occasion:                  '',
    };

    try {
      const target = `${this.baseUrl}/mpesa/transactionstatus/v1/query`;
      const res = await axios.post(target, payload, {
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        timeout: 20_000,
      });
      return res.data;
    } catch (err: any) {
      this.throwMpesaError(err, 'query transaction status', `${this.baseUrl}/mpesa/transactionstatus/v1/query`);
    }
  }

  // ── Account balance query ─────────────────────────
  async checkBalance(): Promise<any> {
    const token = await this.getToken();
    const shortCode = this.config.get('MPESA_SHORTCODE');
    const initiatorName = this.config.get('MPESA_INITIATOR_NAME');
    const securityCredential = this.config.get('MPESA_SECURITY_CREDENTIAL');
    const resultUrl = this.config.get('MPESA_BALANCE_RESULT_URL') || 'https://your-domain.com/api/v1/mpesa/balance-result';

    const payload = {
      Initiator:          initiatorName,
      SecurityCredential: securityCredential,
      CommandID:          'AccountBalance',
      PartyA:             shortCode,
      IdentifierType:     '4',
      Remarks:            'Balance query',
      QueueTimeOutURL:    resultUrl,
      ResultURL:          resultUrl,
    };

    try {
      const target = `${this.baseUrl}/mpesa/accountbalance/v1/query`;
      const res = await axios.post(target, payload, {
        headers: { Authorization: `Bearer ${token}` },
        timeout: 20_000,
      });
      return res.data;
    } catch (err: any) {
      this.throwMpesaError(err, 'query account balance', `${this.baseUrl}/mpesa/accountbalance/v1/query`);
    }
  }
}
