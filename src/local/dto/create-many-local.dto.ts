import {
  IsNumber,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';

export class CreateManyLocalDto {
  @IsString()
  numero: string;

  @IsUUID()
  zoneId: string;

  @IsUUID()
  typelocalId: string;

  @IsNumber()
  latitude: number;

  @IsNumber()
  longitude: number;

  @IsNumber()
  @Min(0)
  @Max(360)
  rotation: number;
}