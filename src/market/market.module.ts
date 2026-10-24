import { Module } from '@nestjs/common';
import { MarketService } from './market.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MarketController } from './market.controller';
import { Market } from './entities/market.entity';
import { HttpModule } from '@nestjs/axios';
import { SocketService } from 'src/socket/socket.service';

@Module({
  imports: [
      TypeOrmModule.forFeature([
        Market,
      ]),
      HttpModule.register({ timeout: 10000, maxRedirects: 3 }),
    ],
  controllers: [MarketController],
  providers: [MarketService,SocketService,],
})
export class MarketModule {}
