import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { 
  detectIncomeDiscrepancies, 
  acceptPreviouslyVerifiedIncome,
  generateStructuralLeaseSignature,
  LeaseData 
} from '@/services/verificationContinuity';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { id: propertyId } = await params;
  const { searchParams } = new URL(req.url);
  const rentRollId = searchParams.get('rentRollId');

  if (!propertyId || !rentRollId) {
    return NextResponse.json({ error: 'Property ID and Rent Roll ID are required' }, { status: 400 });
  }

  try {
    // Find leases in this rent roll that have income discrepancies
    const leasesWithDiscrepancies = await prisma.lease.findMany({
      where: {
        Tenancy: {
          rentRollId: rentRollId
        },
        Unit: {
          Property: {
            ownerId: session.user.id
          }
        }
      },
      include: {
        Resident: true,
        Unit: true,
        VerificationSnapshot: {
          where: {
            rentRollId: rentRollId
          },
          include: {
            verificationContinuity: {
              include: {
                masterVerification: {
                  include: {
                    Lease: {
                      include: {
                        Resident: true
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    });

    const discrepancyResults = [];

    for (const lease of leasesWithDiscrepancies) {
      const snapshot = lease.VerificationSnapshot[0];
      if (!snapshot?.verificationContinuity.masterVerificationId) continue;

      // Check if this lease has a structural match with existing verified data
      const leaseData: LeaseData = {
        id: lease.id,
        leaseStartDate: lease.leaseStartDate,
        leaseEndDate: lease.leaseEndDate,
        leaseRent: lease.leaseRent ? Number(lease.leaseRent) : null,
        residents: lease.Resident.map((r: any) => ({
          name: r.name,
          annualizedIncome: r.annualizedIncome ? Number(r.annualizedIncome) : null
        }))
      };

      const structuralSignature = generateStructuralLeaseSignature(leaseData);

      // Find if there's a structural match with verified income
      const structuralMatch = await prisma.verificationContinuity.findFirst({
        where: {
          propertyId,
          unitId: lease.unitId,
          leaseSignature: structuralSignature,
          masterVerificationId: { not: null }
        }
      });

      if (structuralMatch && structuralMatch.masterVerificationId) {
        const discrepancies = await detectIncomeDiscrepancies(leaseData, structuralMatch.masterVerificationId);
        
        if (discrepancies.length > 0) {
          discrepancyResults.push({
            leaseId: lease.id,
            unitNumber: lease.Unit.unitNumber,
            continuityId: snapshot.verificationContinuityId,
            structuralContinuityId: structuralMatch.id,
            discrepancies
          });
        }
      }
    }

    return NextResponse.json(discrepancyResults);
  } catch (error) {
    console.error('Error fetching income discrepancies:', error);
    return NextResponse.json(
      { error: 'Failed to fetch income discrepancies' },
      { status: 500 }
    );
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { id: propertyId } = await params;

  try {
    const body = await req.json();
    const { 
      leaseId, 
      continuityId, 
      structuralContinuityId, 
      action 
    } = body;

    if (!leaseId || !continuityId || !action) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Verify user has access to this lease
    const lease = await prisma.lease.findFirst({
      where: {
        id: leaseId,
        Unit: {
          Property: {
            ownerId: session.user.id
          }
        }
      }
    });

    if (!lease) {
      return NextResponse.json({ error: 'Lease not found' }, { status: 404 });
    }

    if (action === 'accept_verified_income') {
      if (!structuralContinuityId) {
        return NextResponse.json({ error: 'Structural continuity ID required for accepting verified income' }, { status: 400 });
      }

      // Accept the previously verified income
      const newVerificationId = await acceptPreviouslyVerifiedIncome(
        continuityId,
        structuralContinuityId,
        leaseId
      );

      return NextResponse.json({
        message: 'Previously verified income accepted successfully',
        verificationId: newVerificationId,
        notification: 'Please update the resident incomes in your property management system to match the verified amounts to avoid future discrepancies.'
      });
    } else if (action === 'reject_verified_income') {
      // User wants to start fresh verification process
      // The continuity record already exists without a master verification
      // so normal verification process will proceed
      
      return NextResponse.json({
        message: 'Verified income rejected. You can now proceed with new income verification for this lease.',
        requiresNewVerification: true
      });
    } else {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }
  } catch (error) {
    console.error('Error handling income reconciliation:', error);
    return NextResponse.json(
      { error: 'Failed to process income reconciliation' },
      { status: 500 }
    );
  }
} 