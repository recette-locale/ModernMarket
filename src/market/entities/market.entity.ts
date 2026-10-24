import { Entity, PrimaryGeneratedColumn, Column, OneToMany } from 'typeorm';
import { Zone } from 'src/zone/entities/zone.entity';

@Entity('market')
export class Market {
  @PrimaryGeneratedColumn('uuid')
  id_market: string;

  @Column({ length: 100 })
  nom: string;

  @Column({ length: 12 })
  municipalityId: string;

  @Column({ length: 12 })
  formatted_id: string;

  @Column({ type: 'boolean', default: true })
  status: boolean;

  @Column({
    type: 'geometry',
    spatialFeatureType: 'Polygon',
    srid: 4326,
    nullable: true,
  })
  delimitation: any;

  @OneToMany(() => Zone, (zone) => zone.market)
  zones: Zone[];
}