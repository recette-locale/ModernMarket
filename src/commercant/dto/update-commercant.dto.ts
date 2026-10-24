import { PartialType } from '@nestjs/swagger';
import { CreateCommercantDto } from './create-commercant.dto';

export class UpdateCommercantDto extends PartialType(CreateCommercantDto) {}
