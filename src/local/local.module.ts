import { forwardRef, Module } from '@nestjs/common';
import { LocalService } from './local.service';
import { LocalController } from './local.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Local } from './entities/local.entity';
import { Zone } from 'src/zone/entities/zone.entity';
import { Typelocal } from 'src/type_local/entities/type_locale.entity';
import { HttpModule } from '@nestjs/axios';
import { LocationModule } from 'src/location/location.module';
import { Location } from 'src/location/entities/location.entity';
import { DistributionZoneModule } from 'src/distribution_zone/distribution_zone.module';
import { NotificationModule } from 'src/notification/notification.module';
import { DistributionZone } from 'src/distribution_zone/entities/distribution_zone.entity';
import { LocationService } from 'src/location/location.service';
import { PaiementLocationService } from 'src/paiement_location/paiement_location.service';
import { Paiementlocation } from 'src/paiement_location/entities/paiement_location.entity';
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
    SocketModule,
    forwardRef(() => NotificationModule),
    forwardRef(() => DistributionZoneModule), // ✅ ajout important ici

    HttpModule,
  ],
  controllers: [LocalController],
  providers: [LocalService, LocationService, PaiementLocationService],
  exports: [LocalService], // facultatif, mais utile si NotificationService l'utilise
})
export class LocalModule { }
