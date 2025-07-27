const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function testAutoOverrideFlow() {
  console.log('🧪 Testing Auto-Override Flow\n');

  try {
    // Find an admin user
    const admin = await prisma.user.findFirst({
      where: { role: 'ADMIN' }
    });

    if (!admin) {
      console.log('❌ No admin user found. Creating admin user first...');
      return;
    }

    console.log(`✅ Found admin user: ${admin.email}`);

    // Check for existing auto-override requests
    const existingRequests = await prisma.overrideRequest.findMany({
      where: {
        status: 'PENDING',
        OR: [
          { type: 'DOCUMENT_REVIEW' },
          { type: 'INCOME_DISCREPANCY' }
        ]
      },
      include: {
        requester: {
          select: { name: true, email: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    console.log(`\n📋 Current Auto-Override Requests (${existingRequests.length}):`);
    
    if (existingRequests.length === 0) {
      console.log('   No pending auto-override requests found');
    } else {
      existingRequests.forEach((request, index) => {
        console.log(`   ${index + 1}. ${request.type}: ${request.userExplanation.substring(0, 80)}...`);
        console.log(`      Requested by: ${request.requester.name} (${request.requester.email})`);
        console.log(`      Created: ${request.createdAt.toLocaleString()}`);
        console.log('');
      });
    }

    // Check for income documents with NEEDS_REVIEW status
    const needsReviewDocs = await prisma.incomeDocument.findMany({
      where: { status: 'NEEDS_REVIEW' },
      include: {
        resident: true,
        verification: {
          include: {
            lease: {
              include: {
                unit: true
              }
            }
          }
        }
      },
      take: 5
    });

    console.log(`\n📄 Income Documents Needing Review (${needsReviewDocs.length}):`);
    if (needsReviewDocs.length === 0) {
      console.log('   No documents currently marked as NEEDS_REVIEW');
    } else {
      needsReviewDocs.forEach((doc, index) => {
        console.log(`   ${index + 1}. ${doc.documentType} for ${doc.resident?.name || 'Unknown'}`);
        console.log(`      Unit: ${doc.verification?.lease?.unit?.unitNumber || 'Unknown'}`);
        console.log(`      Status: ${doc.status}`);
      });
    }

    // Check for units with income discrepancies (manual simulation)
    const leases = await prisma.lease.findMany({
      include: {
        residents: true,
        incomeVerifications: {
          where: { status: 'FINALIZED' },
          include: {
            incomeDocuments: {
              where: { status: 'COMPLETED' }
            }
          }
        },
        unit: true
      },
      take: 5
    });

    console.log(`\n🏠 Sample Units with Finalized Verifications (${leases.length}):`);
    leases.forEach((lease, index) => {
      const totalUploadedIncome = lease.residents.reduce((acc, r) => acc + (r.annualizedIncome || 0), 0);
      const finalizedVerification = lease.incomeVerifications.find(v => v.status === 'FINALIZED');
      const totalVerifiedIncome = finalizedVerification?.calculatedVerifiedIncome || 0;
      const discrepancy = Math.abs(totalUploadedIncome - totalVerifiedIncome);
      
      console.log(`   ${index + 1}. Unit ${lease.unit?.unitNumber || 'Unknown'}`);
      console.log(`      Uploaded Income: $${totalUploadedIncome.toLocaleString()}`);
      console.log(`      Verified Income: $${totalVerifiedIncome.toLocaleString()}`);
      console.log(`      Discrepancy: $${discrepancy.toFixed(2)} ${discrepancy > 1 ? '⚠️ (>$1)' : '✅'}`);
    });

    console.log('\n✅ Auto-Override Flow Test Complete!');
    console.log('\n🔧 How the system works:');
    console.log('   1. NEEDS_REVIEW documents automatically create DOCUMENT_REVIEW override requests');
    console.log('   2. Income discrepancies >$1 during finalization create INCOME_DISCREPANCY override requests');
    console.log('   3. Admin dashboard shows all pending requests for review');

  } catch (error) {
    console.error('❌ Error during auto-override flow test:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the test
testAutoOverrideFlow(); 