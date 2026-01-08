import { Injectable, NotFoundException, ForbiddenException, BadRequestException, ServiceUnavailableException, InternalServerErrorException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Notification } from './entities/notification.entity';
import { Location } from 'src/location/entities/location.entity';
import { Paiementlocation } from 'src/paiement_location/entities/paiement_location.entity';
import { Local } from 'src/local/entities/local.entity';
import axios from 'axios';
import { Brackets } from 'typeorm';
import { Between } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { LocalService } from 'src/local/local.service';
import { forwardRef, Inject } from '@nestjs/common';
import { SocketService } from 'src/socket/socket.service';
@Injectable()
export class NotificationService {
  private gatewayBaseUrl: string;
  constructor(
    @InjectRepository(Notification)
    private readonly notifRepository: Repository<Notification>,

    @InjectRepository(Location)
    private readonly locationRepository: Repository<Location>,

    @InjectRepository(Location)
    private readonly paiementLocationRepository: Repository<Paiementlocation>,

    @InjectRepository(Local)
    private readonly localRepository: Repository<Local>,

    @Inject(forwardRef(() => LocalService)) // ✅ utilise forwardRef pour briser le cercle
    private localService: LocalService,
    private readonly configService: ConfigService,
    private readonly socketService: SocketService,

  ) {
    this.gatewayBaseUrl = this.configService.get<string>('GATEWAY_BASE_URL')!;

  }


  async createLocationNotification(
    userId: string,
    type: 'CONFIRMED' | 'CANCELLED' | 'PENDING',
    locationData: any,
  ) {
    if (!locationData.id_location && !locationData.localId) {
      throw new BadRequestException(
        'Vous devez fournir soit id_location soit localId',
      );
    }

    let local;

    // Si l'id de location est fourni
    if (locationData.id_location) {
      const location = await this.locationRepository.findOne({
        where: { id_location: locationData.id_location },
      });

      if (!location) {
        throw new NotFoundException(
          `Aucune location trouvée avec l'id ${locationData.id_location}`,
        );
      }

      // Vérifier que l'utilisateur est propriétaire
      if (location.id_user !== userId) {
        throw new ForbiddenException(
          `L'utilisateur ${userId} n'a pas accès à cette location`,
        );
      }

      // Récupérer le local associé à la location
      local = await this.localRepository.findOne({
        where: { id_local: location.localId },
      });

      if (!local) {
        throw new NotFoundException(`Aucun local trouvé pour cette location`);
      }
    }

    // Si seulement localId est fourni
    if (!local && locationData.localId) {
      local = await this.localRepository.findOne({
        where: { id_local: locationData.localId },
      });

      if (!local) {
        throw new NotFoundException(
          `Aucun local trouvé avec l'id ${locationData.localId}`,
        );
      }
    }

    // Préparer les templates
    const templates = {
      CONFIRMED: {
        title: 'Location confirmée',
        message: `Votre location pour le local ${local.numero} est confirmée.`,
        priority: 'MEDIUM',
        channels: { inApp: true, email: true, sms: false, push: true },
      },
      CANCELLED: {
        title: 'Location annulée',
        message: `Impossible de louer le local ${local.numero}.`,
        priority: 'HIGH',
        channels: { inApp: true, email: false, sms: false, push: true },
      },
      PENDING: {
        title: 'Location en attente',
        message: `La location du local ${local.numero} est en attente.`,
        priority: 'MEDIUM',
        channels: { inApp: true, email: false, sms: false, push: true },
      },
    };

    const notification = this.notifRepository.create({
      userId,
      type:
        type === 'CONFIRMED'
          ? 'LOCATION CONFIRMEE'
          : type === 'CANCELLED'
            ? 'LOCATION ANNULEE'
            : 'LOCATION EN ATTENTE',
      ...templates[type],
      data: locationData,
    });

    const savedNotification = await this.notifRepository.save(notification);

    return savedNotification;
  }



  async createPaymentNotification(
    userId: string,
    type: 'SUCCESS' | 'FAILED' | 'PENDING',
    paymentData: any,
  ) {
    const templates = {
      SUCCESS: {
        title: 'Paiement réussi',
        message: `Votre paiement de ${paymentData.montant} Ar a été traité avec succès.`,
        priority: 'HIGH',
      },
      FAILED: {
        title: 'Échec du paiement',
        message: `Le paiement de ${paymentData.montant} Ar a échoué. Veuillez réessayer.`,
        priority: 'URGENT',
      },
    };

    const notification = this.notifRepository.create({
      userId,
      type: type === 'SUCCESS' ? 'PAIEMENT REUSSIE' : 'PAIEMENT NON REUSSIE',
      ...templates[type],
      data: paymentData,
      channels: { inApp: true, email: true, sms: true, push: true },
    });

    return await this.notifRepository.save(notification);
  }

  async scheduleReminderNotification(
    userId: string,
    reminderData: any,
    dateNormalPaie: number
  ) {
    const notification = this.notifRepository.create({
      userId,
      type: 'RAPPELLE DE PAIEMENT',
      title: 'Rappel de paiement',
      message: `N'oubliez pas votre paiement de votre location d' une montant de ${reminderData.montant} d'ici le ${dateNormalPaie} du mois.`,
      data: reminderData,
      priority: 'MEDIUM',
    });

    return await this.notifRepository.save(notification);
  }

  async markAsRead(notificationId: string, userId: string) {
    const notification = await this.notifRepository.findOne({
      where: { id_notification: notificationId, userId },
    });

    if (!notification) {
      throw new NotFoundException('Notification introuvable');
    }

    notification.isRead = true;
    notification.readAt = new Date();

    return await this.notifRepository.save(notification);
  }

  async getUnreadCount(userId: string): Promise<number> {
    return this.notifRepository.count({
      where: { userId, isRead: false },
    });
  }

  async getUserNotifications(
    userId: string,
    options: {
      page?: number;
      limit?: number;
      isRead?: boolean;
      priority?: string;
      type?: string; // <-- ajout du filtre type
    },
  ) {
    const { page = 1, limit = 20, isRead, priority, type } = options;

    const query = this.notifRepository
      .createQueryBuilder('notification')
      .where('notification.userId = :userId', { userId });

    if (isRead !== undefined) {
      query.andWhere('notification.isRead = :isRead', { isRead });
    }

    if (priority) {
      query.andWhere('notification.priority = :priority', { priority });
    }

    if (type) {
      query.andWhere('notification.type = :type', { type });
    }

    query
      .orderBy('notification.priority', 'DESC')
      .addOrderBy('notification.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    const [result, total] = await query.getManyAndCount();

    return {
      data: result,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }


  async findAllSimple(

    options: {
      municipalityId?: string,
      page?: number;
      limit?: number;
      isRead?: boolean;
      priority?: string;
      type?: string;
      userId?: string;
      dateFrom?: Date | string;
      dateTo?: Date | string;
    }
  ) {
    const { municipalityId, page = 1, limit = 20, isRead, priority, type, userId, dateFrom, dateTo } = options;


    let query = this.notifRepository
      .createQueryBuilder('notification')
      .where('1 = 1'); // Condition toujours vraie pour faciliter l'ajout de conditions


    if (municipalityId) {
      query.andWhere(
        new Brackets((qb) => {
          qb.where(
            `EXISTS (
          SELECT 1 FROM location loc
          INNER JOIN local l ON l.id_local = loc."localId"
          INNER JOIN zone z ON z.id_zone = l."zoneId"
          WHERE (
            (notification.data->>'id_location' IS NOT NULL AND notification.data->>'id_location' = loc.id_location::text)
            OR (notification.data->>'localId' IS NOT NULL AND notification.data->>'localId' = l.id_local::text)
          )
          AND z."municipalityId" = :municipalityId
        )`,
            { municipalityId }
          ).orWhere(
            `EXISTS (
          SELECT 1 FROM paiement_location pl
          INNER JOIN location loc ON loc.id_location = pl."locationId"
          INNER JOIN local l ON l.id_local = loc."localId"
          INNER JOIN zone z ON z.id_zone = l."zoneId"
          WHERE (
            (notification.data->>'id_paiement' IS NOT NULL AND notification.data->>'id_paiement' = pl."paiementId"::text)
            OR (notification.data->>'id_paiement_location' IS NOT NULL AND notification.data->>'id_paiement_location' = pl.id_paiement_location::text)
          )
          AND z."municipalityId" = :municipalityId
        )`,
            { municipalityId }
          );
        })
      );
      console.log("Filtre municipalityId appliqué:", municipalityId);
    } else {
      console.log("Aucun filtre municipalityId appliqué - retourne toutes les municipalités");
    }

    // Maintenant ajouter tous les filtres avec AND
    if (userId) {
      query.andWhere('notification.userId = :userId', { userId });
      console.log("Filtre userId appliqué:", userId);
    }

    if (isRead !== undefined) {
      query.andWhere('notification.isRead = :isRead', { isRead });
      console.log("Filtre isRead appliqué:", isRead);
    }

    if (priority) {
      query.andWhere('notification.priority = :priority', { priority });
      console.log("Filtre priority appliqué:", priority);
    }

    if (type) {
      query.andWhere('notification.type = :type', { type });
      console.log("Filtre type appliqué:", type);
    }

    if (dateFrom) {
      query.andWhere('notification.createdAt >= :dateFrom', {
        dateFrom: typeof dateFrom === 'string' ? new Date(dateFrom) : dateFrom
      });
      console.log("Filtre dateFrom appliqué:", dateFrom);
    }

    if (dateTo) {
      query.andWhere('notification.createdAt <= :dateTo', {
        dateTo: typeof dateTo === 'string' ? new Date(dateTo) : dateTo
      });
      console.log("Filtre dateTo appliqué:", dateTo);
    }

    // Debug: voir la query générée
    console.log("Query SQL générée:", query.getSql());
    console.log("Paramètres:", query.getParameters());

    query
      .orderBy('notification.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    const [result, total] = await query.getManyAndCount();

    return {
      data: result,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOneSimple(id: string, municipalityId: string) {
    console.log('Recherche notification:', { id, municipalityId });

    // D'abord, vérifions si la notification existe
    const notificationExists = await this.notifRepository.findOne({
      where: { id_notification: id }
    });

    console.log('Notification existe:', !!notificationExists);
    if (notificationExists) {
      console.log('Data de la notification:', notificationExists.data);
    }

    // Testons chaque condition séparément
    const locationCondition = await this.notifRepository
      .createQueryBuilder('notification')
      .where('notification.id_notification = :id', { id })
      .andWhere(
        `EXISTS (
        SELECT 1 FROM location loc
        INNER JOIN local l ON l.id_local = loc."localId"
        INNER JOIN zone z ON z.id_zone = l."zoneId"
        WHERE (
          (notification.data->>'id_location' IS NOT NULL AND notification.data->>'id_location' = loc.id_location::text)
          OR (notification.data->>'localId' IS NOT NULL AND notification.data->>'localId' = l.id_local::text)
        )
        AND z."municipalityId" = :municipalityId
      )`,
        { municipalityId }
      )
      .getOne();

    console.log('Résultat condition location:', !!locationCondition);

    const paiementCondition = await this.notifRepository
      .createQueryBuilder('notification')
      .where('notification.id_notification = :id', { id })
      .andWhere(
        `EXISTS (
        SELECT 1 FROM paiement_location pl
        INNER JOIN location loc ON loc.id_location = pl."locationId"
        INNER JOIN local l ON l.id_local = loc."localId"
        INNER JOIN zone z ON z.id_zone = l."zoneId"
        WHERE (
          (notification.data->>'id_paiement' IS NOT NULL AND notification.data->>'id_paiement' = pl."paiementId"::text)
          OR (notification.data->>'id_paiement_location' IS NOT NULL AND notification.data->>'id_paiement_location' = pl.id_paiement_location::text)
        )
        AND z."municipalityId" = :municipalityId
      )`,
        { municipalityId }
      )
      .getOne();

    console.log('Résultat condition paiement:', !!paiementCondition);

    // Requête finale CORRIGÉE (sans les commentaires)
    return this.notifRepository
      .createQueryBuilder('notification')
      .where('notification.id_notification = :id', { id })
      .andWhere(
        `(EXISTS (
        SELECT 1 FROM location loc
        INNER JOIN local l ON l.id_local = loc."localId"
        INNER JOIN zone z ON z.id_zone = l."zoneId"
        WHERE (
          (notification.data->>'id_location' IS NOT NULL AND notification.data->>'id_location' = loc.id_location::text)
          OR (notification.data->>'localId' IS NOT NULL AND notification.data->>'localId' = l.id_local::text)
        )
        AND z."municipalityId" = :municipalityId
      )
      OR EXISTS (
        SELECT 1 FROM paiement_location pl
        INNER JOIN location loc ON loc.id_location = pl."locationId"
        INNER JOIN local l ON l.id_local = loc."localId"
        INNER JOIN zone z ON z.id_zone = l."zoneId"
        WHERE (
          (notification.data->>'id_paiement' IS NOT NULL AND notification.data->>'id_paiement' = pl."paiementId"::text)
          OR (notification.data->>'id_paiement_location' IS NOT NULL AND notification.data->>'id_paiement_location' = pl.id_paiement_location::text)
        )
        AND z."municipalityId" = :municipalityId
      ))`,
        { municipalityId }
      )
      .getOne();
  }

  async CreateHistorique(
    userId: string,
    data: any,
    priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT'
  ) {
    try {
      // Vérifier que l'utilisateur existe dans le service externe
      const response = await axios.get(
        `https://gateway.tsirylab.com/serviceauth/users/${userId}`
      );

      const userData = response.data;

      if (!userData || !userData.user_id) {
        throw new NotFoundException(
          `Utilisateur avec ID ${userId} introuvable`
        );
      }

      // Créer l'historique (ici enregistré dans la table notif)
      const historique = this.notifRepository.create({
        userId,
        type: 'HISTORIQUE CONTROLLEUR',
        data: data,
        priority,
      });

      await this.notifRepository.save(historique);

      return {
        message: 'Historique enregistré avec succès',
        historique,
      };
    } catch (error) {
      console.error('Erreur CreateHistorique:', error?.message || error);

      throw new BadRequestException(
        'Impossible de créer l’historique pour cet utilisateur'
      );
    }
  }

  async CreateCritiqueHistorique(
    userId: string,
    data: any,

  ) {
    try {
      // ✅ Vérifier que l'utilisateur existe dans le service externe
      const response = await axios.get(
        `https://gateway.tsirylab.com/serviceauth/users/${userId}`
      );

      const userData = response.data;

      if (!userData || !userData.user_id) {
        throw new NotFoundException(`Utilisateur avec ID ${userId} introuvable`);
      }

      // ✅ Récupérer le local concerné
      const local = await this.localRepository.findOne({
        where: { id_local: data.localId }, // data.localId doit être fourni
        relations: ['typelocal'], // pour accéder au type et au contribuable
      });

      if (!local) {
        throw new NotFoundException(`Local avec ID ${data.localId} introuvable`);
      }

      // ✅ Construire le data enrichi
      const enrichedData = {
        ...data,
        nom_contribuable: userData.user_pseudo || 'Inconnu',
        numero_local: local.numero || 'N/A',
        type_local: local.typelocal?.typeLoc?.fr || 'Non défini',
      };

      // ✅ Créer et sauvegarder la notification
      const historique = this.notifRepository.create({
        userId,
        type: 'HISTORIQUE CONTROLLEUR',
        data: enrichedData,
        priority: 'URGENT',
      });



      await this.notifRepository.save(historique);
      this.localService.updateDateScan(data.local_id);
      return {
        message: 'Historique enregistré avec succès',
        historique,
      };
    } catch (error) {
      console.error('Erreur CreateHistorique:', error?.message || error);

      throw new BadRequestException(
        'Impossible de créer l’historique pour cet utilisateur'
      );
    }
  }

  async findUserIdByLocalId(id_local: string): Promise<string | null> {
    const notification = await this.notifRepository
      .createQueryBuilder('notif')
      .select('notif.userId')
      .where('notif.type = :type', { type: 'HISTORIQUE CONTROLLEUR' })
      .andWhere("notif.data->>'localId' = :localId", { localId: id_local })
      .getOne();

    console.log("cont trouve:", notification);

    if (!notification) return null;

    return notification.userId;
  }

  async getRapport(
    userId: string,
    filters?: { from?: Date; to?: Date }
  ) {
    const where: any = {
      userId,
      type: 'HISTORIQUE CONTROLLEUR',
    };

    if (filters?.from && filters?.to) {
      where.createdAt = Between(filters.from, filters.to);
    }

    const notifications = await this.notifRepository.find({
      where,
      order: { createdAt: 'DESC' },
    });

    const rapport: Record<
      string,
      { counts: Record<string, number>; notifications: any[] }
    > = {};

    notifications.forEach((notif) => {
      const zone = notif.data.zoneName || 'Zone inconnue';
      const resultat = notif.data.resultat || 'Résultat inconnu';

      if (!rapport[zone]) {
        rapport[zone] = { counts: {}, notifications: [] };
      }

      rapport[zone].counts[resultat] =
        (rapport[zone].counts[resultat] || 0) + 1;

      rapport[zone].notifications.push(notif);
    });

    return rapport;
  }

  async getHistorique(
    municipalityId: string,
    userId: string,
    options: {
      page?: number;
      limit?: number;
      dateFrom?: Date | string;
      dateTo?: Date | string;
    },
  ) {
    const { page = 1, limit = 20, dateFrom, dateTo } = options;

    try {
      let query = this.notifRepository
        .createQueryBuilder('notification')
        .where('notification.userId = :userId', { userId })
        .andWhere('notification.type = :type', { type: 'HISTORIQUE CONTROLLEUR' })
        .andWhere(
          `EXISTS (
          SELECT 1 
          FROM location loc
          INNER JOIN local l ON l.id_local = loc."localId"
          INNER JOIN zone z ON z.id_zone = l."zoneId"
          WHERE (
            (notification.data->>'id_location' IS NOT NULL AND notification.data->>'id_location' = loc.id_location::text)
            OR (notification.data->>'localId' IS NOT NULL AND notification.data->>'localId' = l.id_local::text)
          )
          AND z."municipalityId" = :municipalityId
        )`,
          { municipalityId },
        );

      // ✅ Filtrage par date avec validation
      if (dateFrom && !isNaN(new Date(dateFrom).getTime())) {
        query.andWhere('notification.createdAt >= :dateFrom', {
          dateFrom: new Date(dateFrom),
        });
      }

      if (dateTo && !isNaN(new Date(dateTo).getTime())) {
        query.andWhere('notification.createdAt <= :dateTo', {
          dateTo: new Date(dateTo),
        });
      }

      // Debug (désactivable en prod)
      if (process.env.NODE_ENV !== 'production') {
        console.log('Query SQL générée:', query.getSql());
        console.log('Paramètres:', query.getParameters());
      }

      query
        .orderBy('notification.createdAt', 'DESC')
        .skip((page - 1) * limit)
        .take(limit);

      const [result, total] = await query.getManyAndCount();

      return {
        data: result,
        pagination: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
        },
      };
    } catch (error) {
      console.error('❌ Erreur dans getHistorique:', error.message);
      console.error(error.stack);

      // Envoie une erreur contrôlée à NestJS
      throw new InternalServerErrorException(
        'Erreur lors de la récupération de l’historique. Détails: ' + error.message,
      );
    }
  }


  async openNotification(id_notification: string) {
    const notif = await this.notifRepository.findOne({ where: { id_notification } });
    if (!notif) {
      throw new NotFoundException("Notification not found");
    }

    // Exemple de mapping
    let target = {};
    switch (notif.type) {
      case "PAIEMENT REUSSIE":
        target = {

          page: "paiementsReussi",
          resourceId: notif.data.id_paiement,

        };
        break;

      case "PAIEMENT NON REUSSIE":
        target = {

          page: "paiementNonReussi",
          resourceId: notif.userId,

        };
        break;

      case "LOCATION CONFIRMEE":
        target = {

          page: "locationsConfirmed",
          resourceId: notif.data.id_location,
        };
        break;

      case "LOCATION ANNULEE":
        target = {

          page: "locationsAnnulee",
          resourceId: notif.data.id_location,
        };
        break;

      case "LOCATION EN ATTENTE":
        target = {

          page: "locationsEnAttente",
          resourceId: notif.data.localId,
        };
        break;

      case "RAPPELLE DE PAIEMENT":
        target = {

          page: "locations",
          resourceId: notif.data.id_location,
        };
        break;

      case "HISTORIQUE CONTROLLEUR":
        target = {

          page: "local",
          resourceId: notif.data.localId,
        };
        break;

      default:
        target = { page: "home", url: "/" };
    }

    // Marquer comme lue
    notif.isRead = true;
    notif.readAt = new Date();
    await this.notifRepository.save(notif);

    return {
      notificationId: id_notification,
      type: notif.type,
      ...target
    };
  }

  async getInfractionControlleur(
    municipalityId: string,
    userId: string,
    options: {
      page?: number;
      limit?: number;
      dateFrom?: Date | string;
      dateTo?: Date | string;
    },
  ) {
    const { page = 1, limit = 20, dateFrom, dateTo } = options;
    let userNom;

    let query = this.notifRepository
      .createQueryBuilder('notification')
      .where('notification.userId = :userId', { userId })
      .andWhere('notification.type = :type', { type: 'HISTORIQUE CONTROLLEUR' })
      .andWhere('notification.priority IN (:...priorities)', { priorities: ['URGENT'] })



    if (dateFrom) {
      query.andWhere('notification.createdAt >= :dateFrom', {
        dateFrom: typeof dateFrom === 'string' ? new Date(dateFrom) : dateFrom,
      });
    }

    if (dateTo) {
      query.andWhere('notification.createdAt <= :dateTo', {
        dateTo: typeof dateTo === 'string' ? new Date(dateTo) : dateTo,
      });
    }


    query
      .orderBy('notification.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    const [result, total] = await query.getManyAndCount();

    return {
      data: result,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async remove(id_notification: string) {
    // Vérifier si la zone existe
    const zone = await this.notifRepository.findOne({ where: { id_notification } });
    if (!zone) {
      throw new NotFoundException(`Notification avec id ${id_notification} introuvable`);
    }

    // Supprimer
    await this.notifRepository.delete(id_notification);

    return {
      message: `Notification ${id_notification} supprimée avec succès`,
      success: true,
    };
  }
}
