import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

export enum VerificationStatus {
  PENDING   = 'pending',
  SUBMITTED = 'submitted',
  APPROVED  = 'approved',
  REJECTED  = 'rejected',
}

export enum DocumentType {
  NATIONAL_ID   = 'national_id',
  PASSPORT      = 'passport',
  DRIVING_LICENSE = 'driving_license',
}

@Entity('verifications')
export class Verification {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  userId: string;

  @Column({ type: 'enum', enum: VerificationStatus, default: VerificationStatus.PENDING })
  status: VerificationStatus;

  @Column({ type: 'enum', enum: DocumentType, nullable: true })
  documentType: DocumentType;

  // Uploaded file URLs (stored in MinIO)
  @Column({ nullable: true })
  idFrontUrl: string;

  @Column({ nullable: true })
  idBackUrl: string;

  @Column({ nullable: true })
  selfieUrl: string;

  // Extracted ID data (filled by admin or AI)
  @Column({ nullable: true })
  idNumber: string;

  @Column({ nullable: true })
  fullNameOnId: string;

  @Column({ type: 'date', nullable: true })
  dobOnId: string;

// Admin review
   @Column({ nullable: true })
   reviewedBy: string;

   @Column({ type: 'text', nullable: true })
   reviewNote: string | null;

  @Column({ type: 'timestamp', nullable: true })
  reviewedAt: Date;

  // Confidence score from AI face match (0-100)
  @Column({ type: 'decimal', precision: 5, scale: 2, nullable: true })
  faceMatchScore: number;

  @CreateDateColumn()
  submittedAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
