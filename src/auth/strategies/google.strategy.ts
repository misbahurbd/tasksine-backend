import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Profile, Strategy, VerifyCallback } from 'passport-google-oauth20';
import { OAuthProfile } from 'src/user/interfaces/oAuth-profile.interface';
import { UserService } from 'src/user/user.service';

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  private readonly logger = new Logger(GoogleStrategy.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly userService: UserService,
  ) {
    super({
      clientID: configService.getOrThrow<string>('GOOGLE_CLIENT_ID'),
      clientSecret: configService.getOrThrow<string>('GOOGLE_CLIENT_SECRET'),
      callbackURL: configService.getOrThrow<string>('GOOGLE_CALLBACK_URL'),
      scope: ['email', 'profile'],
    });
  }

  validate(
    accessToken: string,
    refreshToken: string,
    profile: Profile,
    done: VerifyCallback,
  ): void {
    try {
      if (!profile.emails || !profile.emails[0]) {
        this.logger.warn(
          `Google authentication failed: email not provided for user ${profile.id}`,
        );
        return done(
          new Error('Google authentication failed: email not provided'),
          false,
        );
      }

      // Calculate expiration time (default to 1 hour if not specified)
      // Google tokens typically expire in 3600 seconds (1 hour)
      // In a production app, you might want to decode the token to get actual expiration
      const expiresAt = Math.floor(Date.now() / 1000) + 3600;

      const oAuthProfile: OAuthProfile = {
        provider: 'google',
        providerId: profile.id,
        name:
          `${profile.name?.givenName || ''} ${profile.name?.familyName || ''}`.trim() ||
          profile.displayName ||
          profile.emails[0].value.split('@')[0],
        email: profile.emails[0].value,
        image: profile.photos?.[0]?.value,
        accessToken,
        refreshToken,
        expiresAt,
      };

      this.logger.debug(
        `Google OAuth profile validated for user: ${profile.emails[0].value}`,
      );
      done(null, oAuthProfile);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.error(
        `Error validating Google OAuth profile: ${err.message}`,
        err.stack,
      );
      done(err, false);
    }
  }
}
