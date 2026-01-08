import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { HttpModule } from '@nestjs/axios';

import { LocationService } from './location.service';
import { LocationController } from './location.controller';
import { Location } from './entities/location.entity';
import { Local } from 'src/local/entities/local.entity';
import { Paiementlocation } from 'src/paiement_location/entities/paiement_location.entity';
import { DistributionZone } from 'src/distribution_zone/entities/distribution_zone.entity';
import { Zone } from 'src/zone/entities/zone.entity';
import { Typelocal } from 'src/type_local/entities/type_locale.entity';

import { LocalService } from 'src/local/local.service';
import { DistributionZoneService } from 'src/distribution_zone/distribution_zone.service';
import { ZoneService } from 'src/zone/zone.service';
import { ZoneModule } from 'src/zone/zone.module';
import { PaiementLocationModule } from 'src/paiement_location/paiement_location.module';
import { NotificationModule } from 'src/notification/notification.module';
import { DistributionZoneModule } from 'src/distribution_zone/distribution_zone.module';
import { LocalModule } from 'src/local/local.module';
import { SocketModule } from 'src/socket/socket.module';
@Module({
  imports: [
    TypeOrmModule.forFeature([
      Location,
      Local,
      Paiementlocation,
      Zone,
      Typelocal,
      DistributionZone,
    ]),
    forwardRef(() => PaiementLocationModule), // pour PaiementLocationService
    forwardRef(() => NotificationModule), // pour NotificationService
    ScheduleModule.forRoot(),
    HttpModule,ZoneModule,
    LocalModule,
    DistributionZoneModule,
    SocketModule
  ],
  controllers: [LocationController],
  providers: [
    LocationService,
  
  ],
  exports: [LocationService],
})
export class LocationModule {}
