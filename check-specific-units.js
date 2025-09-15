const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkSpecificUnits() {
  try {
    const propertyId = '0fa09a4b-174d-4525-90b5-1a55b1c171a7'; // First Jasmine Cove property
    
    console.log('🔍 Checking specific units for verification status...\n');
    
    // Get units that should have documents (from your screenshot: 202, 203, 204, 205)
    // But the units start with 0, so let's check 0202, 0203, etc.
    const units = await prisma.unit.findMany({
      where: {
        propertyId,
        unitNumber: {
          in: ['0202', '0203', '0204', '0205', '202', '203', '204', '205']
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
            Tenancy: true,
            IncomeVerification: true
          }
        }
      }
    });

    console.log(`Found ${units.length} units to check:\n`);

    for (const unit of units) {
      console.log(`=== Unit ${unit.unitNumber} ===`);
      
      // Find current lease (with tenancy)
      const currentLease = unit.Lease
        .filter(l => l.Tenancy)
        .sort((a, b) => new Date(b.Tenancy.createdAt).getTime() - new Date(a.Tenancy.createdAt).getTime())[0];

      if (!currentLease) {
        console.log('  ❌ No current lease found');
        continue;
      }

      console.log(`  Current Lease: ${currentLease.id}`);
      console.log(`  Residents: ${currentLease.Resident.length}`);
      
      let allFinalized = true;
      let hasDocuments = false;
      
      for (const resident of currentLease.Resident) {
        console.log(`    👤 ${resident.name}:`);
        console.log(`       incomeFinalized: ${resident.incomeFinalized}`);
        console.log(`       hasNoIncome: ${resident.hasNoIncome}`);
        console.log(`       calculatedAnnualizedIncome: ${resident.calculatedAnnualizedIncome}`);
        console.log(`       Documents: ${resident.IncomeDocument.length}`);
        
        if (resident.IncomeDocument.length > 0) {
          hasDocuments = true;
          resident.IncomeDocument.forEach((doc, i) => {
            console.log(`         ${i + 1}. ${doc.documentType}: ${doc.status} (${doc.uploadDate.toISOString().split('T')[0]})`);
          });
        }
        
        if (!resident.incomeFinalized && !resident.hasNoIncome) {
          allFinalized = false;
        }
      }

      // Check income verifications
      if (currentLease.IncomeVerification.length > 0) {
        console.log(`  Income Verifications: ${currentLease.IncomeVerification.length}`);
        currentLease.IncomeVerification.forEach((verification, i) => {
          console.log(`    ${i + 1}. Status: ${verification.status}, Created: ${verification.createdAt.toISOString().split('T')[0]}`);
        });
      }

      // Determine expected status
      console.log(`  📊 Analysis:`);
      console.log(`     Has documents: ${hasDocuments}`);
      console.log(`     All residents finalized: ${allFinalized}`);
      console.log(`     Expected status: ${allFinalized ? 'Verified' : 'Out of Date Income Documents'}`);

      console.log('');
    }

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkSpecificUnits();
