const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function fixManualFutureLeasesWithoutTenancy() {
  console.log('🔧 Fixing manually created future leases without Tenancy records...');
  
  try {
    // Find leases without Tenancy records
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
        Unit: {
          select: {
            id: true,
            unitNumber: true,
            propertyId: true,
            Property: {
              select: {
                name: true
              }
            }
          }
        }
      }
    });

    console.log(`📋 Found ${leasesWithoutTenancy.length} leases to fix`);

    if (leasesWithoutTenancy.length === 0) {
      console.log('✅ No leases need fixing!');
      return;
    }

    // Group leases by property
    const leasesByProperty = new Map();
    leasesWithoutTenancy.forEach(lease => {
      const propertyId = lease.Unit?.propertyId;
      if (propertyId) {
        if (!leasesByProperty.has(propertyId)) {
          leasesByProperty.set(propertyId, []);
        }
        leasesByProperty.get(propertyId).push(lease);
      }
    });

    console.log(`\n📊 Properties with leases to fix: ${leasesByProperty.size}`);

    // Ask for confirmation before proceeding
    const readline = require('readline');
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    const answer = await new Promise((resolve) => {
      rl.question('Do you want to proceed with creating Tenancy records for these leases? (y/N): ', resolve);
    });
    rl.close();

    if (answer.toLowerCase() !== 'y' && answer.toLowerCase() !== 'yes') {
      console.log('❌ Operation cancelled');
      return;
    }

    let fixedCount = 0;

    // Process each property
    for (const [propertyId, leases] of leasesByProperty) {
      console.log(`\n🏠 Processing property: ${leases[0].Unit?.Property?.name}`);
      
      // Find the most recent rent roll for this property
      const mostRecentRentRoll = await prisma.rentRoll.findFirst({
        where: { propertyId },
        orderBy: { uploadDate: 'desc' },
        select: { id: true, uploadDate: true, filename: true }
      });

      if (!mostRecentRentRoll) {
        console.log(`❌ No rent roll found for property ${leases[0].Unit?.Property?.name}`);
        continue;
      }

      console.log(`📄 Using rent roll: ${mostRecentRentRoll.filename} (${mostRecentRentRoll.uploadDate})`);

      // Create Tenancy records for each lease
      for (const lease of leases) {
        try {
          const { randomUUID } = require('crypto');
          
          const tenancy = await prisma.tenancy.create({
            data: {
              id: randomUUID(),
              rentRollId: mostRecentRentRoll.id,
              leaseId: lease.id,
              updatedAt: new Date()
            }
          });

          console.log(`✅ Created Tenancy record for ${lease.name} (Unit ${lease.Unit?.unitNumber})`);
          fixedCount++;
        } catch (error) {
          console.error(`❌ Failed to create Tenancy for ${lease.name}:`, error.message);
        }
      }
    }

    console.log(`\n🎉 Successfully created Tenancy records for ${fixedCount} leases!`);
    console.log('These leases should now show consistent status between property summary and unit detail pages.');

  } catch (error) {
    console.error('❌ Error fixing manual future leases:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the script
fixManualFutureLeasesWithoutTenancy();
