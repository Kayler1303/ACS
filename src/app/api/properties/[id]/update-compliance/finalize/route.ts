import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { randomUUID } from 'crypto';
import { Prisma } from '@prisma/client';
import { getHudIncomeLimits } from '@/services/hud';

interface LeaseData {
  unitId: string;
  unitNumber: string;
  leaseStartDate?: string;
  leaseEndDate?: string;
  leaseRent?: number;
  residents: Array<{
    name: string;
    annualizedIncome?: string;
  }>;
}

interface UnitGroup {
  [unitId: string]: LeaseData[];
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: propertyId } = await params;
    const body = await request.json();
    const { unitGroups, filename, rentRollDate } = body;

    console.log(`🚀 [COMPLIANCE UPDATE] ===== PHASE 1: CREATE SNAPSHOT & CHECK INHERITANCE =====`);
    console.log(`🚀 [COMPLIANCE UPDATE] Property: ${propertyId}`);
    console.log(`🚀 [COMPLIANCE UPDATE] Rent roll date: ${rentRollDate}`);

    const reportDate = rentRollDate ? new Date(rentRollDate) : new Date();

    // First, get property data for HUD income limits
    const property = await prisma.property.findUnique({
      where: { id: propertyId },
      select: {
        county: true,
        state: true,
        placedInServiceDate: true,
        ownerId: true
      }
    });

    if (!property || property.ownerId !== session.user.id) {
      return NextResponse.json({ error: 'Property not found or access denied' }, { status: 404 });
    }

    // Fetch HUD income limits that will be used for this snapshot
    let hudIncomeLimits = null;
    let hudDataYear = new Date().getFullYear();

    try {
      console.log(`[COMPLIANCE UPDATE] 📊 Fetching HUD income limits for snapshot creation`);
      const hudData = await getHudIncomeLimits(property.county, property.state, hudDataYear, property.placedInServiceDate || undefined);
      hudIncomeLimits = hudData;
      console.log(`[COMPLIANCE UPDATE] ✅ Retrieved HUD data for year ${hudDataYear}`);
    } catch (hudError) {
      console.error(`[COMPLIANCE UPDATE] ❌ Failed to fetch HUD income limits:`, hudError);
      // Continue with snapshot creation even if HUD data fails - we'll store null
    }

    const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // STEP 1: Get ALL existing future leases for snapshot preservation
      const existingFutureLeases = await tx.lease.findMany({
        where: {
          Unit: {
            propertyId: propertyId
          },
          Tenancy: null, // Future leases don't have Tenancy records
          NOT: {
            name: {
              startsWith: '[PROCESSED]' // Exclude already processed leases
            }
          }
          // NOTE: We preserve ALL future leases in snapshots, not just those with finalized verifications
          // The finalized verification check is only used later for inheritance matching
        },
        include: {
          Unit: true,
          Resident: {
            include: {
              IncomeDocument: true
            }
          },
          IncomeVerification: {
            where: {
              status: 'FINALIZED'
            }
          }
        }
      });

      console.log(`[COMPLIANCE UPDATE] 🔍 Found ${existingFutureLeases.length} existing future leases with finalized verifications`);
      existingFutureLeases.forEach(lease => {
        console.log(`[COMPLIANCE UPDATE] 📋 Future lease: "${lease.name}" in unit ${lease.Unit.unitNumber}, Start: ${lease.leaseStartDate}, End: ${lease.leaseEndDate}, Residents: ${lease.Resident.length}, Verifications: ${lease.IncomeVerification.length}`);
      });

      // Debug: Show which units are in the new rent roll data
      const newRentRollUnits = Object.keys(unitGroups || {});
      console.log(`[COMPLIANCE UPDATE] 🔍 New rent roll contains ${newRentRollUnits.length} units:`, newRentRollUnits.sort());
      
      // Debug: Check for potential matches
      const futureLeaseUnits = existingFutureLeases.map(lease => lease.Unit.unitNumber);
      const potentialMatches = futureLeaseUnits.filter(unit => newRentRollUnits.includes(unit));
      console.log(`[COMPLIANCE UPDATE] 🎯 Potential matches between future leases and new rent roll:`, potentialMatches);

      // STEP 2: Create snapshot of current state (BEFORE processing new data)
      const snapshot = await tx.rentRollSnapshot.create({
        data: {
          id: randomUUID(),
          propertyId,
          filename: filename || `Upload ${reportDate.toLocaleDateString()}`,
          uploadDate: reportDate,
          isActive: true,
          hudIncomeLimits: hudIncomeLimits,
          hudDataYear: hudDataYear
        } as any
      });

      console.log(`[COMPLIANCE UPDATE] ✅ Created snapshot ${snapshot.id}`);

      // Deactivate previous snapshots
      await tx.rentRollSnapshot.updateMany({
        where: {
          propertyId,
          id: { not: snapshot.id }
        },
        data: { isActive: false }
      });

      // STEP 3: Preserve existing future leases in this snapshot (freeze current state)
      console.log(`[COMPLIANCE UPDATE] 🔄 Preserving ${existingFutureLeases.length} future leases in snapshot`);
      
      for (const futureLease of existingFutureLeases) {
        console.log(`[COMPLIANCE UPDATE] 📋 Preserving future lease: "${futureLease.name}" in unit ${futureLease.Unit.unitNumber}`);
        
        // Create a copy of the lease for this snapshot
        const newLeaseId = randomUUID();
        await tx.lease.create({
          data: {
            id: newLeaseId,
            name: futureLease.name,
            leaseStartDate: futureLease.leaseStartDate,
            leaseEndDate: futureLease.leaseEndDate,
            leaseRent: futureLease.leaseRent,
            unitId: futureLease.unitId,
            createdAt: futureLease.createdAt, // Preserve original creation date
            updatedAt: new Date()
          }
        });

        // Copy income verifications for this lease
        const verificationMap = new Map<string, string>();
        for (const verification of futureLease.IncomeVerification) {
          const newVerificationId = randomUUID();
          await tx.incomeVerification.create({
            data: {
              id: newVerificationId,
              status: verification.status,
              createdAt: verification.createdAt,
              updatedAt: new Date(),
              finalizedAt: verification.finalizedAt,
              calculatedVerifiedIncome: verification.calculatedVerifiedIncome,
              associatedLeaseEnd: verification.associatedLeaseEnd,
              associatedLeaseStart: verification.associatedLeaseStart,
              dueDate: verification.dueDate,
              leaseYear: verification.leaseYear,
              reason: verification.reason,
              reminderSentAt: verification.reminderSentAt,
              verificationPeriodEnd: verification.verificationPeriodEnd,
              verificationPeriodStart: verification.verificationPeriodStart,
              leaseId: newLeaseId
            }
          });
          verificationMap.set(verification.id, newVerificationId);
        }

        // Mark the original future lease as processed to prevent duplicates
        await tx.lease.update({
          where: { id: futureLease.id },
          data: { 
            name: `[PROCESSED] ${futureLease.name}`,
            updatedAt: new Date()
          }
        });
        console.log(`[COMPLIANCE UPDATE] ✅ Marked original future lease as processed: [PROCESSED] ${futureLease.name}`);

        // Copy residents for this lease
        for (const resident of futureLease.Resident) {
          const newResidentId = randomUUID();
          
          // Check if this resident has a finalized income verification
          const hasFinalized = futureLease.IncomeVerification.some(verification => 
            verification.status === 'FINALIZED'
          );
          
          await tx.resident.create({
            data: {
              id: newResidentId,
              name: resident.name,
              verifiedIncome: resident.verifiedIncome,
              annualizedIncome: resident.annualizedIncome,
              originalRentRollIncome: resident.originalRentRollIncome, // Preserve original rent roll income
              calculatedAnnualizedIncome: resident.calculatedAnnualizedIncome,
              incomeFinalized: hasFinalized ? true : resident.incomeFinalized, // Fix: Set to true if verification is finalized
              hasNoIncome: resident.hasNoIncome,
              finalizedAt: hasFinalized && !resident.finalizedAt ? new Date() : resident.finalizedAt, // Set finalizedAt if missing
              leaseId: newLeaseId,
              createdAt: resident.createdAt,
              updatedAt: new Date()
            }
          });

          // Create document references (not copies) for this resident
          const existingDocuments = await tx.incomeDocument.findMany({
            where: { residentId: resident.id }
          });
          
          for (const doc of existingDocuments) {
            const newVerificationId = verificationMap.get(doc.verificationId || '');
            await tx.incomeDocument.create({
              data: {
                id: randomUUID(),
                documentType: doc.documentType,
                documentDate: doc.documentDate,
                uploadDate: doc.uploadDate,
                status: doc.status,
                filePath: doc.filePath, // Reference same file, don't copy
                box1_wages: doc.box1_wages,
                box3_ss_wages: doc.box3_ss_wages,
                box5_med_wages: doc.box5_med_wages,
                employeeName: doc.employeeName,
                employerName: doc.employerName,
                taxYear: doc.taxYear,
                grossPayAmount: doc.grossPayAmount,
                payFrequency: doc.payFrequency,
                payPeriodEndDate: doc.payPeriodEndDate,
                payPeriodStartDate: doc.payPeriodStartDate,
                calculatedAnnualizedIncome: doc.calculatedAnnualizedIncome,
                verificationId: newVerificationId || doc.verificationId,
                residentId: newResidentId
              }
            });
          }
        }
      }

      // STEP 4: Analyze new data for inheritance matches (without importing it yet)
      console.log(`[COMPLIANCE UPDATE] 🔍 Analyzing new data for inheritance matches`);
      console.log(`[COMPLIANCE UPDATE] 🔍 unitGroups keys:`, Object.keys(unitGroups || {}));
      
      // Check specifically for unit 0103
      const hasUnit0103 = Object.keys(unitGroups || {}).includes('0103');
      console.log(`[COMPLIANCE UPDATE] 🎯 Unit 0103 in unitGroups: ${hasUnit0103}`);
      
      if (hasUnit0103) {
        console.log(`[COMPLIANCE UPDATE] 🎯 Unit 0103 data:`, JSON.stringify((unitGroups as any)['0103'], null, 2));
      }
      
      // Check existing future leases for unit 0103
      const existingFutureLeaseFor0103 = existingFutureLeases.find(lease => 
        lease.Unit.unitNumber === '0103'
      );
      console.log(`[COMPLIANCE UPDATE] 🎯 Existing future lease for 0103:`, existingFutureLeaseFor0103 ? 'YES' : 'NO');
      
      if (existingFutureLeaseFor0103) {
        console.log(`[COMPLIANCE UPDATE] 🎯 Existing 0103 lease dates: ${existingFutureLeaseFor0103.leaseStartDate} to ${existingFutureLeaseFor0103.leaseEndDate}`);
      }
      
      const futureLeaseMatches: any[] = [];

      for (const [unitId, leases] of Object.entries(unitGroups as UnitGroup)) {
        for (const leaseData of leases) {
          const unitNumber = leaseData.unitNumber;
          console.log(`[COMPLIANCE UPDATE] 🔄 Processing unit ${unitNumber} for inheritance matching`);
          
          // Check if there's an existing future lease for this unit WITH finalized verifications
          // (only these should trigger inheritance modals)
          const existingFutureLeaseForUnit = existingFutureLeases.find(lease => 
            lease.Unit.unitNumber === unitNumber &&
            lease.IncomeVerification.some(verification => verification.status === 'FINALIZED')
          );

          if (existingFutureLeaseForUnit) {
            console.log(`[COMPLIANCE UPDATE] ✅ Found existing future lease for unit ${unitNumber}: "${existingFutureLeaseForUnit.name}"`);
            
            // Parse new lease dates
            let leaseStartDate: Date | null = null;
            let leaseEndDate: Date | null = null;

            if (leaseData.leaseStartDate) {
              leaseStartDate = new Date(leaseData.leaseStartDate);
            }
            if (leaseData.leaseEndDate) {
              leaseEndDate = new Date(leaseData.leaseEndDate);
            }

            console.log(`[COMPLIANCE UPDATE] 📅 New future lease for unit ${unitNumber}:`);
            console.log(`[COMPLIANCE UPDATE] - Start: ${leaseStartDate?.toISOString() || 'null'}`);
            console.log(`[COMPLIANCE UPDATE] - End: ${leaseEndDate?.toISOString() || 'null'}`);
            console.log(`[COMPLIANCE UPDATE] 📅 Existing future lease for unit ${unitNumber}:`);
            console.log(`[COMPLIANCE UPDATE] - Start: ${existingFutureLeaseForUnit.leaseStartDate?.toISOString() || 'null'}`);
            console.log(`[COMPLIANCE UPDATE] - End: ${existingFutureLeaseForUnit.leaseEndDate?.toISOString() || 'null'}`);

            // Compare new future lease to existing future lease (both dates AND residents)
            const existingStartTime = existingFutureLeaseForUnit.leaseStartDate?.getTime();
            const existingEndTime = existingFutureLeaseForUnit.leaseEndDate?.getTime();
            const newStartTime = leaseStartDate?.getTime();
            const newEndTime = leaseEndDate?.getTime();

            const datesAreIdentical = existingStartTime === newStartTime && existingEndTime === newEndTime;
            
            // Compare residents between existing future lease and new lease data
            const residentsMatch = compareResidents(existingFutureLeaseForUnit.Resident, leaseData.residents || []);
            const residentMatchPercentage = residentsMatch.filter(match => match.isMatch).length / Math.max(residentsMatch.length, 1);
            const residentsAreSimilar = residentMatchPercentage >= 0.8; // 80% of residents must match

            console.log(`[COMPLIANCE UPDATE] 🔍 Lease comparison for unit ${unitNumber}:`);
            console.log(`[COMPLIANCE UPDATE] - Dates identical: ${datesAreIdentical}`);
            console.log(`[COMPLIANCE UPDATE] - Residents similar: ${residentsAreSimilar} (${Math.round(residentMatchPercentage * 100)}% match)`);
            console.log(`[COMPLIANCE UPDATE] - Resident matches:`, residentsMatch);

            const shouldAutoInherit = datesAreIdentical && residentsAreSimilar;
            const shouldTriggerModal = !shouldAutoInherit;

            if (shouldAutoInherit) {
              console.log(`[COMPLIANCE UPDATE] ✅ Future lease matches exactly (dates + residents) - automatic inheritance, no modal needed.`);
            } else {
              console.log(`[COMPLIANCE UPDATE] 🎯 Future lease differs (dates or residents) - inheritance decision needed.`);
            }

            if (!shouldTriggerModal) {
              console.log(`[COMPLIANCE UPDATE] ✅ Lease dates are identical - this is the same lease continuing. No inheritance modal needed for unit ${unitNumber}`);
              // Skip adding to futureLeaseMatches - the lease will automatically carry forward in snapshot preservation
            } else {
              console.log(`[COMPLIANCE UPDATE] 🎯 Lease dates have changed - inheritance decision needed for unit ${unitNumber}`);
              
              const residents = existingFutureLeaseForUnit.Resident.map(r => ({
                id: r.id,
                name: r.name,
                verifiedIncome: r.calculatedAnnualizedIncome ? parseFloat(r.calculatedAnnualizedIncome.toString()) : 0
              }));

              futureLeaseMatches.push({
                unitNumber,
                newLeaseStartDate: leaseData.leaseStartDate,
                newLeaseEndDate: leaseData.leaseEndDate,
                existingFutureLease: {
                  id: existingFutureLeaseForUnit.id,
                  name: existingFutureLeaseForUnit.name,
                  leaseStartDate: existingFutureLeaseForUnit.leaseStartDate,
                  leaseEndDate: existingFutureLeaseForUnit.leaseEndDate,
                  residents: residents
                }
              });

              console.log(`[COMPLIANCE UPDATE] ✅ Added inheritance match for unit ${unitNumber}`);
            }
          }
        }
      }

      // Add debug info to response so we can see it in browser network tab
      const debugInfo = {
        unit0103InUnitGroups: Object.keys(unitGroups || {}).includes('0103'),
        unit0103Data: (unitGroups as any)['0103'] || null,
        existingFutureLeaseFor0103: existingFutureLeases.find(lease => 
          lease.Unit.unitNumber === '0103'
        ) ? {
          leaseStartDate: existingFutureLeases.find(lease => lease.Unit.unitNumber === '0103')?.leaseStartDate,
          leaseEndDate: existingFutureLeases.find(lease => lease.Unit.unitNumber === '0103')?.leaseEndDate,
          name: existingFutureLeases.find(lease => lease.Unit.unitNumber === '0103')?.name
        } : null,
        totalExistingFutureLeases: existingFutureLeases.length,
        unitGroupsKeys: Object.keys(unitGroups || {})
      };

      // Final debugging before return
      console.log(`[COMPLIANCE UPDATE] 🎯 FINAL RESULT:`);
      console.log(`[COMPLIANCE UPDATE] - Future lease matches found: ${futureLeaseMatches.length}`);
      console.log(`[COMPLIANCE UPDATE] - hasFutureLeaseMatches: ${futureLeaseMatches.length > 0}`);
      console.log(`[COMPLIANCE UPDATE] - requiresInheritanceDecision: ${futureLeaseMatches.length > 0}`);
      if (futureLeaseMatches.length > 0) {
        console.log(`[COMPLIANCE UPDATE] - Matches:`, futureLeaseMatches.map(match => `Unit ${match.unitNumber}: ${match.existingLease.name} -> ${match.newLease.name}`));
      }

      return {
        success: true,
        snapshotId: snapshot.id,
        hasFutureLeaseMatches: futureLeaseMatches.length > 0,
        futureLeaseMatches: futureLeaseMatches,
        requiresInheritanceDecision: futureLeaseMatches.length > 0,
        message: futureLeaseMatches.length > 0 
          ? `Snapshot created. Found ${futureLeaseMatches.length} potential inheritance matches. Please make inheritance decisions before importing data.`
          : 'Snapshot created successfully. No inheritance matches found. Ready to import data.',
        debugInfo: debugInfo // Add debug info to response
      };
    });

    console.log(`[COMPLIANCE UPDATE] ✅ Phase 1 completed:`, result);
    return NextResponse.json(result);

  } catch (error) {
    console.error('❌ [COMPLIANCE UPDATE] Error in Phase 1:', error);
    return NextResponse.json(
      { error: 'Failed to create snapshot and check inheritance', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

// Helper function to compare residents between leases
function compareResidents(existingResidents: any[], newResidents: any[]) {
  const matches = [];
  
  for (const existingResident of existingResidents) {
    const bestMatch = newResidents.find(newResident => {
      // Simple name matching - could be enhanced with fuzzy matching
      const existingName = existingResident.name.toLowerCase().trim();
      const newName = newResident.name.toLowerCase().trim();
      
      // Exact match
      if (existingName === newName) return true;
      
      // Check if names are similar (allowing for minor differences)
      const similarity = calculateStringSimilarity(existingName, newName);
      return similarity >= 0.8; // 80% similarity threshold
    });
    
    matches.push({
      existingName: existingResident.name,
      newName: bestMatch?.name || 'No match',
      isMatch: !!bestMatch
    });
  }
  
  return matches;
}

// Simple string similarity calculation (Jaccard similarity)
function calculateStringSimilarity(str1: string, str2: string): number {
  const set1 = new Set(str1.split(''));
  const set2 = new Set(str2.split(''));
  
  const intersection = new Set([...set1].filter(x => set2.has(x)));
  const union = new Set([...set1, ...set2]);
  
  return intersection.size / union.size;
}