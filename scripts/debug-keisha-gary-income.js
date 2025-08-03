#!/usr/bin/env node

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function debugKeishaGaryIncome() {
  console.log('🔍 Debugging Keisha Gary\'s income calculation...\n');

  try {
    // Find Keisha Gary
    const keisha = await prisma.resident.findFirst({
      where: {
        name: { contains: 'Keisha Gary', mode: 'insensitive' }
      },
      include: {
        IncomeDocument: {
          orderBy: {
            uploadDate: 'desc'
          }
        },
        Lease: {
          include: {
            Resident: {
              select: {
                id: true,
                name: true,
                annualizedIncome: true,
                calculatedAnnualizedIncome: true,
                incomeFinalized: true
              }
            }
          }
        }
      }
    });

    if (!keisha) {
      console.log('❌ Keisha Gary not found');
      return;
    }

    console.log(`👩 Found: ${keisha.name} (ID: ${keisha.id})`);
    console.log(`📊 Current Data:`);
    console.log(`   - Rent Roll Income (annualizedIncome): $${Number(keisha.annualizedIncome || 0).toLocaleString()}`);
    console.log(`   - Calculated Income (calculatedAnnualizedIncome): $${Number(keisha.calculatedAnnualizedIncome || 0).toLocaleString()}`);
    console.log(`   - Verified Income (verifiedIncome): $${Number(keisha.verifiedIncome || 0).toLocaleString()}`);
    console.log(`   - Income Finalized: ${keisha.incomeFinalized}`);
    console.log(`   - Has No Income: ${keisha.hasNoIncome}\n`);

    console.log(`📄 Documents (${keisha.IncomeDocument.length} total):`);
    keisha.IncomeDocument.forEach((doc, index) => {
      console.log(`   ${index + 1}. ${doc.documentType} (Status: ${doc.status})`);
      if (doc.documentType === 'PAYSTUB') {
        console.log(`      - Employee: ${doc.employeeName || 'N/A'}`);
        console.log(`      - Employer: ${doc.employerName || 'N/A'}`);
        console.log(`      - Gross Pay: $${Number(doc.grossPayAmount || 0).toFixed(2)}`);
        console.log(`      - Pay Frequency: ${doc.payFrequency || 'N/A'}`);
        console.log(`      - Pay Period: ${doc.payPeriodStartDate ? new Date(doc.payPeriodStartDate).toDateString() : 'N/A'} to ${doc.payPeriodEndDate ? new Date(doc.payPeriodEndDate).toDateString() : 'N/A'}`);
        console.log(`      - Calculated Annual: $${Number(doc.calculatedAnnualizedIncome || 0).toLocaleString()}`);
      } else if (doc.documentType === 'W2') {
        console.log(`      - Employee: ${doc.employeeName || 'N/A'}`);
        console.log(`      - Employer: ${doc.employerName || 'N/A'}`);
        console.log(`      - Box 1 Wages: $${Number(doc.box1_wages || 0).toLocaleString()}`);
        console.log(`      - Box 3 SS Wages: $${Number(doc.box3_ss_wages || 0).toLocaleString()}`);
        console.log(`      - Box 5 Med Wages: $${Number(doc.box5_med_wages || 0).toLocaleString()}`);
        console.log(`      - Tax Year: ${doc.taxYear || 'N/A'}`);
      }
      console.log('');
    });

    // Calculate what her income SHOULD be
    console.log(`🧮 Manual Income Calculation:`);
    
    let correctCalculatedIncome = 0;
    const completedDocs = keisha.IncomeDocument.filter(doc => doc.status === 'COMPLETED');
    
    console.log(`   Using ${completedDocs.length} COMPLETED documents:`);
    
    // Calculate paystub income
    const paystubs = completedDocs.filter(doc => doc.documentType === 'PAYSTUB');
    if (paystubs.length > 0) {
      const validPaystubs = paystubs.filter(p => p.grossPayAmount && Number(p.grossPayAmount) > 0);
      
      if (validPaystubs.length > 0) {
        console.log(`   📊 Paystub Calculation:`);
        
        validPaystubs.forEach((p, i) => {
          console.log(`      ${i + 1}. $${Number(p.grossPayAmount).toFixed(2)} (${p.payFrequency})`);
        });
        
        const totalGrossPay = validPaystubs.reduce((acc, p) => acc + Number(p.grossPayAmount || 0), 0);
        const averageGrossPay = totalGrossPay / validPaystubs.length;
        const payFrequency = validPaystubs[0]?.payFrequency || 'BI-WEEKLY';
        
        const frequencyMultipliers = {
          'WEEKLY': 52,
          'BI-WEEKLY': 26,
          'SEMI-MONTHLY': 24,
          'MONTHLY': 12
        };
        
        const multiplier = frequencyMultipliers[payFrequency] || 26;
        const paystubIncome = averageGrossPay * multiplier;
        correctCalculatedIncome += paystubIncome;
        
        console.log(`      Total Gross Pay: $${totalGrossPay.toFixed(2)}`);
        console.log(`      Average Gross Pay: $${averageGrossPay.toFixed(2)}`);
        console.log(`      Pay Frequency: ${payFrequency} (multiplier: ${multiplier})`);
        console.log(`      Paystub Annual Income: $${paystubIncome.toLocaleString()}`);
      }
    }
    
    // Calculate W2 income
    const w2s = completedDocs.filter(doc => doc.documentType === 'W2');
    if (w2s.length > 0) {
      console.log(`   📄 W2 Calculation:`);
      w2s.forEach(w2 => {
        const box1 = Number(w2.box1_wages || 0);
        const box3 = Number(w2.box3_ss_wages || 0);
        const box5 = Number(w2.box5_med_wages || 0);
        const highestAmount = Math.max(box1, box3, box5);
        correctCalculatedIncome += highestAmount;
        
        console.log(`      Box 1: $${box1.toLocaleString()}, Box 3: $${box3.toLocaleString()}, Box 5: $${box5.toLocaleString()}`);
        console.log(`      Highest Amount: $${highestAmount.toLocaleString()}`);
      });
    }
    
    console.log(`\n   ✅ CORRECT Calculated Income: $${correctCalculatedIncome.toLocaleString()}`);
    console.log(`   ❌ CURRENT Calculated Income: $${Number(keisha.calculatedAnnualizedIncome || 0).toLocaleString()}`);
    
    const difference = Math.abs(correctCalculatedIncome - Number(keisha.calculatedAnnualizedIncome || 0));
    console.log(`   🔍 Difference: $${difference.toLocaleString()}`);
    
    if (difference > 1) {
      console.log(`\n⚠️  CALCULATION MISMATCH DETECTED!`);
      console.log(`   The current calculatedAnnualizedIncome ($${Number(keisha.calculatedAnnualizedIncome || 0).toLocaleString()}) does not match`);
      console.log(`   the correct calculation ($${correctCalculatedIncome.toLocaleString()}) based on her documents.`);
    } else {
      console.log(`\n✅ Calculation looks correct!`);
    }

    // Show other residents in the lease for context
    console.log(`\n👥 Other residents in this lease:`);
    keisha.Lease.Resident.forEach(resident => {
      if (resident.id !== keisha.id) {
        console.log(`   - ${resident.name}: Rent Roll $${Number(resident.annualizedIncome || 0).toLocaleString()}, Calculated $${Number(resident.calculatedAnnualizedIncome || 0).toLocaleString()}, Finalized: ${resident.incomeFinalized}`);
      }
    });

  } catch (error) {
    console.error('❌ Error debugging Keisha Gary income:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the script
if (require.main === module) {
  debugKeishaGaryIncome();
}

module.exports = { debugKeishaGaryIncome }; 