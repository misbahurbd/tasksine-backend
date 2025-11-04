import { Module } from '@nestjs/common';
import { UserService } from './user.service';
import { UserController } from './user.controller';
import { BloomFilterModule } from 'src/common/bloom-filter/bloom-filter.module';

@Module({
  imports: [BloomFilterModule],
  controllers: [UserController],
  providers: [UserService],
  exports: [UserService],
})
export class UserModule {}
