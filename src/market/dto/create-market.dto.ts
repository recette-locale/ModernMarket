import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  IsObject,
  Length,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateMarketDto {
  @ApiProperty({ example: "Marché d'Analakely" })
  @IsString()
  @IsNotEmpty()
  @Length(2, 100)
  nom: string;

  @ApiProperty({ example: '701635701959' })
  @IsString()
  @IsNotEmpty()
  formatted_id: string;

  @ApiProperty({ example: '701635701959' })
  @IsString()
  @IsNotEmpty()
  municipalityId: string;

  @ApiProperty({
    description: 'Limite géométrique du marché (GeoJSON Polygon, SRID 4326)',
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
    required: false,
  })
  @IsOptional()
  @IsObject()
  delimitation?: { type: 'Polygon'; coordinates: number[][][] };
}