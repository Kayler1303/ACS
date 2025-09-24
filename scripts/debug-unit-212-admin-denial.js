const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function debugUnit212AdminDenial() {
  console.log('🔍 Debugging Unit 212 admin denial and document upload issue...');
  
  try {
    // Find Unit 212 (try different formats)
    const searchPatterns = ['212', '0212'];
    let unit212 = null;
    
    for (const pattern of searchPatterns) {
      const units = await prisma.unit.findMany({
        where: {
          unitNumber: pattern
        },
        include: {
          Lease: {
            include: {
              Resident: {
                include: {
                  IncomeDocument: {
                    orderBy: {
                      uploadDate: 'desc'
                    }
                  }
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
        unit212 = units[0];
        console.log(`✅ Found Unit ${pattern}`);
        break;
      }
    }

    if (!unit212) {
      console.log('❌ Unit 212 not found');
      return;
    }

    console.log(`📋 Unit ${unit212.unitNumber} has ${unit212.Lease.length} leases`);

    // Look for recent leases and their documents
    unit212.Lease.forEach((lease, leaseIndex) => {
      console.log(`\n🏠 Lease ${leaseIndex + 1}: ${lease.name}`);
      console.log(`   - Lease ID: ${lease.id}`);
      console.log(`   - Created: ${lease.createdAt}`);
      console.log(`   - Has Tenancy: ${lease.Tenancy ? 'Yes' : 'No'}`);
      console.log(`   - Residents: ${lease.Resident.length}`);
      console.log(`   - Verifications: ${lease.IncomeVerification.length}`);
      
      if (lease.IncomeVerification.length > 0) {
        const verification = lease.IncomeVerification[0];
        console.log(`   - Verification Status: ${verification.status}`);
        console.log(`   - Verification ID: ${verification.id}`);
      }

      // Check for documents that were denied
      lease.Resident.forEach((resident, resIndex) => {
        console.log(`\n   👤 Resident ${resIndex + 1}: ${resident.name}`);
        console.log(`      - Resident ID: ${resident.id}`);
        console.log(`      - Documents: ${resident.IncomeDocument.length}`);
        
        resident.IncomeDocument.forEach((doc, docIndex) => {
          console.log(`      📄 Document ${docIndex + 1}:`);
          console.log(`         - ID: ${doc.id}`);
          console.log(`         - Type: ${doc.documentType}`);
          console.log(`         - Status: ${doc.status}`);
          console.log(`         - Upload Date: ${doc.uploadDate}`);
          console.log(`         - Verification ID: ${doc.verificationId}`);
        });
      });
    });

    // Check for recent override requests related to this unit
    console.log(`\n🔍 Checking for recent override requests for Unit ${unit212.unitNumber}...`);
    
    const overrideRequests = await prisma.overrideRequest.findMany({
      where: {
        Unit: {
          unitNumber: unit212.unitNumber
        }
      },
      orderBy: {
        createdAt: 'desc'
      },
      take: 10,
      include: {
        User_OverrideRequest_requesterIdToUser: {
          select: { name: true, email: true }
        },
        User_OverrideRequest_reviewerIdToUser: {
          select: { name: true, email: true }
        }
      }
    });

    console.log(`📋 Found ${overrideRequests.length} override requests for Unit ${unit212.unitNumber}`);
    
    overrideRequests.forEach((request, index) => {
      console.log(`\n📝 Override Request ${index + 1}:`);
      console.log(`   - ID: ${request.id}`);
      console.log(`   - Type: ${request.type}`);
      console.log(`   - Status: ${request.status}`);
      console.log(`   - Created: ${request.createdAt}`);
      console.log(`   - Reviewed: ${request.reviewedAt || 'Not reviewed'}`);
      console.log(`   - Requester: ${request.User_OverrideRequest_requesterIdToUser?.name || 'Unknown'}`);
      console.log(`   - Reviewer: ${request.User_OverrideRequest_reviewerIdToUser?.name || 'None'}`);
      console.log(`   - Document ID: ${request.documentId || 'N/A'}`);
      console.log(`   - User Explanation: ${request.userExplanation || 'N/A'}`);
      console.log(`   - Admin Notes: ${request.adminNotes || 'N/A'}`);
    });

  } catch (error) {
    console.error('❌ Error debugging Unit 212:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the script
debugUnit212AdminDenial();
