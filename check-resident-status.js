const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkResidentData() {
  try {
    console.log('🔍 Checking resident finalization status for units 202-205...\n');
    
    // Check a few units that should be verified but are showing as out of date
    const units = await prisma.unit.findMany({
      where: {
        unitNumber: {
          in: ['202', '203', '204', '205']
        }
      },
      include: {
        Lease: {
          include: {
            Resident: {
              include: {
                IncomeDocument: true
              }
            },
            Tenancy: true
          }
        }
      }
    });

    for (const unit of units) {
      console.log(`=== Unit ${unit.unitNumber} ===`);
      for (const lease of unit.Lease) {
        if (lease.Tenancy) {
          console.log(`Lease ${lease.id}:`);
          for (const resident of lease.Resident) {
            console.log(`  Resident ${resident.name}:`);
            console.log(`    incomeFinalized: ${resident.incomeFinalized}`);
            console.log(`    hasNoIncome: ${resident.hasNoIncome}`);
            console.log(`    calculatedAnnualizedIncome: ${resident.calculatedAnnualizedIncome}`);
            console.log(`    Documents: ${resident.IncomeDocument.length}`);
            resident.IncomeDocument.forEach(doc => {
              console.log(`      - ${doc.documentType}: ${doc.status} (uploaded: ${doc.uploadDate})`);
            });
          }
        }
      }
      console.log('');
    }
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkResidentData();
