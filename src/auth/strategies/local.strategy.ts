import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Request } from 'express';
import { Strategy } from 'passport-local';
import { UserService } from 'src/user/user.service';

@Injectable()
export class LocalStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly userService: UserService) {
    super({
      usernameField: 'username',
      passwordField: 'password',
      passReqToCallback: true, // Pass request to validate method
    });
  }

  async validate(req: Request, username: string, password: string) {
    try {
      // Extract metadata from request if available
      const metadata =
        req && req.headers
          ? {
              ipAddress: (req.headers['x-forwarded-for'] ||
                req.headers['x-real-ip'] ||
                req.socket?.remoteAddress ||
                req.ip) as string,
              userAgent: req.headers['user-agent'],
            }
          : undefined;

      const user = await this.userService.validateUser(
        username,
        password,
        metadata,
      );

      if (!user) {
        throw new UnauthorizedException('Invalid username or password');
      }

      return user;
    } catch (error: unknown) {
      console.log(error);
      // Re-throw UnauthorizedException if account is deactivated or locked
      if (error instanceof UnauthorizedException) {
        throw error;
      }

      throw new UnauthorizedException('Invalid username or password');
    }
  }
}
