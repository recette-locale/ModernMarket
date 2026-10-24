import { Injectable } from '@nestjs/common';
import { CreateCommercantDto } from './dto/create-commercant.dto';
import { UpdateCommercantDto } from './dto/update-commercant.dto';

@Injectable()
export class CommercantService {
  create(createCommercantDto: CreateCommercantDto) {
    return 'This action adds a new commercant';
  }

  findAll() {
    return `This action returns all commercant`;
  }

  findOne(id: number) {
    return `This action returns a #${id} commercant`;
  }

  update(id: number, updateCommercantDto: UpdateCommercantDto) {
    return `This action updates a #${id} commercant`;
  }

  remove(id: number) {
    return `This action removes a #${id} commercant`;
  }
}
