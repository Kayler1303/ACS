const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function checkOverrides() {
  try {
    console.log('🔍 Checking override requests in database...\n');
    
    // Check all override requests
    const requests = await prisma.overrideRequest.findMany({
      include: {
        requester: { select: { id: true, name: true, email: true } }
      },
      orderBy: { createdAt: 'desc' }
    });

    console.log(`📋 Found ${requests.length} override request(s):\n`);
    
    if (requests.length === 0) {
      console.log('❌ No override requests found in database');
    } else {
      requests.forEach((request, index) => {
        console.log(`${index + 1}. ${request.type} - ${request.status}`);
        console.log(`   Created: ${request.createdAt}`);
        console.log(`   Requester: ${request.requester.name} (${request.requester.email})`);
        console.log(`   Unit ID: ${request.unitId || 'N/A'}`);
        console.log(`   Explanation: ${request.userExplanation}`);
        console.log('');
      });
    }

    console.log('\n🏠 Checking Unit 0101 (Jasmine Cove) specifically...\n');
    
    // Find unit 0101
    const unit0101 = await prisma.unit.findFirst({
      where: { 
        unitNumber: '0101',
        property: { name: 'Jasmine Cove' }
      },
      include: {
        property: { select: { name: true } },
        leases: {
          include: {
            residents: {
              include: {
                incomeDocuments: true
              }
            },
            tenancy: true
          }
        }
      }
    });

    if (!unit0101) {
      console.log('❌ Unit 0101 not found');
      return;
    }

    console.log(`✅ Found Unit 0101 in ${unit0101.property.name}`);
    console.log(`   Unit ID: ${unit0101.id}`);
    console.log(`   Total leases: ${unit0101.leases.length}`);
    
    // Check active lease
    const activeLease = unit0101.leases
      .filter(l => l.tenancy !== null)
      .sort((a, b) => new Date(b.tenancy.createdAt).getTime() - new Date(a.tenancy.createdAt).getTime())[0];
    
    if (activeLease) {
      console.log(`   Active lease: ${activeLease.id}`);
      console.log(`   Residents: ${activeLease.residents.length}`);
      
      activeLease.residents.forEach((resident, index) => {
        console.log(`   Resident ${index + 1}: ${resident.name} (income: $${resident.annualizedIncome || 0})`);
      });
      
      const allDocuments = activeLease.residents.flatMap(r => r.incomeDocuments);
      const completedDocs = allDocuments.filter(d => d.status === 'COMPLETED');
      const needsReviewDocs = allDocuments.filter(d => d.status === 'NEEDS_REVIEW');
      const processingDocs = allDocuments.filter(d => d.status === 'PROCESSING');
      
      console.log(`\n   📄 Document summary:`);
      console.log(`   - Total documents: ${allDocuments.length}`);
      console.log(`   - Completed: ${completedDocs.length}`);
      console.log(`   - Needs review: ${needsReviewDocs.length}`);
      console.log(`   - Processing: ${processingDocs.length}`);
      
      if (allDocuments.length > 0) {
        console.log(`\n   📋 All documents:`);
        allDocuments.forEach((doc, index) => {
          console.log(`   ${index + 1}. ${doc.documentType} - ${doc.status} (uploaded: ${doc.uploadDate.toISOString().split('T')[0]})`);
          if (doc.status === 'NEEDS_REVIEW') {
            console.log(`      ⚠️  This should have triggered an auto-override request!`);
          }
        });
      }
      
      // Calculate income totals like the verification system does
      const totalUploadedIncome = activeLease.residents.reduce((acc, r) => acc + (r.annualizedIncome || 0), 0);
      
      const w2Income = completedDocs
        .filter(d => d.documentType === 'W2')
        .reduce((acc, d) => acc + (d.box1_wages || 0), 0);
      
      const paystubDocs = completedDocs.filter(d => d.documentType === 'PAYSTUB' && d.calculatedAnnualizedIncome);
      const paystubIncome = paystubDocs.length > 0
        ? paystubDocs.reduce((acc, d) => acc + d.calculatedAnnualizedIncome, 0) / paystubDocs.length
        : 0;
      
      const otherIncome = completedDocs
        .filter(d => d.documentType !== 'W2' && d.documentType !== 'PAYSTUB' && d.calculatedAnnualizedIncome)
        .reduce((acc, d) => acc + d.calculatedAnnualizedIncome, 0);
      
      const totalVerifiedIncome = w2Income + paystubIncome + otherIncome;
      
      console.log(`\n   💰 Income comparison:`);
      console.log(`   - Uploaded income: $${totalUploadedIncome}`);
      console.log(`   - Verified income: $${totalVerifiedIncome}`);
      console.log(`   - Difference: $${Math.abs(totalUploadedIncome - totalVerifiedIncome)}`);
      
      if (completedDocs.length === 0) {
        console.log(`   📋 Status: "Out of Date Income Documents" (no completed docs)`);
      } else if (Math.abs(totalUploadedIncome - totalVerifiedIncome) > 1.00) {
        console.log(`   ⚠️  Status: "Needs Investigation" (income discrepancy > $1)`);
        console.log(`   🔴 This should have triggered an auto-override request!`);
      } else {
        console.log(`   ✅ Status: "Verified" (income matches within $1)`);
      }
    } else {
      console.log(`   📋 Status: "Vacant" (no active lease)`);
    }

    console.log('\n📄 Checking ALL documents that need review (not just recent)...\n');
    
    // Check for ALL NEEDS_REVIEW documents
    const allNeedsReviewDocs = await prisma.incomeDocument.findMany({
      where: { 
        status: 'NEEDS_REVIEW'
      },
      include: {
        verification: {
          include: {
            lease: {
              include: {
                unit: { select: { unitNumber: true, property: { select: { name: true } } } }
              }
            }
          }
        }
      },
      orderBy: { uploadDate: 'desc' },
      take: 10 // Just show the 10 most recent
    });

    console.log(`📋 Found ${allNeedsReviewDocs.length} documents needing review (showing latest 10):`);
    allNeedsReviewDocs.forEach((doc, index) => {
      const unit = doc.verification?.lease?.unit;
      console.log(`${index + 1}. ${doc.documentType} - ${doc.status}`);
      console.log(`   Unit: ${unit?.unitNumber || 'Unknown'} in ${unit?.property?.name || 'Unknown'}`);
      console.log(`   Uploaded: ${doc.uploadDate}`);
      console.log(`   Document ID: ${doc.id}`);
      console.log(`   ⚠️  This should have triggered an auto-override request!`);
      console.log('');
    });

  } catch (error) {
    console.error('Error checking overrides:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkOverrides(); 