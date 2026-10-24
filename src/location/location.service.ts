import { Injectable, NotFoundException, ServiceUnavailableException, BadRequestException, Logger, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, LessThanOrEqual, MoreThanOrEqual, LessThan, MoreThan } from 'typeorm';
import { Location } from './entities/location.entity';
import { CreateLocationDto } from './dto/create-location.dto';
import { Periodicite } from './entities/location.entity';
import { Paiementlocation } from 'src/paiement_location/entities/paiement_location.entity';
import { Local } from 'src/local/entities/local.entity';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PaiementLocationService } from 'src/paiement_location/paiement_location.service';
import { NotificationService } from 'src/notification/notification.service';
import * as QRCode from 'qrcode';
import axios from 'axios';
import { DistributionZone } from 'src/distribution_zone/entities/distribution_zone.entity';
import { WritableStreamBuffer } from 'stream-buffers';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom, lastValueFrom } from 'rxjs';
import * as PDFDocument from 'pdfkit';
import { LocalService } from 'src/local/local.service';
import { SocketService } from 'src/socket/socket.service';
import { ConfigService } from '@nestjs/config';
@Injectable()
export class LocationService {
  private readonly logger = new Logger(LocationService.name);
  private gatewayBaseUrl: string;
  constructor(
    @InjectRepository(Location)
    private readonly locationRepository: Repository<Location>,
    @InjectRepository(Local)
    private readonly localRepository: Repository<Local>,
    private readonly paiementLocationService: PaiementLocationService,
    @InjectRepository(Paiementlocation)
    private readonly paiementLocationRepository: Repository<Paiementlocation>,

    @InjectRepository(DistributionZone)
    private readonly distributionZoneRepository: Repository<DistributionZone>,
    private readonly notificationService: NotificationService,
    private readonly httpService: HttpService,
    private readonly localService: LocalService,
    private readonly socketService: SocketService,
    private readonly configService: ConfigService,
  ) {
    this.gatewayBaseUrl = this.configService.get<string>('GATEWAY_BASE_URL')!;
  }

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT, {
    timeZone: 'Europe/Paris',
  })
  async handleExpiredLocations() {
    console.log('--- JOB CRON EXÉCUTÉ À MINUIT ---');
    this.logger.log('Lancement du job CRON pour vérifier les locations expirées.');

    const today = new Date();
    today.setHours(23, 59, 59, 999);

    try {
      const expiredLocations = await this.locationRepository.find({
        where: {
          date_fin_loc: LessThan(today)
        },
        relations: ['local'],
      });

      this.logger.log(`${expiredLocations.length} locations expirées trouvées.`);

      for (const location of expiredLocations) {
        if (location.local) {
          await this.updateLocalStatusIfNoActiveLocation(location.local.id_local);
        }
      }

      const rentedLocals = await this.localRepository.find({
        where: { statut: 'LOUE' }
      });

      for (const local of rentedLocals) {
        await this.updateLocalStatusIfNoActiveLocation(local.id_local);
      }

      this.logger.log(`Fin du job CRON. ${expiredLocations.length} locations expirées traitées.`);
    } catch (error) {
      this.logger.error('Erreur lors du traitement des locations expirées:', error);
    }
  }

  private async updateLocalStatusIfNoActiveLocation(localId: string): Promise<void> {
    try {
      const today = new Date();

      // Vérifier s'il y a une location active pour ce local
      const activeLocation = await this.locationRepository.findOne({
        where: {
          localId,
          date_debut_loc: LessThanOrEqual(today),
          date_fin_loc: MoreThanOrEqual(today),
        },
      });

      // Récupérer le local
      const local = await this.localRepository.findOne({
        where: { id_local: localId }
      });

      if (local) {
        if (!activeLocation) {
          if (local.statut !== 'DISPONIBLE') {
            this.logger.log(`Aucune location active trouvée pour le local ${localId}. Mise à jour du statut en DISPONIBLE.`);

            local.statut = 'DISPONIBLE';
            await this.localRepository.save(local);

          }
        }
        // S'il y a une location active, le local doit être LOUÉ
        else {
          if (local.statut !== 'LOUE') {
            this.logger.log(`Location active trouvée pour le local ${localId}. Mise à jour du statut en LOUÉ.`);

            local.statut = 'LOUE';
            await this.localRepository.save(local);

          }
        }
      }
    } catch (error) {
      this.logger.error(`Erreur lors de la mise à jour du statut du local ${localId}:`, error);
    }
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async updateExpiredLocations() {
    const now = new Date();

    const expiredLocations = await this.locationRepository
      .createQueryBuilder('location')
      .leftJoinAndSelect('location.local', 'local')
      .where('location.date_fin_loc < :now', { now })
      .andWhere('local.statut = :statut', { statut: 'LOUE' })
      .getMany();

    for (const loc of expiredLocations) {
      await this.updateLocalStatusIfNoActiveLocation(loc.local.id_local);
    }
  }

  async findAll(
    municipalityId: string,
    page = 1,
    limit = 10,
  ): Promise<{ data: Location[]; total: number }> {
    const query = this.locationRepository
      .createQueryBuilder('location')
      .leftJoinAndSelect('location.local', 'local')
      .leftJoinAndSelect('local.zone', 'zone')
      .leftJoinAndSelect('zone.market', 'market')     // ✅ market ajouté
      .where('zone.municipalityId = :municipalityId', { municipalityId });

    const [result, total] = await query
      .orderBy('location.id_location', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return { data: result, total };
  }

  async create(createLocationDto: CreateLocationDto): Promise<Location> {
    const { date_debut_loc, localId, id_user, nif } = createLocationDto;

    // ── 1) Le local doit exister ──
    const local = await this.localRepository.findOne({
      where: { id_local: localId },
      relations: ['typelocal'],
    });

    if (!local) {
      throw new NotFoundException(`Local with id ${localId} not found`);
    }

    // ── 2) Le local doit être DISPONIBLE ──
    if (local.statut !== 'DISPONIBLE') {
      throw new BadRequestException(
        `Le local ${localId} n'est pas disponible (statut actuel : ${local.statut}).`,
      );
    }

    // ── 3) Le Typelocal doit autoriser une location mensuelle (ANNUEL) ──
    const typeContrat = local.typelocal?.type_contrat;
    if (!typeContrat) {
      throw new BadRequestException(
        `Le type de contrat du local ${localId} est introuvable.`,
      );
    }
    if (typeContrat !== 'ANNUEL') {
      throw new BadRequestException(
        `Le local ${localId} est de type contrat JOURNALIER. ` +
        `Ce service ne gère que les locations mensuelles.`,
      );
    }

    // ── 4) Limite de locations actives par user ──
    const countCurrentLocationUser =
      await this.countCurrentLocationsByUser(id_user);
    if (countCurrentLocationUser >= 3) {
      throw new BadRequestException(
        `L'utilisateur avec l'ID ${id_user} a déjà 3 locations en cours.`,
      );
    }

    // ── 5) Dates ──
    const debut = new Date(date_debut_loc);
    debut.setHours(0, 0, 0, 0);

    const date_fin_loc = createLocationDto.date_fin_loc
      ? new Date(createLocationDto.date_fin_loc)
      : (() => {
        const d = new Date(debut);
        d.setFullYear(d.getFullYear() + 1);
        return d;
      })();
    date_fin_loc.setHours(23, 59, 59, 999);

    if (debut >= date_fin_loc) {
      throw new BadRequestException(
        'La date de début doit être avant la date de fin.',
      );
    }

    // ── 6) Validation mensuelle : au moins 1 mois d'écart ──
    const diffMonths =
      (date_fin_loc.getFullYear() - debut.getFullYear()) * 12 +
      (date_fin_loc.getMonth() - debut.getMonth());

    if (diffMonths < 1) {
      throw new BadRequestException(
        "Pour une location mensuelle, l'écart doit être d'au moins un mois.",
      );
    }

    // ── 7) Chevauchement avec une location existante ──
    const existingLocation = await this.locationRepository
      .createQueryBuilder('location')
      .where('location.localId = :localId', { localId })
      .andWhere('location.date_debut_loc < :newFin', { newFin: date_fin_loc })
      .andWhere('location.date_fin_loc > :newDebut', { newDebut: debut })
      .getOne();

    if (existingLocation) {
      throw new BadRequestException(
        `Le local ${localId} est déjà loué pour la période demandée.`,
      );
    }

    // ── 8) Fréquence (nb de mois) ──
    const frequence =
      date_fin_loc.getDate() === debut.getDate() && diffMonths > 0
        ? diffMonths
        : date_fin_loc.getDate() >= debut.getDate()
          ? diffMonths + 1
          : diffMonths;

    // ── 9) Création ──
    const location = this.locationRepository.create({
      periodicite: Periodicite.MENSUEL,      // forcé : ce service ne gère que le mensuel
      id_user,
      nif,
      date_debut_loc: debut,
      date_fin_loc,
      localId,
      frequence,
      usage: createLocationDto.usage,
    });

    const savedLocation = await this.locationRepository.save(location);

    // ── 10) Mettre à jour le statut du local ──
    local.statut = 'LOUE';
    await this.localRepository.save(local);

    // ── 11) Notifications ──
    await this.notificationService.createLocationNotification(
      savedLocation.id_user,
      'CONFIRMED',
      {
        id_location: savedLocation.id_location,
        localId: savedLocation.localId,
      },
    );

    this.socketService.sendNotification({
      authorId: '550e8400-e29b-41d4-a716-446655440003',
      destinationId: null,
      typeNotification: 'broadcastToAll',
      message: 'location_created',
      ressource: savedLocation,
    });

    this.socketService.sendNotification({
      authorId: '550e8400-e29b-41d4-a716-446655440003',
      destinationId: savedLocation.id_user,
      typeNotification: 'sendToUser',
      message: 'votre_location_created',
      ressource: savedLocation,
    });

    return savedLocation;
  }

  async updateLocalStatusToRented(locationId: string): Promise<void> {
    // 1. Trouver la Location en incluant la relation vers le Local
    const location = await this.locationRepository.findOne({
      where: { id_location: locationId },
      relations: ['local'],
    });

    if (!location) {
      throw new NotFoundException(`Location with id ${locationId} not found`);
    }

    // 2. Vérifier si un local est associé
    if (!location.local) {
      throw new NotFoundException(`Local not found for location id ${locationId}`);
    }

    // 3. Mettre à jour le statut du Local associé
    const local = location.local;
    local.statut = 'LOUE';
    await this.localRepository.save(local);
  }

  async findAllInProgress(
    municipalityId: string,
    page = 1,
    limit = 50,
  ): Promise<{ data: Location[]; total: number }> {
    // Normaliser à minuit pour comparer avec des colonnes DATE
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const query = this.locationRepository
      .createQueryBuilder('location')
      .leftJoinAndSelect('location.local', 'local')
      .leftJoinAndSelect('local.zone', 'zone')
      .leftJoinAndSelect('zone.market', 'market')
      .where('location.date_debut_loc <= :today', { today })
      .andWhere('location.date_fin_loc >= :today', { today })
      .andWhere('market.municipalityId = :municipalityId', { municipalityId });

    const [data, total] = await query
      .orderBy('location.date_debut_loc', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return { data, total };
  }

  async findByUser(
    id_user: string,
    page?: number,
    limit?: number,
  ): Promise<
    | Location[]
    | { data: Location[]; total: number; currentPage: number; totalPages: number }
  > {
    const query = this.locationRepository
      .createQueryBuilder('location')
      .leftJoinAndSelect('location.local', 'local')
      .leftJoinAndSelect('local.zone', 'zone')
      .leftJoinAndSelect('zone.market', 'market')
      .where('location.id_user = :id_user', { id_user })
      .orderBy('location.date_debut_loc', 'DESC')
      .addOrderBy('location.id_location', 'DESC');

    // Pagination si explicitement demandée
    if (page !== undefined && limit !== undefined && limit > 0) {
      const [data, total] = await query
        .skip((page - 1) * limit)
        .take(limit)
        .getManyAndCount();

      return {
        data,
        total,
        currentPage: page,
        totalPages: Math.ceil(total / limit),
      };
    }

    return query.getMany();
  }


  async findInProgressByUser(id_user: string): Promise<Location[]> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return this.locationRepository.find({
      where: {
        id_user,
        date_debut_loc: LessThanOrEqual(today),
        date_fin_loc: MoreThanOrEqual(today),
      },
      relations: ['local', 'local.zone', 'local.typelocal', 'paiement_locations'],
      order: { date_debut_loc: 'DESC' },
    });
  }

  async findInProgressByUserByControlleur(
    id_user: string,
    id_controleur: string,
  ): Promise<{
    userNom: string | null;
    total: number;
    locations: Location[];
  }> {
    // ── 1) Récupérer le contribuable via la gateway ──
    let userNom: string | null = null;
    try {
      const response = await firstValueFrom(
        this.httpService.get(
          `${this.gatewayBaseUrl}/serviceauth/users/${id_user}`,
        ),
      );

      const userData = response.data;
      if (!userData) {
        throw new NotFoundException(`Utilisateur ${id_user} introuvable.`);
      }
      userNom = userData.user_pseudo ?? null;
    } catch (error: any) {
      // Ne pas masquer nos propres exceptions
      if (error instanceof NotFoundException) throw error;

      if (error.response?.status === 404) {
        throw new NotFoundException(`Utilisateur ${id_user} introuvable.`);
      }
      if (error.response?.status === 403) {
        throw new ForbiddenException(
          `Le contrôleur ${id_controleur} n'a pas accès aux données de l'utilisateur ${id_user}.`,
        );
      }
      this.logger.error(
        `Gateway error for user ${id_user}: ${error.message}`,
      );
      throw new ServiceUnavailableException(
        `Impossible de vérifier l'utilisateur via la gateway.`,
      );
    }

    // ── 2) Zones affectées au contrôleur ──
    const distributionZones = await this.distributionZoneRepository.find({
      where: { id_user: id_controleur },
      relations: ['zone'],
    });

    const zoneIds = distributionZones.map((dz) => dz.zone.id_zone);

    // Le contrôleur n'a aucune zone → il ne peut rien voir
    if (zoneIds.length === 0) {
      return { userNom, total: 0, locations: [] };
    }

    // ── 3) Locations en cours du contribuable, dans les zones du contrôleur ──
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const locations = await this.locationRepository
      .createQueryBuilder('location')
      .leftJoinAndSelect('location.local', 'local')
      .leftJoinAndSelect('local.zone', 'zone')
      .leftJoinAndSelect('local.typelocal', 'typelocal')
      .leftJoinAndSelect('zone.market', 'market')
      .where('location.id_user = :id_user', { id_user })
      .andWhere('location.date_debut_loc <= :today', { today })
      .andWhere('location.date_fin_loc >= :today', { today })
      .andWhere('local.zoneId IN (:...zoneIds)', { zoneIds })
      .orderBy('location.date_debut_loc', 'DESC')
      .getMany();

    return {
      userNom,
      total: locations.length,
      locations,
    };
  }

  async findOne(id: string, municipalityId?: string | null): Promise<Location> {
    const query = this.locationRepository
      .createQueryBuilder('location')
      .leftJoinAndSelect('location.local', 'local')
      .leftJoinAndSelect('local.typelocal', 'typelocal')
      .leftJoinAndSelect('local.zone', 'zone')
      .leftJoinAndSelect('zone.market', 'market')
      .where('location.id_location = :id', { id });

    if (municipalityId) {
      query.andWhere('market.municipalityId = :municipalityId', {
        municipalityId,
      });
    }

    const location = await query.getOne();

    if (!location) {
      throw new NotFoundException(`Location with ID "${id}" not found.`);
    }

    return location;
  }

  async findLocationWithPaymentDates(
    municipalityId: string,
    id_location: string,
  ): Promise<{
    id_location: string;
    periodicite: Periodicite;
    date_debut_loc: Date;
    date_fin_loc: Date;
    frequence: number;
    tarif: number;
    derniere_date_payer: Date | null;
    local_id: string;
    zone_id: string;
    zone_nom: string;
    market_id: string;
    market_nom: string;
    id_user: string;
    nif: string;
    statut: 'À_VENIR' | 'ACTIF' | 'EXPIRÉ';
  }> {
    const location = await this.locationRepository
      .createQueryBuilder('location')
      .leftJoinAndSelect('location.paiement_locations', 'paiement_locations')
      .leftJoinAndSelect('location.local', 'local')
      .leftJoinAndSelect('local.typelocal', 'typelocal')
      .leftJoinAndSelect('local.zone', 'zone')
      .leftJoinAndSelect('zone.market', 'market')
      .where('location.id_location = :id', { id: id_location })
      .andWhere('market.municipalityId = :municipalityId', { municipalityId })
      .orderBy('paiement_locations.date_fin', 'DESC')
      .getOne();

    if (!location) {
      throw new NotFoundException(
        `Location avec l'ID "${id_location}" non trouvée dans la municipalité "${municipalityId}".`,
      );
    }

    const lastPayment =
      location.paiement_locations && location.paiement_locations.length > 0
        ? location.paiement_locations[0].date_fin
        : null;

    const tarif = location.local?.typelocal?.tarif;
    if (tarif === undefined || tarif === null) {
      this.logger.warn(`Tarif manquant pour la location ${id_location}`);
    }

    // Statut complet : avant / pendant / après
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const debut = new Date(location.date_debut_loc);
    const fin = new Date(location.date_fin_loc);
    debut.setHours(0, 0, 0, 0);
    fin.setHours(23, 59, 59, 999);

    let statut: 'À_VENIR' | 'ACTIF' | 'EXPIRÉ';
    if (today > fin) {
      statut = 'EXPIRÉ';
    } else if (today < debut) {
      statut = 'À_VENIR';
    } else {
      statut = 'ACTIF';
    }

    return {
      id_location: location.id_location,
      periodicite: location.periodicite,
      date_debut_loc: location.date_debut_loc,
      date_fin_loc: location.date_fin_loc,
      frequence: location.frequence,
      tarif: tarif ?? 0,
      derniere_date_payer: lastPayment,
      local_id: location.local?.id_local ?? '',
      zone_id: location.local?.zone?.id_zone ?? '',
      zone_nom: location.local?.zone?.nom ?? '',
      market_id: location.local?.zone?.market?.id_market ?? '',
      market_nom: location.local?.zone?.market?.nom ?? '',
      id_user: location.id_user,
      nif: location.nif,
      statut,
    };
  }

  async getRemainingAmount(id_location: string): Promise<{
    Montant_total: number;
    total_payer: number;
    Reste_a_payer: number;
  }> {
    const location = await this.locationRepository.findOne({
      where: { id_location },
      relations: ['local', 'local.typelocal'],
    });

    if (!location) {
      throw new NotFoundException(
        `Location with ID "${id_location}" not found.`,
      );
    }

    if (!location.local || !location.local.typelocal) {
      throw new NotFoundException(
        `Local or TypeLocal not found for location ID "${id_location}".`,
      );
    }

    // ✅ Cast explicite — decimal Postgres = string
    const tarif = Number(location.local.typelocal.tarif);
    const frequence_restante = Number(location.frequence);

    if (!Number.isFinite(tarif) || tarif < 0) {
      throw new BadRequestException(
        `Tarif invalide pour la location ${id_location} (tarif=${location.local.typelocal.tarif}).`,
      );
    }

    if (!Number.isFinite(frequence_restante) || frequence_restante < 0) {
      throw new BadRequestException(
        `Fréquence invalide pour la location ${id_location} (frequence=${location.frequence}).`,
      );
    }

    const total_payer_raw =
      await this.paiementLocationService.getTotalPaidAmount(id_location);

    const total_payer = Number(total_payer_raw ?? 0);

    if (!Number.isFinite(total_payer) || total_payer < 0) {
      throw new BadRequestException(
        `Montant payé invalide pour la location ${id_location} (total_payer=${total_payer_raw}).`,
      );
    }

    // Reste à payer = mois restants × tarif mensuel
    const Reste_a_payer = Math.max(0, tarif * frequence_restante);

    // Montant total engagé = déjà payé + reste
    const Montant_total = total_payer + Reste_a_payer;

    return {
      Montant_total,
      total_payer,
      Reste_a_payer,
    };
  }

  async getPaymentSchedule(id_location: string): Promise<
    Array<{
      dueDate: string;
      amount: number;
      status: 'PAID' | 'OVERDUE' | 'DUE';
    }>
  > {
    const location = await this.locationRepository.findOne({
      where: { id_location },
      relations: ['local', 'local.typelocal'],
    });

    if (!location) {
      throw new NotFoundException(
        `Location with ID "${id_location}" not found.`,
      );
    }

    if (location.periodicite !== 'MENSUEL') {
      throw new BadRequestException(
        'Payment schedule is only available for monthly locations.',
      );
    }

    if (!location.local?.typelocal) {
      throw new NotFoundException(
        `TypeLocal not found for location ID "${id_location}".`,
      );
    }

    const tarif = Number(location.local.typelocal.tarif);

    const paidPeriods = await this.paiementLocationRepository.find({
      where: { locationId: id_location },
      order: { date_fin: 'ASC' },
    });

    const paidUntilDate =
      paidPeriods.length > 0
        ? new Date(paidPeriods[paidPeriods.length - 1].date_fin)
        : null;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const schedule: Array<{
      dueDate: string;
      amount: number;
      status: 'PAID' | 'OVERDUE' | 'DUE';
    }> = [];

    const debut = new Date(location.date_debut_loc);

    for (let i = 0; i < location.frequence; i++) {
      // ✅ Calcul du mois SANS bug de fin de mois
      const paymentDate = new Date(
        debut.getFullYear(),
        debut.getMonth() + i,
        debut.getDate(),
      );

      const isPaid = paidUntilDate !== null && paidUntilDate >= paymentDate;

      let status: 'PAID' | 'OVERDUE' | 'DUE';
      if (isPaid) {
        status = 'PAID';
      } else if (paymentDate < today) {
        status = 'OVERDUE';
      } else {
        status = 'DUE';
      }

      // ✅ Format date locale (pas UTC)
      const yyyy = paymentDate.getFullYear();
      const mm = String(paymentDate.getMonth() + 1).padStart(2, '0');
      const dd = String(paymentDate.getDate()).padStart(2, '0');

      schedule.push({
        dueDate: `${yyyy}-${mm}-${dd}`,
        amount: tarif,
        status,
      });
    }

    return schedule;
  }

  async update(municipalityId: string, id: string, updateDto: Partial<CreateLocationDto>): Promise<Location> {
    const location = await this.findOne(id, municipalityId);
    Object.assign(location, updateDto);
    return await this.locationRepository.save(location);
  }

  //   async update(
  //   municipalityId: string,
  //   id: string,
  //   updateDto: UpdateLocationDto,
  // ): Promise<Location> {
  //   const location = await this.findOne(id, municipalityId);

  //   // Seuls champs autorisés à changer
  //   if (updateDto.nif !== undefined) location.nif = updateDto.nif;
  //   if (updateDto.usage !== undefined) location.usage = updateDto.usage;

  //   return this.locationRepository.save(location);
  // }

  async remove(id: string): Promise<void> {
    const location = await this.locationRepository.findOne({
      where: { id_location: id },
      relations: ['local'],
    });

    if (!location) {
      throw new NotFoundException(`Location avec l'ID "${id}" introuvable`);
    }

    const local = location.local;

    if (local) {
      // Mettre à jour le statut du local en 'DISPONIBLE' avant la suppression de la location
      local.statut = 'DISPONIBLE';
      await this.localRepository.save(local);

    }

    await this.locationRepository.remove(location);
  }

  async countCurrentLocationsByUser(id_user: string): Promise<number> {
    const today = new Date();
    return await this.locationRepository.count({
      where: {
        id_user,
        date_debut_loc: LessThanOrEqual(today),
        date_fin_loc: MoreThanOrEqual(today),
      },
    });
  }

  async getNifByUserId(userId: string): Promise<string> {
    const location = await this.locationRepository.findOne({
      where: { id_user: userId },
      order: { id_location: 'DESC' },
    });

    if (!location) {
      throw new NotFoundException(`No location found for user ID "${userId}".`);
    }

    return location.nif;
  }

  async getLocationEndDate(id_location: string): Promise<Date> {
    const location = await this.locationRepository.findOne({
      where: { id_location },
      select: ['date_fin_loc'],
    });

    if (!location) {
      throw new NotFoundException(`Location with ID "${id_location}" not found.`);
    }

    return location.date_fin_loc;
  }

  async checkAndSendReminders(location: Location) {
    const today = new Date();
    const todayDateOnly = new Date(today.getFullYear(), today.getMonth(), today.getDate());

    // Récupérer la dernière paiement_location (par date_fin max)
    const lastPaiement = await this.paiementLocationRepository
      .createQueryBuilder('pl')
      .where('pl.locationId = :locId', { locId: location.id_location })
      .orderBy('pl.date_fin', 'DESC')
      .getOne();

    if (!lastPaiement) {
      // Juste log au lieu de throw
      console.warn(`⚠️ Aucun paiement trouvé pour la location ${location.id_location}`);
      // await this.notificationService.scheduleReminderNotification(
      //   location.id_user,
      //   {
      //     montant: 123,
      //     locationId: location.id_location,
      //   },
      //   today.getDate()
      // );
      return; // on arrête ici
    }

    // Calculer la prochaine échéance (date_fin du dernier paiement + 1 mois)
    const nextDueDate = new Date(lastPaiement.date_fin);
    nextDueDate.setMonth(nextDueDate.getMonth() + 1);
    const nextDueDateOnly = new Date(
      nextDueDate.getFullYear(),
      nextDueDate.getMonth(),
      nextDueDate.getDate()
    );

    // Différence en jours entre aujourd'hui et la prochaine échéance
    const diffDays = Math.floor(
      (nextDueDateOnly.getTime() - todayDateOnly.getTime()) / (1000 * 60 * 60 * 24)
    );

    // Préparer les données pour la notification
    const reminderData = {
      montant: lastPaiement.montant_paye,
      id_location: location.id_location,
    };

    // J-5 ou J-2 avant la prochaine échéance
    if (diffDays === 5 || diffDays === 2) {
      await this.notificationService.scheduleReminderNotification(
        location.id_user,
        reminderData,
        nextDueDateOnly.getDate()
      );

    }

    // Après échéance, tous les jours si pas encore payé
    if (diffDays < 0) {
      await this.notificationService.scheduleReminderNotification(
        location.id_user,
        reminderData,
        nextDueDateOnly.getDate()
      );
    }
  }

  async findById(id: string): Promise<Location> {
    const location = await this.locationRepository.findOne({
      where: { id_location: id },
      relations: ['local'], // récupère les infos du local associé
    });

    if (!location) {
      throw new NotFoundException(`Location avec id ${id} introuvable`);
    }

    return location;
  }

  // 🔌 Job CRON qui vérifie tous les jours à 7h
  @Cron(CronExpression.EVERY_DAY_AT_7AM)
  async handleDailyReminders() {
    const allLocations = await this.locationRepository.find();

    for (const loc of allLocations) {
      await this.checkAndSendReminders(loc);
    }
  }

  async generateUserQrCode(
    userId: string
  ): Promise<{ userId: string; qrCode: string }> {
    try {
      // Générer un QRCode au format SVG (ne nécessite pas canvas)
      const qrCodeSvg = await QRCode.toString(userId, {
        type: 'svg',
        color: {
          dark: '#000000',
          light: '#FFFFFF',
        },
      });

      // Convertir le SVG en base64 pour créer une Data URL
      const base64Svg = Buffer.from(qrCodeSvg).toString('base64');
      const qrCodeDataUrl = `data:image/svg+xml;base64,${base64Svg}`;

      return {
        userId,
        qrCode: qrCodeDataUrl, // base64 utilisable dans <img src="...">
      };
    } catch (error: any) {
      throw new NotFoundException(
        `Impossible de générer le QRCode pour l'utilisateur ${userId}: ${error?.message || error
        }`
      );
    }
  }


  async findOccupiedPeriods(municipalityId: string, localId: string): Promise<Location[]> {
    const occupiedPeriods = await this.locationRepository.find({
      where: {
        local: {
          id_local: localId,
          zone: {
            municipalityId: municipalityId,
          },
        },
      },
      select: ['date_debut_loc', 'date_fin_loc'],
      order: { date_debut_loc: 'ASC' },
    });
    return occupiedPeriods;
  }

  async getVerificationUserLocal(
    municipalityId: string,
    id_controleur: string,
    id_user: string,
    id_local: string,
  ): Promise<any> {
    const today = new Date();
    let userNom: string;

    // 🔹 Récupération du local + zone
    const local = await this.localRepository.findOne({
      where: { id_local },
      relations: ['zone', 'typelocal'],
    });

    if (!local) {
      throw new NotFoundException(`Local ${id_local} introuvable`);
    }

    const zoneId = local.zone?.id_zone;
    const zoneName = local.zone?.nom || null;

    // 🔹 Récupérer la location en cours pour ce local + contribuable
    const location = await this.locationRepository.findOne({
      where: {
        id_user: id_user,
        date_debut_loc: LessThanOrEqual(today),
        date_fin_loc: MoreThanOrEqual(today),
        local: {
          id_local: id_local,
          zone: { municipalityId: municipalityId, },
        },
      },
      relations: ['local', 'local.zone', 'local.typelocal'],
    });

    // 🔹 Récupération du pseudo du contribuable via API externe
    try {
      const response = await firstValueFrom(
        this.httpService.get(`${this.gatewayBaseUrl}/serviceauth/users/${id_user}`),
      );
      const userData = response.data;
      userNom = userData?.user_pseudo || 'Inconnu';
    } catch (error: unknown) {
      if (axios.isAxiosError(error)) {
        const status = error.response?.status;
        if (status === 404) {
          throw new NotFoundException(`Utilisateur ${id_user} introuvable.`);
        }
        if (status === 403) {
          throw new ForbiddenException(
            `Accès refusé pour l’utilisateur ${id_user}.`,
          );
        }
        this.logger.error(
          `Gateway error for user ${id_user}: ${error.message}`,
        );
      } else if (error instanceof Error) {
        this.logger.error(`Unexpected error: ${error.message}`);
      }
      throw new ServiceUnavailableException(
        `Erreur lors de la vérification de l'utilisateur ${id_user}.`,
      );
    }

    // 🔹 Vérification si une location est en cours
    if (location) {
      // Récupérer les zones de distribution du contrôleur
      const distributionZones = await this.distributionZoneRepository.find({
        where: { id_user: id_controleur },
        relations: ['zone'],
      });

      // Vérifier si le local est dans une zone du contrôleur
      const inDistributionZone = distributionZones.some(
        (dz) => dz.zone.id_zone === zoneId,
      );

      if (inDistributionZone) {
        const histData = {
          id_location: location.id_location,
          localId: local.id_local,
          numero_local: local.numero,
          type_local: local.typelocal?.typeLoc?.fr || null,
          resultat: 'Location valide dans la zone',
          id_contribuable: id_user,
          nom_contribuable: userNom,
          zoneName,
        };

        await this.notificationService.CreateHistorique(id_controleur, histData, 'MEDIUM');
        await this.localService.updateDateScan(id_local);

        return true;
      } else {
        // const histData = {
        //   id_location: location.id_location,
        //   localId: local.id_local,
        //   numero_local: local.numero,
        //   type_local: local.typelocal?.typeLoc?.fr || null,
        //   resultat: 'Location trouvée mais hors distribution zone',
        //   id_contribuable: id_user,
        //   nom_contribuable: userNom,
        //   zoneName,
        // };

        // await this.notificationService.CreateHistorique(id_controleur, histData, 'HIGH');

        throw new ForbiddenException(
          `Location trouvée pour le local mais pas dans la distributionZone du contrôleur.`,
        );
      }
    }

    // 🔹 Aucun location trouvée → URGENT
    const histData = {
      resultat: 'Place occupée mais aucune location trouvée',
      id_contribuable: id_user,
      nom_contribuable: userNom,
      zoneName,
      localId: id_local,
    };

    await this.notificationService.CreateCritiqueHistorique(id_controleur, histData);

    const data = {
      authorId: id_controleur,
      destinationId: null,
      typeNotification: 'broadcastToAll',
      message: 'location_critique',
      ressource: histData
    };
    this.socketService.sendNotification(data);
    return false;
  }


  async generateContratBail(locationId: string): Promise<Buffer> {
    const location = await this.locationRepository.findOne({
      where: { id_location: locationId },
      relations: ['local', 'local.zone', 'local.zone.market', 'local.typelocal'],
    });
    if (!location) {
      throw new NotFoundException(`Location ${locationId} introuvable`);
    }

    if (!location.local || !location.local.zone) {
      throw new NotFoundException(`Le local ou la zone associée est introuvable pour la location ${locationId}`);
    }

    const municipalityId = location.local.zone.municipalityId;
    let userData;
    let citizenData;
    let commune: any = {
      name: "Inconnue",
      code: "-",
      phone_number: "-"
    };

    try {
      const response = await firstValueFrom(
        this.httpService.get(`${this.gatewayBaseUrl}/serviceauth/users/${location.id_user}`),
      );
      userData = response.data;

      const citizen = await firstValueFrom(
        this.httpService.get(`${this.gatewayBaseUrl}/servicecitoyen/citizens/getCitizenById/${userData.id_citizen}`),
      );

      citizenData = citizen.data

    } catch (error: unknown) {
      if (axios.isAxiosError(error)) {
        const status = error.response?.status;
        if (status === 404) {
          throw new NotFoundException(
            `Utilisateur ${location.id_user} introuvable.`,
          );
        }
        if (status === 403) {
          throw new ForbiddenException(
            `Accès refusé pour l’utilisateur ${location.id_user}.`,
          );
        }
        this.logger.error(
          `Gateway error for user ${location.id_user}: ${error.message}`,
        );
      }
      throw new ServiceUnavailableException(
        `Erreur lors de la récupération des données utilisateur.`,
      );
    }

    // 🔹 Tenter de récupérer la commune, mais ignorer si erreur
    try {
      const url = `${this.gatewayBaseUrl}/serviceterritoire-v2/communes/noForm//${municipalityId}`;
      const response = await lastValueFrom(this.httpService.get(url));
      commune = response.data;
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `⚠️ Impossible d'obtenir les données de la commune : ${msg}`,
      );
      // On continue avec des données par défaut
    }


    const bufferStream = new WritableStreamBuffer();
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    doc.pipe(bufferStream);

    // En-tête
    doc.fontSize(18).font('Helvetica-Bold').text('CONTRAT DE BAIL', { align: 'center', underline: true });
    doc.fontSize(11).font('Helvetica').text('Location de place au Marché Communal', { align: 'center' });
    doc.moveDown(2);

    // Informations du Bailleur
    doc.fontSize(13).font('Helvetica-Bold').text('LE BAILLEUR', { underline: true });
    doc.fontSize(11).font('Helvetica');
    doc.text(`Commune Urbaine de ${commune.name}`);
    doc.text(`Code postal : ${commune.code}`);
    doc.text(`Téléphone : ${commune.phone_number}`);

    doc.moveDown();

    // Informations du Locataire
    doc.fontSize(13).font('Helvetica-Bold').text('LE PRENEUR', { underline: true });
    doc.fontSize(11).font('Helvetica');
    doc.text(`Nom : ${userData.user_pseudo}`);
    doc.text(`NIF : ${location.nif || 'Non renseigné'}`);
    doc.text(`CIN : ${citizenData.citizen_national_card_number || 'Non renseigné'}`);
    doc.text(`Numéro de téléphone : ${userData.user_phone || 'Non renseigné'}`);
    doc.moveDown();

    // Informations sur le local
    doc.fontSize(13).font('Helvetica-Bold').text('OBJET DE LA LOCATION', { underline: true });
    doc.fontSize(11).font('Helvetica');
    doc.text(`Place N° : ${location.local.numero || location.localId}`);
    doc.text(`Zone de Marché : ${location.local.zone.nom || 'Marché Communal'}`);
    doc.text(`Latitude : ${location.local.latitude || 'Marché Communal'}`);
    doc.text(`Longitude : ${location.local.longitude || 'Marché Communal'}`);
    doc.text(`Superficie : ${location.local.typelocal.largeur * location.local.typelocal.longueur || '-'} m²`);
    doc.text(`Type de commerce : ${location.usage || 'Non précisé'}`);
    doc.moveDown();

    // Conditions financières
    doc.fontSize(13).font('Helvetica-Bold').text('CONDITIONS FINANCIÈRES', { underline: true });
    doc.fontSize(11).font('Helvetica');
    doc.text(`Loyer : ${location.local?.typelocal?.tarif ?? 'Non précisé'} Ariary`);
    doc.text(`Périodicité : ${location.periodicite}`);
    doc.text(`Total à payer : ${location.local?.typelocal?.tarif * location.frequence || '-'} Ariary`);
    doc.moveDown();

    // Durée du bail
    doc.fontSize(13).font('Helvetica-Bold').text('DURÉE DU BAIL', { underline: true });
    doc.fontSize(11).font('Helvetica');
    doc.text(
      `Début : ${location.date_debut_loc ? new Date(location.date_debut_loc).toLocaleDateString('fr-FR') : '-'}`
    );
    doc.text(
      `Fin : ${location.date_fin_loc ? new Date(location.date_fin_loc).toLocaleDateString('fr-FR') : '-'}`
    );

    doc.text(
      `Durée: 1 an`
    );
    doc.moveDown(1.5);

    // Articles du contrat
    doc.fontSize(12).font('Helvetica-Bold').text('CLAUSES CONTRACTUELLES');
    doc.moveDown(0.5);

    // Article 1
    doc.fontSize(10).font('Helvetica-Bold').text('Article 1 : Objet du bail');
    doc.fontSize(10).font('Helvetica').text(
      `Le bailleur loue au preneur la place désignée ci-dessus au Marché Communal de ${commune.name}, pour l'exercice d'une activité de ${location.usage || 'commerce'}. Le preneur ne pourra utiliser cette place qu'à cet usage exclusif.`,
      { align: 'justify' }
    );
    doc.moveDown(0.5);

    // // Article 2
    doc.fontSize(10).font('Helvetica-Bold').text('Article 2 : Loyer et modalités de paiement');
    doc.fontSize(10).font('Helvetica').text(
      `Le loyer est fixé à ${location.local?.typelocal?.tarif ?? '...'} Ariary, payable ${location.periodicite.toLowerCase()} d'avance. Le paiement peut être effectué directement via l'application officielle du service de  marché ou au régisseur du service marché ou régisseur principale de la Commune de
      ${commune.name} avant le 5 de chaque période. `,
      { align: 'justify' }
    );
    doc.moveDown(0.5);

    // Article 3
    doc.fontSize(10).font('Helvetica-Bold').text('Article 3 : Obligations du preneur');
    doc.fontSize(10).font('Helvetica').text(
      `Le preneur s'engage à : (1) maintenir la place en bon état de propreté, (2) respecter le règlement intérieur du marché, (3) ne pas sous-louer sans autorisation écrite, (4) payer régulièrement les loyers et charges.`,
      { align: 'justify' }
    );
    doc.moveDown(0.5);

    // Article 4
    doc.fontSize(10).font('Helvetica-Bold').text('Article 4 : Obligations du bailleur');
    doc.fontSize(10).font('Helvetica').text(
      `Le bailleur s'engage à : (1) garantir la jouissance paisible de la place, (2) assurer l'entretien des parties communes, (3) fournir les services de gardiennage et de sécurité, (4) maintenir les installations en bon état de fonctionnement.`,
      { align: 'justify' }
    );
    doc.moveDown(0.5);

    // Article 5
    doc.fontSize(10).font('Helvetica-Bold').text('Article 5 : Résiliation');
    doc.fontSize(10).font('Helvetica').text(
      `Le bail peut être résilié par le preneur avec un préavis de 2 mois. Le bailleur peut résilier en cas de non-paiement de 2 mois de loyer consécutifs, de non-respect du règlement, ou pour motif d'intérêt public avec préavis de 3 mois.`,
      { align: 'justify' }
    );
    doc.moveDown(0.5);

    // Article 6
    doc.fontSize(10).font('Helvetica-Bold').text('Article 6 : Renouvellement');
    doc.fontSize(10).font('Helvetica').text(
      `Le bail pourra être renouvelé par accord mutuel, sous réserve du respect des obligations par le preneur et d'une demande écrite 2 mois avant l'expiration.`,
      { align: 'justify' }
    );
    doc.moveDown(0.5);

    //Article 7
    doc.fontSize(10).font('Helvetica-Bold').text('Article 7 : Litiges');
    doc.fontSize(10).font('Helvetica').text(
      `Tout litige relatif au présent contrat sera soumis aux juridictions compétentes de ${commune.name}. Les parties s'engagent préalablement à rechercher une solution amiable.`,
      { align: 'justify' }
    );
    doc.moveDown(2);

    // Signatures
    // Position de départ pour les signatures (250px depuis le bas)
    const signatureY = doc.page.height - 95;

    // Date et lieu
    doc.fontSize(10)
      .font('Helvetica-Bold')
      .text('Fait à ' + commune.name + ', le ' + new Date().toLocaleDateString('fr-FR'), 380, signatureY - 40); // un peu au-dessus des signatures
    doc.moveDown();

    // Deux colonnes pour les signatures
    doc.fontSize(11).font('Helvetica-Bold');
    doc.text('LE BAILLEUR', 50, signatureY);
    doc.text('LE PRENEUR', 400, signatureY);

    // Sous-texte pour les signatures
    doc.fontSize(9).font('Helvetica');
    doc.text('Signature et cachet', 50, signatureY + 30);
    doc.text('Signature précédée de "Lu et approuvé"', 360, signatureY + 30);



    doc.end();

    return new Promise((resolve) => {
      bufferStream.on('finish', () => {
        resolve(bufferStream.getContents());
      });
    });
  }

  async generateContratBailApp(locationId: string): Promise<Buffer> {
    const location = await this.locationRepository.findOne({
      where: { id_location: locationId },
      relations: ['local', 'local.zone', 'local.typelocal'],
    });

    if (!location) {
      throw new NotFoundException(`Location ${locationId} introuvable`);
    }

    if (!location.local || !location.local.zone) {
      throw new NotFoundException(`Le local ou la zone associée est introuvable pour la location ${locationId}`);
    }

    const municipalityId = location.local.zone.municipalityId;
    let userData;
    let citizenData;
    let fokontany;
    let commune: any = {
      name: "Inconnue",
      code: "-",
      phone_number: "-"
    };

    try {
      const response = await firstValueFrom(
        this.httpService.get(`${this.gatewayBaseUrl}/serviceauth/users/${location.id_user}`),
      );
      userData = response.data;

      const citizen = await firstValueFrom(
        this.httpService.get(`${this.gatewayBaseUrl}/servicecitoyen/citizens/getCitizenById/${userData.id_citizen}`),
      );

      citizenData = citizen.data;

      const foko = await firstValueFrom(
        this.httpService.get(`${this.gatewayBaseUrl}/serviceterritoire-v2/fokotanys/fokontanys/${location.local.zone.market?.formatted_id ?? '-'}`),
      );

      fokontany = foko.data

    } catch (error: any) {
      if (error.response?.status === 404) {
        throw new NotFoundException(`Utilisateur ${location.id_user} introuvable.`);
      }
      if (error.response?.status === 403) {
        throw new ForbiddenException(`Accès refusé pour l’utilisateur ${location.id_user}.`);
      }
      console.error('Erreur HTTP lors de la vérification du rôle:', error.response?.data || error.message);
      throw new BadRequestException(`Erreur lors de la vérification du rôle: ${error.message || error}`);
    }


    // 🔹 Tenter de récupérer la commune, mais ignorer si erreur
    try {
      const url = `${this.gatewayBaseUrl}/serviceterritoire-v2/communes/noForm//${municipalityId}`;
      const response = await lastValueFrom(this.httpService.get(url));
      commune = response.data;
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `⚠️ Impossible d'obtenir les données de la commune : ${msg}`,
      );
      // On continue avec des données par défaut
    }


    const bufferStream = new WritableStreamBuffer();
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    doc.pipe(bufferStream);

    // En-tête
    doc.fontSize(18).font('Helvetica-Bold').text('CONTRAT DE BAIL', { align: 'center', underline: true });
    doc.fontSize(11).font('Helvetica').text('Location de place au Marché Communal', { align: 'center' });
    doc.moveDown(2);

    // Informations du Bailleur
    doc.fontSize(13).font('Helvetica-Bold').text('LE BAILLEUR', { underline: true });
    doc.fontSize(11).font('Helvetica');
    doc.text(`Commune Urbaine de ${commune.name}`);
    doc.text(`Code postal : ${commune.code}`);
    doc.text(`Téléphone : ${commune.phone_number}`);

    doc.moveDown();

    // Informations du Locataire
    doc.fontSize(13).font('Helvetica-Bold').text('LE PRENEUR', { underline: true });
    doc.fontSize(11).font('Helvetica');
    doc.text(`Nom : ${userData.user_pseudo}`);
    doc.text(`NIF : ${location.nif || 'Non renseigné'}`);
    doc.text(`CIN : ${citizenData.citizen_national_card_number || 'Non renseigné'}`);
    doc.text(`Numéro de téléphone : ${userData.user_phone || 'Non renseigné'}`);
    doc.moveDown();

    // Informations sur le local
    doc.fontSize(13).font('Helvetica-Bold').text('OBJET DE LA LOCATION', { underline: true });
    doc.fontSize(11).font('Helvetica');
    doc.text(`Place N° : ${location.local.numero || location.localId}`);
    doc.text(`Fokontany : ${fokontany.name || 'Marché Communal'}`);
    doc.text(`Zone de Marché : ${location.local.zone.nom || 'Marché Communal'}`);
    doc.text(`Superficie : ${location.local.typelocal.largeur * location.local.typelocal.longueur || '-'} m²`);
    doc.text(`Type de commerce : ${location.usage || 'Non précisé'}`);
    doc.moveDown();

    // Conditions financières
    doc.fontSize(13).font('Helvetica-Bold').text('CONDITIONS FINANCIÈRES', { underline: true });
    doc.fontSize(11).font('Helvetica');
    doc.text(`Loyer : ${location.local?.typelocal?.tarif ?? 'Non précisé'} Ariary`);
    doc.text(`Périodicité : ${location.periodicite}`);
    doc.text(`Total à payer : ${location.local?.typelocal?.tarif * location.frequence || '-'} Ariary`);
    doc.moveDown();

    // Durée du bail
    doc.fontSize(13).font('Helvetica-Bold').text('DURÉE DU BAIL', { underline: true });
    doc.fontSize(11).font('Helvetica');
    doc.text(
      `Début : ${location.date_debut_loc ? new Date(location.date_debut_loc).toLocaleDateString('fr-FR') : '-'}`
    );
    doc.text(
      `Fin : ${location.date_fin_loc ? new Date(location.date_fin_loc).toLocaleDateString('fr-FR') : '-'}`
    );

    doc.text(
      `Durée: 1 an`
    );
    doc.moveDown(1.5);

    // Articles du contrat



    doc.end();

    return new Promise((resolve) => {
      bufferStream.on('finish', () => {
        resolve(bufferStream.getContents());
      });
    });
  }



}
