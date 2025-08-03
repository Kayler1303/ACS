#!/usr/bin/env node

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function fixIncorrectAcceptVerifiedIncome() {
  console.log('🔍 Finding residents with incorrect income from flawed "accept verified income" functionality...\n');

  try {
    // Find residents who have calculatedAnnualizedIncome that doesn't match their individual documents
    const allResidents = await prisma.resident.findMany({
      where: {
        incomeFinalized: true,
        calculatedAnnualizedIncome: { gt: 0 } // Has some calculated income
      },
      include: {
        IncomeDocument: {
          where: {
            status: { in: ['COMPLETED', 'NEEDS_REVIEW'] }
          }
        },
        Lease: {
          include: {
            Resident: {
              select: {
                id: true,
                name: true,
                calculatedAnnualizedIncome: true,
                incomeFinalized: true
              }
            }
          }
        }
      }
    });

    console.log(`Checking ${allResidents.length} residents with finalized income...\n`);

    let fixedCount = 0;

    for (const resident of allResidents) {
      const documents = resident.IncomeDocument;
      if (documents.length === 0) {
        // Skip residents with no documents
        continue;
      }

      // Calculate what their income SHOULD be based on their individual documents
      let correctCalculatedIncome = 0;
      
      // Separate documents by type
      const paystubs = documents.filter(doc => doc.documentType === 'PAYSTUB');
      const w2s = documents.filter(doc => doc.documentType === 'W2');
      
      // Calculate paystub income using average method
      if (paystubs.length > 0) {
        const validPaystubs = paystubs.filter(p => p.grossPayAmount && Number(p.grossPayAmount) > 0);
        if (validPaystubs.length > 0) {
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
          correctCalculatedIncome += averageGrossPay * multiplier;
        }
      }
      
      // Add W2 income (highest of boxes 1, 3, 5)
      w2s.forEach(w2 => {
        const box1 = Number(w2.box1_wages || 0);
        const box3 = Number(w2.box3_ss_wages || 0);
        const box5 = Number(w2.box5_med_wages || 0);
        const highestAmount = Math.max(box1, box3, box5);
        correctCalculatedIncome += highestAmount;
      });

      const currentIncome = Number(resident.calculatedAnnualizedIncome || 0);
      const difference = Math.abs(correctCalculatedIncome - currentIncome);

      // If there's a significant difference (more than $1000), it's likely wrong
      if (difference > 1000) {
        console.log(`🔧 Fixing ${resident.name}:`);
        console.log(`   Current Income: $${currentIncome.toLocaleString()}`);
        console.log(`   Correct Income: $${correctCalculatedIncome.toLocaleString()}`);
        console.log(`   Difference: $${difference.toLocaleString()}`);
        console.log(`   Documents: ${paystubs.length} paystubs, ${w2s.length} W2s`);

        // Update the resident's income to the correct calculated amount
        await prisma.resident.update({
          where: { id: resident.id },
          data: {
            calculatedAnnualizedIncome: correctCalculatedIncome,
            verifiedIncome: correctCalculatedIncome,
            annualizedIncome: correctCalculatedIncome // Also update rent roll to match
          }
        });
        
        console.log(`   ✅ Fixed ${resident.name}: $${correctCalculatedIncome.toLocaleString()}\n`);
        fixedCount++;
      } else {
        console.log(`✅ ${resident.name}: Income looks correct ($${currentIncome.toLocaleString()})`);
      }
    }

    console.log(`\n🎉 Completed! Fixed ${fixedCount} residents with incorrect income calculations.`);

    if (fixedCount > 0) {
      console.log(`\n📝 Note: You may want to refresh any open browser pages to see the updated income amounts.`);
    }

  } catch (error) {
    console.error('❌ Error fixing incorrect accept verified income:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the script
if (require.main === module) {
  fixIncorrectAcceptVerifiedIncome();
}

module.exports = { fixIncorrectAcceptVerifiedIncome }; 