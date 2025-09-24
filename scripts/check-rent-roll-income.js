const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function checkRentRollIncome() {
  console.log('🔍 Checking rent roll income for Unit 1002 residents...');
  
  try {
    // Find Unit 1002 and its residents
    const unit1002 = await prisma.unit.findFirst({
      where: {
        unitNumber: '1002'
      },
      include: {
        Lease: {
          include: {
            Resident: true,
            Tenancy: {
              include: {
                RentRoll: true
              }
            }
          }
        }
      }
    });

    if (!unit1002) {
      console.log('❌ Unit 1002 not found');
      return;
    }

    console.log(`📋 Found Unit 1002 with ${unit1002.Lease.length} leases`);

    unit1002.Lease.forEach((lease, leaseIndex) => {
      console.log(`\n🏠 Lease ${leaseIndex + 1}: ${lease.name}`);
      console.log(`   - Lease ID: ${lease.id}`);
      console.log(`   - Created: ${lease.createdAt}`);
      console.log(`   - Has Tenancy: ${lease.Tenancy ? 'Yes' : 'No'}`);
      
      if (lease.Tenancy) {
        console.log(`   - Rent Roll: ${lease.Tenancy.RentRoll?.uploadDate || 'N/A'}`);
      }

      console.log(`   - Residents (${lease.Resident.length}):`);
      lease.Resident.forEach((resident, resIndex) => {
        console.log(`     ${resIndex + 1}. ${resident.name}`);
        console.log(`        - ID: ${resident.id}`);
        console.log(`        - annualizedIncome (rent roll): $${resident.annualizedIncome || 0}`);
        console.log(`        - verifiedIncome: $${resident.verifiedIncome || 0}`);
        console.log(`        - calculatedAnnualizedIncome: $${resident.calculatedAnnualizedIncome || 0}`);
        console.log(`        - incomeFinalized: ${resident.incomeFinalized}`);
        console.log(`        - hasNoIncome: ${resident.hasNoIncome}`);
      });
    });

  } catch (error) {
    console.error('❌ Error checking rent roll income:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the script
checkRentRollIncome();
