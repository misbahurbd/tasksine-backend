import { Controller, Get, Query } from '@nestjs/common';
import { ApiQuery, ApiTags } from '@nestjs/swagger';
import { UserService } from './user.service';
import {
  ValidateUsernameDto,
  UsernameValidationResponseDto,
} from './dto/validate-username.dto';
import { ApiGetOperation } from 'src/common/decorators/swagger.decorators';

@ApiTags('User')
@Controller('users')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get('validate-username')
  @ApiQuery({
    name: 'username',
    description: 'Username to validate',
    example: 'johndoe',
    required: true,
  })
  @ApiGetOperation(
    'Validate username availability',
    'Checks if a username is available. Returns suggestions if the username is already taken.',
    UsernameValidationResponseDto,
  )
  async validateUsername(
    @Query() query: ValidateUsernameDto,
  ): Promise<UsernameValidationResponseDto> {
    return this.userService.validateUsername(query.username);
  }
}
