import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

@Entity('audit_logs')
export class AuditLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ nullable: true })
  userId: string;

  @Column({ nullable: true })
  userRole: string;

  @Index()
  @Column({ nullable: true })
  orgId: string;

  /** Verb: CREATE | UPDATE | DELETE | LOGIN | LOGOUT | APPROVE | REJECT | ASSIGN | EXPORT */
  @Column()
  action: string;

  /** Resource type: Task | Job | User | Agent | Organisation | Payment | KYC … */
  @Column()
  entity: string;

  @Column({ nullable: true })
  entityId: string;

  /** Extra context — before/after values, diff, request body excerpt, etc. */
  @Column({ type: 'jsonb', nullable: true })
  details: Record<string, any>;

  @Column({ nullable: true })
  ip: string;

  @Index()
  @CreateDateColumn()
  createdAt: Date;
}
