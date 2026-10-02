import { Controller, Get, Post, Body, Patch, Param, Delete, Query, ParseIntPipe, DefaultValuePipe, ParseUUIDPipe } from '@nestjs/common';
import { LocalService } from './local.service';
import { CreateLocalDto } from './dto/create-local.dto';
import { UpdateLocalDto } from './dto/update-local.dto';
import { ApiTags, ApiOperation, ApiQuery, ApiResponse, ApiBody } from '@nestjs/swagger';
import { LocationService } from 'src/location/location.service';
import { NotFoundException } from '@nestjs/common';
import { CreateManyLocalDto } from './dto/create-many-local.dto';
@ApiTags('Local')
@Controller('local')
export class LocalController {
  constructor(
    private readonly localService: LocalService,
    private readonly locationService: LocationService
  ) { }

  @Post()
  @ApiOperation({ summary: 'Créer un nouveau local' })
  create(@Body() createLocalDto: CreateLocalDto) {
    return this.localService.create(createLocalDto);
  }

@Post('bulk')
@ApiOperation({ summary: 'Créer plusieurs locaux à la fois' })
@ApiBody({
  type: CreateManyLocalDto,
  isArray: true,
})
createMany(@Body() locals: CreateManyLocalDto[]) {
  return this.localService.createMany(locals);
}

@Get('getAll/municipality/:municipalityId')
@ApiOperation({ summary: 'Récupérer les locaux d’une municipalité avec filtres' })
@ApiQuery({ name: 'page', required: false, type: Number, description: 'Numéro de page (par défaut 1)' })
@ApiQuery({ name: 'limit', required: false, type: Number, description: 'Nombre de résultats par page (par défaut 10)' })
@ApiQuery({ name: 'zoneId', required: false, type: String, description: 'Filtrer par zone ID' })
@ApiQuery({ name: 'typelocalId', required: false, type: String, description: 'Filtrer par type de local' })
@ApiQuery({ name: 'statut', required: false, enum: ['DISPONIBLE', 'LOUE', 'INDISPONIBLE'], description: 'Filtrer par statut' })
@ApiQuery({ name: 'keyword', required: false, type: String, description: 'Recherche par mot-clé sur le numéro du local' })
@ApiQuery({ name: 'surface', required: false, type: Number, description: 'Recherche de local ayant a surface inscrite' })
// @ApiQuery({ name: 'latitude', required: true, type: Number, description: 'Latitude du local' })
// @ApiQuery({ name: 'longitude', required: true, type: Number, description: 'Longitude du local'})
async getAll(
  @Param('municipalityId') municipalityId: string,
  @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
  @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
  @Query('zoneId') zoneId ?: string, // ✅ Pas de ParseIntPipe pour les UUID
  @Query('typelocalId') typelocalId ?: string, // ✅ Pas de ParseIntPipe pour les UUID
  @Query('statut') statut ?: 'DISPONIBLE' | 'LOUE' | 'INDISPONIBLE',
  @Query('keyword') keyword ?: string,
  @Query('surface') surface ?: number,
  // @Query('latitude') latitude?: number,z
  // @Query('longitude') longitude?: number
) {
  return this.localService.getAll(municipalityId, page, limit, {
    zoneId,
    typelocalId,
    statut,
    keyword,
    surface,
    // latitude,
    // longitude
  });
}

@Get('municipality/:municipalityId/:id_local/occupied-dates')
@ApiOperation({ summary: 'Récupérer les dates occupées d’un local d’une municipalité' })
async getOccupiedDates(
  @Param('municipalityId') municipalityId: string,
  @Param('id_local', ParseUUIDPipe) id_local: string,
) {
  return this.locationService.findOccupiedPeriods(municipalityId, id_local);
}

@Get('municipality/:municipalityId/:id_local')
@ApiOperation({ summary: 'Récupérer un local d’une municipalité ' })
async findOne(
  @Param('municipalityId') municipalityId: string,
  @Param('id_local', ParseUUIDPipe) id_local: string,
) {
  return this.localService.findOne(municipalityId, id_local);
}

// Mettre à jour un local
@Patch('municipality/:municipalityId/:id_local')
@ApiOperation({ summary: 'Modifier un local d’une municipalité ' })
async update(
  @Param('municipalityId') municipalityId: string,
  @Param('id_local', ParseUUIDPipe) id_local: string,
  @Body() updateLocalDto: UpdateLocalDto,
) {
  return this.localService.update(municipalityId, id_local, updateLocalDto);
}


@Get('municipality/:municipalityId/local/:id_local/last-location')
@ApiOperation({ summary: 'Récupérer la dernière location associée à un local dans une municipalité' })
@ApiResponse({ status: 200, description: 'Dernière location trouvée.' })
@ApiResponse({ status: 404, description: 'Aucune location trouvée pour ce local dans cette municipalité.' })
async findLastLocationByLocal(
  @Param('municipalityId') municipalityId: string,
  @Param('id_local') id_local: string,
) {
  return this.localService.findLastLocationByLocal(municipalityId, id_local);
}


@Get('stats/municipality/:municipalityId')
@ApiOperation({ summary: 'Obtenir les statistiques des locaux par zone pour une municipalité' })
@ApiQuery({ name: 'id_user', required: false, type: String })
@ApiQuery({ name: 'id_typelocal', required: false, type: String })
@ApiQuery({ name: 'id_zone', required: false, type: String })
async getStatsByZone(
  @Param('municipalityId') municipalityId: string,
  @Query('id_user') id_user ?: string,
  @Query('id_typelocal') id_typelocal ?: string,
  @Query('id_zone') id_zone ?: string,
) {
  return await this.localService.getStatsByZone(municipalityId, { id_user, id_typelocal, id_zone });

}
// Supprimer un local
@Delete('municipality/:municipalityId/:id_local')
@ApiOperation({ summary: 'Supprimer un local d’une municipalité ' })
async remove(
  @Param('municipalityId') municipalityId: string,
  @Param('id_local', ParseUUIDPipe) id_local: string,
) {
  return this.localService.remove(municipalityId, id_local);
}
}
