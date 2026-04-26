import {
  Controller, Get, Post, UseGuards, UseInterceptors, UploadedFile,
  UploadedFiles, HttpCode, HttpStatus, Query, ParseFilePipe,
  MaxFileSizeValidator, FileTypeValidator, BadRequestException,
} from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiConsumes, ApiBody } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { UploadService } from './upload.service';

@ApiTags('Upload')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('upload')
export class UploadController {
  constructor(private uploadService: UploadService) {}

  // ── POST /upload/avatar ─────────────────────────────────────────────
  @Post('avatar')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Upload avatar / profile photo — returns public URL' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } } })
  @UseInterceptors(FileInterceptor('file'))
  async uploadAvatar(
    @UploadedFile(new ParseFilePipe({
      validators: [
        new MaxFileSizeValidator({ maxSize: 5 * 1024 * 1024 }),  // 5 MB
        new FileTypeValidator({ fileType: /^image\/(jpeg|png|webp)$/ }),
      ],
    })) file: Express.Multer.File,
    @CurrentUser() user: any,
  ) {
    if (!file) throw new Error('No file provided');
    const result = await this.uploadService.upload({
      buffer:      file.buffer,
      mimetype:    file.mimetype,
      originalName: file.originalname,
      bucket:      'avatars',
      folder:      `avatars/${user.userId}`,
    });
    return { url: result.url, key: result.key };
  }

  // ── POST /upload/task-photo ─────────────────────────────────────────
  @Post('task-photo')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Upload task completion photo — returns public URL' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } } })
  @UseInterceptors(FileInterceptor('file'))
  async uploadTaskPhoto(
    @UploadedFile(new ParseFilePipe({
      validators: [
        new MaxFileSizeValidator({ maxSize: 10 * 1024 * 1024 }),  // 10 MB for task photos
        new FileTypeValidator({ fileType: /^image\/(jpeg|png|webp)$/ }),
      ],
    })) file: Express.Multer.File,
    @CurrentUser() user: any,
    @Query('taskId') taskId?: string,
  ) {
    if (!file) throw new Error('No file provided');
    const result = await this.uploadService.upload({
      buffer:      file.buffer,
      mimetype:    file.mimetype,
      originalName: file.originalname,
      bucket:      'task-photos',
      folder:      `task-photos/${taskId || 'misc'}`,
    });
    return { url: result.url, key: result.key };
  }

  // ── POST /upload/task-photos (multiple) ─────────────────────────────
  @Post('task-photos')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Upload multiple task photos at once (max 5)' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FilesInterceptor('files', 5))
  async uploadTaskPhotos(
    @UploadedFiles() files: Express.Multer.File[],
    @CurrentUser() user: any,
    @Query('taskId') taskId?: string,
  ) {
    if (!files?.length) throw new Error('No files provided');
    const results = await Promise.all(
      files.map(f => this.uploadService.upload({
        buffer:   f.buffer,
        mimetype: f.mimetype,
        bucket:   'task-photos',
        folder:   `task-photos/${taskId || 'misc'}`,
      }))
    );
    return { urls: results.map(r => r.url), keys: results.map(r => r.key) };
  }

  // ── POST /upload/kyc-document ───────────────────────────────────────
  @Post('kyc-document')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Upload KYC document (ID front/back/selfie) — returns signed URL (15min)' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
        docType: { type: 'string', enum: ['id_front', 'id_back', 'selfie'] },
      },
    },
  })
  @UseInterceptors(FileInterceptor('file'))
  async uploadKycDocument(
    @UploadedFile(new ParseFilePipe({
      validators: [
        new MaxFileSizeValidator({ maxSize: 8 * 1024 * 1024 }),  // 8 MB — tighter for KYC
        new FileTypeValidator({ fileType: /^image\/(jpeg|png)$/ }),  // JPEG/PNG only — no WebP for identity docs
      ],
    })) file: Express.Multer.File,
    @CurrentUser() user: any,
    @Query('docType') docType: 'id_front' | 'id_back' | 'selfie' = 'id_front',
  ) {
    if (!file) throw new BadRequestException('No file provided');

    // Magic byte validation — confirms the file content matches the declared type,
    // defeating MIME spoofing via a crafted Content-Type header.
    const buf = file.buffer;
    const isJpeg = buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF;
    const isPng  = buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47;
    if (!isJpeg && !isPng) {
      throw new BadRequestException(
        'Identity documents must be a genuine JPEG or PNG image. ' +
        'Please use a photo taken on your phone or a scanned image of your document.',
      );
    }

    const result = await this.uploadService.upload({
      buffer:      file.buffer,
      mimetype:    file.mimetype,
      originalName: file.originalname,
      bucket:      'kyc-documents',
      folder:      `kyc/${user.userId}/${docType}`,
    });
    return {
      url:     result.url,   // Already a signed URL (15min) for KYC
      key:     result.key,
      docType,
      note:    'This URL expires in 15 minutes. For permanent access call GET /upload/signed-url?key=...',
    };
  }

  // ── POST /upload/chat-attachment — images and documents ────────────
  @Post('chat-attachment')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Upload a chat attachment (image or document) — returns public URL' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } } })
  @UseInterceptors(FileInterceptor('file'))
  async uploadChatAttachment(
    @UploadedFile(new ParseFilePipe({
      validators: [
        new MaxFileSizeValidator({ maxSize: 20 * 1024 * 1024 }),  // 20 MB
        new FileTypeValidator({ fileType: /^(image\/(jpeg|png|webp|gif)|application\/(pdf|msword|vnd\.openxmlformats-officedocument\.(wordprocessingml\.document|spreadsheetml\.sheet)))$/ }),
      ],
    })) file: Express.Multer.File,
    @CurrentUser() user: any,
  ) {
    if (!file) throw new Error('No file provided');
    const result = await this.uploadService.upload({
      buffer:       file.buffer,
      mimetype:     file.mimetype,
      originalName: file.originalname,
      bucket:       'attachments',
      folder:       `chat/${user.userId}`,
    });
    return {
      url:          result.url,
      key:          result.key,
      originalName: file.originalname,
      size:         file.size,
      mimetype:     file.mimetype,
    };
  }

  // ── POST /upload/org-document — compliance docs (PDF, JPEG, PNG) ───
  @Post('org-document')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Upload an organisation compliance document (KRA cert, business reg cert, tax compliance cert)' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
        docType: { type: 'string', enum: ['kra_doc', 'business_reg_doc', 'tax_compliance_doc'] },
      },
    },
  })
  @UseInterceptors(FileInterceptor('file'))
  async uploadOrgDocument(
    @UploadedFile(new ParseFilePipe({
      validators: [
        new MaxFileSizeValidator({ maxSize: 20 * 1024 * 1024 }),  // 20 MB for PDFs
        new FileTypeValidator({ fileType: /^(image\/(jpeg|png)|application\/pdf)$/ }),
      ],
    })) file: Express.Multer.File,
    @CurrentUser() user: any,
    @Query('docType') docType: 'kra_doc' | 'business_reg_doc' | 'tax_compliance_doc' = 'kra_doc',
  ) {
    if (!file) throw new BadRequestException('No file provided');

    // Magic byte check: JPEG, PNG, or PDF (%PDF-)
    const buf = file.buffer;
    const isJpeg = buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF;
    const isPng  = buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47;
    const isPdf  = buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46;
    if (!isJpeg && !isPng && !isPdf) {
      throw new BadRequestException(
        'Organisation documents must be a JPEG, PNG, or PDF file. ' +
        'Please upload a scan or photo of your official document.',
      );
    }

    const result = await this.uploadService.upload({
      buffer:      file.buffer,
      mimetype:    file.mimetype,
      originalName: file.originalname,
      bucket:      'org-documents',
      folder:      `org-docs/${user.userId}/${docType}`,
    });
    return {
      url:     result.url,
      key:     result.key,
      docType,
    };
  }

  // ── GET /upload/signed-url — refresh a signed URL ──────────────────
  @Get('signed-url')
  @ApiOperation({ summary: 'Get a fresh signed URL for a private KYC document' })
  async getSignedUrl(@Query('key') key: string) {
    const url = await this.uploadService.getSignedDownloadUrl(key);
    return { url, expiresIn: 900 };
  }
}
