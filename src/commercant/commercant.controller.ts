import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { CommercantService } from './commercant.service';
import { CreateCommercantDto } from './dto/create-commercant.dto';
import { UpdateCommercantDto } from './dto/update-commercant.dto';

@Controller('commercant')
export class CommercantController {
  constructor(private readonly commercantService: CommercantService) {}

  @Post()
  create(@Body() createCommercantDto: CreateCommercantDto) {
    return this.commercantService.create(createCommercantDto);
  }

  @Get()
  findAll() {
    return this.commercantService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.commercantService.findOne(+id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateCommercantDto: UpdateCommercantDto) {
    return this.commercantService.update(+id, updateCommercantDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.commercantService.remove(+id);
  }
}
