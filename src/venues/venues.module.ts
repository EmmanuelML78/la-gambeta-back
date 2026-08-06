import { Module } from '@nestjs/common';
import { VenuesService } from './venues.service';
import { VenuesController } from './venues.controller';
import { DatabaseModule } from '../database/database.module';

@Module({
  imports: [DatabaseModule],
  providers: [VenuesService],
  controllers: [VenuesController],
  exports: [VenuesService],
})
export class VenuesModule {}
