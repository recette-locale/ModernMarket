import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ZoneModule } from './zone/zone.module';
import * as Joi from 'joi';
import { DatabaseModule } from './Database/database.module';
import { LocalModule } from './local/local.module';
import { LocationModule } from './location/location.module';
import { PaiementModule } from './paiement/paiement.module';
import { PaiementLocationModule } from './paiement_location/paiement_location.module';
import { NotificationModule } from './notification/notification.module';
import { DistributionZoneModule } from './distribution_zone/distribution_zone.module';
import { TypeLocalModule } from './type_local/type_locale.module';
import { ScheduleModule } from '@nestjs/schedule';
import { SocketModule } from './socket/socket.module';



@Module({
  imports: [
    ScheduleModule.forRoot(),
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: Joi.object({
        POSTGRES_HOST: Joi.string().required(),
        POSTGRES_PORT: Joi.number().required(),
        POSTGRES_USER: Joi.string().required(),
        POSTGRES_PASSWORD: Joi.string().required(),
        POSTGRES_DATABASE: Joi.string().required(),
        PORT: Joi.number(),
      })
    }),
    DatabaseModule,
    ZoneModule,
    LocalModule,
    LocationModule,
    PaiementModule,
    PaiementLocationModule,
    NotificationModule,
    TypeLocalModule,
    DistributionZoneModule,
    SocketModule,


  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule { }
