import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Raw, Repository } from 'typeorm';
import { CreateTypeLocalDto } from './dto/create-type_locale.dto';
import { Typelocal } from './entities/type_locale.entity';
import { SocketService } from 'src/socket/socket.service';
@Injectable()
export class TypeLocalService {
  repo: any;
  constructor(
    @InjectRepository(Typelocal)
    private readonly typeLocalRepository: Repository<Typelocal>,
    private readonly socketService: SocketService,
  ) { }

  async create(createTypeLocalDto: CreateTypeLocalDto): Promise<Typelocal> {
    // Vérifiez si un type_local avec le même typeLoc existe déjà pour le municipalityId donné
    const existingTypeLocal = await this.typeLocalRepository.findOne({
      where: {
        municipalityId: createTypeLocalDto.municipalityId,
        typeLoc: Raw(alias => `${alias} @> :query`, { query: createTypeLocalDto.typeLoc }),
      },
    });

    if (existingTypeLocal) {
      throw new BadRequestException('Ce type local existe déjà dans cette municipalité.');
    }

    let typeLocal = this.typeLocalRepository.create(createTypeLocalDto);
    typeLocal = await this.typeLocalRepository.save(typeLocal);

    const data = {
      authorId: '550e8400-e29b-41d4-a716-446655440003',
      destinationId: null,
      typeNotification: 'broadcastToAll',
      message: 'type_local_created',
      ressource: typeLocal
    };

    this.socketService.sendNotification(data);
    return typeLocal;
  }

  async findAll(municipalityId: string, lang: 'mg' | 'fr', page: number = 1, limit: number = 10): Promise<{
    message: string;
    data: any[];
    pagination: { total: number; page: number; limit: number; totalPagination: number };
    status: number;
  }> {
    const type = await this.typeLocalRepository.find({ where: { municipalityId } });
    const [result, total] = await this.typeLocalRepository.findAndCount({
      where: { municipalityId },
      order: { id_type_local: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    const data = result.map(item => ({
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

  async findOne(municipalityId: string, id_type_local: string): Promise<Typelocal> {
    const typeLocal = await this.typeLocalRepository.findOne({
      where: { municipalityId, id_type_local: id_type_local },
      relations: ['locaux'],
    });
    if (!typeLocal) {
      throw new NotFoundException(`TypeLocal with id ${id_type_local} not found`);
    }
    return typeLocal;
  }

  async update(municipalityId: string, id_type_local: string, updateDto: Partial<CreateTypeLocalDto>): Promise<Typelocal> {
    let typeLocal = await this.typeLocalRepository.findOne({
      where: { municipalityId, id_type_local }
    });
    if (!typeLocal) {
      throw new NotFoundException(`TypeLocal with id ${id_type_local} in municipality ${municipalityId} not found`);
    }
    
    Object.assign(typeLocal, updateDto);

    typeLocal = await this.typeLocalRepository.save(typeLocal);
    const data = {
      authorId: '550e8400-e29b-41d4-a716-446655440003',
      destinationId: null,
      typeNotification: 'broadcastToAll',
      message: 'type_local_updated',
      ressource: typeLocal
    };

    this.socketService.sendNotification(data);
    return typeLocal;
  }

  async remove(municipalityId: string, id: string): Promise<{ message: string; status: number; data: any }> {
    const type = await this.typeLocalRepository.findOne({ where: { municipalityId, id_type_local: id } });
    if (!type) {
      return { message: 'Type local introuvable', status: 404, data: null };
    }

    await this.typeLocalRepository.remove(type);
    return { message: 'Type local supprimé avec succès', status: 200, data: type };
  }

}
