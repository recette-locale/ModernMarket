import { Entity, PrimaryGeneratedColumn, Column, OneToMany,CreateDateColumn ,UpdateDateColumn,ManyToOne,JoinColumn} from "typeorm";

@Entity('notification')
export class Notification {
  @PrimaryGeneratedColumn('uuid')
  id_notification: string;

  // Utilisateur concerné
  @Column({ type: 'uuid' })
  userId: string;

  // Type de notification
  @Column()
  type: string;

  // Titre court
  @Column({ length: 100, nullable:true })
  title: string;

  // Message détaillé
  @Column({ type: 'text',nullable:true })
  message: string;

  // Données contextuelles (JSON)
  @Column({ type: 'jsonb', nullable: true })
  data: {
    id_location?: string;
    id_paiement?: string;
    id_paiement_location?:string;
    localId?: string;
    montant?: number;
    zoneName? :string;
    resultat? : string;

   
  };

  // Statuts
  @Column({ type: 'boolean', default: false })
  isRead: boolean;



  // Priorité
  @Column({ 
    type: 'enum', 
    enum: ['LOW', 'MEDIUM', 'HIGH', 'URGENT'],
    default: 'MEDIUM'
  })
  priority: string;

  // Canaux de diffusion
  @Column({ type: 'jsonb', default: { inApp: true, email: false, sms: false } })
  channels: {
    inApp: boolean;
    email: boolean;
    sms: boolean;
    
  };


  @Column({ type: 'timestamp', nullable: true })//enleve
  scheduledAt: Date; // Pour les notifications programmées

  @Column({ type: 'timestamp', nullable: true ,default: () => 'CURRENT_TIMESTAMP'})
  sentAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  readAt: Date;

  @CreateDateColumn()//enleve
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;


}