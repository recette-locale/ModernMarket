import { Body, Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { MarketService } from './market.service';
import { CreateMarketDto } from './dto/create-market.dto';
@ApiTags('market')
@Controller('markets')
export class MarketController {
  constructor(private readonly marketService: MarketService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Créer un nouveau marché' })
  @ApiResponse({ status: 201, description: 'Market créé avec succès' })
  @ApiResponse({ status: 400, description: 'Données invalides' })
  @ApiResponse({ status: 404, description: 'Fokontany introuvable' })
  @ApiResponse({ status: 409, description: 'Doublon ou intersection géométrique' })
  @ApiResponse({ status: 503, description: 'Gateway indisponible' })
  async create(@Body() dto: CreateMarketDto) {
    return this.marketService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'Lister tous les marchés actifs' })
  @ApiResponse({ status: 200, description: 'Liste des marchés' })
  async findAll() {
    return this.marketService.findAll();
  }
}