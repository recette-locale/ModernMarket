import { Module } from '@nestjs/common';
import { DistributionZoneService } from './distribution_zone.service';
import { DistributionZoneController } from './distribution_zone.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DistributionZone } from './entities/distribution_zone.entity';
import { ZoneModule } from 'src/zone/zone.module';
import { Zone } from 'luxon';
import { HttpModule } from '@nestjs/axios';
import { SocketModule } from 'src/socket/socket.module';
@Module({
  imports: [
    TypeOrmModule.forFeature([DistributionZone, Zone]),
    ZoneModule,
    HttpModule,
    SocketModule
  ],
  controllers: [DistributionZoneController],
  providers: [DistributionZoneService],
  exports: [DistributionZoneService]
})
export class DistributionZoneModule { }
