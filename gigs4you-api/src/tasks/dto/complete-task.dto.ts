import { IsString, IsOptional, IsArray, IsNumber, IsBoolean } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CompleteTaskDto {
  @ApiProperty({ example: 'Visited shop, counted 42 SKUs, all shelves stocked', required: false })
  @IsString()
  @IsOptional()
  notes?: string;

  @ApiProperty({ example: ['https://minio/photos/photo1.jpg'], required: false })
  @IsArray()
  @IsOptional()
  photoUrls?: string[];

  @ApiProperty({ example: 'https://minio/signatures/sig1.png', required: false })
  @IsString()
  @IsOptional()
  customerSignatureUrl?: string;

  @ApiProperty({ example: -1.2921, description: 'GPS latitude where task was submitted', required: false })
  @IsNumber()
  @IsOptional()
  submittedLatitude?: number;

  @ApiProperty({ example: 36.8219, description: 'GPS longitude where task was submitted', required: false })
  @IsNumber()
  @IsOptional()
  submittedLongitude?: number;

  @ApiProperty({
    description: 'Checklist item states — agent marks which items were completed',
    required: false,
    example: [{ id: 'ci_0_1234567890', checked: true }],
  })
  @IsArray()
  @IsOptional()
  checklistState?: Array<{ id: string; checked: boolean }>;
}
