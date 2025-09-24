const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function findUnit112() {
  console.log('🔍 Searching for Unit 112 with different patterns...');
  
  try {
    // Try different unit number formats
    const searchPatterns = ['112', '0112', '1120'];
    
    for (const pattern of searchPatterns) {
      console.log(`\n🔍 Searching for unit number: "${pattern}"`);
      
      const units = await prisma.unit.findMany({
        where: {
          unitNumber: pattern
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

      if (units.length > 0) {
        console.log(`✅ Found ${units.length} unit(s) with number "${pattern}"`);
        
        units.forEach((unit, unitIndex) => {
          console.log(`\n📋 Unit ${unitIndex + 1}: ${unit.unitNumber} (ID: ${unit.id})`);
          console.log(`   - Leases: ${unit.Lease.length}`);
          
          unit.Lease.forEach((lease, leaseIndex) => {
            console.log(`   🏠 Lease ${leaseIndex + 1}: ${lease.name}`);
            console.log(`      - ID: ${lease.id}`);
            console.log(`      - Created: ${lease.createdAt}`);
            console.log(`      - Has Tenancy: ${lease.Tenancy ? 'Yes' : 'No'}`);
            console.log(`      - Residents: ${lease.Resident.length}`);
            console.log(`      - Verifications: ${lease.IncomeVerification.length}`);
            
            if (lease.IncomeVerification.length > 0) {
              const verification = lease.IncomeVerification[0];
              console.log(`      - Verification Status: ${verification.status}`);
            }
          });
        });
      } else {
        console.log(`❌ No units found with number "${pattern}"`);
      }
    }

    // Also search by lease name containing "112"
    console.log(`\n🔍 Searching for leases containing "112" in name...`);
    const leasesWithUnit112 = await prisma.lease.findMany({
      where: {
        name: {
          contains: '112'
        }
      },
      include: {
        Unit: true,
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
    });

    if (leasesWithUnit112.length > 0) {
      console.log(`✅ Found ${leasesWithUnit112.length} lease(s) with "112" in name`);
      
      leasesWithUnit112.forEach((lease, index) => {
        console.log(`\n🏠 Lease ${index + 1}: ${lease.name}`);
        console.log(`   - Unit: ${lease.Unit?.unitNumber} (ID: ${lease.Unit?.id})`);
        console.log(`   - Lease ID: ${lease.id}`);
        console.log(`   - Residents: ${lease.Resident.length}`);
        console.log(`   - Verifications: ${lease.IncomeVerification.length}`);
        
        if (lease.IncomeVerification.length > 0) {
          const verification = lease.IncomeVerification[0];
          console.log(`   - Verification Status: ${verification.status}`);
        }
      });
    }

  } catch (error) {
    console.error('❌ Error searching for Unit 112:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the script
findUnit112();
