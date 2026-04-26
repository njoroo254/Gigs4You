import { Controller, Post, Body, HttpException, HttpStatus } from '@nestjs/common';
import { Logger } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { EmailService } from '../email/email.service';

interface ContactFormData {
  name: string;
  phone: string;
  email?: string;
  company?: string;
  agents?: string;
  message?: string;
}

@ApiTags('Contact')
@Controller('contact')
export class ContactController {
  private readonly logger = new Logger(ContactController.name);

  constructor(private emailService: EmailService) {}

  @Throttle({ default: { ttl: 3600_000, limit: 5 } })  // 5 per hour per IP
  @Post()
  @ApiOperation({ summary: 'Submit contact form (public endpoint)' })
  async submitContact(@Body() body: ContactFormData) {
    try {
      if (!body.name || !body.phone) {
        throw new HttpException(
          { message: 'Name and phone are required' },
          HttpStatus.BAD_REQUEST,
        );
      }

      this.logger.log(`📧 Contact form submission: ${body.name} (${body.phone})`);

      const emailSent = await this.emailService.sendContactFormEmail({
        name: body.name,
        phone: body.phone,
        email: body.email,
        company: body.company,
        agents: body.agents,
        message: body.message,
      });

      if (!emailSent) {
        this.logger.warn('Contact email failed to send, but form was received');
      }

      return {
        success: true,
        message: 'Thank you for contacting us. We will respond within 24 hours.',
        data: {
          timestamp: new Date().toISOString(),
          reference: `contact-${Date.now()}`,
          emailSent,
        },
      };
    } catch (error) {
      this.logger.error(`Contact form error: ${(error as Error).message}`);
      throw new HttpException(
        { message: 'Failed to submit contact form' },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}

