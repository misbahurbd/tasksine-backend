import { Module } from '@nestjs/common';
import { BloomFilterService } from './bloom-filter.service';
import { RedisModule } from '../redis/redis.module';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [RedisModule, PrismaModule],
  providers: [BloomFilterService],
  exports: [BloomFilterService],
})
export class BloomFilterModule {}
