const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function findNewLease() {
  try {
    const newLeaseId = '860286ba-12fd-40f2-9130-3f029fcef8d0';
    const newResidentId = 'a3627a5c-06e0-4d09-a851-bddd31f53f44';
    
    console.log('🔍 Checking the NEW lease that was created...');
    console.log('New Lease ID:', newLeaseId);
    console.log('New Resident ID:', newResidentId);
    
    // Check the new lease
    const newLease = await prisma.lease.findUnique({
      where: { id: newLeaseId },
      include: {
        Resident: {
          include: {
            IncomeDocument: true
          }
        },
        IncomeVerification: true,
        Unit: true
      }
    });
    
    if (!newLease) {
      console.log('❌ New lease not found');
      return;
    }
    
    console.log(`\nNew Lease: ${newLease.name}`);
    console.log(`Unit: ${newLease.Unit.unitNumber}`);
    console.log(`Residents: ${newLease.Resident.length}`);
    console.log(`Income Verifications: ${newLease.IncomeVerification.length}`);
    
    newLease.Resident.forEach((resident, index) => {
      console.log(`\nResident ${index + 1}: ${resident.name}`);
      console.log(`  ID: ${resident.id}`);
      console.log(`  incomeFinalized: ${resident.incomeFinalized}`);
      console.log(`  hasNoIncome: ${resident.hasNoIncome}`);
      console.log(`  verifiedIncome: ${resident.verifiedIncome}`);
      console.log(`  calculatedAnnualizedIncome: ${resident.calculatedAnnualizedIncome}`);
      console.log(`  Documents: ${resident.IncomeDocument.length}`);
      
      resident.IncomeDocument.forEach((doc, docIndex) => {
        console.log(`    Doc ${docIndex + 1}: ${doc.documentType} - ${doc.status}`);
        console.log(`      grossPayAmount: ${doc.grossPayAmount}`);
        console.log(`      calculatedAnnualizedIncome: ${doc.calculatedAnnualizedIncome}`);
      });
    });
    
    newLease.IncomeVerification.forEach((verification, index) => {
      console.log(`\nVerification ${index + 1}:`);
      console.log(`  ID: ${verification.id}`);
      console.log(`  Status: ${verification.status}`);
      console.log(`  calculatedVerifiedIncome: ${verification.calculatedVerifiedIncome}`);
      console.log(`  finalizedAt: ${verification.finalizedAt}`);
    });
    
    // Test the verification service logic for the NEW lease
    console.log('\n🧪 Testing verification service logic for NEW lease:');
    const finalizedResidents = newLease.Resident.filter(r => r.incomeFinalized || r.hasNoIncome);
    console.log(`Finalized residents count: ${finalizedResidents.length}`);
    console.log(`Total residents count: ${newLease.Resident.length}`);
    console.log(`All residents finalized: ${finalizedResidents.length === newLease.Resident.length}`);
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

findNewLease();
