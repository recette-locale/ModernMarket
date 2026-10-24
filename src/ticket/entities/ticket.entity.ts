import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn } from "typeorm";
import { Local } from "src/local/entities/local.entity";
import { Commercant } from "src/commercant/entities/commercant.entity";
import { Zone } from "src/zone/entities/zone.entity";
import { Market } from "src/market/entities/market.entity";

@Entity('ticket')
export class Ticket {
    @PrimaryGeneratedColumn('uuid')
    id_ticket: string;

    @Column({ type: 'uuid' })
    percepteurId: string;            // uuid du percepteur (service externe)

    @Column({ type: 'uuid' })
    commercantId: string;

    @Column({ type: 'uuid' })
    localId: string;

    // Dénormalisé pour les rapports — évite les jointures lourdes
    @Column({ type: 'uuid' })
    zoneId: string;

    @Column({ type: 'uuid' })
    marketId: string;

    @Column('decimal', { precision: 12, scale: 2 })
    montant: number;                 // payé en liquide

    @Column({ type: 'date' })
    date_ticket: Date;               // jour de validité (pas timestamp)

    @CreateDateColumn({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
    date_creation: Date;             // horodatage réel du scan

    @ManyToOne(() => Commercant, (c) => c.tickets, { onDelete: 'RESTRICT' })
    @JoinColumn({ name: 'commercantId' })
    commercant: Commercant;

    @ManyToOne(() => Local, { onDelete: 'RESTRICT' })
    @JoinColumn({ name: 'localId' })
    local: Local;

    @ManyToOne(() => Zone, { onDelete: 'RESTRICT' })
    @JoinColumn({ name: 'zoneId' })
    zone: Zone;

    @ManyToOne(() => Market, { onDelete: 'RESTRICT' })
    @JoinColumn({ name: 'marketId' })
    market: Market;
}