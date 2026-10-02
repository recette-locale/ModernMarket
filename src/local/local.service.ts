import { Inject, Injectable, BadRequestException, ServiceUnavailableException, NotFoundException, HttpException } from '@nestjs/common';
import { CreateLocalDto } from './dto/create-local.dto';
import { UpdateLocalDto } from './dto/update-local.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { Local } from './entities/local.entity';
import { LessThan, Repository } from 'typeorm';
import { Zone } from 'src/zone/entities/zone.entity';
import { Typelocal } from 'src/type_local/entities/type_locale.entity';
import { validate as isUUID } from 'uuid';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { Location as LocationEntity } from 'src/location/entities/location.entity';
import { DistributionZoneService } from 'src/distribution_zone/distribution_zone.service';
import { NotificationService } from 'src/notification/notification.service';
import { DistributionZone } from 'src/distribution_zone/entities/distribution_zone.entity';
import { SocketService } from 'src/socket/socket.service';
import { ConfigService } from '@nestjs/config';
import { CreateManyLocalDto } from './dto/create-many-local.dto';
@Injectable()
export class LocalService {
  private gatewayBaseUrl: string;
  constructor(
    @InjectRepository(Local)
    private readonly localRepository:
      Repository<Local>,

    @InjectRepository(Zone)
    private readonly zoneRepository: Repository<Zone>,

    @InjectRepository(LocationEntity)
    private readonly locationRepository: Repository<LocationEntity>,

    @InjectRepository(Typelocal)
    private readonly typeLocalRepository: Repository<Typelocal>,

    @InjectRepository(DistributionZone)
    private readonly distZoneRepository: Repository<DistributionZone>,
    private readonly httpService: HttpService,

    private readonly distZoneService: DistributionZoneService,
    private readonly notifService: NotificationService,
    private readonly configService: ConfigService,
    private readonly socketService: SocketService,
  ) {
    this.gatewayBaseUrl = this.configService.get<string>('GATEWAY_BASE_URL')!;

  }

  async existingLocalTest(createLocalDto: CreateLocalDto) {
    const existingLocal = await this.localRepository.findOne({
      where: { numero: createLocalDto.numero }
    });
    if (existingLocal) {
      throw new NotFoundException(`Local with name ${createLocalDto.numero} already exists`);
    }
  }

  async existingZoneTest(zoneId: string) {
    const zone = await this.zoneRepository.findOne({
      where: { id_zone: zoneId },
    });
    if (!zone) {
      throw new NotFoundException(
        `Zone with id '${zoneId}' not found`,
      );
    }
  }

  async existingType(typelocalId: string) {
    const typeLocal = await this.typeLocalRepository.findOne({
      where: { id_type_local: typelocalId },
    });
    if (!typeLocal) {
      throw new NotFoundException(
        `TypeLocal with id '${typelocalId}' not found`,
      );
    }
  }

async createMany(localsDto: CreateManyLocalDto[]) {
  if (!localsDto || localsDto.length === 0) {
    throw new BadRequestException(
      'La liste des locaux ne peut pas être vide.',
    );
  }

  try {
    // Vérifications de tous les locaux avant insertion
    for (const localDto of localsDto) {

      // Vérifier que la zone existe
      await this.existingZoneTest(localDto.zoneId);

      // Vérifier que le type de local existe
      await this.existingType(localDto.typelocalId);

      // Vérifier que le local n'existe pas déjà
      await this.existingLocalTest(localDto);
    }

    // Vérifier/récupérer les zones
    for (const localDto of localsDto) {
      const zone = await this.zoneRepository.findOne({
        where: { id_zone: localDto.zoneId },
      });

      if (!zone) {
        throw new NotFoundException(
          `Zone with id '${localDto.zoneId}' not found`,
        );
      }
    }

    // Création des entités
    const locaux = this.localRepository.create(localsDto);

    // Sauvegarde de tous les locaux
    const savedLocaux = await this.localRepository.save(locaux);

    // Notification pour chaque local créé
    for (const local of savedLocaux) {
      const data = {
        authorId: '550e8400-e29b-41d4-a716-446655440003',
        destinationId: null,
        typeNotification: 'broadcastToAll',
        message: 'local_created',
        ressource: local,
      };

      this.socketService.sendNotification(data);
    }

    return {
      success: true,
      message: `${savedLocaux.length} locaux créés avec succès.`,
      data: savedLocaux,
    };

  } catch (error: unknown) {

    // Important : conserver les exceptions NestJS
    if (error instanceof HttpException) {
      throw error;
    }

    console.error('Erreur création des locaux:', error);

    const message =
      error instanceof Error ? error.message : 'Erreur inconnue';

    throw new BadRequestException(
      `Impossible de créer les locaux. ${message}`,
    );
  }
}
  async create(createLocalDto: CreateLocalDto) {
    await this.existingZoneTest(createLocalDto.zoneId);
    await this.existingType(createLocalDto.typelocalId);
    await this.existingLocalTest(createLocalDto);


    const zone = await this.zoneRepository.findOne({
      where: { id_zone: createLocalDto.zoneId },
    });
    if (!zone) {
      throw new NotFoundException(
        `Zone with id '${createLocalDto.zoneId}' not found`,
      );
    }


    try {
      let local = this.localRepository.create(createLocalDto);
      local = await this.localRepository.save(local);
      const data = {
        authorId: '550e8400-e29b-41d4-a716-446655440003',
        destinationId: null,
        typeNotification: 'broadcastToAll',
        message: 'local_created',
        ressource: local
      };

      this.socketService.sendNotification(data);
      return local;
    } catch (error) {
      throw new BadRequestException(
        `Failed to create zone. Please check your input data.`,
      );
    }

  }


  async getAll(
    municipalityId: string,
    page: number = 1,
    limit: number = 10,
    filters: {
      zoneId?: string;
      typelocalId?: string;
      statut?: 'DISPONIBLE' | 'LOUE' | 'INDISPONIBLE';
      keyword?: string;
      surface?: number;
    },
  ) {
    try {
      // Vérifier que la municipalité a au moins une zone
      const zones = await this.zoneRepository.find({
        where: { municipalityId },
      });
      console.log("1 terminer, ", zones);
      if (!zones || zones.length === 0) {
        console.log("1 terminer");
        throw new NotFoundException(
          `Aucune zone de marche trouvée pour la municipalité ${municipalityId}`,
        );
      }
      const zoneIds = zones.map((z) => z.id_zone);
      // Construire la requête dynamique
      const query = this.localRepository
        .createQueryBuilder('local')
        .innerJoinAndSelect('local.zone', 'zone')
        .leftJoinAndSelect('local.typelocal', 'typelocal')
        .where('zone.municipalityId = :municipalityId', { municipalityId })
        .skip((page - 1) * limit)
        .take(limit);
      console.log("3 terminer");
      // Application des filtres
      if (filters.zoneId) {
        if (!isUUID(filters.zoneId)) {
          throw new BadRequestException(`zoneId '${filters.zoneId}' n'est pas un UUID valide`);
        }
        await this.existingZoneTest(filters.zoneId);
        query.andWhere('local.zoneId = :zoneId', { zoneId: filters.zoneId });
      }

      if (filters.typelocalId) {
        if (!isUUID(filters.typelocalId)) {
          throw new BadRequestException(`typelocalId '${filters.typelocalId}' n'est pas un UUID valide`);
        }
        await this.existingType(filters.typelocalId);
        query.andWhere('local.typelocalId = :typelocalId', { typelocalId: filters.typelocalId });
      }

      if (filters.statut) {
        query.andWhere('local.statut = :statut', { statut: filters.statut });
      }

      if (filters.keyword) {
        query.andWhere('local.numero ILIKE :keyword', { keyword: `%${filters.keyword}%` });
      }

      if (filters.surface) {
        query.andWhere('local.surface = :surface', { surface: filters.surface });
      }

      // Exécuter la requête avec pagination
      const [result, total] = await query.getManyAndCount();

      // if (result.length === 0) {
      //   throw new NotFoundException(
      //     `Aucun local trouvé pour la municipalité ${municipalityId} avec les filtres donnés`,
      //   );
      // }

      return {
        message: 'Liste des locaux trouvés',
        data: result,
        pagination: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
        },
        status: 200,
      };
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }
      throw new ServiceUnavailableException(
        'Impossible de récupérer les locaux pour le moment.',
      );
    }
  }



  // Trouver un local en vérifiant la municipalité
  async findOne(municipalityId: string, id_local: string) {
    const local = await this.localRepository
      .createQueryBuilder('local')
      .leftJoinAndSelect('local.zone', 'zone')
      .where('local.id_local = :id_local', { id_local })
      .andWhere('zone.municipalityId = :municipalityId', { municipalityId })
      .getOne();

    if (!local) {
      throw new NotFoundException(
        `Local with id '${id_local}' not found in municipality '${municipalityId}'`
      );
    }

    return local;
  }

  async findLastLocationByLocal(municipalityId: string, id_local: string) {
    // 1️⃣ Récupération du local avec ses locations et zone
    const local = await this.localRepository
      .createQueryBuilder('local')
      .leftJoinAndSelect('local.zone', 'zone')
      .leftJoinAndSelect('local.locations', 'location')
      .where('local.id_local = :id_local', { id_local })
      .andWhere('zone.municipalityId = :municipalityId', { municipalityId })
      .orderBy('location.date_fin_loc', 'DESC') // la plus récente d'abord
      .getOne();

    if (!local || !local.locations || local.locations.length === 0) {
      throw new NotFoundException(
        `Aucune location trouvée pour le local '${id_local}' dans la municipalité '${municipalityId}'`,
      );
    }

    const lastLocation = local.locations[0];

    // 2️⃣ Récupérer le userPseudo via l'API externe
    if (!lastLocation.id_user) {
      throw new BadRequestException('La location n’a pas d’utilisateur associé.');
    }

    const url = `${this.gatewayBaseUrl}/serviceauth/users/${lastLocation.id_user}`;

    try {
      const response = await firstValueFrom(this.httpService.get(url, {
        headers: { accept: 'application/json' },
      }));

      const userPseudo = response.data?.user_pseudo || null;

      return {
        ...lastLocation,
        userPseudo,
      };
    } catch (error) {
      throw new NotFoundException(`Impossible de récupérer l'utilisateur '${lastLocation.id_user}'`);
    }
  }


  // Mettre à jour un local
  async update(
    municipalityId: string,
    id_local: string,
    updateLocalDto: UpdateLocalDto
  ) {
    let local = await this.findOne(municipalityId, id_local);

    Object.assign(local, updateLocalDto);
    local = await this.localRepository.save(local);

    const data = {
      authorId: '550e8400-e29b-41d4-a716-446655440003',
      destinationId: null,
      typeNotification: 'broadcastToAll',
      message: 'local_updated',
      ressource: local
    };

    this.socketService.sendNotification(data);
    return local;
  }

  async updateDateScan(id_local: string) {
    const local = await this.localRepository.findOne({
      where: { id_local: id_local },
    });

    if (!local) {
      throw new NotFoundException('Local introuvable');
    }

    local.date_derniere_scan = new Date();

    return await this.localRepository.save(local);
  }
  private async getAllLocauxByMunicipality(municipalityId: string): Promise<Local[]> {
    return await this.localRepository.find({
      relations: ['zone', 'locations', 'typelocal'],
      where: { zone: { municipalityId } },
    });
  }

  /** Retourne la dernière location d’un local (par date de début) */
  private getCurrentLocation(local: Local): LocationEntity | null {
    if (!local.locations?.length) return null;

    const today = new Date();

    // Filtrer les locations actives (en cours)
    const ongoing = local.locations.filter(
      (loc) =>
        new Date(loc.date_debut_loc) <= today &&
        (!loc.date_fin_loc || new Date(loc.date_fin_loc) >= today)
    );

    // Si plusieurs locations en cours, on prend celle qui a commencé le plus récemment
    if (ongoing.length > 0) {
      return ongoing.sort(
        (a, b) => new Date(b.date_debut_loc).getTime() - new Date(a.date_debut_loc).getTime(),
      )[0];
    }

    // Aucune location en cours
    return null;
  }


  /** Vérifie si le local a été scanné aujourd’hui (journalier) ou ce mois-ci (mensuel) */
  private isLocalScanned(local: Local, periodicite: string | null): boolean {
    const now = new Date();

    // Si la date de dernier scan est absente, ce local n’a pas été scanné
    if (!local.date_derniere_scan) {
      return false;
    }

    const dateScan = new Date(local.date_derniere_scan);

    // 📅 Cas 1 : Périodicité journalière
    if (periodicite === 'JOURNALIER') {
      // Le local est considéré comme scanné si la date du jour correspond
      return (
        dateScan.getFullYear() === now.getFullYear() &&
        dateScan.getMonth() === now.getMonth() &&
        dateScan.getDate() === now.getDate()
      );
    }

    // 📆 Cas 2 : Périodicité mensuelle
    if (periodicite === 'MENSUEL') {
      // Le local est considéré comme scanné si c’est le même mois et la même année
      return (
        dateScan.getFullYear() === now.getFullYear() &&
        dateScan.getMonth() === now.getMonth() &&
        dateScan.getDate() === now.getDate()
      );
    }

    // ❌ Si aucune périodicité correspond, on considère non scanné
    return false;
  }

  /** Initialise la structure de stats d’une zone */
  private initZoneStats(zoneName: string) {
    return {
      zoneName,
      totalLocaux: 0,
      louesMensuels: { scanned: [], nonScanned: [] },
      louesJournaliers: { scanned: [], nonScanned: [] },

    };
  }

  /** Ajoute un local à la bonne catégorie (scanné / non scanné) */
  private addLocalToStats(group: { scanned: string[]; nonScanned: string[] }, local: Local, isScanned: boolean) {
    if (isScanned) group.scanned.push(local.numero);
    else group.nonScanned.push(local.numero);
  }

  /** Met en forme le résultat final */
  private formatStats(statsByZone: Record<string, any>): any[] {
    return Object.values(statsByZone).map((zone: any) => ({
      zoneName: zone.zoneName,
      totalLocaux: zone.totalLocaux,

      // Mensuels
      totalLouesMensuels: zone.louesMensuels.scanned.length + zone.louesMensuels.nonScanned.length,
      totalScannedLouesMensuels: zone.louesMensuels.scanned.length,
      scannedLouesMensuelsNumeros: zone.louesMensuels.scanned,

      totalNonScannedLouesMensuels: zone.louesMensuels.nonScanned.length,
      nonScannedLouesMensuelsNumeros: zone.louesMensuels.nonScanned,

      // Journaliers
      totalLouesJournaliers: zone.louesJournaliers.scanned.length + zone.louesJournaliers.nonScanned.length,
      totalScannedLouesJournaliers: zone.louesJournaliers.scanned.length,
      scannedLouesJournaliersNumeros: zone.louesJournaliers.scanned,

      totalNonScannedLouesJournaliers: zone.louesJournaliers.nonScanned.length,
      nonScannedLouesJournaliersNumeros: zone.louesJournaliers.nonScanned,


    }));
  }
  private async getUserNameById(id_user: string): Promise<string> {
    const user = await firstValueFrom(
      this.httpService.get(`${this.gatewayBaseUrl}/serviceauth/users/${id_user}`)
    );
    return user ? user.data.user_pseudo : 'Inconnu';
  }

  async getStatsByZone(
    municipalityId: string,
    options?: { id_user?: string; id_typelocal?: string; id_zone?: string }
  ): Promise<any[]> {
    const locaux = await this.getAllLocauxByMunicipality(municipalityId);
    if (!locaux.length) {
      throw new NotFoundException(`Aucun local trouvé pour la commune ${municipalityId}`);
    }

    // Si un id_user est fourni, récupérer les zones où il travaille et status=true
    let userZones: string[] = [];
    if (options?.id_user) {
      const zones = await this.distZoneRepository.find({
        where: { id_user: options.id_user, status: true },
      });
      userZones = zones.map((z) => z.zoneId);

      if (!userZones.length) {
        // Le contrôleur n'a aucune zone active
        return [];
      }
    }

    const statsByZone: Record<string, Record<string, any>> = {};

    const summarizeLocal = (local: any) => ({
      id_local: local.id_local,
      numero: local.numero,
      type_contrat: local.typelocal?.type_contrat || null,
      type_local: local.typelocal?.typeLoc?.fr || 'Inconnu',
      zoneId: local.zone?.id_zone || null,
      zoneName: local.zone?.nom || 'Inconnue',
      statut: local.statut,
    });

    for (const local of locaux) {
      const zoneName = local.zone?.nom || 'Inconnue';
      const zoneId = local.zone?.id_zone;

      // Filtrer par zone et par user
      if (options?.id_zone && zoneId !== options.id_zone) continue;
      if (options?.id_user && !userZones.includes(zoneId)) continue;
      if (options?.id_typelocal && local.typelocal?.id_type_local !== options.id_typelocal) continue;

      const isLoued = local.statut === 'LOUE';
      const currentLocation = this.getCurrentLocation(local);
      const periodicite = currentLocation
        ? currentLocation.periodicite
        : local.typelocal?.type_contrat;

      const isScanned = this.isLocalScanned(local, periodicite);

      if (!statsByZone[zoneName]) statsByZone[zoneName] = {};

      // Récupérer l'id du contrôleur s’il y a un scan
      const controllerId = isScanned
        ? await this.notifService.findUserIdByLocalId(local.id_local)
        : null;

      const key = controllerId ?? 'Non Scanned';

      if (!statsByZone[zoneName][key]) {
        statsByZone[zoneName][key] = this.initZoneStats(zoneName);
      }

      const zoneStats = statsByZone[zoneName][key];
      zoneStats.totalLocaux++;

      const summarizedLocal = summarizeLocal(local);

      if (isLoued) {
        if (periodicite === 'MENSUEL') {
          isScanned
            ? zoneStats.louesMensuels.scanned.push(summarizedLocal)
            : zoneStats.louesMensuels.nonScanned.push(summarizedLocal);
        } else if (periodicite === 'JOURNALIER') {
          isScanned
            ? zoneStats.louesJournaliers.scanned.push(summarizedLocal)
            : zoneStats.louesJournaliers.nonScanned.push(summarizedLocal);
        }
      } else if (isScanned) {

      }
    }

    // Reformater le résultat
    const result: any[] = [];

    for (const [zoneName, controllers] of Object.entries(statsByZone)) {
      const zoneData: any = {
        zoneName,
        controllers: [],
        totalLocaux: 0,
        totalLouesMensuels: 0,
        totalScannedLouesMensuels: 0,
        totalNonScannedLouesMensuels: 0,
        totalLouesJournaliers: 0,
        totalScannedLouesJournaliers: 0,
        totalNonScannedLouesJournaliers: 0,

      };

      for (const [ctrlId, data] of Object.entries(controllers)) {
        const controlleurName =
          ctrlId === 'Non Scanned'
            ? 'Non Scanned'
            : await this.getUserNameById(ctrlId);

        zoneData.controllers.push({
          controlleur: controlleurName,
          controlleurId: ctrlId !== 'Non Scanned' ? ctrlId : null,
          totalLocaux: data.totalLocaux,
          totalLouesMensuels:
            data.louesMensuels.scanned.length + data.louesMensuels.nonScanned.length,
          totalScannedLouesMensuels: data.louesMensuels.scanned.length,
          scannedLouesMensuels: data.louesMensuels.scanned,
          totalNonScannedLouesMensuels: data.louesMensuels.nonScanned.length,
          nonScannedLouesMensuels: data.louesMensuels.nonScanned,
          totalLouesJournaliers:
            data.louesJournaliers.scanned.length +
            data.louesJournaliers.nonScanned.length,
          totalScannedLouesJournaliers: data.louesJournaliers.scanned.length,
          scannedLouesJournaliers: data.louesJournaliers.scanned,
          totalNonScannedLouesJournaliers: data.louesJournaliers.nonScanned.length,
          nonScannedLouesJournaliers: data.louesJournaliers.nonScanned,

        });

        zoneData.totalLocaux += data.totalLocaux;
        zoneData.totalLouesMensuels +=
          data.louesMensuels.scanned.length + data.louesMensuels.nonScanned.length;
        zoneData.totalScannedLouesMensuels += data.louesMensuels.scanned.length;
        zoneData.totalNonScannedLouesMensuels += data.louesMensuels.nonScanned.length;
        zoneData.totalLouesJournaliers +=
          data.louesJournaliers.scanned.length + data.louesJournaliers.nonScanned.length;
        zoneData.totalScannedLouesJournaliers += data.louesJournaliers.scanned.length;
        zoneData.totalNonScannedLouesJournaliers +=
          data.louesJournaliers.nonScanned.length;

      }

      result.push(zoneData);
    }

    return result;
  }



  // Supprimer un local
  async remove(municipalityId: string, id_local: string) {
    const local = await this.findOne(municipalityId, id_local);
    return await this.localRepository.remove(local);
  }

}
