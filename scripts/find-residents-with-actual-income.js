const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function findResidentsWithActualIncome() {
  console.log('🔍 Finding residents with actual income amounts...');
  
  try {
    // Find residents who have completed documents with calculatedAnnualizedIncome > 0
    const residentsWithIncome = await prisma.resident.findMany({
      where: {
        IncomeDocument: {
          some: {
            status: 'COMPLETED',
            calculatedAnnualizedIncome: { gt: 0 }
          }
        }
      },
      include: {
        IncomeDocument: {
          where: {
            status: 'COMPLETED'
          }
        },
        Lease: {
          include: {
            Unit: true
          }
        }
      }
    });

    console.log(`📋 Found ${residentsWithIncome.length} residents with actual income documents`);

    if (residentsWithIncome.length === 0) {
      console.log('✅ No residents with actual income found!');
      return;
    }

    // Display the residents
    console.log('\n📝 Residents with actual income:');
    residentsWithIncome.forEach((resident, index) => {
      console.log(`${index + 1}. ${resident.name} (Unit ${resident.Lease?.Unit?.unitNumber})`);
      console.log(`   - Resident calculatedAnnualizedIncome: $${resident.calculatedAnnualizedIncome}`);
      console.log(`   - Resident verifiedIncome: $${resident.verifiedIncome || 0}`);
      console.log(`   - incomeFinalized: ${resident.incomeFinalized}`);
      
      resident.IncomeDocument.forEach((doc, docIndex) => {
        console.log(`   - Document ${docIndex + 1}: ${doc.documentType} - $${doc.calculatedAnnualizedIncome}`);
      });
      console.log('');
    });

  } catch (error) {
    console.error('❌ Error finding residents:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the script
findResidentsWithActualIncome();
