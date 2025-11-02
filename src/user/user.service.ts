import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from 'src/common/prisma/prisma.service';
import { CreateUserDto } from './dto/createUser.dto';
import z from 'zod';
import * as argon2 from 'argon2';

@Injectable()
export class UserService {
  constructor(private readonly prisma: PrismaService) {}

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

    // Create new user
    const user = await this.prisma.user.create({
      data: {
        email: normalizedEmail,
        name: userData.name.trim(),
        username: userData.username.trim(),
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

    return user;
  }

  async validateUser(
    username: string,
    password: string,
    metadata?: { ipAddress?: string; userAgent?: string },
  ) {
    // Normalize username to lowercase
    const normalizedUsername = username;

    console.log({ metadata });

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
      return null;
    }

    if (!user.isActive) {
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
}
