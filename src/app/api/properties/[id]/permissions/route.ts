import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { getPropertyPermissions } from '@/lib/permissions';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: propertyId } = await params;
    const permissions = await getPropertyPermissions(propertyId, session.user.id);

    return NextResponse.json({
      isOwner: permissions.canShare, // Only owners can share
      canRead: permissions.canRead,
      canConfigure: permissions.canConfigure,
      canEdit: permissions.canEdit,
      canShare: permissions.canShare,
      canDelete: permissions.canDelete
    });

  } catch (error) {
    console.error('Error fetching user permissions:', error);
    return NextResponse.json(
      { error: 'Failed to fetch permissions' },
      { status: 500 }
    );
  }
} 