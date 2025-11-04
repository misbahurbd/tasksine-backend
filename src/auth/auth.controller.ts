import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiExcludeEndpoint, ApiTags } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { RegisterResponseDto } from './dto/register-response.dto';
import { LoginResponseDto } from './dto/login-response.dto';
import { Request, Response } from 'express';
import { LocalAuthGuard } from './guards/local-auth.guard';
import { GoogleAuthGuard } from './guards/google-auth.guard';
import { GitHubAuthGuard } from './guards/github-auth.guard';
import { ConfigService } from '@nestjs/config';
import { OAuthProfile } from 'src/user/interfaces/oAuth-profile.interface';
import {
  ApiOAuthInit,
  ApiPostOperation,
} from 'src/common/decorators/swagger.decorators';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly authService: AuthService,
  ) {}

  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @ApiPostOperation(
    'Register a new user',
    'Creates a new user account with email, username, name, and password',
    RegisterResponseDto,
  )
  async register(@Body() registerDto: RegisterDto) {
    try {
      const result = await this.authService.register(registerDto);
      return {
        message: 'User registered successfully',
        data: result,
      };
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.error(
        `Registration failed for email: ${registerDto.email} - ${err.message}`,
        err.stack,
      );
      throw error;
    }
  }

  @UseGuards(LocalAuthGuard)
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiPostOperation(
    'Login user',
    'Authenticates user with username/email and password. Returns user data and creates a session.',
    LoginResponseDto,
  )
  login(@Req() req: Request) {
    return {
      message: 'User login successfully',
      data: req.user,
    };
  }

  @Get('google')
  @UseGuards(GoogleAuthGuard)
  @ApiOAuthInit('google')
  googleAuth() {}

  @Get('google/callback')
  @UseGuards(GoogleAuthGuard)
  @ApiExcludeEndpoint()
  async googleAuthCallback(@Req() req: Request, @Res() res: Response) {
    const frontendUrl = this.configService.getOrThrow<string>('CLIENT_ORIGIN');

    try {
      if (!req.user) {
        this.logger.warn('Google OAuth callback: No user in request');
        return res.redirect(
          `${frontendUrl}/auth/login?error=oauth_failed&provider=google`,
        );
      }

      const profile = req.user as OAuthProfile;
      const user = await this.authService.oAuthLogin(profile);

      if (!user) {
        this.logger.warn(
          `Google OAuth login failed: User not found or created for ${profile.email}`,
        );
        return res.redirect(
          `${frontendUrl}/auth/login?error=user_not_found&provider=google`,
        );
      }

      req.logIn(user, (err: Error | null) => {
        if (err) {
          this.logger.error(
            `Session creation failed for user ${user.id}: ${err.message}`,
            err.stack,
          );
          return res.redirect(
            `${frontendUrl}/auth/login?error=session_failed&provider=google`,
          );
        }

        return res.redirect(`${frontendUrl}/dashboard`);
      });
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.error(
        `Google OAuth callback error: ${err.message}`,
        err.stack,
      );
      return res.redirect(
        `${frontendUrl}/auth/login?error=oauth_failed&provider=google`,
      );
    }
  }

  @Get('github')
  @UseGuards(GitHubAuthGuard)
  @ApiOAuthInit('github')
  githubAuth() {}

  @Get('github/callback')
  @UseGuards(GitHubAuthGuard)
  @ApiExcludeEndpoint()
  async githubAuthCallback(@Req() req: Request, @Res() res: Response) {
    const frontendUrl = this.configService.getOrThrow<string>('CLIENT_ORIGIN');

    try {
      if (!req.user) {
        this.logger.warn('GitHub OAuth callback: No user in request');
        return res.redirect(
          `${frontendUrl}/auth/login?error=oauth_failed&provider=github`,
        );
      }

      const profile = req.user as OAuthProfile;
      const user = await this.authService.oAuthLogin(profile);

      if (!user) {
        this.logger.warn(
          `GitHub OAuth login failed: User not found or created for ${profile.email}`,
        );
        return res.redirect(
          `${frontendUrl}/auth/login?error=user_not_found&provider=github`,
        );
      }

      req.logIn(user, (err: Error | null) => {
        if (err) {
          this.logger.error(
            `Session creation failed for user ${user.id}: ${err.message}`,
            err.stack,
          );
          return res.redirect(
            `${frontendUrl}/auth/login?error=session_failed&provider=github`,
          );
        }

        return res.redirect(`${frontendUrl}/dashboard`);
      });
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.error(
        `GitHub OAuth callback error: ${err.message}`,
        err.stack,
      );
      return res.redirect(
        `${frontendUrl}/auth/login?error=oauth_failed&provider=github`,
      );
    }
  }
}
