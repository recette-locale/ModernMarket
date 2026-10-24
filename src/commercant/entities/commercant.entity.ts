
import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, OneToMany, CreateDateColumn } from "typeorm";
import { Local } from "src/local/entities/local.entity";
import { Ticket } from "src/ticket/entities/ticket.entity";

@Entity('commercant')
export class Commercant {
    @PrimaryGeneratedColumn('uuid')
    id_commercant: string;

    @Column({ length: 4, unique: true })
    matricule: string;               // 4 chiffres, format validé en DTO

    @Column({ type: 'uuid', unique: true })
    id_user: string;                 // service externe (auth microservice)

    @Column({ type: 'boolean', default: true })
    regulier: boolean;

    // Local "attitré" — null si pas encore affecté
    @Column({ type: 'uuid', nullable: true })
    localId: string | null;

    @ManyToOne(() => Local, { onDelete: 'SET NULL', nullable: true })
    @JoinColumn({ name: 'localId' })
    local: Local | null;

    @CreateDateColumn({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
    date_creation: Date;

    @OneToMany(() => Ticket, (ticket) => ticket.commercant)
    tickets: Ticket[];
}