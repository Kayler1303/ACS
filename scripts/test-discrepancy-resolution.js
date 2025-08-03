#!/usr/bin/env node

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function testDiscrepancyResolution() {
  console.log('🧪 Testing discrepancy resolution workflow...\n');

  try {
    // Find leases with finalized residents but income discrepancies
    const allLeases = await prisma.lease.findMany({
      include: {
        Resident: {
          where: {
            incomeFinalized: true
          }
        },
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
      }
    });

    console.log(`Found ${allLeases.length} leases to check for discrepancies...\n`);

    let totalDiscrepancies = 0;

    for (const lease of allLeases) {
      if (lease.Resident.length === 0) continue;

      // Check for residents with income discrepancies
      const residentsWithDiscrepancies = lease.Resident.filter(resident => {
        const rentRollIncome = Number(resident.annualizedIncome || 0);
        const verifiedIncome = Number(resident.calculatedAnnualizedIncome || 0);
        const discrepancy = Math.abs(rentRollIncome - verifiedIncome);
        return discrepancy > 1.00; // More than $1 difference
      });

      if (residentsWithDiscrepancies.length > 0) {
        totalDiscrepancies += residentsWithDiscrepancies.length;
        
        console.log(`🔍 Lease: ${lease.name} (${lease.Unit?.Property?.name}, Unit ${lease.Unit?.unitNumber})`);
        console.log(`   ${residentsWithDiscrepancies.length} residents with discrepancies:`);
        
        residentsWithDiscrepancies.forEach(resident => {
          const rentRollIncome = Number(resident.annualizedIncome || 0);
          const verifiedIncome = Number(resident.calculatedAnnualizedIncome || 0);
          const discrepancy = Math.abs(rentRollIncome - verifiedIncome);
          
          console.log(`   - ${resident.name}:`);
          console.log(`     Rent Roll: $${rentRollIncome.toLocaleString()}`);
          console.log(`     Verified:  $${verifiedIncome.toLocaleString()}`);
          console.log(`     Difference: $${discrepancy.toLocaleString()}`);
        });
        console.log('');
      }
    }

    if (totalDiscrepancies === 0) {
      console.log('✅ No income discrepancies found! All residents have matching rent roll and verified incomes.');
    } else {
      console.log(`📊 Summary: Found ${totalDiscrepancies} residents with income discrepancies across ${allLeases.filter(l => l.Resident.some(r => {
        const rentRollIncome = Number(r.annualizedIncome || 0);
        const verifiedIncome = Number(r.calculatedAnnualizedIncome || 0);
        return Math.abs(rentRollIncome - verifiedIncome) > 1.00;
      })).length} leases.`);
      
      console.log(`\n💡 These discrepancies should trigger the "💰 Finalize Income" button in the UI.`);
      console.log(`   The modal should show each resident individually for resolution.`);
    }

    // Also check for any residents who might have been processed incorrectly
    console.log(`\n🔍 Checking for potential data inconsistencies...`);
    
    const problematicResidents = await prisma.resident.findMany({
      where: {
        incomeFinalized: true,
        calculatedAnnualizedIncome: { gt: 0 }
      },
      include: {
        IncomeDocument: {
          where: {
            status: { in: ['COMPLETED', 'NEEDS_REVIEW'] }
          }
        },
        Lease: {
          select: {
            name: true,
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
          }
        }
      }
    });

    let dataInconsistencies = 0;
    for (const resident of problematicResidents) {
      if (resident.IncomeDocument.length === 0) continue;

      // Calculate what their income should be
      let correctIncome = 0;
      const paystubs = resident.IncomeDocument.filter(doc => doc.documentType === 'PAYSTUB');
      const w2s = resident.IncomeDocument.filter(doc => doc.documentType === 'W2');

      if (paystubs.length > 0) {
        const validPaystubs = paystubs.filter(p => p.grossPayAmount && Number(p.grossPayAmount) > 0);
        if (validPaystubs.length > 0) {
          const totalGrossPay = validPaystubs.reduce((acc, p) => acc + Number(p.grossPayAmount), 0);
          const averageGrossPay = totalGrossPay / validPaystubs.length;
          const payFrequency = validPaystubs[0]?.payFrequency || 'BI-WEEKLY';
          const multipliers = { 'WEEKLY': 52, 'BI-WEEKLY': 26, 'SEMI-MONTHLY': 24, 'MONTHLY': 12 };
          correctIncome += averageGrossPay * (multipliers[payFrequency] || 26);
        }
      }

      w2s.forEach(w2 => {
        const box1 = Number(w2.box1_wages || 0);
        const box3 = Number(w2.box3_ss_wages || 0);
        const box5 = Number(w2.box5_med_wages || 0);
        correctIncome += Math.max(box1, box3, box5);
      });

      const currentIncome = Number(resident.calculatedAnnualizedIncome);
      const difference = Math.abs(correctIncome - currentIncome);

      if (difference > 100) { // More than $100 difference
        dataInconsistencies++;
        console.log(`⚠️  ${resident.name} (${resident.Lease?.Unit?.Property?.name}, Unit ${resident.Lease?.Unit?.unitNumber}):`);
        console.log(`   Current: $${currentIncome.toLocaleString()}, Should be: $${correctIncome.toLocaleString()}, Diff: $${difference.toLocaleString()}`);
      }
    }

    if (dataInconsistencies === 0) {
      console.log('✅ No data inconsistencies found! All calculated incomes match document data.');
    } else {
      console.log(`⚠️  Found ${dataInconsistencies} residents with incorrect calculated incomes.`);
      console.log(`   Consider running the fix script: node scripts/fix-incorrect-accept-verified-income.js`);
    }

  } catch (error) {
    console.error('❌ Error testing discrepancy resolution:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the script
if (require.main === module) {
  testDiscrepancyResolution();
}

module.exports = { testDiscrepancyResolution }; 