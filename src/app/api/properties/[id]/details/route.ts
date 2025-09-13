import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { checkPropertyAccess } from '@/lib/permissions';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  // Use the working workaround for API routes
  const propertyId = req.nextUrl.pathname.split('/')[3];

  if (!propertyId) {
    return NextResponse.json({ error: 'Property ID missing' }, { status: 400 });
  }

  try {
    // Check if user has access to this property (owner or shared)
    const access = await checkPropertyAccess(propertyId, session.user.id);
    if (!access.hasAccess) {
      return NextResponse.json({ error: 'Property not found' }, { status: 404 });
    }

    const property = await prisma.property.findUnique({
      where: { 
        id: propertyId
      },
      select: {
        id: true,
        name: true,
        address: true,
      }
    });

    if (!property) {
      return NextResponse.json({ error: 'Property not found' }, { status: 404 });
    }

    return NextResponse.json(property);

  } catch (error: unknown) {
    console.error('Error fetching property details:', error);
    return NextResponse.json({ error: 'An unexpected error occurred.' }, { status: 500 });
  }
} 