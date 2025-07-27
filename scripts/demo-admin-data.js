const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function demoAdminData() {
  console.log('🎯 Enhanced Admin Dashboard Data Demo\n');

  try {
    // Get override requests with enhanced contextual data (simulating the enhanced API)
    const requests = await (prisma).overrideRequest.findMany({
      include: {
        requester: {
          select: {
            id: true,
            name: true,
            email: true,
            company: true,
          }
        }
      },
      orderBy: [
        { status: 'asc' },
        { createdAt: 'desc' }
      ]
    });

    console.log(`📋 Found ${requests.length} override request(s)\n`);

    for (const request of requests) {
      console.log(`\n🔸 ${request.type} - ${request.status}`);
      console.log(`   Created: ${request.createdAt.toLocaleString()}`);
      console.log(`   Requester: ${request.requester.name} (${request.requester.email})`);
      console.log(`   Company: ${request.requester.company}`);

      // Get contextual data based on request type
      let contextualData = {};

      // For unit-based requests, get unit and property info
      if (request.unitId) {
        const unit = await prisma.unit.findUnique({
          where: { id: request.unitId },
          include: {
            property: {
              select: { id: true, name: true, address: true }
            },
            leases: {
              include: {
                residents: {
                  select: { id: true, name: true, annualizedIncome: true, verifiedIncome: true }
                },
                incomeVerifications: {
                  include: {
                    incomeDocuments: {
                      include: {
                        resident: { select: { id: true, name: true } }
                      }
                    }
                  },
                  orderBy: { createdAt: 'desc' },
                  take: 1
                }
              },
              orderBy: { createdAt: 'desc' }
            }
          }
        });
        contextualData.unit = unit;
      }

      // For document-specific requests
      if (request.documentId) {
        const document = await prisma.incomeDocument.findUnique({
          where: { id: request.documentId },
          include: {
            resident: { select: { id: true, name: true } },
            verification: {
              include: {
                lease: {
                  include: {
                    unit: {
                      include: {
                        property: { select: { id: true, name: true, address: true } }
                      }
                    }
                  }
                }
              }
            }
          }
        });
        contextualData.document = document;
      }

      // Display contextual information
      if (contextualData.unit) {
        const unit = contextualData.unit;
        console.log(`\n   📍 Property Context:`);
        console.log(`      Property: ${unit.property?.name || 'Unknown'}`);
        console.log(`      Address: ${unit.property?.address || 'Unknown'}`);
        console.log(`      Unit: ${unit.unitNumber}`);

        if (unit.leases && unit.leases.length > 0) {
          const lease = unit.leases[0]; // Most recent lease
          console.log(`\n   👥 Residents:`);
          lease.residents.forEach(resident => {
            console.log(`      - ${resident.name}`);
            console.log(`        Compliance Income: $${(resident.annualizedIncome || 0).toLocaleString()}`);
            console.log(`        Verified Income: $${(resident.verifiedIncome || 0).toLocaleString()}`);
          });

          // Calculate income discrepancy for INCOME_DISCREPANCY requests
          if (request.type === 'INCOME_DISCREPANCY') {
            const complianceIncome = lease.residents.reduce((sum, r) => sum + (r.annualizedIncome || 0), 0);
            const verifiedIncome = lease.residents.reduce((sum, r) => sum + (r.verifiedIncome || 0), 0);
            const discrepancy = Math.abs(complianceIncome - verifiedIncome);
            const percentage = complianceIncome > 0 ? ((discrepancy / complianceIncome) * 100) : 0;

            console.log(`\n   💰 Income Discrepancy Analysis:`);
            console.log(`      Compliance Income: $${complianceIncome.toLocaleString()}`);
            console.log(`      Verified Income: $${verifiedIncome.toLocaleString()}`);
            console.log(`      Discrepancy: $${discrepancy.toLocaleString()} (${percentage.toFixed(1)}%)`);
            console.log(`      Status: ${discrepancy > 1 ? '🔴 Significant discrepancy' : '🟢 Minor discrepancy'}`);
          }

          // Show documents for verification
          if (lease.incomeVerifications && lease.incomeVerifications.length > 0) {
            const verification = lease.incomeVerifications[0];
            console.log(`\n   📄 Recent Documents:`);
            verification.incomeDocuments.forEach(doc => {
              console.log(`      - ${doc.documentType}: ${doc.status} (${doc.resident?.name || 'Unknown'})`);
              if (doc.documentType === 'PAYSTUB') {
                console.log(`        Gross Pay: $${doc.grossPayAmount || 'Not detected'}`);
                console.log(`        Annualized: $${doc.calculatedAnnualizedIncome || 'Not calculated'}`);
                console.log(`        Pay Frequency: ${doc.payFrequency || 'Not detected'}`);
              }
              if (doc.documentType === 'W2') {
                console.log(`        Box 1 Wages: $${doc.box1_wages || 'Not detected'}`);
                console.log(`        Tax Year: ${doc.taxYear || 'Not detected'}`);
              }
            });
          }
        }
      }

      if (contextualData.document) {
        const doc = contextualData.document;
        console.log(`\n   📄 Document Review Details:`);
        console.log(`      Type: ${doc.documentType}`);
        console.log(`      Status: ${doc.status}`);
        console.log(`      Resident: ${doc.resident?.name || 'Unknown'}`);
        console.log(`      Upload Date: ${new Date(doc.uploadDate).toLocaleDateString()}`);
        
        if (doc.documentType === 'PAYSTUB') {
          console.log(`      Employee: ${doc.employeeName || 'Not detected'}`);
          console.log(`      Employer: ${doc.employerName || 'Not detected'}`);
          console.log(`      Gross Pay: $${doc.grossPayAmount || 'Not detected'}`);
          console.log(`      Pay Period: ${doc.payPeriodStartDate && doc.payPeriodEndDate 
            ? `${new Date(doc.payPeriodStartDate).toLocaleDateString()} - ${new Date(doc.payPeriodEndDate).toLocaleDateString()}`
            : 'Not detected'}`);
        }
      }

      console.log(`\n   💬 User Explanation:`);
      console.log(`      "${request.userExplanation}"`);

      if (request.adminNotes) {
        console.log(`\n   📝 Admin Notes:`);
        console.log(`      "${request.adminNotes}"`);
      }

      console.log('\n' + '='.repeat(80));
    }

    // Show statistics
    const stats = {
      total: requests.length,
      pending: requests.filter(r => r.status === 'PENDING').length,
      approved: requests.filter(r => r.status === 'APPROVED').length,
      denied: requests.filter(r => r.status === 'DENIED').length,
    };

    console.log(`\n📊 Admin Dashboard Statistics:`);
    console.log(`   Total Requests: ${stats.total}`);
    console.log(`   🟡 Pending: ${stats.pending}`);
    console.log(`   🟢 Approved: ${stats.approved}`);
    console.log(`   🔴 Denied: ${stats.denied}`);

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

demoAdminData(); 