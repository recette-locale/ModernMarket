import { Module } from '@nestjs/common';
import { CommercantService } from './commercant.service';
import { CommercantController } from './commercant.controller';

@Module({
  controllers: [CommercantController],
  providers: [CommercantService],
})
export class CommercantModule {}
