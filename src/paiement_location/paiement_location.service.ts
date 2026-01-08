import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, QueryRunner } from 'typeorm';
import { Paiementlocation } from './entities/paiement_location.entity';
import { CreatePaiementLocationDto } from './dto/create-paiement_location.dto';
import { Location, Periodicite } from 'src/location/entities/location.entity';
import * as QRCode from 'qrcode';
import { SocketService } from 'src/socket/socket.service';

@Injectable()
export class PaiementLocationService {
  constructor(
    @InjectRepository(Paiementlocation)
    private readonly paiementLocationRepository: Repository<Paiementlocation>,
    @InjectRepository(Location)
    private readonly locationRepository: Repository<Location>,
    private readonly socketService: SocketService,

  ) { }

  async create(
    createPaiementLocationDto: CreatePaiementLocationDto,
    queryRunner?: QueryRunner,
  ): Promise<{ paiementLocation: Paiementlocation; qrCode: string }> { // <= MODIFICATION ici : le type de retour est mis à jour
    const { locationId, nombre_paye, montant_paye, ...dtoRest } = createPaiementLocationDto;

    const manager = queryRunner ? queryRunner.manager : this.locationRepository.manager;

    const location = await manager.findOne(Location, {
      where: { id_location: locationId },
      relations: ['local', 'local.typelocal'],
    });

    if (!location) {
      throw new NotFoundException(`Location with ID "${locationId}" not found.`);
    }

    // Vérification du premier paiement
    const lastPaiement = await manager.findOne(Paiementlocation, {
      where: { locationId },
      order: { date_fin: 'DESC' },
    });

    if (!lastPaiement && nombre_paye < 1) {
      throw new BadRequestException("Le premier paiement doit couvrir au moins une période.");
    }

    // Vérification du montant payé par rapport au tarif du local
    if (!location.local || !location.local.typelocal || !location.local.typelocal.type_contrat) {
      throw new NotFoundException("Impossible de trouver le tarif pour ce local.");
    }

    const tarif = location.local.typelocal.tarif;
    const expectedAmount = tarif * nombre_paye;

    if (montant_paye !== expectedAmount) {
      throw new BadRequestException(
        `Le montant payé (${montant_paye}) doit correspondre exactement au tarif total (${expectedAmount}) pour ${nombre_paye} périodes.`
      );
    }

    // Calcul des dates
    const now = new Date();
    let newDateDebut: Date = lastPaiement ? new Date(lastPaiement.date_fin) : new Date(location.date_debut_loc);
    let newDateFin: Date = new Date(newDateDebut);

    if (location.periodicite === Periodicite.MENSUEL) {
      newDateFin.setMonth(newDateFin.getMonth() + nombre_paye);
    } else if (location.periodicite === Periodicite.JOURNALIER) {
      newDateFin.setDate(newDateFin.getDate() + nombre_paye);
    } else {
      throw new BadRequestException(`Invalid periodicity for location ID "${locationId}".`);
    }

    if (location.frequence !== null && nombre_paye > location.frequence) {
      throw new BadRequestException(`Cannot pay for more than the remaining frequency (${location.frequence}).`);
    }

    if (location.frequence !== null) {
      location.frequence -= nombre_paye;
    }
    await manager.save(location);

    const newPaiementLocation = manager.create(Paiementlocation, {
      ...dtoRest,
      locationId,
      nombre_paye,
      date_debut: newDateDebut,
      date_fin: newDateFin,
      date_paiement: new Date(),
      montant_paye,
    });

    const savedPaiementLocation = await manager.save(newPaiementLocation);



    // <= NOUVEAU CODE ici pour générer le QR code après la sauvegarde
    const qrData = {
      id_paiement_location: savedPaiementLocation.id_paiement_location,
      montant_paye: savedPaiementLocation.montant_paye,
      date_paiement: savedPaiementLocation.date_paiement,
    };

    const qrCode = await QRCode.toDataURL(JSON.stringify(qrData));

    const data = {
      authorId: '550e8400-e29b-41d4-a716-446655440003',
      destinationId: savedPaiementLocation.id_paiement_location,
      typeNotification: 'sendToUser',
      message: 'votre_paiement_location_reussi',
      ressource: savedPaiementLocation
    };

    const data1 = {
      authorId: '550e8400-e29b-41d4-a716-446655440003',
      destinationId: null,
      typeNotification: 'broadcastToAll',
      message: 'paiement_location_created',
      ressource: savedPaiementLocation
    };
    this.socketService.sendNotification(data);
    this.socketService.sendNotification(data1);

    return { paiementLocation: savedPaiementLocation, qrCode };
  }

  async findAll(
    municipalityId: string,
    filters?: {
      locationId?: string;
      paiementId?: string;
      startDate?: string;
      endDate?: string;
    },
  ): Promise<Paiementlocation[]> {
    if (!municipalityId) {
      throw new BadRequestException('Le municipalityId est obligatoire.');
    }

    const query = this.paiementLocationRepository
      .createQueryBuilder('paiement_location')
      .leftJoinAndSelect('paiement_location.paiement', 'paiement')
      .leftJoinAndSelect('paiement_location.location', 'location')
      .leftJoinAndSelect('location.local', 'local')
      .leftJoinAndSelect('local.zone', 'zone')
      .where('zone.municipalityId = :municipalityId', { municipalityId }); // filtre obligatoire

    if (filters?.locationId) {
      query.andWhere('paiement_location.locationId = :locationId', {
        locationId: filters.locationId,
      });
    }

    if (filters?.paiementId) {
      query.andWhere('paiement_location.paiementId = :paiementId', {
        paiementId: filters.paiementId,
      });
    }

    if (filters?.startDate) {
      query.andWhere('paiement_location.date_paiement >= :startDate', {
        startDate: filters.startDate,
      });
    }

    if (filters?.endDate) {
      query.andWhere('paiement_location.date_paiement <= :endDate', {
        endDate: filters.endDate,
      });
    }

    query.orderBy('paiement_location.date_paiement', 'DESC');

    return query.getMany();
  }

  async findOne(id: string, municipalityId: string): Promise<Paiementlocation> {
    const found = await this.paiementLocationRepository
      .createQueryBuilder('paiement_location')
      .leftJoinAndSelect('paiement_location.paiement', 'paiement')
      .leftJoinAndSelect('paiement_location.location', 'location')
      .leftJoinAndSelect('location.local', 'local')
      .leftJoinAndSelect('local.zone', 'zone')
      .where('paiement_location.id_paiement_location = :id', { id })
      .andWhere('zone.municipalityId = :municipalityId', { municipalityId })
      .getOne();

    if (!found) {
      throw new NotFoundException(`Paiementlocation with ID "${id}" not found in municipality "${municipalityId}".`);
    }

    return found;
  }


  async findOneWithQr(
    id: string,
    municipalityId: string,
  ): Promise<{ paiementLocation: Paiementlocation; qrCode: string }> {
    const found = await this.paiementLocationRepository
      .createQueryBuilder('paiement_location')
      .leftJoinAndSelect('paiement_location.paiement', 'paiement')
      .leftJoinAndSelect('paiement_location.location', 'location')
      .leftJoinAndSelect('location.local', 'local')
      .leftJoinAndSelect('local.zone', 'zone')
      .where('paiement_location.id_paiement_location = :id', { id })
      .andWhere('zone.municipalityId = :municipalityId', { municipalityId })
      .getOne();

    if (!found) {
      throw new NotFoundException(`Paiementlocation with ID "${id}" not found in municipality "${municipalityId}".`);
    }

    const qrData = {
      reference: found.id_paiement_location
    };

    const qrCode = await QRCode.toDataURL(JSON.stringify(qrData));

    return { paiementLocation: found, qrCode };
  }

  async getTotalPaidAmount(locationId: string): Promise<number> {
    const result = await this.paiementLocationRepository
      .createQueryBuilder('paiement_location')
      .select('SUM(paiement_location.montant_paye)', 'total')
      .where('paiement_location.locationId = :locationId', { locationId })
      .getRawOne();

    return parseFloat(result.total) || 0;
  }
}