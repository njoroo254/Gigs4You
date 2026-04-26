import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

export interface ContactEmailData {
  name: string;
  phone: string;
  email?: string;
  company?: string;
  agents?: string;
  message?: string;
}

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private transporter: nodemailer.Transporter;

  constructor(private config: ConfigService) {
    this.initTransporter();
  }

  private initTransporter() {
    const host = this.config.get('SMTP_HOST');
    const port = +(this.config.get<number>('SMTP_PORT') ?? 587);
    const secure = this.config.get('SMTP_SECURE') === 'true';
    const user = this.config.get('SMTP_USER');
    const pass = this.config.get('SMTP_PASS');

    if (!host || !user || !pass) {
      this.logger.warn('SMTP configuration incomplete — email sending disabled');
      this.transporter = null as any;
      return;
    }

    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: { user, pass },
    });
    this.logger.log('Email transporter initialized');
  }

  async sendContactFormEmail(data: ContactEmailData): Promise<boolean> {
    if (!this.transporter) {
      this.logger.warn('Email transporter not initialized — skipping send');
      return false;
    }

    const toEmail = this.config.get('SMTP_FROM') || 'hello@gigs4you.co.ke';
    const subject = `New Contact Form Submission: ${data.name}`;

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #2563eb; border-bottom: 2px solid #2563eb; padding-bottom: 10px;">
          New Contact Form Submission
        </h2>
        <table style="width: 100%; border-collapse: collapse; margin-top: 20px;">
          <tr>
            <td style="padding: 10px; border-bottom: 1px solid #eee; font-weight: bold; width: 120px;">Name:</td>
            <td style="padding: 10px; border-bottom: 1px solid #eee;">${this.escapeHtml(data.name)}</td>
          </tr>
          <tr>
            <td style="padding: 10px; border-bottom: 1px solid #eee; font-weight: bold;">Phone:</td>
            <td style="padding: 10px; border-bottom: 1px solid #eee;">
              <a href="tel:${data.phone}">${this.escapeHtml(data.phone)}</a>
            </td>
          </tr>
          ${data.email ? `
          <tr>
            <td style="padding: 10px; border-bottom: 1px solid #eee; font-weight: bold;">Email:</td>
            <td style="padding: 10px; border-bottom: 1px solid #eee;">
              <a href="mailto:${data.email}">${this.escapeHtml(data.email)}</a>
            </td>
          </tr>
          ` : ''}
          ${data.company ? `
          <tr>
            <td style="padding: 10px; border-bottom: 1px solid #eee; font-weight: bold;">Company:</td>
            <td style="padding: 10px; border-bottom: 1px solid #eee;">${this.escapeHtml(data.company)}</td>
          </tr>
          ` : ''}
          ${data.agents ? `
          <tr>
            <td style="padding: 10px; border-bottom: 1px solid #eee; font-weight: bold;">Number of Agents:</td>
            <td style="padding: 10px; border-bottom: 1px solid #eee;">${this.escapeHtml(data.agents)}</td>
          </tr>
          ` : ''}
        </table>
        ${data.message ? `
        <div style="margin-top: 20px; padding: 15px; background: #f9fafb; border-radius: 8px;">
          <h3 style="margin: 0 0 10px 0; font-size: 14px; color: #666;">Message:</h3>
          <p style="margin: 0; white-space: pre-wrap;">${this.escapeHtml(data.message)}</p>
        </div>
        ` : ''}
        <div style="margin-top: 30px; padding: 15px; background: #f3f4f6; border-radius: 8px; font-size: 12px; color: #666;">
          Submitted at: ${new Date().toLocaleString('en-KE', { timeZone: 'Africa/Nairobi' })}
        </div>
      </div>
    `;

    const text = `
New Contact Form Submission
===========================

Name: ${data.name}
Phone: ${data.phone}
${data.email ? `Email: ${data.email}` : ''}
${data.company ? `Company: ${data.company}` : ''}
${data.agents ? `Number of Agents: ${data.agents}` : ''}
${data.message ? `\nMessage:\n${data.message}` : ''}

Submitted at: ${new Date().toLocaleString('en-KE', { timeZone: 'Africa/Nairobi' })}
    `.trim();

    try {
      const info = await this.transporter.sendMail({
        from: `"${data.name}" <${toEmail}>`,
        to: toEmail,
        subject,
        text,
        html,
        replyTo: data.email || data.phone,
      });

      this.logger.log(`Contact email sent: ${info.messageId}`);
      return true;
    } catch (error) {
      this.logger.error(`Failed to send contact email: ${(error as Error).message}`);
      return false;
    }
  }

  async sendAdminAlert(subject: string, bodyHtml: string): Promise<boolean> {
    if (!this.transporter) {
      this.logger.warn('Email transporter not initialized — skipping admin alert');
      return false;
    }

    const adminEmail = this.config.get('ADMIN_ALERT_EMAIL') || this.config.get('SMTP_FROM') || 'admin@gigs4you.co.ke';

    try {
      const info = await this.transporter.sendMail({
        from:    `"Gigs4You Platform" <${this.config.get('SMTP_FROM') || adminEmail}>`,
        to:      adminEmail,
        subject: `[Gigs4You Alert] ${subject}`,
        html:    bodyHtml,
      });
      this.logger.log(`Admin alert sent: ${info.messageId}`);
      return true;
    } catch (error) {
      this.logger.error(`Failed to send admin alert: ${(error as Error).message}`);
      return false;
    }
  }

  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}
