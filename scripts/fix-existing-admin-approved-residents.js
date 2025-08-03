#!/usr/bin/env node

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function fixExistingAdminApprovedResidents() {
  console.log('🔍 Finding residents who were admin-approved but have $0 calculated income despite having documents...\n');

  try {
    // Find residents who are finalized but have $0 calculated income
    const problematicResidents = await prisma.resident.findMany({
      where: {
        incomeFinalized: true,
        OR: [
          { calculatedAnnualizedIncome: null },
          { calculatedAnnualizedIncome: 0 }
        ]
      },
      include: {
        IncomeDocument: {
          where: {
            status: { in: ['COMPLETED', 'NEEDS_REVIEW'] }
          }
        },
        Lease: {
          include: {
            IncomeVerification: {
              where: { status: 'IN_PROGRESS' },
              take: 1
            }
          }
        }
      }
    });

    console.log(`Found ${problematicResidents.length} residents with finalized income but $0 calculated income\n`);

    for (const resident of problematicResidents) {
      const documents = resident.IncomeDocument;
      if (documents.length === 0) {
        console.log(`⏭️  Skipping ${resident.name} (ID: ${resident.id}) - No documents found`);
        continue;
      }

      console.log(`🔧 Fixing ${resident.name} (ID: ${resident.id}) - Found ${documents.length} documents`);

      // Calculate income using the same logic as the admin approval fix
      let calculatedIncome = 0;
      
      // Separate documents by type
      const paystubs = documents.filter(doc => doc.documentType === 'PAYSTUB');
      const w2s = documents.filter(doc => doc.documentType === 'W2');
      
      // Calculate income from paystubs
      if (paystubs.length > 0) {
        const validPaystubs = paystubs.filter(p => p.grossPayAmount && Number(p.grossPayAmount) > 0);
        if (validPaystubs.length > 0) {
          const totalGrossPay = validPaystubs.reduce((acc, p) => acc + Number(p.grossPayAmount || 0), 0);
          const averageGrossPay = totalGrossPay / validPaystubs.length;
          
          // Get pay frequency
          const payFrequency = validPaystubs[0]?.payFrequency || 'WEEKLY';
          
          // Calculate annual multiplier
          const frequencyMultipliers = {
            'WEEKLY': 52,
            'BI-WEEKLY': 26, 
            'SEMI-MONTHLY': 24,
            'MONTHLY': 12
          };
          
          const multiplier = frequencyMultipliers[payFrequency] || 52;
          const paystubIncome = averageGrossPay * multiplier;
          calculatedIncome += paystubIncome;
          
          console.log(`   📊 Paystubs: ${validPaystubs.length} docs, avg $${averageGrossPay.toFixed(2)} ${payFrequency}, annual: $${paystubIncome.toFixed(2)}`);
        }
      }
      
      // Add income from W2s
      w2s.forEach(w2 => {
        const box1 = Number(w2.box1_wages || 0);
        const box3 = Number(w2.box3_ss_wages || 0);
        const box5 = Number(w2.box5_med_wages || 0);
        const highestAmount = Math.max(box1, box3, box5);
        calculatedIncome += highestAmount;
        
        if (highestAmount > 0) {
          console.log(`   📄 W2: Highest amount $${highestAmount.toFixed(2)} (Box1: $${box1}, Box3: $${box3}, Box5: $${box5})`);
        }
      });

      if (calculatedIncome > 0) {
        // Update the resident's calculated income
        await prisma.resident.update({
          where: { id: resident.id },
          data: {
            calculatedAnnualizedIncome: calculatedIncome,
            verifiedIncome: calculatedIncome
          }
        });
        
        console.log(`   ✅ Updated ${resident.name}: calculatedAnnualizedIncome = $${calculatedIncome.toFixed(2)}\n`);
      } else {
        console.log(`   ⚠️  No valid income found for ${resident.name} - keeping at $0\n`);
      }
    }

    console.log(`🎉 Completed fixing ${problematicResidents.length} residents!`);

  } catch (error) {
    console.error('❌ Error fixing residents:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the script
if (require.main === module) {
  fixExistingAdminApprovedResidents();
}

module.exports = { fixExistingAdminApprovedResidents }; 