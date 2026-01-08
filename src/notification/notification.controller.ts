import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  Patch,
  BadRequestException,
  ParseIntPipe,
  UsePipes,
  ValidationPipe,
  NotFoundException,
  Delete
} from '@nestjs/common';
import { NotificationService } from './notification.service';
import {
  CreateLocationNotificationDto,
  CreatePaymentNotificationDto,
  CreateReminderNotificationDto,
  MarkAsReadDto,
  GetMunicipalityNotificationsDto,
  CreateHistoriqueDto,

} from './dto/create-notification.dto';
import {
  ApiTags, ApiOperation, ApiBody, ApiQuery, ApiResponse, ApiParam
} from '@nestjs/swagger';

@ApiTags('notifications')
@Controller('notifications')
export class NotificationController {
  constructor(private readonly notificationService: NotificationService,
  ) { }




  // -----------------------
  // Créer une notification de location
  // -----------------------
  @Post('location')
  @ApiOperation({ summary: 'Créer une notification de location' })
  @ApiBody({ type: CreateLocationNotificationDto })
  async createLocationNotification(
    @Body() dto: CreateLocationNotificationDto,
  ) {
    const { userId, type, data } = dto;
    return this.notificationService.createLocationNotification(userId, type, data);
  }

  // -----------------------
  // Créer une notification de paiement
  // -----------------------
  @Post('payment')
  @ApiOperation({ summary: 'Créer une notification de paiement' })
  @ApiBody({ type: CreatePaymentNotificationDto })
  async createPaymentNotification(
    @Body() dto: CreatePaymentNotificationDto,
  ) {
    const { userId, type, data } = dto;
    return this.notificationService.createPaymentNotification(userId, type, data);
  }

  // -----------------------
  // Créer une notification programmée
  // -----------------------
  @Post('reminder')
  @ApiOperation({ summary: 'Programmer une notification de rappel' })
  @ApiBody({ type: CreateReminderNotificationDto })
  async scheduleReminderNotification(
    @Body() dto: CreateReminderNotificationDto,
  ) {
    const { userId, data, dateNormalPaie } = dto;
    return this.notificationService.scheduleReminderNotification(userId, data, dateNormalPaie);
  }

  @Post('critique-historique/:userId')
  @ApiParam({
    name: 'userId',
    required: true,
    description: "Identifiant de l'utilisateur contrôleur",
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        data: {
          type: 'object',
          description: 'Données supplémentaires de l’historique',
          example: {
            resultat: 'Place occupée mais aucune location trouvée',
            id_contribuable: '123456',
            zoneName: null,
            localId: 'loc-789',
          },
        }
      },
      required: ['data', 'priority'],
    },
  })
  async createCritiqueHistorique(
    @Param('userId') userId: string,
    @Body()
    body: {
      data: any;

    },
  ) {
    if (!userId || userId.trim() === '') {
      throw new BadRequestException('Le paramètre userId est obligatoire');
    }

    const { data } = body;
    if (!data) {
      throw new BadRequestException('Le champ data est obligatoire');
    }

    return this.notificationService.CreateCritiqueHistorique(
      userId,
      data,

    );
  }

  // -----------------------
  // Marquer une notification comme lue
  // -----------------------
  @Patch(':id/read')
  @ApiOperation({ summary: 'Marquer une notification comme lue' })
  @ApiBody({ type: MarkAsReadDto })
  async markAsRead(
    @Param('id') id: string,
    @Body() dto: MarkAsReadDto,
  ) {
    return this.notificationService.markAsRead(id, dto.userId);
  }

  // -----------------------
  // Nombre de notifications non lues
  // -----------------------
  @Get('unread/count/:userId')
  @ApiOperation({ summary: 'Obtenir le nombre de notifications non lues' })
  async getUnreadCount(@Param('userId') userId: string) {
    return this.notificationService.getUnreadCount(userId);
  }

  // -----------------------
  // Récupérer les notifications d'un utilisateur avec filtres
  // -----------------------
  // @Get(':userId')
  // @ApiOperation({ summary: 'Lister les notifications d’un utilisateur avec pagination et filtres' })
  // async getUserNotifications(
  //   @Param('userId') userId: string,
  //   @Query() query: GetUserNotificationsDto,
  // ) {
  //   return this.notificationService.getUserNotifications(userId, {
  //     page: query.page ? +query.page : 1,
  //     limit: query.limit ? +query.limit : 20,
  //     isRead: query.isRead,
  //     priority: query.priority,
  //     type: query.type, // <-- ajout du filtre type
  //   });
  // }

  @Get()
  @ApiOperation({ summary: 'Lister les notifications filtrées par municipalité avec pagination' })
  async findAll(
    @Query() query: GetMunicipalityNotificationsDto,
  ) {
    const {
      municipalityId, // 👉 Peut être undefined maintenant
      userId,
      type,
      priority,
      isRead,
      page = 1,
      limit = 20,
      dateFrom,
      dateTo,
    } = query;

    return this.notificationService.findAllSimple({
      municipalityId,
      userId,
      type,
      priority,
      isRead,
      page,
      limit,
      dateFrom,
      dateTo
    });
  }



  @Get(':id')
  @UsePipes(new ValidationPipe({ transform: true }))
  @ApiOperation({ summary: 'Récupérer une notification spécifique par ID avec vérification de municipalité' })
  @ApiParam({ name: 'id', type: String, description: 'ID de la notification' })
  @ApiQuery({ name: 'municipalityId', type: Number, required: true, description: 'ID de la municipalité' })
  @ApiResponse({ status: 200, description: 'Notification trouvée' })
  @ApiResponse({ status: 404, description: 'Notification non trouvée ou non accessible dans cette municipalité' })
  async findOne(
    @Param('id') id: string,
    @Query('municipalityId') municipalityId: string,
  ) {
    try {
      const notification = await this.notificationService.findOneSimple(id, municipalityId);

      if (!notification) {
        throw new NotFoundException(`Notification with ID ${id} not found or not accessible in municipality ${municipalityId}`);
      }

      return {
        success: true,
        data: notification,
        municipalityId
      };
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new BadRequestException(`Error fetching notification: ${error.message}`);
    }
  }


  @Get(':userId/rapport')
  @ApiOperation({ summary: 'Obtenir le rapport des notifications HISTORIQUE CONTROLLEUR par zone' })
  async getRapport(
    @Param('userId') userId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    // Si besoin : filtrer par période
    const filters = {
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
    };

    return this.notificationService.getRapport(userId, filters);
  }

  @Get('historique/:userId/:municipalityId')
  @ApiQuery({
    name: 'page',
    required: false,
    type: Number,
    description: 'Numéro de la page (par défaut 1)',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Nombre d’éléments par page (par défaut 20)',
  })
  @ApiQuery({
    name: 'dateFrom',
    required: false,
    type: String,
    description: 'Date de début (format ISO : YYYY-MM-DD ou YYYY-MM-DDTHH:mm:ss)',
  })
  @ApiQuery({
    name: 'dateTo',
    required: false,
    type: String,
    description: 'Date de fin (format ISO : YYYY-MM-DD ou YYYY-MM-DDTHH:mm:ss)',
  })
  async getHistorique(
    @Param('userId') userId: string,
    @Param('municipalityId') municipalityId: string, // converti en number après
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
  ) {
    if (!userId || userId.trim() === '') {
      throw new BadRequestException('Le paramètre userId est obligatoire.');
    }

    if (!municipalityId) {
      throw new BadRequestException(
        'Le paramètre municipalityId est obligatoire et doit être un nombre valide.',
      );
    }

    const options = {
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 20,
      dateFrom: dateFrom ? new Date(dateFrom) : undefined,
      dateTo: dateTo ? new Date(dateTo) : undefined,
    };

    return this.notificationService.getHistorique(
      municipalityId,
      userId,
      options,
    );
  }



  @Get('open/:id')
  @ApiOperation({ summary: 'Ouvrir une notification et récupérer la cible associée' })
  async openNotif(@Param('id') id: string) {
    return this.notificationService.openNotification(id);
  }

  @ApiQuery({
    name: 'page',
    required: false,
    type: Number,
    description: 'Numéro de la page (par défaut 1)',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Nombre d’éléments par page (par défaut 20)',
  })
  @ApiQuery({
    name: 'dateFrom',
    required: false,
    type: String,
    description: 'Date de début (format ISO : YYYY-MM-DD ou YYYY-MM-DDTHH:mm:ss)',
  })
  @ApiQuery({
    name: 'dateTo',
    required: false,
    type: String,
    description: 'Date de fin (format ISO : YYYY-MM-DD ou YYYY-MM-DDTHH:mm:ss)',
  })
  @Get('infractions/controlleur/:municipalityId/user/:userId')
  async getInfractionsControlleur(
    @Param('userId') userId: string,
    @Param('municipalityId') municipalityId: string, // converti en number après
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
  ) {

    const options = {
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 20,
      dateFrom: dateFrom ? new Date(dateFrom) : undefined,
      dateTo: dateTo ? new Date(dateTo) : undefined,
    };
    return this.notificationService.getInfractionControlleur(municipalityId, userId, options);
  }

   @Delete(':id_notification')
    remove(
  
      @Param('id_notification') id_zone: string,
    ) {
      return this.notificationService.remove(id_zone);
    }
}
