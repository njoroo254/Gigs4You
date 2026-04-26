import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, UpdateDateColumn,
  ManyToOne, JoinColumn,
} from 'typeorm';
import { Job } from '../jobs/job.entity';
import { Agent } from '../agents/agent.entity';

export enum ApplicationStatus {
  PENDING   = 'pending',
  SHORTLISTED = 'shortlisted',
  ACCEPTED  = 'accepted',
  REJECTED  = 'rejected',
  WITHDRAWN = 'withdrawn',
}

@Entity('job_applications')
export class JobApplication {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Job, (job) => job.applications, { eager: false })
  @JoinColumn()
  job: Job;

  @Column({ type: 'uuid' })
  jobId: string;

  @ManyToOne(() => Agent, { eager: true, nullable: true })
  @JoinColumn()
  agent: Agent;

  @Column({ type: 'uuid', nullable: true })
  agentId: string;

  @Column({ nullable: true })
  applicantId: string;

  get applicant() {
    return this.agent;
  }

  get applicantType() {
    return 'agent';
  }

  @Column({ type: 'enum', enum: ApplicationStatus, default: ApplicationStatus.PENDING })
  status: ApplicationStatus;

  @Column({ type: 'text', nullable: true })
  coverNote: string;

  @CreateDateColumn()
  appliedAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
