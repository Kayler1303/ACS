const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function debugLeaseFinalization() {
  try {
    const leaseId = '1e39bbfc-b3ef-47db-bb11-c079e5c06c8e';
    
    console.log('🔍 Debugging lease finalization issue...');
    console.log('Lease ID:', leaseId);
    
    // Check the lease and its residents
    const lease = await prisma.lease.findUnique({
      where: { id: leaseId },
      include: {
        Resident: {
          include: {
            IncomeDocument: true
          }
        },
        IncomeVerification: true
      }
    });
    
    if (!lease) {
      console.log('❌ Lease not found');
      return;
    }
    
    console.log('\nLease:', lease.name);
    console.log('Residents:', lease.Resident.length);
    console.log('Income Verifications:', lease.IncomeVerification.length);
    
    lease.Resident.forEach((resident, index) => {
      console.log(`\nResident ${index + 1}: ${resident.name}`);
      console.log(`  ID: ${resident.id}`);
      console.log(`  incomeFinalized: ${resident.incomeFinalized}`);
      console.log(`  hasNoIncome: ${resident.hasNoIncome}`);
      console.log(`  verifiedIncome: ${resident.verifiedIncome}`);
      console.log(`  calculatedAnnualizedIncome: ${resident.calculatedAnnualizedIncome}`);
      console.log(`  Documents: ${resident.IncomeDocument.length}`);
      
      // Check if this resident should be considered finalized
      const isFinalized = resident.incomeFinalized || resident.hasNoIncome;
      console.log(`  Should be considered finalized: ${isFinalized}`);
    });
    
    lease.IncomeVerification.forEach((verification, index) => {
      console.log(`\nVerification ${index + 1}:`);
      console.log(`  ID: ${verification.id}`);
      console.log(`  Status: ${verification.status}`);
      console.log(`  calculatedVerifiedIncome: ${verification.calculatedVerifiedIncome}`);
      console.log(`  finalizedAt: ${verification.finalizedAt}`);
    });
    
    // Test the verification service logic
    console.log('\n🧪 Testing verification service logic:');
    const finalizedResidents = lease.Resident.filter(r => r.incomeFinalized || r.hasNoIncome);
    console.log(`Finalized residents count: ${finalizedResidents.length}`);
    console.log(`Total residents count: ${lease.Resident.length}`);
    console.log(`All residents finalized: ${finalizedResidents.length === lease.Resident.length}`);
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

debugLeaseFinalization();
