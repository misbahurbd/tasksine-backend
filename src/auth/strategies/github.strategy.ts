import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Profile, Strategy } from 'passport-github2';
import { OAuthProfile } from 'src/user/interfaces/oAuth-profile.interface';
import { UserService } from 'src/user/user.service';

@Injectable()
export class GithubStrategy extends PassportStrategy(Strategy, 'github') {
  private readonly logger = new Logger(GithubStrategy.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly userService: UserService,
  ) {
    super({
      clientID: configService.getOrThrow<string>('GITHUB_CLIENT_ID'),
      clientSecret: configService.getOrThrow<string>('GITHUB_CLIENT_SECRET'),
      callbackURL: configService.getOrThrow<string>('GITHUB_CALLBACK_URL'),
      scope: ['user:email'],
    });
  }

  validate(
    accessToken: string,
    refreshToken: string,
    profile: Profile,
    done: (error: any, user?: OAuthProfile | null) => void,
  ): void {
    try {
      // GitHub profile structure differs from Google
      // GitHub may not always provide emails in the profile directly
      // If emails are not available, we need to fetch them separately using the access token
      if (!profile.emails || !profile.emails.length) {
        this.logger.warn(
          `GitHub authentication failed: email not provided for user ${profile.id}`,
        );
        return done(
          new Error('GitHub authentication failed: email not provided'),
          null,
        );
      }

      // Calculate expiration time (default to 1 hour)
      // GitHub tokens typically don't expire, but we'll set a reasonable default
      const expiresAt = Math.floor(Date.now() / 1000) + 3600;

      // Extract email from profile
      // GitHub emails array has objects with value property
      const email =
        typeof profile.emails[0] === 'string'
          ? profile.emails[0]
          : profile.emails[0].value;

      // GitHub profile structure: displayName, username, photos
      const name =
        profile.displayName || profile.username || email.split('@')[0];

      const oAuthProfile: OAuthProfile = {
        provider: 'github',
        providerId: profile.id,
        name,
        email,
        username: profile.username,
        image: profile.photos?.[0]?.value,
        accessToken,
        refreshToken,
        expiresAt,
      };

      this.logger.debug(`GitHub OAuth profile validated for user: ${email}`);
      done(null, oAuthProfile);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.error(
        `Error validating GitHub OAuth profile: ${err.message}`,
        err.stack,
      );
      done(err, null);
    }
  }
}
