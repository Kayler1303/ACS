import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: propertyId } = await params;
    const body = await req.json();
    
    const { 
      complianceOption, 
      includeRentAnalysis, 
      includeUtilityAllowances, 
      utilityAllowances 
    } = body;

    // Verify property ownership
    const property = await prisma.property.findFirst({
      where: {
        id: propertyId,
        ownerId: session.user.id,
      },
    });

    if (!property) {
      return NextResponse.json({ error: 'Property not found' }, { status: 404 });
    }

    // Build update data object with only provided fields
    const updateData: any = {};
    if (complianceOption !== undefined) updateData.complianceOption = complianceOption;
    if (includeRentAnalysis !== undefined) updateData.includeRentAnalysis = includeRentAnalysis;
    if (includeUtilityAllowances !== undefined) updateData.includeUtilityAllowances = includeUtilityAllowances;
    if (utilityAllowances !== undefined) updateData.utilityAllowances = utilityAllowances;

    const updatedProperty = await prisma.property.update({
      where: { id: propertyId },
      data: updateData,
    });

    return NextResponse.json({
      success: true,
      property: updatedProperty,
    });

  } catch (error) {
    console.error('Error updating analysis settings:', error);
    return NextResponse.json(
      { error: 'Failed to update analysis settings' },
      { status: 500 }
    );
  }
} 