import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: propertyId } = await params;
    const {
      complianceOption,
      includeRentAnalysis,
      includeUtilityAllowances,
      utilityAllowances,
      placedInServiceDate
    } = await request.json();

    // Verify the user owns this property
    const property = await prisma.property.findFirst({
      where: {
        id: propertyId,
        ownerId: session.user.id
      }
    });

    if (!property) {
      return NextResponse.json({ error: 'Property not found or access denied' }, { status: 404 });
    }

    // Update the property settings
    const updatedProperty = await prisma.property.update({
      where: { id: propertyId },
      data: {
        complianceOption,
        includeRentAnalysis,
        includeUtilityAllowances,
        utilityAllowances: utilityAllowances || null,
        placedInServiceDate: placedInServiceDate ? new Date(placedInServiceDate) : null
      }
    });

    return NextResponse.json({
      success: true,
      property: {
        complianceOption: updatedProperty.complianceOption,
        includeRentAnalysis: updatedProperty.includeRentAnalysis,
        includeUtilityAllowances: updatedProperty.includeUtilityAllowances,
        utilityAllowances: updatedProperty.utilityAllowances,
        placedInServiceDate: updatedProperty.placedInServiceDate
      }
    });

  } catch (error) {
    console.error('Error updating property settings:', error);
    return NextResponse.json({ error: 'Failed to update settings' }, { status: 500 });
  }
} 