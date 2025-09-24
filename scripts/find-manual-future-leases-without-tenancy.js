const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function findManualFutureLeasesWithoutTenancy() {
  console.log('🔍 Finding manually created future leases without Tenancy records...');
  
  try {
    // Find leases that:
    // 1. Don't have Tenancy records (Tenancy: null)
    // 2. Are not marked as [PROCESSED]
    // 3. Have residents (indicating they were manually created, not just empty)
    const leasesWithoutTenancy = await prisma.lease.findMany({
      where: {
        Tenancy: null,
        NOT: {
          name: {
            startsWith: '[PROCESSED]'
          }
        },
        Resident: {
          some: {} // Has at least one resident
        }
      },
      include: {
        Resident: {
          include: {
            IncomeDocument: true
          }
        },
        IncomeVerification: true,
        Unit: {
          select: {
            unitNumber: true,
            Property: {
              select: {
                name: true
              }
            }
          }
        }
      },
      orderBy: [
        { createdAt: 'desc' }
      ]
    });

    console.log(`📋 Found ${leasesWithoutTenancy.length} manually created future leases without Tenancy records`);

    if (leasesWithoutTenancy.length === 0) {
      console.log('✅ No manually created future leases found without Tenancy records!');
      return;
    }

    // Display the leases
    console.log('\n📝 Manually created future leases without Tenancy records:');
    leasesWithoutTenancy.forEach((lease, index) => {
      console.log(`${index + 1}. ${lease.name} (Unit ${lease.Unit?.unitNumber})`);
      console.log(`   - Property: ${lease.Unit?.Property?.name || 'Unknown'}`);
      console.log(`   - Lease ID: ${lease.id}`);
      console.log(`   - Created: ${lease.createdAt}`);
      console.log(`   - Residents: ${lease.Resident.length}`);
      console.log(`   - Verifications: ${lease.IncomeVerification.length}`);
      
      if (lease.IncomeVerification.length > 0) {
        const verification = lease.IncomeVerification[0];
        console.log(`   - Verification Status: ${verification.status}`);
        console.log(`   - Finalized At: ${verification.finalizedAt || 'Not finalized'}`);
      }
      
      // Check if all residents are finalized
      const finalizedResidents = lease.Resident.filter(r => r.incomeFinalized || r.hasNoIncome);
      const allFinalized = finalizedResidents.length === lease.Resident.length;
      console.log(`   - All Residents Finalized: ${allFinalized ? '✅' : '❌'} (${finalizedResidents.length}/${lease.Resident.length})`);
      
      console.log('');
    });

    // Also check for the most recent rent roll to assign these leases to
    console.log('\n🔍 Finding the most recent rent roll for each property...');
    
    const propertiesWithLeases = [...new Set(leasesWithoutTenancy.map(l => l.Unit?.Property?.name).filter(Boolean))];
    
    for (const propertyName of propertiesWithLeases) {
      const leasesForProperty = leasesWithoutTenancy.filter(l => l.Unit?.Property?.name === propertyName);
      
      if (leasesForProperty.length > 0) {
        const propertyId = leasesForProperty[0].Unit?.id ? 
          (await prisma.unit.findUnique({ where: { id: leasesForProperty[0].Unit.id }, select: { propertyId: true } }))?.propertyId 
          : null;
        
        if (propertyId) {
          const mostRecentRentRoll = await prisma.rentRoll.findFirst({
            where: { propertyId },
            orderBy: { uploadDate: 'desc' },
            select: { id: true, uploadDate: true, filename: true }
          });
          
          console.log(`📊 Property: ${propertyName}`);
          console.log(`   - Leases without Tenancy: ${leasesForProperty.length}`);
          console.log(`   - Most recent rent roll: ${mostRecentRentRoll?.filename || 'None'} (${mostRecentRentRoll?.uploadDate || 'N/A'})`);
          console.log(`   - Rent Roll ID: ${mostRecentRentRoll?.id || 'N/A'}`);
          console.log('');
        }
      }
    }

  } catch (error) {
    console.error('❌ Error finding manual future leases:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the script
findManualFutureLeasesWithoutTenancy();
