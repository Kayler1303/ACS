export type IndividualResidentData = {
  unit: string;
  resident: string;
  income: number;
  totalIncome: number;
  rent: string | number;
  leaseStartDate?: string;
  leaseEndDate?: string;
}; 

export type VerificationStatus = 'IN_PROGRESS' | 'FINALIZED' | 'OVERDUE';

export type VerificationReason = 
  | 'INITIAL_LEASE' 
  | 'ANNUAL_RECERTIFICATION' 
  | 'LEASE_RENEWAL' 
  | 'INCOME_CHANGE' 
  | 'COMPLIANCE_AUDIT';

export type IncomeVerification = {
  id: string;
  tenancyId: string;
  status: VerificationStatus;
  reason: VerificationReason;
  
  // Verification Period - what time span this verification covers
  verificationPeriodStart: Date;
  verificationPeriodEnd: Date;
  
  // Compliance Timeline
  dueDate: Date;
  reminderSentAt?: Date;
  
  // Lease Association
  leaseYear?: number;
  associatedLeaseStart?: Date;
  associatedLeaseEnd?: Date;
  
  createdAt: Date;
  updatedAt: Date;
  finalizedAt?: Date;
  calculatedVerifiedIncome?: number;
};