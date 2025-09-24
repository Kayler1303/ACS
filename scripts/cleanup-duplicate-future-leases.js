#!/usr/bin/env node

/**
 * Cleanup Script: Mark Duplicate Future Leases as [PROCESSED]
 * 
 * Problem: Before our fix, the compliance update process created duplicate future leases
 * without marking the originals as [PROCESSED]. This script identifies and cleans up
 * those duplicates by marking older ones as [PROCESSED].
 * 
 * Strategy:
 * 1. Find all future leases (Tenancy = null, not already [PROCESSED])
 * 2. Group by unit + lease dates + resident names
 * 3. For each group with duplicates, keep the newest and mark others as [PROCESSED]
 * 4. Prioritize leases with FINALIZED income verifications
 */

const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function cleanupDuplicateFutureLeases() {
  console.log('🧹 [CLEANUP] Starting duplicate future lease cleanup...');
  
  try {
    // Get all leases (both current and future) that are not already processed
    const allLeases = await prisma.lease.findMany({
      where: {
        NOT: {
          name: {
            startsWith: '[PROCESSED]'
          }
        }
      },
      include: {
        Unit: {
          select: {
            id: true,
            unitNumber: true,
            propertyId: true
          }
        },
        Resident: {
          select: {
            id: true,
            name: true
          }
        },
        IncomeVerification: {
          select: {
            id: true,
            status: true,
            createdAt: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc' // Newest first
      }
    });

    console.log(`📊 [CLEANUP] Found ${allLeases.length} leases to analyze`);

    // Group leases by unit + dates + residents to find duplicates
    const leaseGroups = new Map();

    for (const lease of allLeases) {
      // Create a key based on unit, dates, and resident names
      const unitKey = `${lease.Unit.propertyId}-${lease.Unit.unitNumber}`;
      const dateKey = `${lease.leaseStartDate?.toISOString() || 'null'}-${lease.leaseEndDate?.toISOString() || 'null'}`;
      const residentKey = lease.Resident
        .map(r => r.name.toLowerCase().trim())
        .sort()
        .join('|');
      
      const groupKey = `${unitKey}:${dateKey}:${residentKey}`;
      
      if (!leaseGroups.has(groupKey)) {
        leaseGroups.set(groupKey, []);
      }
      
      leaseGroups.get(groupKey).push(lease);
    }

    console.log(`🔍 [CLEANUP] Grouped into ${leaseGroups.size} unique lease combinations`);

    let totalProcessed = 0;
    let duplicateGroups = 0;

    // Process each group
    for (const [groupKey, leases] of leaseGroups) {
      if (leases.length <= 1) {
        continue; // No duplicates
      }

      duplicateGroups++;
      console.log(`\n🔄 [CLEANUP] Processing duplicate group: ${groupKey}`);
      console.log(`📋 [CLEANUP] Found ${leases.length} duplicate leases:`);
      
      leases.forEach((lease, index) => {
        const hasFinalized = lease.IncomeVerification.some(v => v.status === 'FINALIZED');
        console.log(`  ${index + 1}. ${lease.name} (${lease.createdAt.toISOString()}) - ${hasFinalized ? 'FINALIZED' : 'NOT FINALIZED'}`);
      });

      // Sort leases by priority:
      // 1. Has FINALIZED income verification (higher priority)
      // 2. Most recent creation date (higher priority)
      const sortedLeases = leases.sort((a, b) => {
        const aHasFinalized = a.IncomeVerification.some(v => v.status === 'FINALIZED');
        const bHasFinalized = b.IncomeVerification.some(v => v.status === 'FINALIZED');
        
        // First priority: FINALIZED status
        if (aHasFinalized && !bHasFinalized) return -1;
        if (!aHasFinalized && bHasFinalized) return 1;
        
        // Second priority: Creation date (newest first)
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });

      // Keep the first (highest priority) lease, mark others as [PROCESSED]
      const leaseToKeep = sortedLeases[0];
      const leasesToProcess = sortedLeases.slice(1);

      console.log(`✅ [CLEANUP] Keeping: ${leaseToKeep.name} (${leaseToKeep.createdAt.toISOString()})`);
      
      for (const lease of leasesToProcess) {
        const processedName = `[PROCESSED] ${lease.name}`;
        
        await prisma.lease.update({
          where: { id: lease.id },
          data: {
            name: processedName,
            updatedAt: new Date()
          }
        });
        
        console.log(`🏷️  [CLEANUP] Marked as processed: ${processedName}`);
        totalProcessed++;
      }
    }

    console.log(`\n✅ [CLEANUP] Cleanup completed successfully!`);
    console.log(`📊 [CLEANUP] Summary:`);
    console.log(`   - Total leases analyzed: ${allLeases.length}`);
    console.log(`   - Duplicate groups found: ${duplicateGroups}`);
    console.log(`   - Leases marked as [PROCESSED]: ${totalProcessed}`);
    console.log(`   - Active leases remaining: ${allLeases.length - totalProcessed}`);

  } catch (error) {
    console.error('❌ [CLEANUP] Error during cleanup:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run the cleanup if this script is executed directly
if (require.main === module) {
  cleanupDuplicateFutureLeases()
    .then(() => {
      console.log('🎉 [CLEANUP] Script completed successfully!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 [CLEANUP] Script failed:', error);
      process.exit(1);
    });
}

module.exports = { cleanupDuplicateFutureLeases };
