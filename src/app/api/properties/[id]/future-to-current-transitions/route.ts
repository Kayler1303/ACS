import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

interface FutureToCurrentTransition {
  unitId: string;
  unitNumber: string;
  futureLeaseId: string;
  futureLeaseName: string;
  currentLeaseId: string;
  currentLeaseName: string;
  hasVerifiedDocuments: boolean;
  documentCount: number;
  residentMatches: Array<{
    futureName: string;
    currentName: string;
    isMatch: boolean;
  }>;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: propertyId } = await params;
    const { searchParams } = new URL(request.url);
    const rentRollId = searchParams.get('rentRollId');

    if (!rentRollId) {
      return NextResponse.json({ error: 'rentRollId is required' }, { status: 400 });
    }

    // Get the current rent roll
    const currentRentRoll = await prisma.rentRoll.findUnique({
      where: { id: rentRollId },
      select: { uploadDate: true, propertyId: true }
    });

    if (!currentRentRoll || currentRentRoll.propertyId !== propertyId) {
      return NextResponse.json({ error: 'Rent roll not found' }, { status: 404 });
    }

    // Get the previous rent roll to compare changes
    const previousRentRoll = await prisma.rentRoll.findFirst({
      where: {
        propertyId: propertyId,
        uploadDate: { lt: currentRentRoll.uploadDate }
      },
      orderBy: { uploadDate: 'desc' },
      include: {
        Tenancy: {
          include: {
            Lease: {
              include: {
                Resident: true,
                Unit: true
              }
            }
          }
        }
      }
    });

    if (!previousRentRoll) {
      return NextResponse.json({ transitions: [] });
    }

    // Get all units for this property with their current and future leases
    const units = await prisma.unit.findMany({
      where: { propertyId },
      include: {
        Lease: {
          include: {
            Resident: true,
            IncomeVerification: {
              include: {
                IncomeDocument: {
                  where: {
                    status: { in: ['COMPLETED', 'NEEDS_REVIEW'] }
                  }
                }
              }
            },
            Tenancy: {
              where: { rentRollId },
              select: { id: true }
            }
          }
        }
      }
    });

    const transitions: FutureToCurrentTransition[] = [];

    for (const unit of units) {
      // Find current lease for this unit in the new rent roll
      const currentLease = unit.Lease.find(lease => 
        Array.isArray(lease.Tenancy) && lease.Tenancy.length > 0
      );

      if (!currentLease) continue;

      // Find previous lease for this unit in the previous rent roll
      const previousTenancy = previousRentRoll.Tenancy.find((tenancy: any) => 
        tenancy.Lease?.Unit?.id === unit.id
      );
      const previousLease = previousTenancy?.Lease;

      // Find any future leases for this unit (leases without tenancy in current rent roll)
      const futureLeases = unit.Lease.filter(lease => 
        !Array.isArray(lease.Tenancy) || lease.Tenancy.length === 0
      );

      // Check if current lease changed from previous AND there are future leases
      if (futureLeases.length > 0) {
        let leaseChanged = false;

        if (!previousLease) {
          // No previous lease, so this is a new lease
          leaseChanged = true;
        } else {
          // Compare key lease details to see if they changed
          const currentResidentNames = currentLease.Resident?.map((r: any) => r.name).sort() || [];
          const previousResidentNames = previousLease.Resident?.map((r: any) => r.name).sort() || [];
          
          const residentsChanged = JSON.stringify(currentResidentNames) !== JSON.stringify(previousResidentNames);
          const datesChanged = currentLease.leaseStartDate?.getTime() !== previousLease.leaseStartDate?.getTime() ||
                              currentLease.leaseEndDate?.getTime() !== previousLease.leaseEndDate?.getTime();
          const rentChanged = Number(currentLease.leaseRent || 0) !== Number(previousLease.leaseRent || 0);

          leaseChanged = residentsChanged || datesChanged || rentChanged;
        }

        if (leaseChanged) {
          // For each future lease, create a transition record
          for (const futureLease of futureLeases) {
            const hasVerifiedDocuments = futureLease.IncomeVerification?.some(verification => 
              verification.IncomeDocument && verification.IncomeDocument.length > 0
            ) || false;

            const documentCount = futureLease.IncomeVerification?.reduce((count, verification) => 
              count + (verification.IncomeDocument?.length || 0), 0
            ) || 0;

            // Simple resident name comparison for display
            const futureResidentNames = futureLease.Resident?.map((r: any) => r.name) || [];
            const currentResidentNames = currentLease.Resident?.map((r: any) => r.name) || [];
            
            const residentMatches = futureResidentNames.map((futureName: string) => {
              const matchingCurrent = currentResidentNames.find((currentName: string) => 
                futureName && currentName && (
                  futureName.toLowerCase().includes(currentName.toLowerCase()) ||
                  currentName.toLowerCase().includes(futureName.toLowerCase())
                )
              );
              return {
                futureName: futureName || '',
                currentName: matchingCurrent || '',
                isMatch: !!matchingCurrent
              };
            });

            transitions.push({
              unitId: unit.id,
              unitNumber: unit.unitNumber,
              futureLeaseId: futureLease.id,
              futureLeaseName: futureLease.name,
              currentLeaseId: currentLease.id,
              currentLeaseName: currentLease.name,
              hasVerifiedDocuments,
              documentCount,
              residentMatches
            });
          }
        }
      }
    }

    return NextResponse.json({ transitions });

  } catch (error) {
    console.error('Error fetching future-to-current transitions:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// Helper function to determine if a future lease likely matches a current lease
function checkLeaseMatch(futureLease: any, currentLease: any): boolean {
  // Check if lease names are similar (e.g., "August 2024 Lease Renewal" vs "Lease from 8/1/2024 to 7/31/2025")
  const futureNameLower = futureLease.name.toLowerCase();
  const currentNameLower = currentLease.name.toLowerCase();
  
  // Extract dates from lease names to compare
  const futureHasDate = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|\d{1,2}\/|\d{4})\b/i.test(futureNameLower);
  const currentHasDate = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|\d{1,2}\/|\d{4})\b/i.test(currentNameLower);
  
  // If both have dates, try to match them
  if (futureHasDate && currentHasDate) {
    // Extract year from both names
    const futureYear = futureNameLower.match(/\b20\d{2}\b/)?.[0];
    const currentYear = currentNameLower.match(/\b20\d{2}\b/)?.[0];
    
    if (futureYear && currentYear && futureYear === currentYear) {
      return true;
    }
    
    // Extract month from both names
    const monthNames = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
    const futureMonth = monthNames.find(month => futureNameLower.includes(month));
    const currentMonth = monthNames.find(month => currentNameLower.includes(month));
    
    if (futureMonth && currentMonth && futureMonth === currentMonth) {
      return true;
    }
  }
  
  // Check if lease start dates are close (within 30 days)
  if (futureLease.leaseStartDate && currentLease.leaseStartDate) {
    const futureStart = new Date(futureLease.leaseStartDate);
    const currentStart = new Date(currentLease.leaseStartDate);
    const daysDiff = Math.abs(futureStart.getTime() - currentStart.getTime()) / (1000 * 60 * 60 * 24);
    
    if (daysDiff <= 30) {
      return true;
    }
  }
  
  // Check if residents are similar
  const residentMatches = compareResidents(futureLease.Resident, currentLease.Resident);
  const matchPercentage = residentMatches.filter(match => match.isMatch).length / Math.max(residentMatches.length, 1);
  
  return matchPercentage >= 0.5; // At least 50% of residents match
}

// Helper function to compare residents between leases
function compareResidents(futureResidents: any[], currentResidents: any[]) {
  const matches = [];
  
  for (const futureResident of futureResidents) {
    const bestMatch = currentResidents.find(currentResident => {
      // Simple name matching - could be enhanced with fuzzy matching
      const futureName = futureResident.name.toLowerCase().trim();
      const currentName = currentResident.name.toLowerCase().trim();
      
      // Exact match
      if (futureName === currentName) return true;
      
      // Check if names are similar (allowing for minor differences)
      const similarity = calculateStringSimilarity(futureName, currentName);
      return similarity >= 0.8; // 80% similarity threshold
    });
    
    matches.push({
      futureName: futureResident.name,
      currentName: bestMatch?.name || 'No match',
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
    const { futureLeaseId, currentLeaseId, transferDocuments } = body;

    if (!futureLeaseId || !currentLeaseId) {
      return NextResponse.json({ error: 'Both futureLeaseId and currentLeaseId are required' }, { status: 400 });
    }

    const result = await prisma.$transaction(async (tx) => {
      if (transferDocuments) {
        // Transfer income verifications and documents from future lease to current lease
        const futureVerifications = await tx.incomeVerification.findMany({
          where: { leaseId: futureLeaseId },
          include: { IncomeDocument: true }
        });

        for (const verification of futureVerifications) {
          // Update the verification to point to the current lease
          await tx.incomeVerification.update({
            where: { id: verification.id },
            data: { leaseId: currentLeaseId }
          });
        }

        // Update residents' income data if they have verified income
        const futureResidents = await tx.resident.findMany({
          where: { 
            leaseId: futureLeaseId,
            incomeFinalized: true
          }
        });

        const currentResidents = await tx.resident.findMany({
          where: { leaseId: currentLeaseId }
        });

        // Match residents by name and transfer income data
        for (const futureResident of futureResidents) {
          const matchingCurrentResident = currentResidents.find(resident => 
            resident.name.toLowerCase().trim() === futureResident.name.toLowerCase().trim()
          );

          if (matchingCurrentResident) {
            await tx.resident.update({
              where: { id: matchingCurrentResident.id },
              data: {
                annualizedIncome: futureResident.annualizedIncome,
                calculatedAnnualizedIncome: futureResident.calculatedAnnualizedIncome,
                verifiedIncome: futureResident.verifiedIncome,
                incomeFinalized: futureResident.incomeFinalized,
                finalizedAt: futureResident.finalizedAt
              }
            });

            // Update document references to point to the new resident
            await tx.incomeDocument.updateMany({
              where: { residentId: futureResident.id },
              data: { residentId: matchingCurrentResident.id }
            });
          }
        }
      }

      // Mark the transition as processed (you might want to add a table to track this)
      // For now, we'll just return success

      return { success: true };
    });

    return NextResponse.json(result);

  } catch (error) {
    console.error('Error processing future-to-current transition:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
} 