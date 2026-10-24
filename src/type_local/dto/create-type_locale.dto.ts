import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Min,
  IsNumber,
} from 'class-validator';

export enum TypeContrat {
  JOURNALIER = 'JOURNALIER',
  ANNUEL = 'ANNUEL',
}

export class CreateTypeLocalDto {
  @ApiProperty({
    description: 'Nom du type de local traduit',
    example: { mg: 'Langara', fr: 'Hangar' },
  })
  @IsObject()
  @IsNotEmpty()
  typeLoc: { mg: string; fr: string };

  @ApiProperty({
    description: 'ID de la municipalité (UUID)',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsUUID()          // ✅ était @IsNumber() → bug
  @IsNotEmpty()
  municipalityId: string;

  @ApiPropertyOptional({
    description: 'Description traduite du type de local',
    example: {
      mg: 'Famaritana amin’ny teny Malagasy',
      fr: 'Description en français',
    },
  })
  @IsOptional()
  @IsObject()
  description?: { mg: string; fr: string };

  @ApiPropertyOptional({
    description: 'Type du contrat',
    enum: TypeContrat,
    example: TypeContrat.ANNUEL,
    default: TypeContrat.ANNUEL,
  })
  @IsOptional()
  @IsEnum(TypeContrat, {
    message: `type_contrat doit être 'JOURNALIER' ou 'ANNUEL'`,
  })
  type_contrat?: TypeContrat;

  @ApiProperty({ description: 'Longueur du local (m)', example: 10.5 })
  @IsNumber()
  @Min(0)
  longueur: number;

  @ApiProperty({ description: 'Largeur du local (m)', example: 8.2 })
  @IsNumber()
  @Min(0)
  largeur: number;

  @ApiProperty({ description: 'Tarif du local', example: 50000 })
  @IsNumber()
  @Min(0)
  tarif: number;

  @ApiPropertyOptional({
    description: 'Couleur du local (format #RRGGBB)',
    example: '#FF5722',
  })
  @IsOptional()
  @IsString()
  couleur?: string;
}