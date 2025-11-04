import {
  Injectable,
  OnModuleInit,
  Logger,
  OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from 'src/common/prisma/prisma.service';
import { RedisService } from 'src/common/redis/redis.service';
import { BloomFilter } from 'bloom-filters';

/**
 * Bloom Filter Service for Username Validation
 *
 * This service provides a probabilistic data structure to efficiently check
 * if a username might already exist. It reduces database queries by filtering
 * out most non-existent usernames before checking the database.
 *
 * Features:
 * - Redis persistence for distributed cache
 * - Automatic initialization from database
 * - Configurable false positive rate
 * - Graceful degradation on errors
 */
@Injectable()
export class BloomFilterService implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(BloomFilterService.name);
  private bloomFilter: BloomFilter | null = null;
  private isInitialized = false;
  private initializationPromise: Promise<void> | null = null;

  // Redis key for storing the Bloom filter
  private readonly REDIS_KEY = 'bloom:usernames';
  // Configuration keys
  private readonly DEFAULT_CAPACITY = 1000000; // 1M usernames
  private readonly DEFAULT_ERROR_RATE = 0.01; // 1% false positive rate

  constructor(
    private readonly redisService: RedisService,
    private readonly prismaService: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Initialize Bloom filter on module initialization
   */
  async onModuleInit(): Promise<void> {
    await this.initialize();
  }

  /**
   * Save Bloom filter state on application shutdown
   */
  async onApplicationShutdown(): Promise<void> {
    await this.saveToRedis();
  }

  /**
   * Initialize the Bloom filter from Redis or database
   */
  async initialize(): Promise<void> {
    // Prevent multiple simultaneous initializations
    if (this.initializationPromise) {
      return this.initializationPromise;
    }

    this.initializationPromise = this.doInitialize();
    await this.initializationPromise;
  }

  private async doInitialize(): Promise<void> {
    try {
      this.logger.log('Initializing Bloom filter for username validation...');

      // Try to load from Redis first
      const loaded = await this.loadFromRedis();

      if (loaded) {
        this.logger.log('Bloom filter loaded from Redis');
        this.isInitialized = true;
        return;
      }

      // If not in Redis, initialize from database
      await this.initializeFromDatabase();
      this.isInitialized = true;
      this.logger.log('Bloom filter initialized from database');
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.error(
        `Failed to initialize Bloom filter: ${err.message}`,
        err.stack,
      );
      // Create an empty Bloom filter as fallback
      this.createEmptyFilter();
      this.isInitialized = true;
      this.logger.warn(
        'Bloom filter initialized with empty filter. Some checks may be less efficient.',
      );
    } finally {
      this.initializationPromise = null;
    }
  }

  /**
   * Check if username is available (not in Bloom filter)
   * Note: This is a probabilistic check - false positives are possible
   *
   * @param username - Username to check
   * @returns true if username might be available, false if it definitely exists
   */
  isAvailable(username: string): boolean {
    if (!this.isInitialized || !this.bloomFilter) {
      // If not initialized, assume available and let database check handle it
      this.logger.warn(
        'Bloom filter not initialized, skipping filter check for username',
      );
      return true;
    }

    if (!this.bloomFilter) {
      return true;
    }

    try {
      const normalizedUsername = this.normalizeUsername(username);
      const exists = this.bloomFilter.has(normalizedUsername);
      return !exists;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.error(
        `Error checking username availability: ${err.message}`,
        err.stack,
      );
      // On error, assume available (safer - database will do final check)
      return true;
    }
  }

  /**
   * Add username to Bloom filter
   * Should be called after successfully creating a user
   *
   * @param username - Username to add
   */
  async add(username: string): Promise<void> {
    if (!this.isInitialized || !this.bloomFilter) {
      this.logger.warn('Bloom filter not initialized, cannot add username');
      return;
    }

    try {
      const normalizedUsername = this.normalizeUsername(username);
      this.bloomFilter.add(normalizedUsername);

      // Periodically save to Redis (not on every add to reduce I/O)
      // Save immediately for now, but could be optimized with batching
      await this.saveToRedis();
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.error(
        `Error adding username to Bloom filter: ${err.message}`,
        err.stack,
      );
      // Non-critical error - continue execution
    }
  }

  /**
   * Add multiple usernames at once
   * Useful for bulk operations or initialization
   *
   * @param usernames - Array of usernames to add
   */
  async addBulk(usernames: string[]): Promise<void> {
    if (!this.isInitialized || !this.bloomFilter) {
      this.logger.warn('Bloom filter not initialized, cannot add usernames');
      return;
    }

    try {
      const normalizedUsernames = usernames.map((u) =>
        this.normalizeUsername(u),
      );
      normalizedUsernames.forEach((username) => {
        if (this.bloomFilter) {
          this.bloomFilter.add(username);
        }
      });

      await this.saveToRedis();
      this.logger.debug(`Added ${usernames.length} usernames to Bloom filter`);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.error(
        `Error adding usernames to Bloom filter: ${err.message}`,
        err.stack,
      );
    }
  }

  /**
   * Initialize Bloom filter from database
   */
  private async initializeFromDatabase(): Promise<void> {
    try {
      // Get count of existing usernames for capacity estimation
      const userCount = await this.prismaService.user.count();

      // Use configured capacity or estimate based on current data (with 2x buffer)
      const capacity = Math.max(
        this.getCapacity(),
        Math.ceil(userCount * 2.5), // 2.5x for growth buffer
      );

      this.logger.log(
        `Creating Bloom filter with capacity: ${capacity}, error rate: ${this.getErrorRate()}`,
      );

      // Create new Bloom filter
      this.bloomFilter = BloomFilter.create(capacity, this.getErrorRate());

      // Load all usernames from database in batches
      const batchSize = 1000;
      let skip = 0;
      let hasMore = true;
      let totalLoaded = 0;

      while (hasMore) {
        const users = await this.prismaService.user.findMany({
          select: {
            username: true,
          },
          skip,
          take: batchSize,
        });

        if (users.length === 0) {
          hasMore = false;
          break;
        }

        const usernames = users.map((u) => u.username);

        await this.addBulk(usernames);
        totalLoaded += usernames.length;
        skip += batchSize;

        this.logger.debug(
          `Loaded ${totalLoaded} usernames into Bloom filter...`,
        );
      }

      // Save to Redis for future use
      await this.saveToRedis();

      this.logger.log(
        `Successfully initialized Bloom filter with ${totalLoaded} usernames`,
      );
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.error(
        `Error initializing Bloom filter from database: ${err.message}`,
        err.stack,
      );
      throw err;
    }
  }

  /**
   * Load Bloom filter from Redis
   */
  private async loadFromRedis(): Promise<boolean> {
    try {
      if (!this.redisService.isConnected()) {
        this.logger.warn('Redis not connected, cannot load Bloom filter');
        return false;
      }

      const serialized = await this.redisService.get(this.REDIS_KEY);

      if (!serialized) {
        return false;
      }

      try {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        const data = JSON.parse(serialized);
        if (data && typeof data === 'object') {
          // BloomFilter.fromJSON expects a specific JSON structure
          // Type assertion is safe here as we're loading our own saved data
          // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
          const filter = BloomFilter.fromJSON(data) as BloomFilter;
          this.bloomFilter = filter;
          if (this.bloomFilter) {
            this.logger.log(
              `Bloom filter loaded from Redis with ${this.bloomFilter.length} items`,
            );
            return true;
          }
        }
        return false;
      } catch {
        this.logger.warn(
          'Failed to parse Bloom filter data from Redis, will reinitialize',
        );
        return false;
      }
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.error(
        `Error loading Bloom filter from Redis: ${err.message}`,
        err.stack,
      );
      return false;
    }
  }

  /**
   * Save Bloom filter to Redis
   */
  private async saveToRedis(): Promise<void> {
    if (!this.bloomFilter || !this.redisService.isConnected()) {
      return;
    }

    try {
      const serialized = JSON.stringify(this.bloomFilter.saveAsJSON());
      await this.redisService.set(this.REDIS_KEY, serialized);
      this.logger.debug('Bloom filter saved to Redis');
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.error(
        `Error saving Bloom filter to Redis: ${err.message}`,
        err.stack,
      );
      // Non-critical error - continue execution
    }
  }

  /**
   * Create an empty Bloom filter as fallback
   */
  private createEmptyFilter(): void {
    this.bloomFilter = BloomFilter.create(
      this.getCapacity(),
      this.getErrorRate(),
    );
  }

  /**
   * Normalize username for consistent storage
   */
  private normalizeUsername(username: string): string {
    return username.toLowerCase().trim();
  }

  /**
   * Get configured capacity or default
   */
  private getCapacity(): number {
    return (
      this.configService.get<number>('BLOOM_FILTER_CAPACITY') ||
      this.DEFAULT_CAPACITY
    );
  }

  /**
   * Get configured error rate or default
   */
  private getErrorRate(): number {
    return (
      this.configService.get<number>('BLOOM_FILTER_ERROR_RATE') ||
      this.DEFAULT_ERROR_RATE
    );
  }

  /**
   * Get Bloom filter statistics
   */
  getStats(): {
    initialized: boolean;
    itemCount: number;
    capacity: number;
    errorRate: number;
    falsePositiveRate?: number;
  } {
    return {
      initialized: this.isInitialized,
      itemCount: this.bloomFilter?.length || 0,
      capacity: this.getCapacity(),
      errorRate: this.getErrorRate(),
      falsePositiveRate: this.bloomFilter?.rate() || 0,
    };
  }

  /**
   * Force re-initialization of Bloom filter
   * Useful for maintenance or after data migration
   */
  async reinitialize(): Promise<void> {
    this.logger.log('Force reinitializing Bloom filter...');
    this.isInitialized = false;
    this.bloomFilter = null;
    await this.initialize();
  }
}
