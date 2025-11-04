import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from 'src/common/prisma/prisma.service';
import { BloomFilterService } from 'src/common/bloom-filter/bloom-filter.service';
import { CreateUserDto } from './dto/createUser.dto';
import z from 'zod';
import * as argon2 from 'argon2';
import { OAuthProfile } from './interfaces/oAuth-profile.interface';

@Injectable()
export class UserService {
  private readonly logger = new Logger(UserService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly bloomFilter: BloomFilterService,
  ) {}

  async createUser(userData: CreateUserDto) {
    // Normalize and validate email
    const normalizedEmail = userData.email.toLowerCase().trim();
    const emailSchema = z.email();
    const result = emailSchema.safeParse(normalizedEmail);
    if (!result.success) {
      throw new BadRequestException('Invalid email address');
    }

    // check if user already created with this email
    const isExist = await this.prisma.user.findUnique({
      where: {
        email: normalizedEmail,
      },
    });
    if (isExist) {
      throw new ConflictException(
        'An account with this email address already exists',
      );
    }

    // Hash password
    const hashedPassword = await argon2.hash(userData.password);

    // Normalize and check username
    const normalizedUsername = userData.username.trim().toLowerCase();

    // Check if username already exists (final check before creation)
    const existingUser = await this.prisma.user.findFirst({
      where: {
        username: {
          equals: normalizedUsername,
          mode: 'insensitive',
        },
      },
      select: {
        id: true,
      },
    });

    if (existingUser) {
      throw new ConflictException('This username is already taken');
    }

    // Create new user
    const user = await this.prisma.user.create({
      data: {
        email: normalizedEmail,
        name: userData.name.trim(),
        username: normalizedUsername,
        password: hashedPassword,
        isActive: true,
        preferences: {
          create: {},
        },
      },
      omit: {
        password: true,
        twoFactorSecret: true,
      },
    });

    // Add username to Bloom filter after successful creation
    await this.bloomFilter.add(normalizedUsername);

    return user;
  }

  async findOrCreateOAuthUser(profile: OAuthProfile) {
    const account = await this.prisma.account.findUnique({
      where: {
        provider_providerAccountId: {
          provider: profile.provider,
          providerAccountId: profile.providerId,
        },
      },
      include: {
        user: {
          omit: {
            password: true,
            twoFactorSecret: true,
          },
        },
      },
    });

    if (account) {
      if (account.user.isActive) {
        throw new UnauthorizedException(
          'Your account has been deactivated. Please contact support.',
        );
      }

      // Update account tokens if provided
      await this.prisma.account.update({
        where: {
          provider_providerAccountId: {
            provider: profile.provider,
            providerAccountId: profile.providerId,
          },
        },
        data: {
          access_token: profile.accessToken || account.access_token,
          refresh_token: profile.refreshToken || account.refresh_token,
          expires_at: profile.expiresAt || account.expires_at,
          updatedAt: new Date(),
        },
      });

      return account.user;
    }

    // Normalize email to lowercase
    const normalizedEmail = profile.email.toLowerCase().trim();

    // Check if user exists with this email
    let user = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
      omit: {
        password: true,
        twoFactorSecret: true,
      },
      include: {
        accounts: {
          where: {
            provider: profile.provider,
          },
        },
      },
    });

    if (user && !user.isActive) {
      this.logger.warn(
        `Attempted OAuth login with deactivated account: ${normalizedEmail} (provider: ${profile.provider})`,
      );
      throw new UnauthorizedException(
        'Your account has been deactivated. Please contact support.',
      );
    }

    if (!user) {
      // Create new user with OAuth account
      const baseUsername = profile.username || normalizedEmail.split('@')[0];
      const username = await this.generateUniqueUsername(baseUsername);

      user = await this.prisma.user.create({
        data: {
          username,
          name: profile.name,
          email: profile.email,
          emailVerified: new Date(),
          image: profile.image,
          isActive: true,
          lastLoginAt: new Date(),
          preferences: {
            create: {},
          },
          accounts: {
            create: {
              provider: profile.provider,
              providerAccountId: profile.providerId,
              access_token: profile.accessToken,
              refresh_token: profile.refreshToken,
              expires_at: profile.expiresAt,
              type: 'oauth',
            },
          },
        },
        omit: {
          password: true,
          twoFactorSecret: true,
        },
        include: {
          accounts: true,
        },
      });

      // Add username to Bloom filter after successful creation
      await this.bloomFilter.add(username);
    } else {
      // User exists but account might not be linked - link it
      const existingAccount = user.accounts.find(
        (acc) => acc.provider === profile.provider,
      );

      if (!existingAccount) {
        // Link OAuth account to existing user
        await this.prisma.account.create({
          data: {
            userId: user.id,
            provider: profile.provider,
            providerAccountId: profile.providerId,
            access_token: profile.accessToken,
            refresh_token: profile.refreshToken,
            expires_at: profile.expiresAt,
            type: 'oauth',
          },
        });
      }

      // Update last login
      await this.prisma.user.update({
        where: { id: user.id },
        data: { lastLoginAt: new Date() },
      });
    }

    return user;
  }

  async validateUser(
    username: string,
    password: string,
    metadata?: { ipAddress?: string; userAgent?: string },
  ) {
    // Normalize username to lowercase
    const normalizedUsername = username;

    // TODO: Check is this user in ratelimit

    const user = await this.prisma.user.findFirst({
      where: {
        OR: [
          {
            email: {
              equals: normalizedUsername,
              mode: 'insensitive',
            },
          },
          {
            username: {
              equals: normalizedUsername,
              mode: 'insensitive',
            },
          },
        ],
      },
    });

    if (!user || !user.password) {
      // TODO: Record rate limit for non-existent user
      this.logger.warn(
        `Failed login attempt: user not found or no password - ${normalizedUsername}${metadata?.ipAddress ? ` from IP: ${metadata.ipAddress}` : ''}`,
      );
      return null;
    }

    if (!user.isActive) {
      this.logger.warn(
        `Attempted login with deactivated account: ${user.id} - ${user.email}${metadata?.ipAddress ? ` from IP: ${metadata.ipAddress}` : ''}`,
      );
      throw new UnauthorizedException(
        'Your account has been deactivated. Please contact support.',
      );
    }

    // TODO: Implement look feature

    // check password
    const isPasswordValid = await argon2.verify(user.password, password);

    if (!isPasswordValid) {
      // TODO: Increment failed attempts
      // await this.accountLock.incrementFailedAttempts(user.id, metadata);
      // await this.rateLimiter.recordFailedLoginAttempt(normalizedEmail);
      // TODO: Log security event
      // await this.securityEvents.logEvent(user.id, 'login_failure', metadata);
      this.logger.warn(
        `Failed login attempt: invalid password for user ${user.id} - ${user.email}${metadata?.ipAddress ? ` from IP: ${metadata.ipAddress}` : ''}`,
      );
      return null;
    }

    // TODO: Successful login - reset failed attempts and rate limit
    // await this.accountLock.resetFailedAttempts(user.id);
    // await this.rateLimiter.resetLoginAttempts(normalizedEmail);

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    // TODO: Log security event
    // await this.securityEvents.logEvent(user.id, 'login_success', metadata);

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password: _, twoFactorSecret: __, ...userWithoutPassword } = user;

    return userWithoutPassword;
  }

  /**
   * Generate a unique username using Bloom filter for fast availability checks
   * @param baseUsername - Base username to normalize and check
   * @param maxRetries - Maximum number of attempts with suffixes (default: 10)
   * @returns A unique username
   */
  private async generateUniqueUsername(
    baseUsername: string,
    maxRetries = 10,
  ): Promise<string> {
    // Normalize username
    let username = baseUsername
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, '')
      .substring(0, 32);

    if (username.length === 0) {
      username = `user_${Math.random().toString(36).substring(2, 7)}`;
    }

    // Check with Bloom filter first - if available, verify with database
    const isAvailableInBloom = this.bloomFilter.isAvailable(username);
    if (isAvailableInBloom) {
      const existsInDb = await this.checkUsernameExistsInDb(username);
      if (!existsInDb) {
        return username;
      }
      // False positive - username exists, add to filter and continue
      await this.bloomFilter.add(username);
    }

    // If not available, try with random suffix
    for (let i = 0; i < maxRetries; i++) {
      const suffix = Math.random().toString(36).substring(2, 7);
      const candidate = `${username}_${suffix}`;

      const isAvailable = this.bloomFilter.isAvailable(candidate);
      if (isAvailable) {
        const existsInDb = await this.checkUsernameExistsInDb(candidate);
        if (!existsInDb) {
          return candidate;
        }
        // False positive
        await this.bloomFilter.add(candidate);
      }
    }

    // Fallback: add timestamp-based suffix (guaranteed unique)
    const fallbackUsername = `${username}_${Date.now().toString(36)}`;
    return fallbackUsername;
  }

  /**
   * Check if username exists in database
   * This is the final authoritative check after Bloom filter
   */
  private async checkUsernameExistsInDb(username: string): Promise<boolean> {
    try {
      const user = await this.prisma.user.findFirst({
        where: {
          username: {
            equals: username,
            mode: 'insensitive',
          },
        },
        select: {
          id: true,
        },
      });
      return !!user;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.error(
        `Error checking username in database: ${err.message}`,
        err.stack,
      );
      // On error, assume exists (safer - prevents duplicates)
      return true;
    }
  }

  /**
   * Validate username availability and generate suggestions if not available
   * @param username - Username to check
   * @param maxSuggestions - Maximum number of suggestions to generate (default: 5)
   * @returns Object with isAvailable status and suggestions array
   */
  async validateUsername(
    username: string,
    maxSuggestions = 5,
  ): Promise<{ isAvailable: boolean; suggestions?: string[] }> {
    // Normalize username
    const normalizedUsername = username.toLowerCase().trim();

    // Quick check with Bloom filter first
    const isAvailableInBloom = this.bloomFilter.isAvailable(normalizedUsername);

    if (isAvailableInBloom) {
      // Verify with database (authoritative check)
      const existsInDb = await this.checkUsernameExistsInDb(normalizedUsername);
      if (!existsInDb) {
        return { isAvailable: true };
      }
      // False positive - username exists, update filter
      await this.bloomFilter.add(normalizedUsername);
    }

    // Username is not available, generate suggestions
    const suggestions = await this.generateUsernameSuggestions(
      normalizedUsername,
      maxSuggestions,
    );

    return {
      isAvailable: false,
      suggestions,
    };
  }

  /**
   * Generate available username suggestions with diverse variants
   * @param baseUsername - Base username to generate suggestions from
   * @param maxSuggestions - Maximum number of suggestions to generate
   * @returns Array of available username suggestions
   */
  private async generateUsernameSuggestions(
    baseUsername: string,
    maxSuggestions: number,
  ): Promise<string[]> {
    const suggestions: string[] = [];
    const attemptedUsernames = new Set<string>();

    // Clean and normalize base username
    let cleanUsername = baseUsername
      .replace(/[^a-z0-9_]/g, '')
      .substring(0, 32);
    if (cleanUsername.length === 0) {
      cleanUsername = 'user';
    }

    // Common suffixes and prefixes for username generation
    const commonSuffixes = [
      '123',
      '2024',
      '2025',
      'pro',
      'dev',
      'ai',
      'co',
      'io',
      'me',
      'xyz',
    ];
    const randomWords = [
      'cool',
      'nice',
      'best',
      'top',
      'new',
      'super',
      'mega',
      'ultra',
      'prime',
      'star',
    ];
    const numbers = [
      1, 2, 3, 5, 7, 9, 11, 13, 17, 19, 23, 27, 42, 99, 100, 200, 404, 500,
    ];

    // Helper function to generate and check candidate
    const checkAndAddCandidate = async (
      candidate: string,
    ): Promise<boolean> => {
      if (
        candidate.length > 32 ||
        candidate.length < 3 ||
        attemptedUsernames.has(candidate)
      ) {
        return false;
      }

      attemptedUsernames.add(candidate);

      if (!this.bloomFilter.isAvailable(candidate)) {
        return false;
      }

      const existsInDb = await this.checkUsernameExistsInDb(candidate);
      if (!existsInDb) {
        suggestions.push(candidate);
        return true;
      }
      return false;
    };

    // Strategy 1: Random alphanumeric suffixes (most random)
    let attempts = 0;
    const maxRandomAttempts = 100;
    while (
      suggestions.length < maxSuggestions &&
      attempts < maxRandomAttempts
    ) {
      attempts++;
      const randomSuffix = Math.random().toString(36).substring(2, 6);
      const candidate = `${cleanUsername}_${randomSuffix}`;
      await checkAndAddCandidate(candidate);
    }

    // Strategy 2: Mix numbers at different positions
    if (suggestions.length < maxSuggestions) {
      for (const num of numbers.slice(0, 10)) {
        if (suggestions.length >= maxSuggestions) break;

        // Number at end
        const candidate1 = `${cleanUsername}${num}`;
        await checkAndAddCandidate(candidate1);

        // Number with underscore
        if (suggestions.length < maxSuggestions) {
          const candidate2 = `${cleanUsername}_${num}`;
          await checkAndAddCandidate(candidate2);
        }
      }
    }

    // Strategy 3: Random 2-4 digit numbers
    if (suggestions.length < maxSuggestions) {
      attempts = 0;
      while (suggestions.length < maxSuggestions && attempts < 50) {
        attempts++;
        const randomNum = Math.floor(Math.random() * 9999) + 10;
        const candidate = `${cleanUsername}${randomNum}`;
        await checkAndAddCandidate(candidate);
      }
    }

    // Strategy 4: Common suffixes
    if (suggestions.length < maxSuggestions) {
      for (const suffix of commonSuffixes) {
        if (suggestions.length >= maxSuggestions) break;

        const candidate = `${cleanUsername}${suffix}`;
        await checkAndAddCandidate(candidate);

        if (suggestions.length < maxSuggestions) {
          const candidate2 = `${cleanUsername}_${suffix}`;
          await checkAndAddCandidate(candidate2);
        }
      }
    }

    // Strategy 5: Insert random characters/numbers in the middle
    if (suggestions.length < maxSuggestions && cleanUsername.length > 4) {
      attempts = 0;
      while (suggestions.length < maxSuggestions && attempts < 30) {
        attempts++;
        const midPoint = Math.floor(cleanUsername.length / 2);
        const randomChar = Math.random().toString(36).substring(2, 3);
        const randomNum = Math.floor(Math.random() * 9) + 1;
        const part1 = cleanUsername.substring(0, midPoint);
        const part2 = cleanUsername.substring(midPoint);

        // Insert random char
        const candidate1 = `${part1}${randomChar}${part2}`;
        await checkAndAddCandidate(candidate1);

        // Insert random number
        if (suggestions.length < maxSuggestions) {
          const candidate2 = `${part1}${randomNum}${part2}`;
          await checkAndAddCandidate(candidate2);
        }
      }
    }

    // Strategy 6: Random word suffixes
    if (suggestions.length < maxSuggestions) {
      attempts = 0;
      while (suggestions.length < maxSuggestions && attempts < 20) {
        attempts++;
        const randomWord =
          randomWords[Math.floor(Math.random() * randomWords.length)];
        const candidate = `${cleanUsername}_${randomWord}`;
        await checkAndAddCandidate(candidate);
      }
    }

    // Strategy 7: Shorten and add random suffix
    if (suggestions.length < maxSuggestions && cleanUsername.length > 6) {
      attempts = 0;
      while (suggestions.length < maxSuggestions && attempts < 20) {
        attempts++;
        const shortened = cleanUsername.substring(
          0,
          Math.max(4, cleanUsername.length - 3),
        );
        const randomSuffix = Math.random().toString(36).substring(2, 5);
        const candidate = `${shortened}_${randomSuffix}`;
        await checkAndAddCandidate(candidate);
      }
    }

    // Strategy 8: Year variations
    if (suggestions.length < maxSuggestions) {
      const year = new Date().getFullYear();
      const yearShort = year.toString().substring(2);

      const candidates = [
        `${cleanUsername}${year}`,
        `${cleanUsername}${yearShort}`,
        `${cleanUsername}_${year}`,
        `${cleanUsername}_${yearShort}`,
      ];

      for (const candidate of candidates) {
        if (suggestions.length >= maxSuggestions) break;
        await checkAndAddCandidate(candidate);
      }
    }

    // Strategy 9: Random alphanumeric prefix/suffix combinations
    if (suggestions.length < maxSuggestions) {
      attempts = 0;
      while (suggestions.length < maxSuggestions && attempts < 30) {
        attempts++;
        const randomPrefix = Math.random().toString(36).substring(2, 4);
        const randomSuffix = Math.random().toString(36).substring(2, 4);

        // Prefix
        const candidate1 = `${randomPrefix}_${cleanUsername}`;
        await checkAndAddCandidate(candidate1);

        // Suffix
        if (suggestions.length < maxSuggestions) {
          const candidate2 = `${cleanUsername}_${randomSuffix}`;
          await checkAndAddCandidate(candidate2);
        }

        // Both
        if (suggestions.length < maxSuggestions) {
          const candidate3 = `${randomPrefix}_${cleanUsername}_${randomSuffix}`;
          await checkAndAddCandidate(candidate3);
        }
      }
    }

    // Strategy 10: Completely random with base username components
    if (suggestions.length < maxSuggestions) {
      attempts = 0;
      while (suggestions.length < maxSuggestions && attempts < 20) {
        attempts++;
        const randomPart1 = Math.random().toString(36).substring(2, 5);
        const randomPart2 = Math.random().toString(36).substring(2, 5);
        const randomNum = Math.floor(Math.random() * 999) + 1;

        // Mix base username with random parts
        const variants = [
          `${cleanUsername.substring(0, 3)}${randomPart1}${randomNum}`,
          `${randomPart1}_${cleanUsername.substring(0, 4)}_${randomPart2}`,
          `${cleanUsername.substring(0, 4)}${randomNum}_${randomPart1}`,
        ];

        for (const candidate of variants) {
          if (suggestions.length >= maxSuggestions) break;
          await checkAndAddCandidate(candidate);
        }
      }
    }

    // Shuffle suggestions to mix different strategies
    return this.shuffleArray(suggestions).slice(0, maxSuggestions);
  }

  /**
   * Shuffle array to randomize order
   */
  private shuffleArray<T>(array: T[]): T[] {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }
}
