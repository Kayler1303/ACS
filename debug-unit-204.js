const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function debugUnit204() {
  try {
    console.log('🔍 Debugging Unit 204 specifically...\n');
    
    // Find Unit 204
    const unit = await prisma.unit.findFirst({
      where: {
        unitNumber: {
          in: ['204', '0204']
        }
      },
      include: {
        Property: {
          select: {
            id: true,
            name: true
          }
        },
        Lease: {
          include: {
            Resident: {
              include: {
                IncomeDocument: true
              }
            },
            Tenancy: {
              include: {
                RentRoll: {
                  select: {
                    id: true,
                    uploadDate: true
                  }
                }
              }
            },
            IncomeVerification: {
              include: {
                IncomeDocument: true
              }
            }
          }
        }
      }
    });

    if (!unit) {
      console.log('❌ Unit 204 not found');
      return;
    }

    console.log(`✅ Found Unit ${unit.unitNumber} in property: ${unit.Property.name}`);
    console.log(`   Property ID: ${unit.Property.id}`);
    console.log(`   Unit ID: ${unit.id}`);
    console.log(`   Total Leases: ${unit.Lease.length}\n`);

    // Check each lease
    for (const lease of unit.Lease) {
      console.log(`=== Lease: ${lease.name} ===`);
      console.log(`   Lease ID: ${lease.id}`);
      console.log(`   Start Date: ${lease.leaseStartDate}`);
      console.log(`   End Date: ${lease.leaseEndDate}`);
      console.log(`   Has Tenancy: ${!!lease.Tenancy}`);
      
      if (lease.Tenancy) {
        console.log(`   Rent Roll ID: ${lease.Tenancy.RentRoll.id}`);
        console.log(`   Rent Roll Date: ${lease.Tenancy.RentRoll.uploadDate}`);
      }
      
      console.log(`   Residents: ${lease.Resident.length}`);
      
      for (const resident of lease.Resident) {
        console.log(`     👤 ${resident.name}:`);
        console.log(`        ID: ${resident.id}`);
        console.log(`        Income Finalized: ${resident.incomeFinalized}`);
        console.log(`        Has No Income: ${resident.hasNoIncome}`);
        console.log(`        Documents: ${resident.IncomeDocument.length}`);
        
        for (const doc of resident.IncomeDocument) {
          console.log(`          📄 ${doc.documentType}: ${doc.status} (${doc.uploadDate.toISOString().split('T')[0]})`);
        }
      }
      
      console.log(`   Income Verifications: ${lease.IncomeVerification.length}`);
      for (const verification of lease.IncomeVerification) {
        console.log(`     🔍 Verification ${verification.id}: ${verification.status}`);
        console.log(`        Documents: ${verification.IncomeDocument.length}`);
        for (const doc of verification.IncomeDocument) {
          console.log(`          📄 ${doc.documentType}: ${doc.status} (Resident: ${doc.residentId})`);
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

debugUnit204();
