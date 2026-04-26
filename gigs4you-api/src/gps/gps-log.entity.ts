import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, ManyToOne, JoinColumn,
} from 'typeorm';
import { Agent } from '../agents/agent.entity';

@Entity('gps_logs')
export class GpsLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Agent, (agent) => agent.gpsLogs)
  @JoinColumn()
  agent: Agent;

  @Column()
  agentId: string;

  @Column({ type: 'decimal', precision: 10, scale: 7 })
  latitude: number;

  @Column({ type: 'decimal', precision: 10, scale: 7 })
  longitude: number;

  // Speed in km/h — used for fraud detection (too-fast movement)
  @Column({ type: 'decimal', precision: 6, scale: 2, nullable: true })
  speed: number;

  // Accuracy from device GPS in metres
  @Column({ type: 'decimal', precision: 8, scale: 2, nullable: true })
  accuracy: number;

// Flag unusual GPS behaviour
   @Column({ default: false })
   isFlagged: boolean;

   @Column({ type: 'text', nullable: true })
   flagReason: string | null;

  @CreateDateColumn({ name: 'createdAt' })
  timestamp: Date;
}
