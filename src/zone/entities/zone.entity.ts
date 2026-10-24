import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, OneToMany } from "typeorm";
import { Market } from "src/market/entities/market.entity";
import { Local } from "src/local/entities/local.entity";
import { DistributionZone } from "src/distribution_zone/entities/distribution_zone.entity";

@Entity('zone')
export class Zone {
    @PrimaryGeneratedColumn('uuid')
    id_zone: string;

    @Column({ length: 50 })
    nom: string;                  // plus unique globalement — unique par market

    @Column({ type: 'boolean', default: true })
    status: boolean;

    @Column({  length: 12 })
    municipalityId: string;
    
    // Jours actifs : 1=lundi ... 7=dimanche. null = actif tous les jours.
    @Column('smallint', { array: true, nullable: true })
    jours_actifs: number[] | null;

    @Column({
        type: 'geometry',
        spatialFeatureType: 'Polygon',
        srid: 4326,
    })
    delimitation: string;

    @Column({ type: 'uuid' })
    marketId: string;

    @ManyToOne(() => Market, (market) => market.zones, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'marketId' })
    market: Market;

    @OneToMany(() => Local, (local) => local.zone)
    locaux: Local[];

    @OneToMany(() => DistributionZone, (dz) => dz.zone)
    distributionZones: DistributionZone[];
}