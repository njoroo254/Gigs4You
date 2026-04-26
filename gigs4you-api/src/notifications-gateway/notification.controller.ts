import { Controller, Post, Body, UseGuards, Logger } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { NotificationService } from './notification.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { UserRole } from '../users/user.entity';

@ApiTags('Notifications')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('notifications-admin')
export class NotificationController {
  private readonly log = new Logger(NotificationController.name);

  constructor(private readonly notif: NotificationService) {}

  /**
   * POST /notifications-admin/test-email
   * Super-admin only — sends a test email to diagnose SMTP configuration.
   */
  @Post('test-email')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @ApiOperation({ summary: 'Send a test email to verify SMTP config (super_admin only)' })
  async testEmail(
    @CurrentUser() user: any,
    @Body('to') to?: string,
  ) {
    const recipient = to || user.email;
    if (!recipient) return { ok: false, error: 'No recipient email — set one in your profile or pass "to" in body' };

    const now = new Date();
    const dateStr = now.toLocaleString('en-KE', { dateStyle: 'long', timeStyle: 'short' });
    try {
      await this.notif.sendEmail({
        to:      recipient,
        subject: 'Gigs4You — Email delivery test',
        text:    `Hi,\n\nThis is a delivery test from the Gigs4You platform. Your email notifications are configured correctly.\n\nSent: ${dateStr}\n\n— The Gigs4You Team`,
        html:    `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F3F4F6;font-family:Arial,Helvetica,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:32px 0">
    <tr><td align="center">
      <table width="520" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08)">
        <!-- Header -->
        <tr>
          <td style="background:#1B6B3A;padding:28px 32px;text-align:center">
            <table cellpadding="0" cellspacing="0" style="display:inline-table">
              <tr>
                <td style="background:#fff;border-radius:50%;width:44px;height:44px;text-align:center;vertical-align:middle;font-size:22px;line-height:44px">
                  📍
                </td>
                <td style="padding-left:12px;vertical-align:middle">
                  <span style="color:#fff;font-size:22px;font-weight:700;letter-spacing:-0.5px">Gigs4You</span>
                </td>
              </tr>
            </table>
            <p style="color:rgba(255,255,255,0.8);font-size:12px;margin:10px 0 0">Connecting talent with opportunity across Kenya</p>
          </td>
        </tr>
        <!-- Body -->
        <tr>
          <td style="padding:36px 32px">
            <h2 style="margin:0 0 8px;color:#111827;font-size:20px;font-weight:700">Email delivery confirmed ✅</h2>
            <p style="margin:0 0 24px;color:#4B5563;font-size:14px;line-height:1.6">
              Your Gigs4You platform is correctly configured to send email notifications.
              This test was triggered from the platform settings.
            </p>
            <table cellpadding="0" cellspacing="0" width="100%" style="background:#F0FDF4;border:1px solid #BBF7D0;border-radius:8px;margin-bottom:24px">
              <tr>
                <td style="padding:16px 20px">
                  <p style="margin:0;color:#166534;font-size:13px;font-weight:600">Delivery details</p>
                  <p style="margin:6px 0 0;color:#15803D;font-size:13px">Recipient: <strong>${recipient}</strong></p>
                  <p style="margin:4px 0 0;color:#15803D;font-size:13px">Sent: <strong>${dateStr}</strong></p>
                  <p style="margin:4px 0 0;color:#15803D;font-size:13px">Provider: Gmail SMTP</p>
                </td>
              </tr>
            </table>
            <p style="margin:0;color:#6B7280;font-size:13px;line-height:1.6">
              If you received this email, push notifications, SMS, and in-app alerts are ready to deliver
              to your agents and managers across the platform.
            </p>
          </td>
        </tr>
        <!-- Footer -->
        <tr>
          <td style="background:#F9FAFB;border-top:1px solid #E5E7EB;padding:20px 32px;text-align:center">
            <p style="margin:0;color:#9CA3AF;font-size:11px">
              © ${now.getFullYear()} Gigs4You · Nairobi, Kenya<br>
              <span style="color:#D1D5DB">This is an automated system test — no action required.</span>
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
      });
      this.log.log(`Test email sent to ${recipient}`);
      return { ok: true, sentTo: recipient, message: 'Test email sent — check your inbox' };
    } catch (e: any) {
      this.log.error('Test email failed', e.message);
      return { ok: false, error: e.message };
    }
  }

  /**
   * POST /notifications-admin/test-sms
   * Send a test SMS via Africa's Talking to diagnose SMS config.
   */
  @Post('test-sms')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @ApiOperation({ summary: 'Send a test SMS to verify Africa\'s Talking config (super_admin only)' })
  async testSms(
    @CurrentUser() user: any,
    @Body('to') to?: string,
  ) {
    const recipient = to || user.phone;
    if (!recipient) return { ok: false, error: 'No phone number — pass "to" in body' };

    try {
      await this.notif.sendSms(recipient, `[Gigs4You] SMS test — Africa's Talking is working. ${new Date().toLocaleString()}`);
      return { ok: true, sentTo: recipient, message: 'Test SMS sent' };
    } catch (e: any) {
      return { ok: false, error: e.message };
    }
  }
}
