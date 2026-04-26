// src/tasks/dto/create-task.dto.ts
import {
  IsString, IsNotEmpty, IsEnum, IsOptional,
  IsNumber, IsDateString, IsUUID,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { TaskPriority } from '../task.entity';

export class CreateTaskDto {
  @ApiProperty({ example: 'Visit Shop XYZ — Westlands' })
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiProperty({ example: 'Capture shelf stock photos and count SKUs', required: false })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({ enum: TaskPriority, default: TaskPriority.MEDIUM })
  @IsEnum(TaskPriority)
  @IsOptional()
  priority?: TaskPriority;

  @ApiProperty({ example: '-1.2921' })
  @IsNumber()
  @IsOptional()
  latitude?: number;

  @ApiProperty({ example: '36.8219' })
  @IsNumber()
  @IsOptional()
  longitude?: number;

  @ApiProperty({ example: 'Westlands Shopping Centre' })
  @IsString()
  @IsOptional()
  locationName?: string;

  @ApiProperty({ example: '2025-03-22T11:00:00.000Z' })
  @IsDateString()
  @IsOptional()
  dueAt?: string;

  @ApiProperty({ example: 'uuid-of-agent' })
  @IsUUID()
  @IsOptional()
  agentId?: string;

  @ApiProperty({ example: 50 })
  @IsNumber()
  @IsOptional()
  xpReward?: number;

  @ApiProperty({ default: false })
  @IsOptional()
  requiresPhoto?: boolean;

  @ApiProperty({ default: false })
  @IsOptional()
  requiresSignature?: boolean;

  @ApiProperty({ default: 120, description: 'Minutes agent has to accept the task' })
  @IsNumber()
  @IsOptional()
  acceptanceWindowMinutes?: number;

  @ApiProperty({ type: 'array', description: 'Checklist items the agent must complete' })
  @IsOptional()
  checklist?: Array<{ label: string; required?: boolean }>;
}
