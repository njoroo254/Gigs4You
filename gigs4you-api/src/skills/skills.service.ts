import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like, In } from 'typeorm';
import { Skill } from './skill.entity';

@Injectable()
export class SkillsService {
  constructor(
    @InjectRepository(Skill)
    private skillsRepo: Repository<Skill>,
  ) {}

  async findAll(category?: string, search?: string): Promise<Skill[]> {
    const where: any = { isActive: true };
    if (category && category !== 'all') where.category = category;
    if (search) where.name = Like(`%${search}%`);
    return this.skillsRepo.find({ where, order: { name: 'ASC' } });
  }

  async findById(id: string): Promise<Skill | null> {
    return this.skillsRepo.findOne({ where: { id } });
  }

  async findByIds(ids: string[]): Promise<Skill[]> {
    if (!ids?.length) return [];
    return this.skillsRepo.find({ where: { id: In(ids) } });
  }

  // Create a skill if it doesn't exist — for "Other" custom inputs
  async findOrCreate(name: string, category = 'general'): Promise<Skill> {
    const normalized = name.trim().split(' ')
      .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
    const existing = await this.skillsRepo.findOne({ where: { name: normalized } });
    if (existing) return existing;
    const skill = this.skillsRepo.create({ name: normalized, category, isActive: true });
    return this.skillsRepo.save(skill);
  }

  async seedSkills(): Promise<void> {
    const count = await this.skillsRepo.count();
    if (count > 0) return;

    const skillsData = [
      { name:'Route Sales',category:'sales',colorIndex:0 },
      { name:'Van Sales',category:'sales',colorIndex:0 },
      { name:'Order Taking',category:'sales',colorIndex:0 },
      { name:'Collections',category:'sales',colorIndex:0 },
      { name:'Customer Service',category:'sales',colorIndex:0 },
      { name:'Retail Sales',category:'sales',colorIndex:0 },
      { name:'Solar Installation',category:'technician',colorIndex:1 },
      { name:'Electrical Wiring',category:'technician',colorIndex:1 },
      { name:'Plumbing',category:'technician',colorIndex:1 },
      { name:'CCTV Installation',category:'technician',colorIndex:1 },
      { name:'IT Support',category:'technician',colorIndex:1 },
      { name:'AC Repair',category:'technician',colorIndex:1 },
      { name:'Motorbike Riding',category:'logistics',colorIndex:2 },
      { name:'Delivery',category:'logistics',colorIndex:2 },
      { name:'Parcel Handling',category:'logistics',colorIndex:2 },
      { name:'Route Navigation',category:'logistics',colorIndex:2 },
      { name:'Cold Chain',category:'logistics',colorIndex:2 },
      { name:'Loan Assessment',category:'finance',colorIndex:3 },
      { name:'KYC Verification',category:'finance',colorIndex:3 },
      { name:'Debt Collection',category:'finance',colorIndex:3 },
      { name:'M-Pesa Float',category:'finance',colorIndex:3 },
      { name:'Book-keeping',category:'finance',colorIndex:3 },
      { name:'Data Collection',category:'research',colorIndex:4 },
      { name:'Interviewing',category:'research',colorIndex:4 },
      { name:'Field Survey',category:'research',colorIndex:4 },
      { name:'Data Entry',category:'research',colorIndex:4 },
      { name:'Focus Groups',category:'research',colorIndex:4 },
      { name:'Shelf Stocking',category:'merchandising',colorIndex:5 },
      { name:'POSM Placement',category:'merchandising',colorIndex:5 },
      { name:'Planogram Compliance',category:'merchandising',colorIndex:5 },
      { name:'Stock Counting',category:'merchandising',colorIndex:5 },
      { name:'Competitor Monitoring',category:'merchandising',colorIndex:5 },
      { name:'Kiswahili',category:'general',colorIndex:6 },
      { name:'English',category:'general',colorIndex:6 },
      { name:'Photography',category:'general',colorIndex:6 },
      { name:'Microsoft Excel',category:'general',colorIndex:6 },
      { name:'Driving (Class B)',category:'general',colorIndex:6 },
      { name:'First Aid',category:'general',colorIndex:6 },
    ];
    for (const s of skillsData)
      await this.skillsRepo.save(this.skillsRepo.create(s));
  }
}
