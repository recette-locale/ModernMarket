import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  Min,
} from 'class-validator';

export class CreateZoneDto {
  @ApiProperty({ description: 'Nom de la zone', example: 'Zone A' })
  @IsString()
  @IsNotEmpty()
  @Length(2, 50)
  nom: string;

  @ApiProperty({
    description: 'ID du market auquel la zone appartient',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsUUID()
  @IsNotEmpty()
  marketId: string;

  @ApiProperty({
    description: 'Limite géométrique de la zone (GeoJSON Polygon, SRID 4326)',
    example: {
      type: 'Polygon',
      coordinates: [
        [
          [-1.5, 48.5],
          [-1.5, 48.6],
          [-1.4, 48.6],
          [-1.4, 48.5],
          [-1.5, 48.5],
        ],
      ],
    },
  })
  @IsObject()
  @IsNotEmpty()
  delimitation: { type: 'Polygon'; coordinates: number[][][] };

  @ApiProperty({
    description:
      'Jours actifs de la zone (1=lundi ... 7=dimanche). ' +
      'Si absent ou vide → zone active tous les jours.',
    example: [1, 3, 5],
    required: false,
  })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @ArrayMinSize(1)
  @ArrayMaxSize(7)
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Max(7, { each: true })
  jours_actifs?: number[];
}