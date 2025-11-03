import { Injectable, Logger } from '@nestjs/common';
import { PassportSerializer } from '@nestjs/passport';

interface UserPayload {
  id: string;
  email: string;
}

interface SerializedUser {
  id: string;
  email: string;
}

@Injectable()
export class SessionSerializer extends PassportSerializer {
  private readonly logger = new Logger(SessionSerializer.name);

  serializeUser(
    user: UserPayload,
    done: (err: Error | null, user: SerializedUser) => void,
  ): void {
    try {
      done(null, { id: user.id, email: user.email });
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.error(
        `Session serialization failed for user ${user.id}: ${err.message}`,
        err.stack,
      );
      done(err, { id: '', email: '' });
    }
  }

  deserializeUser(
    payload: SerializedUser,
    done: (err: Error | null, user: SerializedUser) => void,
  ): void {
    try {
      done(null, payload);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.error(
        `Session deserialization failed for payload ${payload.id}: ${err.message}`,
        err.stack,
      );
      done(err, { id: payload.id || '', email: payload.email || '' });
    }
  }
}
