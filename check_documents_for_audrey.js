const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkAudreyDocuments() {
  try {
    console.log('🔍 CHECKING AUDREY MAKINS DOCUMENTS...\n');
    
    // Find Audrey's resident record
    const audrey = await prisma.resident.findFirst({
      where: { name: 'Audrey Makins' },
      include: {
        lease: {
          include: {
            unit: true
          }
        }
      }
    });
    
    if (!audrey) {
      console.log('❌ No resident found with name "Audrey Makins"');
      return;
    }
    
    console.log('👤 RESIDENT INFO:');
    console.log(`   ID: ${audrey.id}`);
    console.log(`   Name: ${audrey.name}`);
    console.log(`   Lease ID: ${audrey.leaseId}`);
    console.log(`   Unit: ${audrey.lease?.unit?.unitNumber || 'N/A'}`);
    console.log(`   Income Finalized: ${audrey.incomeFinalized}`);
    console.log(`   Calculated Income: $${audrey.calculatedAnnualizedIncome || 0}`);
    console.log('');
    
    // Find all income documents for Audrey
    const documents = await prisma.incomeDocument.findMany({
      where: { residentId: audrey.id },
      orderBy: { uploadDate: 'desc' }
    });
    
    console.log(`📄 FOUND ${documents.length} DOCUMENTS FOR AUDREY:`);
    documents.forEach((doc, index) => {
      console.log(`   ${index + 1}. ${doc.documentType} - Status: ${doc.status}`);
      console.log(`      Upload Date: ${doc.uploadDate}`);
      console.log(`      Document Date: ${doc.documentDate}`);
      console.log(`      Employee Name: "${doc.employeeName}"`);
      console.log(`      Verification ID: ${doc.verificationId}`);
      console.log(`      Calculated Income: $${doc.calculatedAnnualizedIncome || 0}`);
      console.log('');
    });
    
    // Check verification records
    const verifications = await prisma.incomeVerification.findMany({
      where: { leaseId: audrey.leaseId },
      orderBy: { createdAt: 'desc' }
    });
    
    console.log(`📋 FOUND ${verifications.length} VERIFICATION RECORDS:`);
    verifications.forEach((verification, index) => {
      console.log(`   ${index + 1}. ID: ${verification.id}`);
      console.log(`      Status: ${verification.status}`);
      console.log(`      Created: ${verification.createdAt}`);
      console.log('');
    });
    
    // Check for completed documents specifically
    const completedDocs = documents.filter(doc => doc.status === 'COMPLETED');
    console.log(`✅ COMPLETED DOCUMENTS: ${completedDocs.length}`);
    
    if (completedDocs.length === 0) {
      console.log('❌ NO COMPLETED DOCUMENTS FOUND!');
      console.log('This explains why verification service returns "Out of Date Income Documents"');
    } else {
      console.log('✅ Found completed documents but verification service still failing...');
      console.log('This suggests a query issue in the verification service.');
    }
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkAudreyDocuments(); 