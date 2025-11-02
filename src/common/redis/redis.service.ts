import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, RedisClientType } from 'redis';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client: RedisClientType | null = null;
  private isInitialized = false;

  constructor(private configService: ConfigService) {}

  async onModuleInit(): Promise<void> {
    await this.connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.disconnect();
  }

  /**
   * Connect to Redis
   */
  private async connect(): Promise<void> {
    if (this.isInitialized && this.client?.isReady) {
      return;
    }

    try {
      const redisUrl =
        this.configService.get<string>('REDIS_URL') || 'redis://localhost:6379';

      this.client = createClient({
        url: redisUrl,
      }) as RedisClientType;

      // Set up event listeners
      this.client.on('error', (err) => {
        this.logger.error('Redis Client Error', err);
      });

      this.client.on('connect', () => {
        this.logger.log('Connecting to Redis...');
      });

      this.client.on('ready', () => {
        this.logger.log('Redis client ready');
        this.isInitialized = true;
      });

      this.client.on('reconnecting', () => {
        this.logger.warn('Redis client reconnecting...');
      });

      this.client.on('end', () => {
        this.logger.log('Redis client connection ended');
        this.isInitialized = false;
      });

      await this.client.connect();
      this.logger.log('Redis connected successfully');
      this.isInitialized = true;
    } catch (error) {
      this.logger.error('Failed to connect to Redis', error);
      // Don't throw - allow app to continue without Redis
      this.client = null;
      this.isInitialized = false;
    }
  }

  /**
   * Disconnect from Redis
   */
  private async disconnect(): Promise<void> {
    if (!this.client) {
      return;
    }

    try {
      if (this.client.isReady) {
        await this.client.quit();
      } else {
        await this.client.disconnect();
      }
      this.logger.log('Redis disconnected successfully');
    } catch (error) {
      this.logger.error('Error disconnecting from Redis', error);
    } finally {
      this.client = null;
      this.isInitialized = false;
    }
  }

  /**
   * Get the Redis client instance
   * Useful for libraries that need direct client access (e.g., connect-redis)
   */
  getClient(): RedisClientType | null {
    return this.client;
  }

  /**
   * Check if Redis is connected and ready
   */
  isConnected(): boolean {
    return this.client?.isReady === true;
  }

  /**
   * Ensure Redis is connected before operations
   */
  private ensureConnected(): boolean {
    if (!this.client || !this.isConnected()) {
      this.logger.warn('Redis client is not connected');
      return false;
    }
    return true;
  }

  // ==================== String Operations ====================

  /**
   * Get value from Redis
   */
  async get(key: string): Promise<string | null> {
    if (!this.ensureConnected()) {
      return null;
    }
    try {
      return await this.client!.get(key);
    } catch (error) {
      this.logger.error(`Error getting key ${key} from Redis`, error);
      return null;
    }
  }

  /**
   * Set value in Redis
   */
  async set(key: string, value: string, ttlSeconds?: number): Promise<boolean> {
    if (!this.ensureConnected()) {
      return false;
    }
    try {
      if (ttlSeconds && ttlSeconds > 0) {
        await this.client!.setEx(key, ttlSeconds, value);
      } else {
        await this.client!.set(key, value);
      }
      return true;
    } catch (error) {
      this.logger.error(`Error setting key ${key} in Redis`, error);
      return false;
    }
  }

  /**
   * Delete key(s) from Redis
   */
  async del(...keys: string[]): Promise<boolean> {
    if (!this.ensureConnected() || keys.length === 0) {
      return false;
    }
    try {
      const result = await this.client!.del(keys);
      return result > 0;
    } catch (error) {
      this.logger.error(
        `Error deleting keys ${keys.join(', ')} from Redis`,
        error,
      );
      return false;
    }
  }

  /**
   * Check if key exists
   */
  async exists(key: string): Promise<boolean> {
    if (!this.ensureConnected()) {
      return false;
    }
    try {
      const result = await this.client!.exists(key);
      return result === 1;
    } catch (error) {
      this.logger.error(`Error checking key ${key} in Redis`, error);
      return false;
    }
  }

  /**
   * Set expiration time for a key
   */
  async expire(key: string, seconds: number): Promise<boolean> {
    if (!this.ensureConnected()) {
      return false;
    }
    try {
      const result = await this.client!.expire(key, seconds);
      return result === 1;
    } catch (error) {
      this.logger.error(
        `Error setting expiration for key ${key} in Redis`,
        error,
      );
      return false;
    }
  }

  /**
   * Get time to live for a key
   */
  async ttl(key: string): Promise<number> {
    if (!this.ensureConnected()) {
      return -2; // Key doesn't exist
    }
    try {
      return await this.client!.ttl(key);
    } catch (error) {
      this.logger.error(`Error getting TTL for key ${key} in Redis`, error);
      return -2;
    }
  }

  // ==================== Hash Operations ====================

  /**
   * Get hash field value
   */
  async hGet(key: string, field: string): Promise<string | null> {
    if (!this.ensureConnected()) {
      return null;
    }
    try {
      return await this.client!.hGet(key, field);
    } catch (error) {
      this.logger.error(
        `Error getting hash field ${field} from key ${key} in Redis`,
        error,
      );
      return null;
    }
  }

  /**
   * Get all hash fields and values
   */
  async hGetAll(key: string): Promise<Record<string, string>> {
    if (!this.ensureConnected()) {
      return {};
    }
    try {
      return await this.client!.hGetAll(key);
    } catch (error) {
      this.logger.error(
        `Error getting all hash fields from key ${key} in Redis`,
        error,
      );
      return {};
    }
  }

  /**
   * Set hash field value
   */
  async hSet(key: string, field: string, value: string): Promise<boolean> {
    if (!this.ensureConnected()) {
      return false;
    }
    try {
      await this.client!.hSet(key, field, value);
      return true;
    } catch (error) {
      this.logger.error(
        `Error setting hash field ${field} for key ${key} in Redis`,
        error,
      );
      return false;
    }
  }

  /**
   * Set multiple hash fields
   */
  async hSetMultiple(
    key: string,
    data: Record<string, string>,
  ): Promise<boolean> {
    if (!this.ensureConnected() || Object.keys(data).length === 0) {
      return false;
    }
    try {
      await this.client!.hSet(key, data);
      return true;
    } catch (error) {
      this.logger.error(
        `Error setting multiple hash fields for key ${key} in Redis`,
        error,
      );
      return false;
    }
  }

  /**
   * Delete hash field(s)
   */
  async hDel(key: string, ...fields: string[]): Promise<boolean> {
    if (!this.ensureConnected() || fields.length === 0) {
      return false;
    }
    try {
      const result = await this.client!.hDel(key, fields);
      return result > 0;
    } catch (error) {
      this.logger.error(
        `Error deleting hash fields from key ${key} in Redis`,
        error,
      );
      return false;
    }
  }

  // ==================== List Operations ====================

  /**
   * Push value to list (left)
   */
  async lPush(key: string, ...values: string[]): Promise<number | null> {
    if (!this.ensureConnected() || values.length === 0) {
      return null;
    }
    try {
      return await this.client!.lPush(key, values);
    } catch (error) {
      this.logger.error(`Error pushing to list ${key} in Redis`, error);
      return null;
    }
  }

  /**
   * Push value to list (right)
   */
  async rPush(key: string, ...values: string[]): Promise<number | null> {
    if (!this.ensureConnected() || values.length === 0) {
      return null;
    }
    try {
      return await this.client!.rPush(key, values);
    } catch (error) {
      this.logger.error(`Error pushing to list ${key} in Redis`, error);
      return null;
    }
  }

  /**
   * Pop value from list (left)
   */
  async lPop(key: string): Promise<string | null> {
    if (!this.ensureConnected()) {
      return null;
    }
    try {
      return await this.client!.lPop(key);
    } catch (error) {
      this.logger.error(`Error popping from list ${key} in Redis`, error);
      return null;
    }
  }

  /**
   * Pop value from list (right)
   */
  async rPop(key: string): Promise<string | null> {
    if (!this.ensureConnected()) {
      return null;
    }
    try {
      return await this.client!.rPop(key);
    } catch (error) {
      this.logger.error(`Error popping from list ${key} in Redis`, error);
      return null;
    }
  }

  /**
   * Get list length
   */
  async lLen(key: string): Promise<number | null> {
    if (!this.ensureConnected()) {
      return null;
    }
    try {
      return await this.client!.lLen(key);
    } catch (error) {
      this.logger.error(
        `Error getting list length for key ${key} in Redis`,
        error,
      );
      return null;
    }
  }

  // ==================== Set Operations ====================

  /**
   * Add member(s) to set
   */
  async sAdd(key: string, ...members: string[]): Promise<number | null> {
    if (!this.ensureConnected() || members.length === 0) {
      return null;
    }
    try {
      return await this.client!.sAdd(key, members);
    } catch (error) {
      this.logger.error(`Error adding to set ${key} in Redis`, error);
      return null;
    }
  }

  /**
   * Check if member exists in set
   */
  async sIsMember(key: string, member: string): Promise<boolean> {
    if (!this.ensureConnected()) {
      return false;
    }
    try {
      const result = await this.client!.sIsMember(key, member);
      return result === 1;
    } catch (error) {
      this.logger.error(
        `Error checking set membership for key ${key} in Redis`,
        error,
      );
      return false;
    }
  }

  /**
   * Get all members of a set
   */
  async sMembers(key: string): Promise<string[]> {
    if (!this.ensureConnected()) {
      return [];
    }
    try {
      return await this.client!.sMembers(key);
    } catch (error) {
      this.logger.error(
        `Error getting set members for key ${key} in Redis`,
        error,
      );
      return [];
    }
  }

  /**
   * Remove member(s) from set
   */
  async sRem(key: string, ...members: string[]): Promise<number | null> {
    if (!this.ensureConnected() || members.length === 0) {
      return null;
    }
    try {
      return await this.client!.sRem(key, members);
    } catch (error) {
      this.logger.error(`Error removing from set ${key} in Redis`, error);
      return null;
    }
  }

  // ==================== Advanced Operations ====================

  /**
   * Increment value
   */
  async incr(key: string): Promise<number | null> {
    if (!this.ensureConnected()) {
      return null;
    }
    try {
      return await this.client!.incr(key);
    } catch (error) {
      this.logger.error(`Error incrementing key ${key} in Redis`, error);
      return null;
    }
  }

  /**
   * Increment value by amount
   */
  async incrBy(key: string, increment: number): Promise<number | null> {
    if (!this.ensureConnected()) {
      return null;
    }
    try {
      return await this.client!.incrBy(key, increment);
    } catch (error) {
      this.logger.error(
        `Error incrementing key ${key} by ${increment} in Redis`,
        error,
      );
      return null;
    }
  }

  /**
   * Decrement value
   */
  async decr(key: string): Promise<number | null> {
    if (!this.ensureConnected()) {
      return null;
    }
    try {
      return await this.client!.decr(key);
    } catch (error) {
      this.logger.error(`Error decrementing key ${key} in Redis`, error);
      return null;
    }
  }

  /**
   * Get multiple keys
   */
  async mGet(...keys: string[]): Promise<(string | null)[]> {
    if (!this.ensureConnected() || keys.length === 0) {
      return [];
    }
    try {
      return await this.client!.mGet(keys);
    } catch (error) {
      this.logger.error(`Error getting multiple keys in Redis`, error);
      return [];
    }
  }

  /**
   * Set multiple keys
   */
  async mSet(data: Record<string, string>): Promise<boolean> {
    if (!this.ensureConnected() || Object.keys(data).length === 0) {
      return false;
    }
    try {
      await this.client!.mSet(data);
      return true;
    } catch (error) {
      this.logger.error(`Error setting multiple keys in Redis`, error);
      return false;
    }
  }
}
