import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, ManyToMany,
} from 'typeorm';

@Entity('skills')
export class Skill {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  name: string;

  @Column({ default: 'general' })
  category: string; // sales | technician | logistics | finance | research | merchandising | general

  @Column({ nullable: true })
  description: string;

  @Column({ nullable: true })
  iconCode: string; // icon identifier for frontend

  @Column({ default: 0 })
  colorIndex: number; // maps to colour palette on frontend

  @Column({ default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;
}
