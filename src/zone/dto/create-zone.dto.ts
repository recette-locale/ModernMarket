import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsNumber, IsString } from 'class-validator';
import type { Geometry } from 'geojson';

export class CreateZoneDto {
  @ApiProperty({ description: 'Nom de la zone' })
  @IsString()
  nom: string;

  @ApiProperty({ description: 'ID de la municipalité' })
  @IsString()
  municipalityId: string;

  @ApiProperty({ description: 'ID du fokontany' })
  @IsString()
  formatted_id: string;

   @ApiProperty({
        description: 'Limite géométrique de la zone sur la carte (format GeoJSON ou WKT)',
        example: {
            type: 'Polygon',
            coordinates: [
                [
                    [-1.5, 48.5],
                    [-1.5, 48.6],
                    [-1.4, 48.6],
                    [-1.4, 48.5],
                    [-1.5, 48.5]
                ]
            ]
        }
    })
    delimitation: any;
}
