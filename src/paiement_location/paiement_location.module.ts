import { Module } from '@nestjs/common';
import { PaiementLocationService } from './paiement_location.service';
import { PaiementLocationController } from './paiement_location.controller';
import { Paiementlocation } from './entities/paiement_location.entity';
import { Location } from 'src/location/entities/location.entity';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SocketModule } from 'src/socket/socket.module';
@Module({
  imports: [
    TypeOrmModule.forFeature([Paiementlocation, Location]),
    SocketModule
  ],
  controllers: [PaiementLocationController],
  providers: [PaiementLocationService],
  exports: [PaiementLocationService],
})
export class PaiementLocationModule {}
