const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function cleanupStuckDocuments() {
  console.log('🔍 Starting cleanup of stuck PROCESSING documents...');
  
  try {
    // Find documents stuck in PROCESSING for more than 5 minutes
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    
    const stuckDocuments = await prisma.incomeDocument.findMany({
      where: {
        status: 'PROCESSING',
        uploadDate: {
          lt: fiveMinutesAgo
        }
      },
      include: {
        Resident: { select: { name: true } },
        IncomeVerification: {
          include: {
            Lease: { select: { name: true } }
          }
        }
      }
    });
    
    console.log(`📄 Found ${stuckDocuments.length} stuck documents:`);
    
    if (stuckDocuments.length === 0) {
      console.log('✅ No stuck documents found!');
      return;
    }
    
    // Show details of stuck documents
    stuckDocuments.forEach(doc => {
      console.log(`  - ${doc.id.substring(0, 8)}: ${doc.documentType} for ${doc.Resident?.name} (${doc.uploadDate})`);
    });
    
    // Update stuck documents to NEEDS_REVIEW status
    const result = await prisma.incomeDocument.updateMany({
      where: {
        status: 'PROCESSING',
        uploadDate: {
          lt: fiveMinutesAgo
        }
      },
      data: {
        status: 'NEEDS_REVIEW'
      }
    });
    
    console.log(`✅ Fixed ${result.count} stuck documents - marked as NEEDS_REVIEW for admin attention`);
    console.log('🎉 Cleanup complete! Polling loops should stop now.');
    
  } catch (error) {
    console.error('❌ Error during cleanup:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the cleanup
cleanupStuckDocuments().catch(console.error); 