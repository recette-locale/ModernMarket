import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { AxiosResponse } from 'axios';
import axios from 'axios';

import { Market } from './entities/market.entity';
import { CreateMarketDto } from './dto/create-market.dto';
import { SocketService } from 'src/socket/socket.service'; // adapte le chemin

@Injectable()
export class MarketService {
  private readonly logger = new Logger(MarketService.name);
  private readonly gatewayBaseUrl: string;

  constructor(
    @InjectRepository(Market)
    private readonly marketRepository: Repository<Market>,
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
    private readonly socketService: SocketService,
  ) {
    this.gatewayBaseUrl = this.configService.get<string>(
      'GATEWAY_BASE_URL',
      '',
    );
  }

  private geoJsonToWkt(geojson: {
    type: 'Polygon';
    coordinates: number[][][];
  }): string {
    const ring = geojson.coordinates[0];
    const points = ring.map(([lng, lat]) => `${lng} ${lat}`).join(', ');
    return `POLYGON((${points}))`;
  }

  // ─────────────────────────────────────────────────────────────
  // 1. Vérification du fokontany via le service externe
  // ─────────────────────────────────────────────────────────────
 async existingFokontany(formattedId: string) {
    if (!formattedId) {
      throw new BadRequestException(`Fokontany Id manquant.`);
    }

    try {
      const fullUrl = `${this.gatewayBaseUrl}/serviceterritoire-v2/fokotanys/fokontanys/${formattedId}`;
console.log('URL appelée:', fullUrl);
      const response: AxiosResponse<any> = await firstValueFrom(
        this.httpService.get(
          `${this.gatewayBaseUrl}/serviceterritoire-v2/fokotanys/fokontanys/${formattedId}`,
        ),
      );
console.log('Response from gateway:', response.data);
      if (!response.data) {
        throw new NotFoundException(
          `Fokontany avec l'id '${formattedId}' n'existe pas`,
        );
      }

      return response.data;
    } catch (error: unknown) {
      // Erreur provenant d'Axios
      if (axios.isAxiosError(error)) {
        const status = error.response?.status;

        if (status === 404) {
          throw new NotFoundException(
            `Fokontany with id '${formattedId}' not found in gateway`,
          );
        }

        if (status === 400) {
          throw new BadRequestException(
            `Invalid Fokontany ID '${formattedId}' provided`,
          );
        }
      }

      // Erreur générique : réseau, gateway indisponible, timeout...
      throw new ServiceUnavailableException(
        `Unable to reach the gateway service for fokontany validation`,
      );
    }
  }
  // ─────────────────────────────────────────────────────────────
  // 2. Création d'un market
  // ─────────────────────────────────────────────────────────────
  async create(createMarketDto: CreateMarketDto): Promise<Market> {
    // a) Vérifier que le fokontany existe côté service externe
    await this.existingFokontany(createMarketDto.formatted_id);


    // b) Vérifier la présence du municipalityId
    if (!createMarketDto.municipalityId) {
      throw new BadRequestException(
        `municipalityId est requis dans la requête`,
      );
    }

    // c) Vérifier l'unicité (nom + formatted_id sur le même fokontany)
    const existingMarket = await this.marketRepository.findOne({
      where: {
        nom: createMarketDto.nom,
        formatted_id: createMarketDto.formatted_id,
      },
    });

    if (existingMarket) {
      throw new ConflictException(
        `Market '${createMarketDto.nom}' already exists in fokontany ${createMarketDto.formatted_id}`,
      );
    }

    // d) Vérifier l'unicité du formatted_id (un market par fokontany ?)
    //    → adapte selon ta règle métier : plusieurs markets dans un fokontany ?
    const existingFormatted = await this.marketRepository.findOne({
      where: { formatted_id: createMarketDto.formatted_id },
    });
    if (existingFormatted) {
      throw new ConflictException(
        `A market is already registered for fokontany '${createMarketDto.formatted_id}'`,
      );
    }

    // e) Vérifier les intersections géométriques si delimitation fournie
    if (createMarketDto.delimitation) {
      const intersection = await this.marketRepository
        .createQueryBuilder('market')
        .where(
          `ST_Intersects(
             ST_GeomFromGeoJSON(:newPolygon)::geometry,
             market.delimitation
           )`,
        )
        .setParameters({
          newPolygon: JSON.stringify(createMarketDto.delimitation),
        })
        .getOne();

      if (intersection) {
        throw new ConflictException(
          `The new market intersects with existing market '${intersection.nom}' (id: ${intersection.id_market})`,
        );
      }
    }


    // f) Création + sauvegarde
    try {
    let market = this.marketRepository.create({
      ...createMarketDto,        // ← delimitation reste en objet GeoJSON brut
      // municipalityId déjà dedans
    });

    market = await this.marketRepository.save(market);

      this.socketService.sendNotification({
        authorId: '550e8400-e29b-41d4-a716-446655440003',
        destinationId: null,
        typeNotification: 'broadcastToAll',
        message: 'market_created',
        ressource: market,
      });

      return market;
    } catch (error: unknown) {
      this.logger.error(
        `Failed to create market: ${error instanceof Error ? error.message : String(error)
        }`,
      );
      throw new BadRequestException(
        `Failed to create market. Please check your input data. ${error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  async findAll(): Promise<Market[]> {
    return this.marketRepository.find({
      where: { status: true },
      order: { nom: 'ASC' },
    });
  }
}