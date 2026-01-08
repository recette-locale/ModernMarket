import { ApiProperty } from "@nestjs/swagger";
import { IsUUID, IsString, IsNumber } from "class-validator";


export class CreateLocalDto {
    @ApiProperty({ maxLength: 11 ,description:'Le numero du local ,ex:Pav1,Hang1'})
    @IsString()
    numero: string;

    @ApiProperty({ maxLength: 10,description:'L Id de la zone du local' })
    @IsUUID()
    zoneId: string;

    @ApiProperty({ maxLength: 10 ,description:'L Id du typtLocal du local' })
    @IsUUID()
    typelocalId: string;

    @ApiProperty({ description: 'La latitude du local' ,
        example: -18.879190 
    })
    @IsNumber()
    latitude: number;

    @ApiProperty({ description: 'La longitude du local' ,
        example: 47.507905
     })
    @IsNumber()
    longitude: number;

    @ApiProperty({ description: 'La rotation du local en degrés' ,
        example: 45
     })
    @IsNumber()
    rotation: number;
}
