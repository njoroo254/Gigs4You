import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

@Entity('system_options')
@Index(['type'])
export class SystemOption {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  type: string;

  @Column()
  value: string;

  @CreateDateColumn()
  createdAt: Date;
}
