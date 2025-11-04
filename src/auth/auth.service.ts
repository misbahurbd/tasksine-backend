import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/common/prisma/prisma.service';
import { RegisterDto } from './dto/register.dto';
import { UserService } from 'src/user/user.service';
import { OAuthProfile } from 'src/user/interfaces/oAuth-profile.interface';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly userService: UserService,
  ) {}

  async register(userData: RegisterDto) {
    const user = await this.userService.createUser(userData);

    return user;
  }

  async oAuthLogin(profile: OAuthProfile) {
    const user = await this.userService.findOrCreateOAuthUser(profile);

    return user;
  }
}
