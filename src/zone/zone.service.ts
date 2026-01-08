import {
  Injectable, NotFoundException, BadRequestException,
  ConflictException,
  ServiceUnavailableException, Query
} from '@nestjs/common';
import { InjectRepository, } from '@nestjs/typeorm';
import { Repository, ILike, } from 'typeorm';
import { Zone } from './entities/zone.entity';
import { CreateZoneDto } from './dto/create-zone.dto';
import { UpdateZoneDto } from './dto/update-zone.dto';
import { firstValueFrom } from 'rxjs';
import { HttpService } from '@nestjs/axios';
import { AxiosResponse, AxiosError } from 'axios';
import { SocketService } from 'src/socket/socket.service';
import * as _ from 'lodash';
import { ConfigService } from '@nestjs/config';
@Injectable()
export class ZoneService {
  private gatewayBaseUrl: string;
  constructor(
    @InjectRepository(Zone)
    private readonly zoneRepository: Repository<Zone>,
    private readonly httpService: HttpService,
    private readonly socketService: SocketService,
    private readonly configService: ConfigService,
  ) {
    this.gatewayBaseUrl = this.configService.get<string>('GATEWAY_BASE_URL')!;
  }

  async findOneById(zoneId: string): Promise<Zone | null> {
    return this.zoneRepository.findOne({ where: { id_zone: zoneId } });
  }

  async existingFokontany(formattedId: string) {
    if (!formattedId) {
      throw new BadRequestException(`Fokontany Id manquant.`);
    }

    try {
      console.log(this.gatewayBaseUrl);
      const response: AxiosResponse<any> = await firstValueFrom(
        this.httpService.get(
          `https://gateway.tsirylab.com/serviceterritoire-v2/fokotanys/${formattedId}`,
        ),
      );

      if (!response.data) {
        throw new NotFoundException(
          `Fokontany avec l' id '${formattedId}' n'existe pas`,
        );
      }

      return response.data;
    } catch (error) {
      // Erreur côté API externe
      if (error.response?.status === 404) {
        throw new NotFoundException(
          `Fokontany with id '${formattedId}' not found in gateway`,
        );
      }
      if (error.response?.status === 400) {
        throw new BadRequestException(
          `Invalid Fokontany ID '${formattedId}' provided`,
        );
      }

      // Erreur générique (API down ou problème réseau)
      throw new ServiceUnavailableException(
        `Unable to reach the gateway service for fokontany validation`,
      );
    }
  }

  async create(createZoneDto: CreateZoneDto) {
    // Vérifier que la fokontany existe dans le service externe
    //const fokontany = await this.existingFokontany(createZoneDto.formatted_id);

    const municipalityId = createZoneDto.municipalityId;
    
    if (!municipalityId) {
      throw new BadRequestException(
        `municipalityId est requis dans la requête`,
      );
    }


    const existingZone = await this.zoneRepository.findOne({
      where: {
        nom: createZoneDto.nom,
        formatted_id: createZoneDto.formatted_id,
      },
    });

    if (existingZone) {
      throw new ConflictException(
        `Zone '${createZoneDto.nom}' already exists in fokontany ${createZoneDto.formatted_id}`,
      );
    }

    // 🚨 Vérifier les intersections avec d’autres zones
    const intersection = await this.zoneRepository
      .createQueryBuilder('zone')
      .where(
        `ST_Intersects(
        ST_GeomFromGeoJSON(:newPolygon)::geometry,
        zone.delimitation
      )`,
      )
      .setParameters({
        newPolygon: JSON.stringify(createZoneDto.delimitation),
      })
      .getOne();

    if (intersection) {
      throw new ConflictException(
        `The new zone intersects with existing zone '${intersection.nom}' (id: ${intersection.id_zone})`,
      );
    }

    try {
      let zone = this.zoneRepository.create({
        ...createZoneDto,
        municipalityId,
      });

      // 2️⃣ Sauvegarde → l'ID est maintenant généré
      zone = await this.zoneRepository.save(zone);
      console.log("heloooo");
      // 3️⃣ Envoi de la notification avec la zone complète
      const data = {
        authorId: '550e8400-e29b-41d4-a716-446655440003',
        destinationId: null,
        typeNotification: 'broadcastToAll',
        message: 'zone_created',
        ressource: zone
      };

      this.socketService.sendNotification(data);

      return zone;
    } catch (error) {
      throw new BadRequestException(
        `Failed to create zone. Please check your input data. ${error.message}`,
      );
    }
  }


  // Retourner toutes les zones d’une municipalité
  async findAll(
    municipalityId: string,
    limit: number,
    page: number,
    filters: {
      keyword?: string;
      latitude?: number;
      longitude?: number;
    },
  ) {
    try {
      // Vérifier si la municipalité existe via API externe
      // const url = `${this.gatewayBaseUrl}/serviceterritoire-v2/communes/${municipalityId}`;
      // const response = await firstValueFrom(
      //   this.httpService.get(url, { headers: { accept: 'application/json' } }),
      // );

      // if (!response.data) {
      //   throw new NotFoundException(`Municipality with id ${municipalityId} not found`);
      // }

      // Version simple avec calcul JavaScript (recommandée pour simplicité)
      const query = this.zoneRepository
        .createQueryBuilder('zone')
        .leftJoinAndSelect('zone.locaux', 'locaux')
        .where('zone.municipalityId = :municipalityId', { municipalityId });

      if (filters.keyword) {
        query.andWhere('LOWER(zone.nom) LIKE :keyword', {
          keyword: `%${filters.keyword.toLowerCase()}%`,
        });
      }

      if (filters.latitude && filters.longitude) {
        query.andWhere(
          `ST_Contains(zone.delimitation, ST_SetSRID(ST_Point(:lng, :lat), 4326))`,
          { lat: filters.latitude, lng: filters.longitude },
        );
      }
      // Pagination
      query
        .orderBy('zone.nom', 'ASC')
        .skip((page - 1) * limit)
        .take(limit);

      const [result, total] = await query.getManyAndCount();

      // Calculer seulement le total et les disponibles pour chaque zone
      const zonesWithCounts = result.map(zone => ({
        id_zone: zone.id_zone,
        nom: zone.nom,
        status: zone.status,
        geo_delimitation: zone.delimitation,
        formatted_Id: zone.formatted_id,
        municipalityId: zone.municipalityId,
        total_locaux: zone.locaux.length,
        locaux_disponibles: zone.locaux.filter(local => local.statut === 'DISPONIBLE').length
      }));

      return {
        message: 'Liste des zones filtrées',
        data: zonesWithCounts,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
        status: 200,
      };
    } catch (error) {
      if (error instanceof AxiosError && error.response?.status === 404) {
        throw new NotFoundException(`Municipality with id ${municipalityId} not found`);
      }

      if (error instanceof NotFoundException) {
        throw error;
      }

      throw new ServiceUnavailableException(
        'Impossible de récupérer les zones pour le moment. Veuillez réessayer plus tard.',
      );
    }
  }

  async findOne(id_zone: string, municipalityId?: string) {
    const query = this.zoneRepository
      .createQueryBuilder('zone')
      .leftJoinAndSelect('zone.locaux', 'locaux')
      .where('zone.id_zone = :id_zone', { id_zone });

    if (municipalityId !== undefined && municipalityId !== null && municipalityId !== "{municipalityId}") {
      await this.verifyMunicipalityExists(municipalityId);
      query.andWhere('zone.municipalityId = :municipalityId', { municipalityId });
    }

    const zone = await query.getOne();

    if (!zone) {
      throw new NotFoundException(`Zone with id ${id_zone} not found`);
    }

    return zone;
  }

  // Méthode auxiliaire pour vérifier l'existence de la municipalité
  private async verifyMunicipalityExists(municipalityId: string): Promise<void> {
    try {
      const url = `https://gateway.tsirylab.com/serviceterritoire-v2/communes/${municipalityId}`;
      await firstValueFrom(
        this.httpService.get(url, {
          headers: { accept: 'application/json' }
        })
      );
    } catch (error) {
      if (error instanceof AxiosError && error.response?.status === 404) {
        throw new NotFoundException(
          `Municipalité avec id ${municipalityId} introuvable`
        );
      }
      throw new ServiceUnavailableException(
        'Impossible de vérifier la municipalité. Veuillez réessayer plus tard.',
      );
    }
  }
  async searchByName(municipalityId: string, keyword: string): Promise<Zone[]> {
    if (!keyword) {
      throw new BadRequestException('Le mot-clé de recherche est requis');
    }
    console.log("happy");
    const url = `https://gateway.tsirylab.com/serviceterritoire-v2/communes/${municipalityId}`;
    const response = await firstValueFrom(
      this.httpService.get(url, { headers: { accept: 'application/json' } })
    );

    if (!response.data) {
      throw new NotFoundException(`Municipality with id ${municipalityId} not found`);
    }

    try {

      return await this.zoneRepository.find({
        where: {
          municipalityId,
          nom: ILike(`%${keyword}%`), // insensible à la casse
        },
      });
    } catch (error) {
      // Vérifier si l'erreur vient de l'API (404)
      if (error instanceof AxiosError && error.response?.status === 404) {
        throw new NotFoundException(`Municipality with id ${municipalityId} not found`);
      }

      // Toute autre erreur
      throw new ServiceUnavailableException(
        'Impossible de récupérer les zones pour le moment. Veuillez réessayer plus tard.',
      );
    }
  }

  // Mettre à jour une zone via son nom et la municipalité
  async update(
    municipalityId: string,
    id_zone: string,
    updateZoneDto: UpdateZoneDto,
  ) {
    const url = `https://gateway.tsirylab.com/serviceterritoire-v2/communes/${municipalityId}`;
    const response = await firstValueFrom(
      this.httpService.get(url, { headers: { accept: 'application/json' } })
    );

    if (!response.data) {
      throw new NotFoundException(`Municipality with id ${municipalityId} not found`);
    }

    try {
      let zone = await this.findOne(id_zone, municipalityId);

      Object.assign(zone, updateZoneDto);

      zone = await this.zoneRepository.save(zone);

      const data = {
        authorId: '550e8400-e29b-41d4-a716-446655440003',
        destinationId: null,
        typeNotification: 'broadcastToAll',
        message: 'zone_upated',
        ressource: zone
      };

      this.socketService.sendNotification(data);
      return zone;
    } catch (error) {
      // Vérifier si l'erreur vient de l'API (404)
      if (error instanceof AxiosError && error.response?.status === 404) {
        throw new NotFoundException(`Municipality with id ${municipalityId} not found`);
      }

      // Toute autre erreur
      throw new ServiceUnavailableException(
        'Impossible de mettre a jour  les zones pour le moment. Veuillez réessayer plus tard.',
      );
    }
  }
  // Supprimer une zone via son nom et la municipalité
  async remove(id_zone: string) {
    // Vérifier si la zone existe
    const zone = await this.zoneRepository.findOne({ where: { id_zone } });
    if (!zone) {
      throw new NotFoundException(`Zone avec id ${id_zone} introuvable`);
    }

    // Supprimer
    await this.zoneRepository.delete(id_zone);

    return {
      message: `Zone ${id_zone} supprimée avec succès`,
      success: true,
    };
  }


  async findAll1(): Promise<Zone[]> {
    const data = {
      authorId: '550e8400-e29b-41d4-a716-446655440003',
      destinationId: null,
      typeNotification: 'broadcastToAll',
      message: 'findAllZone',

    };

    // Envoie à tous les clients connectés via ton SocketService
    this.socketService.sendNotification(data);
    return this.zoneRepository.find({
      relations: ['locaux', 'distributionZones'], // si tu veux récupérer les relations
    });
  }
}