import { IncomeDocument, DocumentType } from '@prisma/client';
import { differenceInDays } from 'date-fns';

const PAY_PERIOD_FREQUENCIES = {
  WEEKLY: 7,
  BI_WEEKLY: 14,
  SEMI_MONTHLY: 15,
  MONTHLY: 30,
};

const FREQUENCY_MULTIPLIERS = {
  WEEKLY: 52,
  BI_WEEKLY: 26,
  SEMI_MONTHLY: 24,
  MONTHLY: 12,
};

// Represents the result of the paystub analysis
interface PaystubAnalysisResult {
  annualizedIncome: number | null;
  error?: string;
  payFrequency?: keyof typeof PAY_PERIOD_FREQUENCIES;
}

// Type for paystub documents with required fields
type PaystubDocument = IncomeDocument & {
  payPeriodStartDate: Date;
  payPeriodEndDate: Date;
  grossPayAmount: number;
};

/**
 * Analyzes a list of paystub documents to determine pay frequency and calculate annualized income.
 *
 * @param paystubs - A list of IncomeDocument objects of type PAYSTUB.
 * @returns An object containing the annualized income or an error message.
 */
export function analyzePaystubs(paystubs: IncomeDocument[]): PaystubAnalysisResult {
  if (paystubs.length === 0) {
    return { annualizedIncome: null, error: 'No paystubs provided.' };
  }

  // Ensure all documents are paystubs and have the necessary information
  const processedPaystubs = paystubs
    .map((p): PaystubDocument | null => {
        if (!p.payPeriodStartDate || !p.payPeriodEndDate || typeof p.grossPayAmount !== 'number') {
            return null;
        }

        return {
            ...p,
            payPeriodStartDate: p.payPeriodStartDate,
            payPeriodEndDate: p.payPeriodEndDate,
            grossPayAmount: p.grossPayAmount,
        };
    })
    .filter((p): p is PaystubDocument => p !== null)
    .sort((a, b) => new Date(b.payPeriodEndDate).getTime() - new Date(a.payPeriodEndDate).getTime());

  if (processedPaystubs.length < 2) {
    return { annualizedIncome: null, error: 'At least two paystubs are required to determine frequency.' };
  }

  // Determine pay frequency from the two most recent paystubs
  const [latest, secondLatest] = processedPaystubs;
  const daysBetween = differenceInDays(new Date(latest.payPeriodEndDate), new Date(secondLatest.payPeriodEndDate));
  
  let payFrequency: keyof typeof PAY_PERIOD_FREQUENCIES | undefined;
  for (const [freq, days] of Object.entries(PAY_PERIOD_FREQUENCIES)) {
    if (Math.abs(daysBetween - days) <= 2) { // Allow a 2-day tolerance
      payFrequency = freq as keyof typeof PAY_PERIOD_FREQUENCIES;
      break;
    }
  }

  if (!payFrequency) {
    return { annualizedIncome: null, error: 'Could not determine pay frequency.' };
  }
  
  // Verify there's at least a full month of paystubs
  const requiredStubs = Math.ceil(30 / PAY_PERIOD_FREQUENCIES[payFrequency]);
  if (processedPaystubs.length < requiredStubs) {
      return { annualizedIncome: null, error: `Not enough paystubs for a full month. Expected ${requiredStubs}, got ${processedPaystubs.length}.`};
  }
  
  // Calculate the average gross pay from the available paystubs
  const totalGrossPay = processedPaystubs.slice(0, requiredStubs).reduce((acc, p) => acc + p.grossPayAmount, 0);
  const averageGrossPay = totalGrossPay / requiredStubs;

  // Annualize the income
  const multiplier = FREQUENCY_MULTIPLIERS[payFrequency];
  const annualizedIncome = averageGrossPay * multiplier;

  return { annualizedIncome, payFrequency };
}

export interface HudIncomeLimits {
  '50percent': Record<string, number>;
  '60percent': Record<string, number>;
  '80percent': Record<string, number>;
}

export interface AmiBucketCalculation {
  actualBucket: string;
  complianceBucket: string;
  amiPercentage: number;
  householdIncome: number;
  householdSize: number;
}

/**
 * Calculate the actual AMI bucket based on income and household size
 */
export function getActualAmiBucket(
  totalIncome: number, 
  residentCount: number, 
  hudIncomeLimits: HudIncomeLimits, 
  complianceOption: string = "20% at 50% AMI, 55% at 80% AMI"
): string {
  if (residentCount === 0) return 'Vacant';
  if (residentCount > 0 && (!totalIncome || totalIncome === 0)) return 'No Income Information';
  
  const familySize = Math.min(residentCount, 8); // Cap at 8 per HUD guidelines

  switch (complianceOption) {
    case '20% at 50% AMI, 55% at 80% AMI':
      const limit50 = hudIncomeLimits['50percent']?.[`il50_p${familySize}`];
      const limit80 = hudIncomeLimits['80percent']?.[`il80_p${familySize}`];
      
      if (limit50 && totalIncome <= limit50) return '50% AMI';
      if (limit80 && totalIncome <= limit80) return '80% AMI';
      return 'Market';
      
    case '40% at 60% AMI, 35% at 80% AMI':
      const limit60 = hudIncomeLimits['60percent']?.[`il60_p${familySize}`];
      const limit80_2 = hudIncomeLimits['80percent']?.[`il80_p${familySize}`];
      
      if (limit60 && totalIncome <= limit60) return '60% AMI';
      if (limit80_2 && totalIncome <= limit80_2) return '80% AMI';
      return 'Market';
      
    case '100% at 80% AMI':
      const limit80_3 = hudIncomeLimits['80percent']?.[`il80_p${familySize}`];
      
      if (limit80_3 && totalIncome <= limit80_3) return '80% AMI';
      return 'Market';
      
    default:
      return 'Market';
  }
}

/**
 * Calculate AMI percentage based on income and household size
 */
export function calculateAmiPercentage(
  totalIncome: number,
  residentCount: number,
  hudIncomeLimits: HudIncomeLimits
): number {
  if (residentCount === 0 || totalIncome === 0) return 0;
  
  const familySize = Math.min(residentCount, 8);
  
  // Use 100% AMI as baseline (we can derive this from 80% AMI)
  const limit80 = hudIncomeLimits['80percent']?.[`il80_p${familySize}`];
  if (!limit80) return 0;
  
  // 100% AMI = 80% AMI / 0.8
  const limit100 = limit80 / 0.8;
  
  return (totalIncome / limit100) * 100;
}

/**
 * Calculate compliance bucket using the 140% rule
 * If original qualification was Market, use actual bucket
 * Otherwise, use the better of original vs actual bucket
 */
export function getComplianceAmiBucket(
  actualBucket: string,
  originalQualificationBucket: string
): string {
  // Apply 140% rule: if original was Market, show actual. Otherwise show better of original vs actual
  if (originalQualificationBucket === 'Market') {
    return actualBucket;
  }

  // Return the better bucket (lower AMI is better)
  const bucketPriority = ['50% AMI', '60% AMI', '80% AMI', 'Market', 'Vacant', 'No Income Information'];
  const originalIndex = bucketPriority.indexOf(originalQualificationBucket);
  const actualIndex = bucketPriority.indexOf(actualBucket);
  
  return actualIndex <= originalIndex ? actualBucket : originalQualificationBucket;
}

/**
 * Calculate total verified income from income documents
 */
export function calculateTotalVerifiedIncome(incomeDocuments: any[]): number {
  const verifiedDocuments = incomeDocuments.filter(d => d.status === 'COMPLETED');
  
  // Sum W2 income (box1_wages)
  const w2Income = verifiedDocuments
    .filter(d => d.documentType === 'W2')
    .reduce((acc, d) => acc + (d.box1_wages || 0), 0);
  
  // Sum paystub income (calculatedAnnualizedIncome)
  const paystubIncome = verifiedDocuments
    .filter(d => d.documentType === 'PAYSTUB' && d.calculatedAnnualizedIncome)
    .reduce((acc, d) => acc + d.calculatedAnnualizedIncome!, 0);
    
  // Sum other income types (calculatedAnnualizedIncome)
  const otherIncome = verifiedDocuments
    .filter(d => d.documentType !== 'W2' && d.documentType !== 'PAYSTUB' && d.calculatedAnnualizedIncome)
    .reduce((acc, d) => acc + d.calculatedAnnualizedIncome!, 0);

  return w2Income + paystubIncome + otherIncome;
}

/**
 * Calculate comprehensive AMI bucket information for a lease
 */
export function calculateAmiBucketForLease(
  residents: any[],
  incomeDocuments: any[],
  hudIncomeLimits: HudIncomeLimits,
  complianceOption: string = "20% at 50% AMI, 55% at 80% AMI"
): AmiBucketCalculation {
  const householdSize = residents.length;
  const householdIncome = calculateTotalVerifiedIncome(incomeDocuments);
  
  const actualBucket = getActualAmiBucket(
    householdIncome,
    householdSize,
    hudIncomeLimits,
    complianceOption
  );
  
  const amiPercentage = calculateAmiPercentage(
    householdIncome,
    householdSize,
    hudIncomeLimits
  );
  
  // For provisional leases, we typically use the actual bucket for compliance
  // since there's no "original qualification" from move-in
  const complianceBucket = actualBucket;
  
  return {
    actualBucket,
    complianceBucket,
    amiPercentage,
    householdIncome,
    householdSize
  };
}