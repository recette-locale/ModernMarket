import { Controller,HttpCode,HttpStatus, Get, Post, Body, Patch, Delete, Param, Query, ParseIntPipe, DefaultValuePipe } from '@nestjs/common';
import { ZoneService } from './zone.service';
import { CreateZoneDto } from './dto/create-zone.dto';
import { UpdateZoneDto } from './dto/update-zone.dto';
import { ApiResponse, ApiTags, ApiOperation, ApiQuery, ApiParam } from '@nestjs/swagger';


@ApiTags('Zones')
@Controller('zones')
export class ZoneController {
  constructor(private readonly zoneService: ZoneService) { }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Créer une nouvelle zone dans un market' })
  @ApiResponse({ status: 201, description: 'Zone créée avec succès' })
  @ApiResponse({ status: 400, description: 'Market inactif' })
  @ApiResponse({ status: 404, description: 'Market introuvable' })
  @ApiResponse({
    status: 409,
    description: 'Doublon, intersection ou zone hors du market',
  })
  async create(@Body() dto: CreateZoneDto) {
    return this.zoneService.create(dto);
  }

 

  @Get(':municipalityId')
  @ApiOperation({ summary: 'Récupérer toutes les zones d’une commune avec filtres' })
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
    description: 'Nombre de résultats par page (par défaut 10)',
  })
  @ApiQuery({
    name: 'keyword',
    required: false,
    type: String,
    description: 'Recherche par mot-clé (ex: numéro du local)',
  })
  @ApiQuery({
    name: 'latitude',
    required: false,
    type: Number,
    description: 'Latitude pour filtrer par position géographique',
  })
  @ApiQuery({
    name: 'longitude',
    required: false,
    type: Number,
    description: 'Longitude pour filtrer par position géographique',
  })
  findAll(
    @Param('municipalityId') municipalityId: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
    @Query('keyword') keyword?: string,
    @Query('latitude') latitude?: number,
    @Query('longitude') longitude?: number,
  ) {
    return this.zoneService.findAll(municipalityId, limit, page, {
      keyword,
      latitude,
      longitude,
    });
  }

  @Get()
  @ApiOperation({ summary: 'Récupérer toutes les zones' })
  getAllZones(){
    return this.zoneService.findAll1();
  }


  @Get('edit/:id_zone/')
  @ApiParam({ name: 'id_zone', required: true, description: 'ID de la zone' })
  @ApiQuery({ name: 'municipalityId', required: false, description: 'ID de la municipalité' })
  @ApiOperation({ summary: 'Récupérer une zone par son id dans une municipalité' })
  findOneByIdAndMunicipality(
    @Param('id_zone') id_zone: string,
    @Query('municipalityId') municipalityId: string,
  ) {
    return this.zoneService.findOne(id_zone, municipalityId);
  }



  @Patch(':municipalityId/:id_zone')
  @ApiOperation({ summary: 'Modifier une zone' })
  update(
    @Param('municipalityId') municipalityId: string,
    @Param('id_zone') id_zone: string,
    @Body() updateZoneDto: UpdateZoneDto,
  ) {
    return this.zoneService.update(municipalityId, id_zone, updateZoneDto);
  }

  @Delete(':id_zone')
  @ApiOperation({ summary: 'Supprimer une zone et tout ce qui est lié avec elle.' })
  remove(
    @Param('id_zone') id_zone: string,
  ) {
    return this.zoneService.remove(id_zone);
  }
}
