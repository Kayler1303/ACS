const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function debugVerificationIssue() {
  try {
    console.log('🔍 Debugging verification status issue...\n');
    
    // Get a specific property and check its verification status
    const property = await prisma.property.findFirst({
      where: {
        name: {
          contains: 'Apartment', // Adjust this to match your property name
          mode: 'insensitive'
        }
      }
    });

    if (!property) {
      console.log('❌ No property found');
      return;
    }

    console.log(`✅ Found property: ${property.name} (${property.id})\n`);

    // Get units 202-205 specifically
    const units = await prisma.unit.findMany({
      where: {
        propertyId: property.id,
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
      
      for (const resident of currentLease.Resident) {
        console.log(`    👤 ${resident.name}:`);
        console.log(`       incomeFinalized: ${resident.incomeFinalized}`);
        console.log(`       hasNoIncome: ${resident.hasNoIncome}`);
        console.log(`       calculatedAnnualizedIncome: ${resident.calculatedAnnualizedIncome}`);
        console.log(`       Documents: ${resident.IncomeDocument.length}`);
        
        if (resident.IncomeDocument.length > 0) {
          resident.IncomeDocument.forEach((doc, i) => {
            console.log(`         ${i + 1}. ${doc.documentType}: ${doc.status} (${doc.uploadDate.toISOString().split('T')[0]})`);
          });
        }
      }

      // Check income verifications
      if (currentLease.IncomeVerification.length > 0) {
        console.log(`  Income Verifications: ${currentLease.IncomeVerification.length}`);
        currentLease.IncomeVerification.forEach((verification, i) => {
          console.log(`    ${i + 1}. Status: ${verification.status}, Created: ${verification.createdAt.toISOString().split('T')[0]}`);
        });
      }

      console.log('');
    }

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

debugVerificationIssue();
