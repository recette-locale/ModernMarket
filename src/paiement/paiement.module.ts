import { Module } from '@nestjs/common';
import { PaiementService } from './paiement.service';
import { PaiementController } from './paiement.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Paiement } from './entities/paiement.entity';
import { Location } from 'src/location/entities/location.entity';
import { Paiementlocation } from 'src/paiement_location/entities/paiement_location.entity';
import { PaiementLocationService } from 'src/paiement_location/paiement_location.service';
import { LocationModule } from 'src/location/location.module';
import { NotificationModule } from 'src/notification/notification.module';
import { HttpModule } from '@nestjs/axios';
import { PaiementLocationModule } from 'src/paiement_location/paiement_location.module';
import { SocketModule } from 'src/socket/socket.module';
@Module({
  imports: [TypeOrmModule.forFeature([Paiement,Location,Paiementlocation]), LocationModule,NotificationModule,HttpModule,
PaiementLocationModule,SocketModule],
  controllers: [PaiementController],
  providers: [PaiementService],
  exports: [PaiementService],
})
export class PaiementModule {}
