const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function debugUnit0112FutureLease() {
  console.log('🔍 Debugging Unit 0112 future lease status...');
  
  try {
    // Get the specific future lease
    const futureLease = await prisma.lease.findUnique({
      where: {
        id: '57b9b6e1-0ad7-4f5b-a84a-509312b65c06'
      },
      include: {
        Resident: {
          include: {
            IncomeDocument: true
          }
        },
        IncomeVerification: true,
        Tenancy: true,
        Unit: true
      }
    });

    if (!futureLease) {
      console.log('❌ Future lease not found');
      return;
    }

    console.log(`🏠 Future Lease: ${futureLease.name}`);
    console.log(`   - Lease ID: ${futureLease.id}`);
    console.log(`   - Unit: ${futureLease.Unit?.unitNumber}`);
    console.log(`   - Created: ${futureLease.createdAt}`);
    console.log(`   - Has Tenancy: ${futureLease.Tenancy ? 'Yes' : 'No'}`);
    console.log(`   - Lease Start Date: ${futureLease.leaseStartDate || 'N/A'}`);
    console.log(`   - Lease End Date: ${futureLease.leaseEndDate || 'N/A'}`);

    // Check verification details
    if (futureLease.IncomeVerification.length > 0) {
      const verification = futureLease.IncomeVerification[0];
      console.log(`\n📊 Income Verification:`);
      console.log(`   - ID: ${verification.id}`);
      console.log(`   - Status: ${verification.status}`);
      console.log(`   - Finalized At: ${verification.finalizedAt || 'Not finalized'}`);
      console.log(`   - Calculated Verified Income: $${verification.calculatedVerifiedIncome || 0}`);
    }

    console.log(`\n👥 Residents (${futureLease.Resident.length}):`);
    let allFinalized = true;
    
    futureLease.Resident.forEach((resident, index) => {
      const isFinalized = resident.incomeFinalized || resident.hasNoIncome;
      if (!isFinalized) allFinalized = false;
      
      console.log(`   ${index + 1}. ${resident.name}`);
      console.log(`      - ID: ${resident.id}`);
      console.log(`      - annualizedIncome (rent roll): $${resident.annualizedIncome || 0}`);
      console.log(`      - verifiedIncome: $${resident.verifiedIncome || 0}`);
      console.log(`      - calculatedAnnualizedIncome: $${resident.calculatedAnnualizedIncome || 0}`);
      console.log(`      - incomeFinalized: ${resident.incomeFinalized}`);
      console.log(`      - hasNoIncome: ${resident.hasNoIncome}`);
      console.log(`      - Is Finalized: ${isFinalized ? '✅' : '❌'}`);
      console.log(`      - Documents: ${resident.IncomeDocument.length}`);
      
      resident.IncomeDocument.forEach((doc, docIndex) => {
        console.log(`         - Doc ${docIndex + 1}: ${doc.documentType} - Status: ${doc.status} - Amount: $${doc.calculatedAnnualizedIncome || 0}`);
      });
    });

    console.log(`\n📈 Status Analysis:`);
    console.log(`   - Total Residents: ${futureLease.Resident.length}`);
    console.log(`   - All Residents Finalized: ${allFinalized ? '✅' : '❌'}`);
    console.log(`   - Verification Status: ${futureLease.IncomeVerification[0]?.status || 'No verification'}`);
    console.log(`   - Expected Unit Detail Status: ${allFinalized && futureLease.IncomeVerification[0]?.status === 'FINALIZED' ? 'Verified' : 'In Progress'}`);

  } catch (error) {
    console.error('❌ Error debugging Unit 0112 future lease:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the script
debugUnit0112FutureLease();
