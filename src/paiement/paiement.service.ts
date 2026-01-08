import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { CreatePaiementDto } from './dto/create-paiement.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { Paiement } from './entities/paiement.entity';
import { Repository } from 'typeorm';
import { LocationService } from 'src/location/location.service';
import { Paiementlocation } from 'src/paiement_location/entities/paiement_location.entity';
import { PaiementLocationService } from 'src/paiement_location/paiement_location.service';
import { NotificationService } from 'src/notification/notification.service';
import * as PDFDocument from 'pdfkit';
import * as fs from 'fs';
import { join } from 'path';
import { HttpService } from '@nestjs/axios';
import { lastValueFrom } from 'rxjs';
import { SocketService } from 'src/socket/socket.service';
import { WritableStreamBuffer } from 'stream-buffers';
import { ConfigService } from '@nestjs/config';
@Injectable()
export class PaiementService {
  private gatewayBaseUrl: string;
  constructor(
    @InjectRepository(Paiement)
    private readonly paieRepository: Repository<Paiement>,
    private readonly locationService: LocationService,
    private readonly paiementLocationService: PaiementLocationService,
    private readonly notificationService: NotificationService,
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
    private readonly socketService: SocketService,
  ) {
    this.gatewayBaseUrl = this.configService.get<string>('GATEWAY_BASE_URL')!;
  }

  async create(createPaiementDto: CreatePaiementDto): Promise<any> {
    const queryRunner = this.paieRepository.manager.connection.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const { paiement_locations, ...paiementData } = createPaiementDto;

      if (!paiement_locations || paiement_locations.length === 0) {
        throw new BadRequestException('Au moins une location doit être associée au paiement.');
      }

      const locationId = paiement_locations[0].locationId;
      const location = await this.locationService.findOne(locationId, null);

      if (!location || !location.local) {
        throw new NotFoundException(`Location with ID "${locationId}" not found or has no associated local.`);
      }

      const newPaiement = this.paieRepository.create({
        ...paiementData,
      });

      const savedPaiement = await queryRunner.manager.save(newPaiement);


      if (savedPaiement) {
        const data = {
          authorId: '550e8400-e29b-41d4-a716-446655440003',
          destinationId: null,
          typeNotification: 'broadcastToAll',
          message: 'paiement_created',
          ressource: savedPaiement
        };
        this.socketService.sendNotification(data);
        console.log("envoie");
      }

      const createdPaiementLocations: Paiementlocation[] = [];
      let contratPdf: Buffer | null = null;

      if (savedPaiement.status === 'success') {
        const montant_total_paye = paiement_locations.reduce((total, loc) => total + loc.montant_paye, 0);

        // ✅ CORRECTION : Calcul du montant attendu basé sur le nombre de périodes
        const nombre_total_periodes = paiement_locations.reduce((total, loc) => total + loc.nombre_paye, 0);
        const montant_attendu = location.local.typelocal.tarif * nombre_total_periodes;

        // Validation du montant payé corrigée
        if (montant_total_paye !== montant_attendu) {
          throw new BadRequestException(
            `Le montant total payé (${montant_total_paye} Ar) ne correspond pas au montant attendu (${montant_attendu} Ar) pour ${nombre_total_periodes} période(s) à ${location.local.typelocal.tarif} Ar chacune.`
          );
        }

        // Création des paiements de location
        for (const locDto of paiement_locations) {
          // ✅ Validation individuelle pour chaque paiement de location
          const montant_attendu_individual = location.local.typelocal.tarif * locDto.nombre_paye;
          if (locDto.montant_paye !== montant_attendu_individual) {
            throw new BadRequestException(
              `Le montant payé (${locDto.montant_paye} Ar) ne correspond pas au montant attendu (${montant_attendu_individual} Ar) pour ${locDto.nombre_paye} période(s).`
            );
          }

          const { paiementLocation, qrCode } = await this.paiementLocationService.create(locDto, queryRunner);

          createdPaiementLocations.push(paiementLocation);

          const updatedLocation = await this.locationService.findOne(locationId);

          if (updatedLocation.local.statut === 'DISPONIBLE') {
            await this.locationService.updateLocalStatusToRented(locationId);
            console.log(`🏠 Local ${updatedLocation.local.numero} marqué comme LOUE.`);
            contratPdf = await this.locationService.generateContratBail(locationId);
          } else {
            console.log(`ℹ️ Local déjà loué.`);
          }
        }


        // Création de la notification de succès
        const userId = location.id_user;
        await this.notificationService.createPaymentNotification(
          userId,
          'SUCCESS',
          {
            montant: montant_total_paye,
            reference: savedPaiement.reference,
            id_paiement: savedPaiement.id_paiement,
            id_paiement_locations: createdPaiementLocations.map(
              (pl) => pl.id_paiement_location
            ),
          }
        );

      } else {
        const userId = location.id_user;
        const montant_total_paye = paiement_locations.reduce((total, loc) => total + loc.montant_paye, 0);
        await this.notificationService.createPaymentNotification(
          userId,
          'FAILED',
          {
            montant: montant_total_paye,
            reference: savedPaiement.reference,
          }
        );
      }

      savedPaiement.paiement_locations = createdPaiementLocations;
      await queryRunner.manager.save(savedPaiement);

      await queryRunner.commitTransaction();

      return {
        message: 'Paiement créé avec succès.',
        paiement: savedPaiement,
        contratBail: contratPdf ? contratPdf.toString('base64') : null,
      };

    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw new BadRequestException(`Échec de la transaction de paiement : ${error.message}`);
    } finally {
      await queryRunner.release();
    }
  }

  async findAll(
    municipalityId: string,
    filters: {
      reference?: string;
      status?: 'success' | 'failed';
      zoneId?: string;
      startDate?: string;
      endDate?: string;
    },
    page = 1,
    limit = 10,
  ) {
    if (!municipalityId) {
      throw new BadRequestException('Le municipalityId est obligatoire.');
    }

    const query = this.paieRepository
      .createQueryBuilder('paiement')
      .leftJoinAndSelect('paiement.paiement_locations', 'paiement_location')
      .leftJoinAndSelect('paiement_location.location', 'location')
      .leftJoinAndSelect('location.local', 'local')
      .leftJoinAndSelect('local.zone', 'zone')
      .where('zone.municipalityId = :municipalityId', { municipalityId });

    if (filters.reference) {
      query.andWhere('paiement.reference ILIKE :reference', {
        reference: `%${filters.reference}%`,
      });
    }

    if (filters.status) {
      query.andWhere('paiement.status = :status', { status: filters.status });
    }

    if (filters.zoneId) {
      query.andWhere('zone.id_zone = :zoneId', { zoneId: filters.zoneId });
    }

    if (filters.startDate) {
      query.andWhere('paiement.date_creation >= :startDate', {
        startDate: filters.startDate,
      });
    }

    if (filters.endDate) {
      query.andWhere('paiement.date_creation <= :endDate', {
        endDate: filters.endDate,
      });
    }

    query.skip((page - 1) * limit).take(limit).orderBy('paiement.date_creation', 'DESC');

    const [data, total] = await query.getManyAndCount();

    return {
      message: 'Liste des paiements filtrés',
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
      status: 200,
    };
  }

  async findOne(id_paiement: string, municipalityId: string) {
    if (!municipalityId) {
      throw new BadRequestException('Le municipalityId est obligatoire.');
    }

    const paiement = await this.paieRepository
      .createQueryBuilder('paiement')
      .leftJoinAndSelect('paiement.paiement_locations', 'paiement_location')
      .leftJoinAndSelect('paiement_location.location', 'location')
      .leftJoinAndSelect('location.local', 'local')
      .leftJoinAndSelect('local.zone', 'zone')
      .where('paiement.id_paiement = :id_paiement', { id_paiement })
      .andWhere('zone.municipalityId = :municipalityId', { municipalityId })
      .getOne();

    if (!paiement) {
      throw new NotFoundException(`Paiement with ID "${id_paiement}" not found for municipality ${municipalityId}.`);
    }

    return paiement;
  }

  async findHistoryByUser(id_user: string, municipalityId?: string, page: number = 1, limit: number = 10) {
    if (!id_user) {
      throw new BadRequestException('L\'ID de l\'utilisateur est obligatoire.');
    }

    const query = this.paieRepository
      .createQueryBuilder('paiement')
      .leftJoinAndSelect('paiement.paiement_locations', 'paiement_location')
      .leftJoinAndSelect('paiement_location.location', 'location')
      .leftJoinAndSelect('location.local', 'local')
      .leftJoinAndSelect('local.zone', 'zone')
      .where('location.id_user = :id_user', { id_user });

    if (municipalityId) {
      query.andWhere('zone.municipalityId = :municipalityId', { municipalityId });
    }

    query
      .orderBy('paiement.date_creation', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    const [data, total] = await query.getManyAndCount();

    const message = municipalityId
      ? `Historique des paiements pour l'utilisateur ${id_user} dans la municipalité ${municipalityId}`
      : `Historique des paiements pour l'utilisateur ${id_user}`;

    return {
      message,
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
      status: 200,
    };
  }

  async remove(id: string): Promise<{ message: string }> {
    const paiement = await this.paieRepository.findOne({
      where: { id_paiement: id },
      relations: ['paiement_locations'],
    });

    if (!paiement) {
      throw new NotFoundException(`Paiement avec l'ID "${id}" introuvable`);
    }

    await this.paieRepository.remove(paiement);

    return { message: `Paiement avec l'ID "${id}" supprimé avec succès.` };
  }

  async generateRecuPaiement(referencePaiement: string): Promise<Buffer> {
    const paiement = await this.findByReference(referencePaiement);
    if (!paiement) throw new NotFoundException(`Paiement ${referencePaiement} introuvable`);

    const bufferStream = new WritableStreamBuffer();
    const doc = new PDFDocument();
    doc.pipe(bufferStream);

    doc.fontSize(18).text('🧾 Reçu de Paiement', { align: 'center' });
    doc.moveDown();
    doc.fontSize(12).text(`Référence : ${paiement.reference}`);
    doc.text(`Date : ${new Date(paiement.date_paiement).toLocaleDateString()}`);
    doc.text(`Montant payé : ${paiement.montant_paye} Ar`);
    doc.text(`Client : ${paiement.nom_client}`);
    doc.text(`Mode de paiement : ${paiement.mode_paiement}`);
    doc.moveDown();
    doc.text('Merci pour votre paiement.', { align: 'center' });

    doc.end();

    return new Promise((resolve) => {
      bufferStream.on('finish', () => {
        const pdfBuffer = bufferStream.getContents();
        resolve(pdfBuffer);
      });
    });
  }

  async generateRecuPaiementRegisseur(referencePaiement: string): Promise<Buffer> {
    // 🔹 Récupérer le paiement
    const paiement = await this.findByReference(referencePaiement);
    if (!paiement) {
      throw new NotFoundException(`Paiement ${referencePaiement} introuvable`);
    }

    // 🔹 Récupérer les infos du régisseur depuis le microservice
    let regiInfo: any = null;
    try {
      const url = `https://gateway.tsirylab.com/serviceregis/recus/regisseur-by-reference/${referencePaiement}`;
      const response = await lastValueFrom(this.httpService.get(url));
      regiInfo = response.data;
    } catch (error: any) {
      console.warn(`Impossible de récupérer le régisseur pour ${referencePaiement}: ${error?.response?.data?.message || error.message}`);
      // On continue quand même, le PDF sera généré sans info régisseur
    }

    // 🔹 Création du PDF en mémoire
    const bufferStream = new WritableStreamBuffer();
    const doc = new PDFDocument();
    doc.pipe(bufferStream);

    // Titre
    doc.fontSize(18).text('🧾 Reçu de paiement (avec régisseur)', { align: 'center' });
    doc.moveDown();

    // Infos du paiement
    doc.fontSize(12).text(`Référence : ${paiement.reference}`);
    doc.text(`Date : ${new Date(paiement.date_paiement).toLocaleDateString()}`);
    doc.text(`Montant payé : ${paiement.montant_paye} Ar`);
    doc.text(`Client : ${paiement.nom_client}`);
    doc.text(`Mode de paiement : ${paiement.mode_paiement}`);
    doc.moveDown();

    // Infos du régisseur (si disponibles)
    if (regiInfo) {
      doc.fontSize(14).text('Informations du régisseur :', { underline: true });
      doc.moveDown(0.5);
      doc.fontSize(12).text(`Nom : ${regiInfo.user_pseudo || 'Non disponible'}`);
      doc.text(`Email : ${regiInfo.user_email || 'Non disponible'}`);
      doc.text(`Téléphone : ${regiInfo.user_phone || 'Non disponible'}`);
      doc.text(`Service : ${regiInfo.service_name || 'Non disponible'}`);
      doc.text(`Poste : ${regiInfo.nom_regi || 'Non disponible'}`);
    } else {
      doc.fontSize(12).text('Aucune information régisseur disponible pour cette référence.');
    }

    doc.end();

    return new Promise((resolve) => {
      bufferStream.on('finish', () => {
        const pdfBuffer = bufferStream.getContents();
        resolve(pdfBuffer);
      });
    });
  }



  // Exemple de récupération d’un paiement (à adapter à ton repo réel)
  private async findByReference(reference: string) {
    // ici tu fais un appel à ton repository
    return {
      reference,
      date_paiement: new Date(),
      montant_paye: 125000,
      nom_client: 'Rakoto Jean',
      mode_paiement: 'Espèces',
    };
  }
}