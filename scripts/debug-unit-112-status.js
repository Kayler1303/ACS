const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function debugUnit112Status() {
  console.log('🔍 Debugging Unit 112 status inconsistency...');
  
  try {
    // Find Unit 112 and its leases
    const unit112 = await prisma.unit.findFirst({
      where: {
        unitNumber: '112'
      },
      include: {
        Lease: {
          include: {
            Resident: {
              include: {
                IncomeDocument: true
              }
            },
            IncomeVerification: true,
            Tenancy: {
              include: {
                RentRoll: true
              }
            }
          }
        }
      }
    });

    if (!unit112) {
      console.log('❌ Unit 112 not found');
      return;
    }

    console.log(`📋 Found Unit 112 with ${unit112.Lease.length} leases`);

    // Focus on the future lease (the one showing inconsistency)
    const futureLeases = unit112.Lease.filter(lease => 
      !lease.name?.startsWith('[PROCESSED]') && 
      lease.name?.includes('August 2025 Renewal')
    );

    if (futureLeases.length === 0) {
      console.log('❌ No future lease found for Unit 112');
      return;
    }

    const futureLease = futureLeases[0];
    console.log(`\n🏠 Future Lease: ${futureLease.name}`);
    console.log(`   - Lease ID: ${futureLease.id}`);
    console.log(`   - Created: ${futureLease.createdAt}`);
    console.log(`   - Has Tenancy: ${futureLease.Tenancy ? 'Yes' : 'No'}`);
    console.log(`   - Income Verifications: ${futureLease.IncomeVerification.length}`);

    // Check verification status
    if (futureLease.IncomeVerification.length > 0) {
      const verification = futureLease.IncomeVerification[0];
      console.log(`\n📊 Income Verification:`);
      console.log(`   - ID: ${verification.id}`);
      console.log(`   - Status: ${verification.status}`);
      console.log(`   - Finalized At: ${verification.finalizedAt || 'Not finalized'}`);
      console.log(`   - Calculated Verified Income: $${verification.calculatedVerifiedIncome || 0}`);
    }

    console.log(`\n👥 Residents (${futureLease.Resident.length}):`);
    futureLease.Resident.forEach((resident, index) => {
      console.log(`   ${index + 1}. ${resident.name}`);
      console.log(`      - ID: ${resident.id}`);
      console.log(`      - annualizedIncome (rent roll): $${resident.annualizedIncome || 0}`);
      console.log(`      - verifiedIncome: $${resident.verifiedIncome || 0}`);
      console.log(`      - calculatedAnnualizedIncome: $${resident.calculatedAnnualizedIncome || 0}`);
      console.log(`      - incomeFinalized: ${resident.incomeFinalized}`);
      console.log(`      - hasNoIncome: ${resident.hasNoIncome}`);
      console.log(`      - Documents: ${resident.IncomeDocument.length}`);
      
      resident.IncomeDocument.forEach((doc, docIndex) => {
        console.log(`         - Doc ${docIndex + 1}: ${doc.documentType} - Status: ${doc.status} - Amount: $${doc.calculatedAnnualizedIncome || 0}`);
      });
    });

    // Calculate what the status should be
    const allResidents = futureLease.Resident;
    const finalizedResidents = allResidents.filter(r => r.incomeFinalized || r.hasNoIncome);
    const allFinalized = finalizedResidents.length === allResidents.length;
    
    console.log(`\n📈 Status Analysis:`);
    console.log(`   - Total Residents: ${allResidents.length}`);
    console.log(`   - Finalized Residents: ${finalizedResidents.length}`);
    console.log(`   - All Finalized: ${allFinalized}`);
    console.log(`   - Expected Status: ${allFinalized ? 'Verified' : 'In Progress'}`);

  } catch (error) {
    console.error('❌ Error debugging Unit 112:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the script
debugUnit112Status();
