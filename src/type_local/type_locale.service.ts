import { BadRequestException, Injectable,Logger,ConflictException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Raw, Repository } from 'typeorm';
import { CreateTypeLocalDto } from './dto/create-type_locale.dto';
import { Typelocal } from './entities/type_locale.entity';
import { SocketService } from 'src/socket/socket.service';
@Injectable()
export class TypeLocalService {
  private readonly logger = new Logger(TypeLocalService.name);
  repo: any;
  constructor(
    @InjectRepository(Typelocal)
    private readonly typeLocalRepository: Repository<Typelocal>,
    private readonly socketService: SocketService,
  ) { }

 async create(createTypeLocalDto: CreateTypeLocalDto): Promise<Typelocal> {
    // Vérifier l'unicité de typeLoc.fr (ou .mg ?) par municipalité
    const existingTypeLocal = await this.typeLocalRepository.findOne({
      where: {
        municipalityId: createTypeLocalDto.municipalityId,
        // Comparaison stricte sur le nom français — plus fiable que @>
        typeLoc: {
          fr: createTypeLocalDto.typeLoc.fr,
        } as any,
      },
    });

    if (existingTypeLocal) {
      throw new ConflictException(
        `Un type de local nommé '${createTypeLocalDto.typeLoc.fr}' existe déjà dans cette municipalité.`,
      );
    }

    try {
      let typeLocal = this.typeLocalRepository.create({
        ...createTypeLocalDto,
        type_contrat: createTypeLocalDto.type_contrat ?? 'ANNUEL',
        description: createTypeLocalDto.description ?? null,
        couleur: createTypeLocalDto.couleur ?? null,
      });

      typeLocal = await this.typeLocalRepository.save(typeLocal);

      this.socketService.sendNotification({
        authorId: '550e8400-e29b-41d4-a716-446655440003',
        destinationId: null,
        typeNotification: 'broadcastToAll',
        message: 'type_local_created',
        ressource: typeLocal,
      });

      return typeLocal;
    } catch (error: unknown) {
      this.logger.error(
        `Failed to create type local: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      throw new BadRequestException(
        `Failed to create type local: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  async findAll(
    municipalityId: string,
    lang: 'mg' | 'fr' = 'fr',
    page = 1,
    limit = 10,
  ) {
    const [result, total] = await this.typeLocalRepository.findAndCount({
      where: { municipalityId },
      order: { id_type_local: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    const data = result.map((item) => ({
      ...item,
      typeLoc: item.typeLoc?.[lang] ?? item.typeLoc,
      description: item.description?.[lang] ?? item.description,
    }));

    return {
      message: 'Liste des types locaux',
      data,
      pagination: {
        total,
        page,
        limit,
        totalPagination: Math.ceil(total / limit),
      },
      status: 200,
    };
  }

  // ─────────────────────────────────────────────────────────────
  // FIND ONE
  // ─────────────────────────────────────────────────────────────
  async findOne(
    municipalityId: string,
    id_type_local: string,
  ): Promise<Typelocal> {
    const typeLocal = await this.typeLocalRepository.findOne({
      where: { municipalityId, id_type_local },
      relations: ['locaux'],
    });

    if (!typeLocal) {
      throw new NotFoundException(
        `TypeLocal with id ${id_type_local} not found in municipality ${municipalityId}`,
      );
    }

    return typeLocal;
  }

  // ─────────────────────────────────────────────────────────────
  // UPDATE
  // ─────────────────────────────────────────────────────────────
  async update(
    municipalityId: string,
    id_type_local: string,
    updateDto: Partial<CreateTypeLocalDto>,
  ): Promise<Typelocal> {
    const typeLocal = await this.typeLocalRepository.findOne({
      where: { municipalityId, id_type_local },
    });

    if (!typeLocal) {
      throw new NotFoundException(
        `TypeLocal with id ${id_type_local} in municipality ${municipalityId} not found`,
      );
    }

    // 🔒 Empêcher la modification du municipalityId (migration entre communes)
    const { municipalityId: _ignored, ...safeUpdate } = updateDto;

    Object.assign(typeLocal, safeUpdate);

    const updated = await this.typeLocalRepository.save(typeLocal);

    this.socketService.sendNotification({
      authorId: '550e8400-e29b-41d4-a716-446655440003',
      destinationId: null,
      typeNotification: 'broadcastToAll',
      message: 'type_local_updated',
      ressource: updated,
    });

    return updated;
  }

  // ─────────────────────────────────────────────────────────────
  // REMOVE
  // ─────────────────────────────────────────────────────────────
  async remove(
    municipalityId: string,
    id: string,
  ): Promise<{ message: string; status: number; data: any }> {
    const type = await this.typeLocalRepository.findOne({
      where: { municipalityId, id_type_local: id },
      relations: ['locaux'],
    });

    if (!type) {
      throw new NotFoundException(
        `TypeLocal with id ${id} not found in municipality ${municipalityId}`,
      );
    }

    // ⚠️ Empêcher la suppression si des locaux y sont rattachés
    if (type.locaux && type.locaux.length > 0) {
      throw new ConflictException(
        `Impossible de supprimer : ${type.locaux.length} local(aux) utilise(nt) ce type`,
      );
    }

    await this.typeLocalRepository.remove(type);

    return {
      message: 'Type local supprimé avec succès',
      status: 200,
      data: type,
    };
  }
}



