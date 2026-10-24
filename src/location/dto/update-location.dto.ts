import { PartialType } from '@nestjs/swagger';
import { CreateLocationDto } from './create-location.dto';

export class UpdateLocationDto extends PartialType(CreateLocationDto) {}
// export class UpdateLocationDto {
//   @ApiPropertyOptional({ description: 'NIF corrigé' })
//   @IsOptional()
//   @IsString()
//   @Length(1, 10)
//   nif?: string;

//   @ApiPropertyOptional({ description: "Usage du local" })
//   @IsOptional()
//   @IsString()
//   usage?: string;
// }