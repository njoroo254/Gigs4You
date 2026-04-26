import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class LoginDto {
  @ApiProperty({
    example: '0712345678',
    description: 'Phone number, email address, or username',
  })
  @IsString()
  @IsNotEmpty()
  identifier: string;   // phone | email | username

  @ApiProperty({ example: 'Password123!' })
  @IsString()
  @IsNotEmpty()
  password: string;
}
