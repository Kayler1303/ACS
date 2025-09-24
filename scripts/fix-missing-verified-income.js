const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function fixMissingVerifiedIncome() {
  console.log('🔍 Finding residents with missing verifiedIncome but have calculatedAnnualizedIncome...');
  
  try {
    // Find residents who:
    // 1. Have calculatedAnnualizedIncome set (from admin approval)
    // 2. But verifiedIncome is null or 0
    // 3. Are marked as incomeFinalized
    const residentsToFix = await prisma.resident.findMany({
      where: {
        incomeFinalized: true,
        calculatedAnnualizedIncome: { not: null },
        OR: [
          { verifiedIncome: null },
          { verifiedIncome: 0 }
        ]
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

    console.log(`📋 Found ${residentsToFix.length} residents with missing verifiedIncome`);

    if (residentsToFix.length === 0) {
      console.log('✅ No residents need fixing!');
      return;
    }

    // Display the residents that will be fixed
    console.log('\n📝 Residents to be fixed:');
    residentsToFix.forEach((resident, index) => {
      console.log(`${index + 1}. ${resident.name} (Unit ${resident.Lease?.Unit?.unitNumber})`);
      console.log(`   - calculatedAnnualizedIncome: $${resident.calculatedAnnualizedIncome}`);
      console.log(`   - verifiedIncome: $${resident.verifiedIncome || 0}`);
      console.log(`   - Documents: ${resident.IncomeDocument.length} completed`);
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
      const calculatedIncome = Number(resident.calculatedAnnualizedIncome);
      
      await prisma.resident.update({
        where: { id: resident.id },
        data: {
          verifiedIncome: calculatedIncome
        }
      });

      console.log(`✅ Fixed ${resident.name}: Set verifiedIncome to $${calculatedIncome}`);
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
fixMissingVerifiedIncome();
