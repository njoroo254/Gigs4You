import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { UploadService } from './upload.service';
import { UploadController } from './upload.controller';

@Module({
  imports: [
    MulterModule.register({
      storage: memoryStorage(),    // keep in memory — we stream to S3 directly
      limits: { fileSize: 10 * 1024 * 1024 },  // 10 MB hard limit
    }),
  ],
  providers:   [UploadService],
  controllers: [UploadController],
  exports:     [UploadService],
})
export class UploadModule {}
