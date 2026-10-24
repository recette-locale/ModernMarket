import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    OneToMany,
} from 'typeorm';
import { Local } from 'src/local/entities/local.entity';


@Entity('type_locale')
export class Typelocal {
    @PrimaryGeneratedColumn('uuid')
    id_type_local: string;

    @Column({ type: 'uuid' })
    municipalityId: string;

    @Column({ type: 'jsonb', nullable: false })
    typeLoc: { mg: string; fr: string };

    @Column({ type: 'enum', enum: ['JOURNALIER', 'ANNUEL'], default: 'ANNUEL' })
    type_contrat: 'JOURNALIER' | 'ANNUEL';

    @Column('decimal', { precision: 10, scale: 2 })
    longueur: number;

    @Column('decimal', { precision: 10, scale: 2 })
    largeur: number;

    @Column({ type: 'jsonb', nullable: true })
    description: { mg: string; fr: string } | null;

    @Column('decimal', { precision: 12, scale: 2 })
    tarif: number;                // tarif mensuel/annuel

    // ✅ nouveau
    @Column({ type: 'varchar', length: 7, nullable: true })
    couleur: string | null;

    @OneToMany(() => Local, (local) => local.typelocal)
    locaux: Local[];
}