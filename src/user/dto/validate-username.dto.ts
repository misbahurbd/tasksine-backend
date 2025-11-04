import { IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ValidateUsernameDto {
  @ApiProperty({
    description: 'Username to validate',
    example: 'johndoe',
    minLength: 3,
    maxLength: 32,
  })
  @IsString()
  @MinLength(3, { message: 'Username must be at least 3 characters long' })
  @MaxLength(32, { message: 'Username must not exceed 32 characters' })
  @Matches(/^[a-z0-9_]+$/, {
    message:
      'Username can only contain lowercase letters, numbers, and underscores',
  })
  username: string;
}

export class UsernameValidationResponseDto {
  @ApiProperty({
    description: 'Whether the username is available',
    example: true,
  })
  isAvailable: boolean;

  @ApiProperty({
    description:
      'Suggested alternative usernames if the requested username is not available',
    example: ['johndoe123', 'johndoe_2024', 'john_doe'],
    type: [String],
    required: false,
  })
  suggestions?: string[];
}
