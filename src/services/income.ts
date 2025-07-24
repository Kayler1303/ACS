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