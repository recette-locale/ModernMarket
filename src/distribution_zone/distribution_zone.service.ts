import { Injectable, NotFoundException, ServiceUnavailableException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { CreateDistributionZoneDto } from './dto/create-distribution_zone.dto';
import { UpdateDistributionZoneDto } from './dto/update-distribution_zone.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DistributionZone } from './entities/distribution_zone.entity';
import { ZoneService } from 'src/zone/zone.service';
import { Zone } from 'src/zone/entities/zone.entity';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { IsNull } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { SocketService } from 'src/socket/socket.service';

@Injectable()
export class DistributionZoneService {
  private gatewayBaseUrl: string;

  constructor(
    @InjectRepository(DistributionZone)
    private readonly distributionZoneRepository: Repository<DistributionZone>,
    private readonly zoneService: ZoneService,
    private readonly socketService: SocketService,
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
  ) {
    this.gatewayBaseUrl = this.configService.get<string>('GATEWAY_BASE_URL')!;


  }

  async create(createDistributionZoneDto: CreateDistributionZoneDto) {
    const zone = await this.zoneService.findOneById(createDistributionZoneDto.zoneId);
    if (!zone) {
      throw new NotFoundException(`Zone ${createDistributionZoneDto.zoneId} introuvable`);
    }
    try {
      const response = await firstValueFrom(
        this.httpService.get(`https://gateway.tsirylab.com/serviceauth/users/${createDistributionZoneDto.id_user}`)
      );

      const userData = response.data;

      if (!userData) {
        throw new NotFoundException(`Utilisateur ${createDistributionZoneDto.id_user} introuvable ou roles manquants.`);
      }
    } catch (error: any) {
      // Gestion spécifique pour AxiosError
      if (error.response?.status === 404) {
        throw new NotFoundException(`Utilisateur ${createDistributionZoneDto.id_user} introuvable.`);
      }
      if (error.response?.status === 403) {
        throw new ForbiddenException(`Accès refusé pour l’utilisateur ${createDistributionZoneDto.id_user}.`);
      }
      console.error('Erreur HTTP lors de la vérification du rôle:', error.response?.data || error.message);
      throw new BadRequestException(`Erreur lors de la vérification du rôle: ${error.message || error}`);
    }

    let verification = await this.distributionZoneRepository.findOne({
      where: {
        id_user: createDistributionZoneDto.id_user,
        zoneId: createDistributionZoneDto.zoneId,
        status: true
      }
    });
    if (verification) {
      throw new BadRequestException(`L'utilisateur ${createDistributionZoneDto.id_user} est déjà affecté à la zone ${createDistributionZoneDto.zoneId} avec le statut actif.`);
    }

    let distributionZone = this.distributionZoneRepository.create(createDistributionZoneDto);

    distributionZone = await this.distributionZoneRepository.save(distributionZone);
    const data = {
      authorId: '550e8400-e29b-41d4-a716-446655440003',
      destinationId: distributionZone.id_user,
      typeNotification: 'sendToUser',
      message: 'vous_avez_une_zone',
      ressource: distributionZone
    };
    const data1 = {
      authorId: '550e8400-e29b-41d4-a716-446655440003',
      destinationId: null,
      typeNotification: 'broadcastToAll',
      message: 'distribution_zone_created',
      ressource: distributionZone
    };
    this.socketService.sendNotification(data1);
    // Envoie à tous les clients connectés via ton SocketService
    this.socketService.sendNotification(data);

    return distributionZone;
  }

  async findAll(municipalityId: string, page: number = 1, limit: number = 10): Promise<{ data: DistributionZone[], total: number }> {
    const query = this.distributionZoneRepository
      .createQueryBuilder('distributionZone')
      .leftJoinAndSelect('distributionZone.zone', 'zone')
      .where('zone.municipalityId = :municipalityId', { municipalityId })
      .orderBy('distributionZone.id_distribution_zone', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    const [result, total] = await query.getManyAndCount();

    return { data: result, total };
  }

  async findOne(id_distribution_zone: string, municipalityId: string) {
    const distributionZone = await this.distributionZoneRepository
      .createQueryBuilder('distributionZone')
      .leftJoinAndSelect('distributionZone.zone', 'zone')
      .where('distributionZone.id_distribution_zone = :id_distribution_zone', { id_distribution_zone })
      .andWhere('zone.municipalityId = :municipalityId', { municipalityId })
      .getOne();

    if (!distributionZone) {
      throw new NotFoundException(`DistributionZone ${id_distribution_zone} introuvable dans cette municipalité`);
    }

    return distributionZone;
  }

  async findAllTrueByidUser(id_user: string, municipalityId: string) {
    const distributionZone = await this.distributionZoneRepository
      .createQueryBuilder('distributionZone')
      .leftJoinAndSelect('distributionZone.zone', 'zone')
      .where('distributionZone.id_user = :id_user', { id_user })
      .andWhere('zone.municipalityId = :municipalityId', { municipalityId })
      .andWhere('distributionZone.status = :status', { status: true })
      .getMany();

    if (!distributionZone) {
      throw new NotFoundException(`DistributionZone for user ${id_user} introuvable dans cette municipalité`);
    }
    return distributionZone;
  }

  async findAllByIdUser(id_user: string, municipalityId: string): Promise<DistributionZone[]> {
    const distributionZones = await this.distributionZoneRepository
      .createQueryBuilder('distributionZone')
      .leftJoinAndSelect('distributionZone.zone', 'zone')
      .where('distributionZone.id_user = :id_user', { id_user })
      .andWhere('zone.municipalityId = :municipalityId', { municipalityId })
      .getMany();

    if (!distributionZones || distributionZones.length === 0) {
      throw new NotFoundException(`Aucune zone de distribution historique n'a été trouvée pour l'utilisateur ${id_user} dans cette municipalité.`);
    }

    return distributionZones;
  }

  async findCurrentUserByZone(id_zone): Promise<string[]> {
    const distributions = await this.distributionZoneRepository.find({
      where: { zoneId: id_zone, status: true },
      select: ['id_user'],
    });

    if (!distributions.length) {
      return [];
    }


    // On retourne uniquement les id_user sous forme de tableau
    return distributions.map((dist) => dist.id_user);
  }


  async update(id_distribution_zone: string, municipalityId: string, updateDistributionZoneDto: UpdateDistributionZoneDto) {
    const distributionZone = await this.findOne(id_distribution_zone, municipalityId);
    Object.assign(distributionZone, updateDistributionZoneDto);

    return await this.distributionZoneRepository.save(distributionZone);
  }


  async remove(id_distribution_zone: string, municipalityId: string) {
    const distributionZone = await this.findOne(id_distribution_zone, municipalityId);
    return await this.distributionZoneRepository.remove(distributionZone);
  }
}
