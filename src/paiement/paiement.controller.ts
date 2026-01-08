import { Controller, Get, Post, Body, Patch, Param, Res, Delete, Query, ParseIntPipe, DefaultValuePipe, BadRequestException } from '@nestjs/common';
import { PaiementService } from './paiement.service';
import { CreatePaiementDto } from './dto/create-paiement.dto';
import { ApiResponse, ApiTags, ApiOperation, ApiQuery, ApiParam } from '@nestjs/swagger';
import { Response } from 'express';

@ApiTags('Paiement')
@Controller('paiement')
export class PaiementController {
  constructor(private readonly paiementService: PaiementService) { }

  @Post()
  @ApiOperation({ summary: 'Enregistrer le paiement d un contribuable' })
  create(@Body() createPaiementDto: CreatePaiementDto) {
    return this.paiementService.create(createPaiementDto);
  }

  @Get()
  @ApiOperation({ summary: 'Récupérer tous les paiements filtrés par municipalité, zone, référence et status' })
  @ApiQuery({ name: 'municipalityId', required: true, type: String, description: 'ID de la municipalité' })
  @ApiQuery({ name: 'zoneId', required: false, type: String, description: 'ID de la zone' })
  @ApiQuery({ name: 'reference', required: false, type: String, description: 'Filtre sur la référence du paiement' })
  @ApiQuery({ name: 'status', required: false, type: String, enum: ['success', 'failed'], description: 'Filtre sur le statut du paiement' })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Numéro de page (par défaut 1)' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Nombre de résultats par page (par défaut 10)' })
  @ApiQuery({
    name: 'startDate',
    required: false,
    type: String,
    description: 'Date de début pour filtrer (format ISO, ex: 2025-09-01)'
  })
  @ApiQuery({
    name: 'endDate',
    required: false,
    type: String,
    description: 'Date de fin pour filtrer (format ISO, ex: 2025-09-30)'
  })

  
  async findAll(
    @Query('municipalityId', ParseIntPipe) municipalityId: string,
    // @Query('userId') userId?: string,
    @Query('zoneId') zoneId?: string,
    @Query('reference') reference?: string,
    @Query('status') status?: 'success' | 'failed',
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page = 1,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit = 10,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    if (!municipalityId) {
      throw new BadRequestException('Le municipalityId est obligatoire.');
    }

    return this.paiementService.findAll(
      municipalityId,
      { zoneId, reference, status, startDate, endDate },
      page,
      limit,
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Récupérer un paiement par son id et municipalityId' })
  @ApiQuery({
    name: 'municipalityId',
    required: true,
    type: Number,
    description: 'ID de la municipalité obligatoire pour filtrer les paiements'
  })
  async findOne(
    @Param('id') id: string,
    @Query('municipalityId') municipalityId: string,
  ) {
    return this.paiementService.findOne(id, municipalityId);
  }

  @Get('user/:user_id/history')
  @ApiOperation({ summary: 'Récupérer l\'historique des paiements d\'un utilisateur' })
  @ApiQuery({ name: 'municipalityId', required: false, type: String, description: 'ID de la municipalité (optionnel)' })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Numéro de la page (par défaut 1)' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Nombre d\'éléments par page (par défaut 10)' })
  async findHistoryForUser(
    @Param('user_id') id_user: string,
    @Query('municipalityId') municipalityId?: string, // UUID ou undefined
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page = 1,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit = 10,
  ) {
    return this.paiementService.findHistoryByUser(id_user, municipalityId, page, limit);
  }

  @Get('recu/:reference')
  @ApiOperation({ summary: 'Télécharger le reçu PDF pour un paiement' })
  @ApiResponse({ status: 200, description: 'Reçu généré et téléchargé.' })
  async downloadRecu(
    @Param('reference') ref: string,
    @Res() res: Response,
  ) {
    const pdfBuffer = await this.paiementService.generateRecuPaiement(ref);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="recu_paiement_${ref}.pdf"`,
    );

    res.end(pdfBuffer);
  }
  @Get('recu-regisseur/:reference')
  @ApiOperation({ summary: 'Télécharger le reçu PDF avec régisseur pour un paiement donné' })
  @ApiResponse({ status: 200, description: 'Reçu régisseur généré et envoyé avec succès.' })
  @ApiResponse({ status: 404, description: 'Paiement introuvable pour cette municipalité.' })
  async downloadRecuRegisseur(
    @Param('reference') ref: string,
    @Res() res: Response,
  ) {
    const pdfBuffer = await this.paiementService.generateRecuPaiementRegisseur(ref);

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="recu_regisseur_${ref}.pdf"`,
    });

    res.send(pdfBuffer);
  }


  @Delete(':id')
  @ApiOperation({ summary: 'Supprimer un paiement par son ID (et ses paiements_location associés)' })
  @ApiResponse({ status: 200, description: 'Le paiement a été supprimé avec succès.' })
  @ApiResponse({ status: 404, description: 'Paiement introuvable.' })
  async remove(@Param('id') id: string) {
    return this.paiementService.remove(id);
  }
}