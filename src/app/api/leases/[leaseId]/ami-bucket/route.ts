import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { calculateAmiBucketForLease, HudIncomeLimits } from '@/services/income';
import { getHudIncomeLimits } from '@/services/hud';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ leaseId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { leaseId } = await params;

    // Get lease with all related data
    const lease = await prisma.lease.findFirst({
      where: { 
        id: leaseId,
        Unit: {
          Property: {
            ownerId: session.user.id
          }
        }
      },
      include: {
        Resident: true,
        IncomeVerification: {
          where: { status: 'FINALIZED' },
          orderBy: { createdAt: 'desc' },
          take: 1,
          include: {
            IncomeDocument: true
          }
        },
        Unit: {
          include: {
            Property: true
          }
        }
      }
    });

    if (!lease) {
      return NextResponse.json({ error: 'Lease not found or access denied' }, { status: 404 });
    }

    // Check if there's a finalized income verification
    const finalized = lease.IncomeVerification[0];
    if (!finalized) {
      return NextResponse.json({ 
        error: 'No finalized income verification found for this lease' 
      }, { status: 400 });
    }

    // Get HUD income limits for the property's location
    const currentYear = new Date().getFullYear();
    const property = lease.Unit.Property;
    
    if (!property.county || !property.state) {
      return NextResponse.json({ 
        error: 'Property is missing county or state information' 
      }, { status: 400 });
    }

    // Try current year first, then fall back to previous year
    let hudIncomeLimits: HudIncomeLimits | null = null;
    let actualYear = currentYear;
    let hudError = null;
    
    try {
      hudIncomeLimits = await getHudIncomeLimits(property.county, property.state, currentYear);
    } catch (error) {
      try {
        // Fall back to previous year if current year fails
        hudIncomeLimits = await getHudIncomeLimits(property.county, property.state, currentYear - 1);
        actualYear = currentYear - 1;
      } catch (fallbackError) {
        console.error('AMI Bucket API: HUD income limits failed for both years:', fallbackError);
        hudError = 'HUD API timeout or unavailable';
        // Don't return 400 - continue with null income limits
      }
    }

    // Calculate AMI bucket information
    let amiBucketInfo;
    if (hudIncomeLimits) {
      amiBucketInfo = calculateAmiBucketForLease(
        lease.Resident,
        finalized.IncomeDocument,
        hudIncomeLimits
      );
    } else {
      // Return placeholder data when HUD limits are unavailable
      amiBucketInfo = {
        amiBucket: 'HUD data unavailable',
        totalIncome: 0,
        householdSize: lease.Resident.length,
        error: hudError
      };
    }

    // Add additional context information
    const response = {
      ...amiBucketInfo,
      leaseId: lease.id,
      leaseName: lease.name,
      verificationId: finalized.id,
      finalizedAt: finalized.finalizedAt,
      hudDataYear: hudIncomeLimits ? actualYear : null,
      propertyLocation: `${property.county}, ${property.state}`
    };

    return NextResponse.json(response);

  } catch (error) {
    console.error('Error calculating AMI bucket:', error);
    return NextResponse.json(
      { error: 'Failed to calculate AMI bucket' }, 
      { status: 500 }
    );
  }
} 