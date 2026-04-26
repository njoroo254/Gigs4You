import { IsString, IsNotEmpty, MinLength, IsOptional, IsEmail } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RegisterDto {
  @ApiProperty({ example: 'Peter Mwangi' })
  @IsString() @IsNotEmpty()
  name: string;

  @ApiProperty({ example: '0712345678' })
  @IsString() @IsNotEmpty()
  phone: string;

  @ApiProperty({ example: 'peter@company.co.ke', required: false })
  @IsEmail() @IsOptional()
  email?: string;

  @ApiProperty({ example: 'Password123!' })
  @IsString() @MinLength(6)
  password: string;

  @ApiProperty({ 
    description: 'Role: worker (freelancer) or admin (org admin). Other roles are created by admins.',
    example: 'worker', required: false 
  })
  @IsString() @IsOptional()
  role?: string;   // 'worker' | 'admin' | 'employer' — public registration only

  @ApiProperty({ example: 'Bidco Africa Ltd', required: false })
  @IsString() @IsOptional()
  companyName?: string;

  @ApiProperty({ example: 'Nairobi', required: false })
  @IsString() @IsOptional()
  county?: string;

  @ApiProperty({ example: 'org-uuid', required: false })
  @IsString() @IsOptional()
  organisationId?: string;
}
