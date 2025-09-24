const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function fixAllMissingVerifiedIncome() {
  console.log('🔍 Finding residents with admin-approved documents but missing verifiedIncome...');
  
  try {
    // Find residents who have completed documents with income > 0 but resident verifiedIncome is 0 or null
    const residentsToFix = await prisma.resident.findMany({
      where: {
        incomeFinalized: true,
        OR: [
          { verifiedIncome: null },
          { verifiedIncome: 0 }
        ],
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

    console.log(`📋 Found ${residentsToFix.length} residents with missing verifiedIncome but have approved documents`);

    if (residentsToFix.length === 0) {
      console.log('✅ No residents need fixing!');
      return;
    }

    // Display the residents that will be fixed
    console.log('\n📝 Residents to be fixed:');
    residentsToFix.forEach((resident, index) => {
      const maxDocumentIncome = Math.max(...resident.IncomeDocument.map(doc => Number(doc.calculatedAnnualizedIncome) || 0));
      console.log(`${index + 1}. ${resident.name} (Unit ${resident.Lease?.Unit?.unitNumber})`);
      console.log(`   - Current verifiedIncome: $${resident.verifiedIncome || 0}`);
      console.log(`   - Max document income: $${maxDocumentIncome}`);
      console.log(`   - Documents: ${resident.IncomeDocument.length} completed`);
      resident.IncomeDocument.forEach((doc, docIndex) => {
        console.log(`     - ${doc.documentType}: $${doc.calculatedAnnualizedIncome}`);
      });
      console.log('');
    });

    // Ask for confirmation
    const readline = require('readline');
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    const answer = await new Promise((resolve) => {
      rl.question('Do you want to proceed with fixing these residents? (y/N): ', resolve);
    });
    rl.close();

    if (answer.toLowerCase() !== 'y' && answer.toLowerCase() !== 'yes') {
      console.log('❌ Operation cancelled');
      return;
    }

    // Fix each resident
    let fixedCount = 0;
    for (const resident of residentsToFix) {
      // Calculate the correct verified income (highest document amount)
      const maxDocumentIncome = Math.max(...resident.IncomeDocument.map(doc => Number(doc.calculatedAnnualizedIncome) || 0));
      
      await prisma.resident.update({
        where: { id: resident.id },
        data: {
          verifiedIncome: maxDocumentIncome,
          calculatedAnnualizedIncome: maxDocumentIncome
        }
      });

      console.log(`✅ Fixed ${resident.name}: Set verifiedIncome to $${maxDocumentIncome}`);
      fixedCount++;
    }

    console.log(`\n🎉 Successfully fixed ${fixedCount} residents!`);
    console.log('The income discrepancy modals should now show correct verified income amounts.');

  } catch (error) {
    console.error('❌ Error fixing residents:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the script
fixAllMissingVerifiedIncome();
