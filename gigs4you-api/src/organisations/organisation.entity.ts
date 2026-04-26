import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, UpdateDateColumn,
} from 'typeorm';

@Entity('organisations')
export class Organisation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  // Normalised for deduplication: lowercase, trimmed, single-spaced.
  // Unique constraint prevents "Limuru Country Club" and "limuru country club"
  // from being registered as separate organisations.
  @Column({ unique: true })
  nameNormalized: string;

  @Column({ nullable: true })
  industry: string;

  @Column({ nullable: true })
  county: string;

  @Column({ nullable: true })
  logoUrl: string;

  @Column({ nullable: true })
  description: string;

  // Physical address
  @Column({ nullable: true })
  address: string;

  // Tax compliance fields
  @Column({ nullable: true })
  kraPin: string;        // KRA PIN number

  @Column({ nullable: true })
  vatNumber: string;     // VAT registration number

  @Column({ nullable: true })
  businessRegNo: string; // Business registration / certificate number

  // Compliance document uploads — stored in object storage (MinIO)
  @Column({ nullable: true })
  kraDocUrl: string;             // KRA PIN certificate

  @Column({ nullable: true })
  businessRegDocUrl: string;     // Certificate of incorporation / business registration cert

  @Column({ nullable: true })
  taxComplianceDocUrl: string;   // KRA tax compliance certificate

  // Contact info for invoices/receipts
  @Column({ nullable: true })
  billingEmail: string;

  @Column({ nullable: true })
  billingPhone: string;

  // Owner/admin user ID — maps to "adminUserId" in DB
  @Column({ name: 'adminUserId' })
  ownerId: string;

  // Branch support — null = root org; set = branch of another org
  @Column({ nullable: true })
  parentId: string;

  @Column({ nullable: true })
  branchName: string;  // e.g. "Mombasa Branch", "Kisumu Office"

  @Column({ default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
