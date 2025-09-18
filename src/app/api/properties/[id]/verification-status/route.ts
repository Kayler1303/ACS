import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { checkPropertyAccess } from '@/lib/permissions';
import * as fs from 'fs';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  console.log(`🚨 [VERIFICATION STATUS API] ===== API ENDPOINT HIT =====`);
  console.error(`🚨 [VERIFICATION STATUS API] ===== THIS SHOULD APPEAR IN CONSOLE =====`);
  
  // Write logs to a file for easier debugging
  const logFile = '/tmp/verification-debug.log';
  const timestamp = new Date().toISOString();
  fs.writeFileSync(logFile, `\n=== VERIFICATION STATUS DEBUG - ${timestamp} ===\n`, { flag: 'a' });
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: propertyId } = await params;
    const { searchParams } = new URL(request.url);
    const rentRollId = searchParams.get('rentRollId');

    console.log(`🔍 [VERIFICATION STATUS API] ===== STARTING VERIFICATION STATUS CHECK =====`);
    console.log(`[VERIFICATION STATUS] Fetching status for property ${propertyId}, rentRoll: ${rentRollId || 'latest'}`);

    // Check if user has access to this property (owner or shared)
    const access = await checkPropertyAccess(propertyId, session.user.id);
    if (!access.hasAccess) {
      return NextResponse.json({ error: 'Property not found or access denied' }, { status: 404 });
    }

    const property = await prisma.property.findUnique({
      where: { id: propertyId },
      include: { User: true }
    });

    if (!property) {
      return NextResponse.json({ error: 'Property not found' }, { status: 404 });
    }

    // Get the target rent roll (specific or latest active)
    let targetRentRoll;
    if (rentRollId) {
      targetRentRoll = await prisma.rentRoll.findUnique({
        where: { id: rentRollId, propertyId }
      });
    } else {
      targetRentRoll = await prisma.rentRoll.findFirst({
        where: { propertyId },
        orderBy: { uploadDate: 'desc' }
      });
    }

    if (!targetRentRoll) {
      return NextResponse.json({ error: 'No rent roll found' }, { status: 404 });
    }

    console.log(`[VERIFICATION STATUS] Using rent roll ${targetRentRoll.id} from ${targetRentRoll.uploadDate}`);
    console.error(`🔍 VERIFICATION STATUS API CALLED - Property: ${propertyId}, RentRoll: ${targetRentRoll.id}`);
    
    // Log rent roll info to file
    fs.writeFileSync(logFile, `Property ID: ${propertyId}\n`, { flag: 'a' });
    fs.writeFileSync(logFile, `Rent Roll ID: ${targetRentRoll.id}\n`, { flag: 'a' });
    fs.writeFileSync(logFile, `Rent Roll Date: ${targetRentRoll.uploadDate}\n`, { flag: 'a' });

    // Get all units with ALL their leases and residents (we'll filter for current ones later)
    const units = await prisma.unit.findMany({
      where: { propertyId },
      include: {
        Lease: {
          include: {
            Resident: {
              include: {
                IncomeDocument: {
                  include: {
                    IncomeVerification: true
                  }
                }
              }
            },
            Tenancy: true
          }
        }
      },
      orderBy: { unitNumber: 'asc' }
    });

    console.log(`🔍 [VERIFICATION STATUS API] ===== PROCESSING ${units.length} UNITS =====`);
    
    // Log all unit numbers to see what we're processing
    const unitNumbers = units.map((u: any) => u.unitNumber).sort();
    fs.writeFileSync(logFile, `Total units found: ${units.length}\n`, { flag: 'a' });
    fs.writeFileSync(logFile, `Unit numbers: ${unitNumbers.join(', ')}\n`, { flag: 'a' });
    fs.writeFileSync(logFile, `Looking for units 102 and 107...\n`, { flag: 'a' });

    const verificationStatus = units.map((unit: any) => {
      console.log(`[VERIFICATION STATUS DEBUG] Processing unit ${unit.unitNumber} (ID: ${unit.id})`);
      
      const unitLeases = unit.Lease;
      
      // Special debugging for problematic units
      const unitNum = unit.unitNumber.toString();
      if (unitNum === '102' || unitNum === '107' || unitNum === '0102' || unitNum === '0107' || 
          unitNum === '801-104' || unitNum === '805-206') {
        const debugMsg = `🚨 [SPECIAL DEBUG] Unit ${unit.unitNumber} - Investigating lease classification`;
        console.log(debugMsg);
        fs.writeFileSync(logFile, debugMsg + '\n', { flag: 'a' });
        
        // Log detailed lease information
        fs.writeFileSync(logFile, `  Rent Roll Date: ${targetRentRoll.uploadDate}\n`, { flag: 'a' });
        fs.writeFileSync(logFile, `  Total Leases: ${unitLeases.length}\n`, { flag: 'a' });
        
        unitLeases.forEach((lease: any, index: number) => {
          fs.writeFileSync(logFile, `  Lease ${index + 1}:\n`, { flag: 'a' });
          fs.writeFileSync(logFile, `    ID: ${lease.id}\n`, { flag: 'a' });
          fs.writeFileSync(logFile, `    Start Date: ${lease.leaseStartDate}\n`, { flag: 'a' });
          fs.writeFileSync(logFile, `    End Date: ${lease.leaseEndDate}\n`, { flag: 'a' });
          fs.writeFileSync(logFile, `    Rent: ${lease.rent}\n`, { flag: 'a' });
          fs.writeFileSync(logFile, `    Has Tenancy: ${!!lease.Tenancy}\n`, { flag: 'a' });
          fs.writeFileSync(logFile, `    Tenancy Rent Roll ID: ${lease.Tenancy?.rentRollId || 'none'}\n`, { flag: 'a' });
          fs.writeFileSync(logFile, `    Target Rent Roll ID: ${targetRentRoll.id}\n`, { flag: 'a' });
          
          if (lease.leaseStartDate) {
            const leaseStart = new Date(lease.leaseStartDate);
            const rentRollDate = new Date(targetRentRoll.uploadDate);
            const isFuture = leaseStart > rentRollDate;
            fs.writeFileSync(logFile, `    Is Future Lease: ${isFuture} (${lease.leaseStartDate} vs ${targetRentRoll.uploadDate})\n`, { flag: 'a' });
          }
          
          fs.writeFileSync(logFile, `    Residents: ${lease.Resident?.length || 0}\n`, { flag: 'a' });
          if (lease.Resident?.length > 0) {
            lease.Resident.forEach((resident: any) => {
              fs.writeFileSync(logFile, `      - ${resident.name} (finalized: ${resident.incomeFinalized})\n`, { flag: 'a' });
            });
          }
          fs.writeFileSync(logFile, `\n`, { flag: 'a' });
        });
      }
      console.log(`[VERIFICATION STATUS DEBUG] Unit ${unit.unitNumber}: Found ${unitLeases.length} total leases`);

      // Filter to leases with tenancy for this specific rent roll AND that started on or before the rent roll date
      const rentRollDate = new Date(targetRentRoll.uploadDate);
      const currentLeases = unitLeases.filter((lease: any) => {
        if (!lease.Tenancy || lease.Tenancy.rentRollId !== targetRentRoll.id) {
          return false;
        }
        
        // Check if lease start date is on or before the rent roll upload date
        const leaseStartDate = new Date(lease.leaseStartDate);
        const isCurrentLease = leaseStartDate <= rentRollDate;
        
        if (!isCurrentLease) {
          console.log(`[VERIFICATION STATUS DEBUG] Unit ${unit.unitNumber}: Lease ${lease.id} starts ${lease.leaseStartDate} (after rent roll date ${targetRentRoll.uploadDate}) - treating as future lease`);
        }
        
        return isCurrentLease;
      });
      console.log(`[VERIFICATION STATUS DEBUG] Unit ${unit.unitNumber}: ${currentLeases.length} current leases (started on/before rent roll date)`);

      if (unit.unitNumber === '0101') {
        console.error(`🏠 UNIT 0101 DEBUG - Processing verification status for Unit 0101`);
        
        // Write debug info to file for Unit 0101
        const debugInfo = {
          timestamp: new Date().toISOString(),
          unitNumber: unit.unitNumber,
          unitId: unit.id,
          totalLeases: unitLeases.length,
          currentLeases: currentLeases.length,
          targetRentRollId: targetRentRoll.id,
          leaseDetails: unitLeases.map((lease: any) => ({
            id: lease.id,
            leaseStartDate: lease.leaseStartDate,
            leaseEndDate: lease.leaseEndDate,
            rent: lease.rent,
            hasTenancy: !!lease.Tenancy,
            tenancyRentRollId: lease.Tenancy?.rentRollId,
            residents: lease.Resident?.map((r: any) => ({
              name: r.name,
              incomeFinalized: r.incomeFinalized,
              calculatedAnnualizedIncome: r.calculatedAnnualizedIncome,
              documentsCount: r.IncomeDocument?.length || 0
            })) || []
          }))
        };
        
        fs.writeFileSync('/tmp/unit-0101-debug.log', JSON.stringify(debugInfo, null, 2));
      }

      let targetLease = null;
      if (currentLeases.length > 0) {
        // Use the most recent current lease
        targetLease = currentLeases.sort((a: any, b: any) => 
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        )[0];
        console.log(`[VERIFICATION STATUS DEBUG] Unit ${unit.unitNumber}: Using current lease ${targetLease.id}`);
      } else {
        console.log(`[VERIFICATION STATUS DEBUG] Unit ${unit.unitNumber}: No current leases found for this rent roll`);
        
        // Check for future leases (leases without Tenancy records)
        const futureLeases = unitLeases.filter((lease: any) => {
          // Future leases don't have Tenancy records
          return !lease.Tenancy && lease.leaseStartDate;
        });
        
        console.log(`[VERIFICATION STATUS DEBUG] Unit ${unit.unitNumber}: Found ${futureLeases.length} future leases`);
        
        // Special debugging for Unit 1216
        if (unit.unitNumber === '1216') {
          console.log(`🚨 [UNIT 1216 DEBUG] Processing Unit 1216 - No current leases found`);
          console.log(`🚨 [UNIT 1216 DEBUG] Total leases: ${unitLeases.length}`);
          console.log(`🚨 [UNIT 1216 DEBUG] Future leases: ${futureLeases.length}`);
          
          unitLeases.forEach((lease: any, index: number) => {
            console.log(`🚨 [UNIT 1216 DEBUG] Lease ${index + 1}:`, {
              id: lease.id,
              leaseStartDate: lease.leaseStartDate,
              hasTenancy: !!lease.Tenancy,
              tenancyRentRollId: lease.Tenancy?.rentRollId,
              targetRentRollId: targetRentRoll.id,
              residents: lease.Resident?.map((r: any) => ({
                name: r.name,
                incomeFinalized: r.incomeFinalized
              })) || []
            });
          });
          
          futureLeases.forEach((lease: any, index: number) => {
            console.log(`🚨 [UNIT 1216 DEBUG] Future lease ${index + 1}:`, {
              id: lease.id,
              leaseStartDate: lease.leaseStartDate,
              residents: lease.Resident?.map((r: any) => ({
                name: r.name,
                incomeFinalized: r.incomeFinalized
              })) || []
            });
          });
        }
        
        if (futureLeases.length > 0) {
          // Use the most recent future lease
          targetLease = futureLeases.sort((a: any, b: any) => 
            new Date(b.leaseStartDate).getTime() - new Date(a.leaseStartDate).getTime()
          )[0];
          console.log(`[VERIFICATION STATUS DEBUG] Unit ${unit.unitNumber}: Using future lease ${targetLease.id} for verification status`);
        } else {
          console.log(`[VERIFICATION STATUS DEBUG] Unit ${unit.unitNumber}: No current or future leases found - treating as Vacant`);
          return {
            unitId: unit.id,
            unitNumber: unit.unitNumber,
            status: 'Vacant',
            totalResidents: 0,
            residentsWithVerifiedIncome: 0,
            verifiedDocuments: 0,
            leaseStartDate: null,
            residents: []
          };
        }
      }

      // Check if current lease has verified residents
      const currentLeaseHasVerifiedResidents = targetLease.Resident && 
        targetLease.Resident.some((r: any) => r.incomeFinalized && r.calculatedAnnualizedIncome !== null);

      // If current lease doesn't have verified residents, look for matching lease with verified data
      if (!currentLeaseHasVerifiedResidents) {
        console.log(`[VERIFICATION STATUS DEBUG] Unit ${unit.unitNumber}: Current lease has no verified residents, looking for matching lease with verification`);
        
        // Look for leases with same key information and verified residents
        const matchingVerifiedLeases = unitLeases.filter((lease: any) => {
          // Must have verified residents
          const hasVerifiedResidents = lease.Resident && 
            lease.Resident.some((r: any) => r.incomeFinalized && r.calculatedAnnualizedIncome !== null);
          
          if (!hasVerifiedResidents) return false;
          
          // IMPORTANT: Only inherit from leases of the same type (current vs future)
          // Current leases have Tenancy, future leases don't
          const targetIsCurrentLease = !!targetLease.Tenancy;
          const leaseIsCurrentLease = !!lease.Tenancy;
          
          if (targetIsCurrentLease !== leaseIsCurrentLease) {
            console.log(`[VERIFICATION STATUS DEBUG] Unit ${unit.unitNumber}: Skipping lease ${lease.id} - different lease type (current: ${targetIsCurrentLease} vs ${leaseIsCurrentLease})`);
            return false;
          }
          
          // Extra debugging for Unit 505
          if (unit.unitNumber === '505') {
            console.log(`[UNIT 505 DEBUG] Comparing leases:`, {
              targetLeaseId: targetLease.id,
              candidateLeaseId: lease.id,
              targetIsCurrentLease,
              leaseIsCurrentLease,
              targetHasTenancy: !!targetLease.Tenancy,
              leaseHasTenancy: !!lease.Tenancy,
              targetResidents: targetLease.Resident?.length || 0,
              leaseResidents: lease.Resident?.length || 0
            });
          }
          
          // Must match key lease information
          const sameStartDate = lease.leaseStartDate?.getTime() === targetLease.leaseStartDate?.getTime();
          const sameEndDate = lease.leaseEndDate?.getTime() === targetLease.leaseEndDate?.getTime();
          // Handle rent comparison (both null is considered matching, convert to numbers for comparison)
          const leaseRentNum = lease.leaseRent ? parseFloat(lease.leaseRent.toString().trim()) : null;
          const targetRentNum = targetLease.leaseRent ? parseFloat(targetLease.leaseRent.toString().trim()) : null;
          const sameRent = (leaseRentNum === targetRentNum) || 
                          (leaseRentNum == null && targetRentNum == null);
          
          // Check if resident names match
          const currentResidentNames = targetLease.Resident?.map((r: any) => r.name.toLowerCase().trim()).sort() || [];
          const leaseResidentNames = lease.Resident?.map((r: any) => r.name.toLowerCase().trim()).sort() || [];
          const sameResidents = JSON.stringify(currentResidentNames) === JSON.stringify(leaseResidentNames);
          
          console.log(`[VERIFICATION STATUS DEBUG] Unit ${unit.unitNumber}: Checking lease ${lease.id} - Start: ${sameStartDate}, End: ${sameEndDate}, Rent: ${sameRent}, Residents: ${sameResidents}`);
          
          if (unit.unitNumber === '0101') {
            const matchingDebug = {
              timestamp: new Date().toISOString(),
              leaseId: lease.id,
              targetLeaseId: targetLease.id,
              sameStartDate,
              sameEndDate, 
              sameRent,
              sameResidents,
              leaseStartDate: lease.leaseStartDate,
              targetStartDate: targetLease.leaseStartDate,
              leaseEndDate: lease.leaseEndDate,
              targetEndDate: targetLease.leaseEndDate,
              leaseRent: lease.leaseRent,
              targetRent: targetLease.leaseRent,
              leaseRentNum,
              targetRentNum,
              currentResidentNames,
              leaseResidentNames,
              hasVerifiedResidents
            };
            fs.appendFileSync('/tmp/unit-0101-debug.log', '\n\nMATCHING DEBUG:\n' + JSON.stringify(matchingDebug, null, 2));
          }
          
          return sameStartDate && sameEndDate && sameRent && sameResidents;
        });
        
        if (matchingVerifiedLeases.length > 0) {
          const matchingLease = matchingVerifiedLeases[0];
          console.log(`[VERIFICATION STATUS DEBUG] Unit ${unit.unitNumber}: Found matching verified lease ${matchingLease.id}, inheriting verification data`);
          
          // Inherit verified residents from matching lease
          targetLease.Resident = matchingLease.Resident;
        } else {
          console.log(`[VERIFICATION STATUS DEBUG] Unit ${unit.unitNumber}: No matching verified lease found`);
        }
      }

      console.log(`[VERIFICATION STATUS DEBUG] Unit ${unit.unitNumber}: Processing with lease ${targetLease.id}`);

      const allResidents = targetLease.Resident;
      
      // Filter residents to only include those whose lease has started as of the report date
      // This prevents future residents from being counted as current residents
      const reportDate = new Date(targetRentRoll.uploadDate);
      const leaseStartDate = targetLease.leaseStartDate;
      
      let residents = allResidents;
      if (leaseStartDate && leaseStartDate > reportDate) {
        // This is a future lease - no residents should be counted as current
        console.log(`[VERIFICATION STATUS DEBUG] Unit ${unit.unitNumber}: Future lease detected (starts ${leaseStartDate.toISOString()} > report ${reportDate.toISOString()}) - treating as vacant`);
        residents = [];
      }
      
      const totalResidents = residents.length;

      console.log(`[VERIFICATION STATUS DEBUG] Unit ${unit.unitNumber}: {
        leaseStartDate: '${targetLease.leaseStartDate?.toISOString()}',
        residentsCount: ${totalResidents},
        totalDocuments: ${residents.reduce((sum: number, r: any) => sum + r.IncomeDocument.length, 0)}
      }`);

      // Calculate verification metrics
      let residentsWithVerifiedIncome = 0;
      let verifiedDocuments = 0;
      let residentsWithFinalizedIncome = 0;
      let residentsWithInProgressVerification = 0;

      const residentDetails = residents.map((resident: any) => {
        const hasVerifiedIncome = (resident.incomeFinalized && resident.calculatedAnnualizedIncome !== null) || resident.hasNoIncome;
        const documentsCount = resident.IncomeDocument.length;
        const hasDocumentsButNotFinalized = documentsCount > 0 && !resident.incomeFinalized && !resident.hasNoIncome;
        
        // Enhanced debugging for status determination
        const residentDebug = {
          incomeFinalized: resident.incomeFinalized,
          calculatedAnnualizedIncome: resident.calculatedAnnualizedIncome,
          documentsCount: documentsCount,
          hasVerifiedIncome: hasVerifiedIncome,
          hasDocumentsButNotFinalized: hasDocumentsButNotFinalized
        };
        console.log(`[VERIFICATION STATUS DEBUG] Unit ${unit.unitNumber} - Resident ${resident.name}:`, residentDebug);
        
        // Write to file for problematic units
        if (unitNum === '102' || unitNum === '107' || unitNum === '0102' || unitNum === '0107' || 
            unitNum === '801-104' || unitNum === '805-206') {
          fs.writeFileSync(logFile, `  Resident ${resident.name}: ${JSON.stringify(residentDebug, null, 2)}\n`, { flag: 'a' });
        }
        
        if (hasVerifiedIncome) {
          residentsWithVerifiedIncome++;
          residentsWithFinalizedIncome++;
        } else if (hasDocumentsButNotFinalized) {
          residentsWithInProgressVerification++;
        }
        
        verifiedDocuments += documentsCount;

        return {
          id: resident.id,
          name: resident.name,
          hasNoIncome: resident.hasNoIncome,
          incomeFinalized: resident.incomeFinalized,
          calculatedAnnualizedIncome: resident.calculatedAnnualizedIncome,
          documentsCount,
          documents: resident.IncomeDocument.map((doc: any) => ({
            id: doc.id,
            documentType: doc.documentType,
            status: doc.status,
            uploadDate: doc.uploadDate,
            calculatedAnnualizedIncome: doc.calculatedAnnualizedIncome
          }))
        };
      });

      console.log(`[VERIFICATION SERVICE DEBUG] Unit ${unit.unitNumber} - Resident Details: [
        ${residentDetails.map((r: any) => `{
          id: '${r.id}',
          name: '${r.name}',
          hasNoIncome: ${r.hasNoIncome},
          incomeFinalized: ${r.incomeFinalized},
          calculatedAnnualizedIncome: ${r.calculatedAnnualizedIncome}
        }`).join(',\n  ')}
      ]`);

      console.log(`[VERIFICATION SERVICE DEBUG] Unit ${unit.unitNumber} SUMMARY: {
        verifiedDocuments: ${verifiedDocuments},
        residentsWithFinalizedIncome: ${residentsWithFinalizedIncome},
        totalResidentsWithVerifiedIncome: ${residentsWithVerifiedIncome},
        residentsWithInProgressVerification: ${residentsWithInProgressVerification},
        totalResidents: ${totalResidents},
        documentStatuses: []
      }`);

      // Check if any resident has documents that need admin review (PRIORITY CHECK)
      const hasDocumentsNeedingReview = residents.some((resident: any) =>
        (resident.IncomeDocument || []).some((doc: any) => doc.status === 'NEEDS_REVIEW')
      );

      // Determine overall status
      // Valid statuses: Verified, In Progress - Finalize to Process, Out of Date Income Documents, Waiting for Admin Review, Vacant
      let status: string;
      if (totalResidents === 0) {
        status = 'Vacant';
      } else if (hasDocumentsNeedingReview) {
        // PRIORITY: If any documents need admin review, status is "Waiting for Admin Review"
        status = 'Waiting for Admin Review';
        console.log(`[VERIFICATION SERVICE DEBUG] Unit ${unit.unitNumber}: Has documents needing admin review - returning Waiting for Admin Review`);
      } else if (residentsWithVerifiedIncome === 0 && residentsWithInProgressVerification === 0) {
        status = 'Out of Date Income Documents';
        console.log(`[VERIFICATION SERVICE DEBUG] Unit ${unit.unitNumber}: No residents with verified income or in-progress verification - returning Out of Date Income Documents`);
      } else if (residentsWithVerifiedIncome === totalResidents) {
        status = 'Verified';
      } else {
        // Any unit with mixed verification states (some verified, some not) = In Progress
        status = 'In Progress - Finalize to Process';
        const statusMsg = `[VERIFICATION SERVICE DEBUG] Unit ${unit.unitNumber}: ✅ MIXED VERIFICATION STATES: residentsWithVerifiedIncome (${residentsWithVerifiedIncome}) < totalResidents (${totalResidents}) - returning In Progress - Finalize to Process`;
        console.log(statusMsg);
        if (unitNum === '102' || unitNum === '107' || unitNum === '0102' || unitNum === '0107' || 
            unitNum === '801-104' || unitNum === '805-206') {
          fs.writeFileSync(logFile, statusMsg + '\n', { flag: 'a' });
        }
      }

      return {
        unitId: unit.id,
        unitNumber: unit.unitNumber,
        status,
        totalResidents,
        residentsWithVerifiedIncome,
        verifiedDocuments,
        leaseStartDate: targetLease.leaseStartDate,
        residents: residentDetails
      };
    });

    console.log(`[VERIFICATION STATUS] Completed processing ${units.length} units for rent roll ${targetRentRoll.id}`);

    return NextResponse.json({
      success: true,
      rentRollId: targetRentRoll.id,
      rentRollDate: targetRentRoll.uploadDate,
      verificationStatus
    });

  } catch (error) {
    console.error('[VERIFICATION STATUS] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch verification status', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
} 