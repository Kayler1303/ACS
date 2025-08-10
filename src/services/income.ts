import { differenceInDays } from 'date-fns';
import { IncomeDocument, Resident, Prisma } from '@prisma/client';

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
  grossPayAmount: number;
};

// Helper type for documents that might have paystub fields
type PotentialPaystubDocument = IncomeDocument & {
  payPeriodStartDate?: Date | null;
  payPeriodEndDate?: Date | null;
  grossPayAmount?: Prisma.Decimal | number | null; // Could be Decimal or number
};

/**
 * Analyzes a list of paystub documents to calculate annualized income using correct business logic.
 *
 * @param paystubs - A list of income document objects of type PAYSTUB.
 * @returns An object containing the annualized income or an error message.
 */
export function analyzePaystubs(paystubs: PotentialPaystubDocument[]): PaystubAnalysisResult {
  if (paystubs.length === 0) {
    return { annualizedIncome: null, error: 'No paystubs provided.' };
  }

  // Ensure all documents are paystubs and have the necessary information
  const processedPaystubs = paystubs
    .map((p): PaystubDocument | null => {
        // Handle both Prisma Decimal and number types for grossPayAmount
        const grossPayAmount = p.grossPayAmount ? Number(p.grossPayAmount) : null;
        
        if (!grossPayAmount || grossPayAmount <= 0) {
            return null;
        }

        return {
            ...p,
            grossPayAmount: grossPayAmount,
        } as PaystubDocument;
    })
    .filter((p): p is PaystubDocument => p !== null);

  if (processedPaystubs.length === 0) {
    return { annualizedIncome: null, error: 'No valid paystubs with gross pay amounts found.' };
  }

  // Get pay frequency from any paystub (should be the same for all from same resident)
  // Convert from upload format (BI-WEEKLY) to constant format (BI_WEEKLY)
  const uploadFrequency = processedPaystubs[0]?.payFrequency || 'BI-WEEKLY';
  const payFrequency = uploadFrequency.replace('-', '_') as keyof typeof PAY_PERIOD_FREQUENCIES;
  
  // Group paystubs by pay period (start date + end date) and sum amounts within same period
  const payPeriodGroups = new Map<string, number>();
  
  for (const paystub of processedPaystubs) {
    // Create a unique key for each pay period based on start and end dates
    const startDate = paystub.payPeriodStartDate ? new Date(paystub.payPeriodStartDate).toISOString().split('T')[0] : 'unknown-start';
    const endDate = paystub.payPeriodEndDate ? new Date(paystub.payPeriodEndDate).toISOString().split('T')[0] : 'unknown-end';
    const payPeriodKey = `${startDate}_${endDate}`;
    
    // Sum amounts for the same pay period
    const currentAmount = payPeriodGroups.get(payPeriodKey) || 0;
    payPeriodGroups.set(payPeriodKey, currentAmount + paystub.grossPayAmount);
  }
  
  // Calculate average gross pay from pay period totals (not individual paystubs)
  const payPeriodTotals = Array.from(payPeriodGroups.values());
  const totalGrossPay = payPeriodTotals.reduce((acc, total) => acc + total, 0);
  const averageGrossPay = totalGrossPay / payPeriodTotals.length;
  
  console.log(`[PAYSTUB ANALYSIS] Grouped ${processedPaystubs.length} paystubs into ${payPeriodTotals.length} pay periods:`, 
    Array.from(payPeriodGroups.entries()).map(([key, amount]) => ({ period: key, amount })));

  // Get the multiplier for annualization
  const multiplier = FREQUENCY_MULTIPLIERS[payFrequency] || FREQUENCY_MULTIPLIERS.BI_WEEKLY; // Default to bi-weekly
  const annualizedIncome = averageGrossPay * multiplier;

  return { 
    annualizedIncome, 
    payFrequency: uploadFrequency as any // Return in upload format for consistency
  };
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
 * Calculate total verified income from income documents using correct business logic
 */
export function calculateTotalVerifiedIncome(incomeDocuments: IncomeDocument[]): number {
  const verifiedDocuments = incomeDocuments.filter(d => d.status === 'COMPLETED');
  
  // Group documents by type
  const w2Documents = verifiedDocuments.filter(d => d.documentType === 'W2');
  const paystubDocuments = verifiedDocuments.filter(d => d.documentType === 'PAYSTUB');
  const otherDocuments = verifiedDocuments.filter(d => d.documentType !== 'W2' && d.documentType !== 'PAYSTUB');
  
  // Calculate W2 income - take highest of boxes 1, 3, 5
  const w2Income = w2Documents.reduce((acc, doc) => {
    const box1 = doc.box1_wages || 0;
    const box3 = doc.box3_ss_wages || 0;
    const box5 = doc.box5_med_wages || 0;
    const highestAmount = Math.max(Number(box1), Number(box3), Number(box5));
    return acc + highestAmount;
  }, 0);
  
  // Calculate paystub income - group by pay period, sum amounts, then average and annualize
  let paystubIncome = 0;
  if (paystubDocuments.length > 0) {
    // Group paystubs by pay period and sum amounts within same period
    const payPeriodGroups = new Map<string, number>();
    
    for (const doc of paystubDocuments) {
      const grossPayAmount = doc.grossPayAmount ? Number(doc.grossPayAmount) : 0;
      const startDate = doc.payPeriodStartDate ? new Date(doc.payPeriodStartDate).toISOString().split('T')[0] : 'unknown-start';
      const endDate = doc.payPeriodEndDate ? new Date(doc.payPeriodEndDate).toISOString().split('T')[0] : 'unknown-end';
      const payPeriodKey = `${startDate}_${endDate}`;
      
      const currentAmount = payPeriodGroups.get(payPeriodKey) || 0;
      payPeriodGroups.set(payPeriodKey, currentAmount + grossPayAmount);
    }
    
    // Calculate average gross pay from pay period totals (not individual paystubs)
    const payPeriodTotals = Array.from(payPeriodGroups.values());
    const totalGrossPay = payPeriodTotals.reduce((acc, total) => acc + total, 0);
    const averageGrossPay = totalGrossPay / payPeriodTotals.length;
    
    // Get pay frequency from any paystub (should be the same for all from same resident)
    const payFrequency = paystubDocuments[0]?.payFrequency || 'BI-WEEKLY';
    
    // Convert to annual based on frequency
    const frequencyMultipliers: { [key: string]: number } = {
      'WEEKLY': 52,
      'BI-WEEKLY': 26,
      'SEMI-MONTHLY': 24, // Twice a month
      'MONTHLY': 12,
      'YEARLY': 1
    };
    
    const multiplier = frequencyMultipliers[payFrequency] || 26; // Default to bi-weekly
    paystubIncome = averageGrossPay * multiplier;
  }
  
  // Calculate other income types (use existing calculatedAnnualizedIncome)
  const otherIncome = otherDocuments
    .filter(d => d.calculatedAnnualizedIncome)
    .reduce((acc, d) => acc + Number(d.calculatedAnnualizedIncome!), 0);

  return w2Income + paystubIncome + otherIncome;
}

/**
 * Calculate comprehensive AMI bucket information for a lease
 */
export function calculateAmiBucketForLease(
  residents: Resident[],
  incomeDocuments: IncomeDocument[],
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