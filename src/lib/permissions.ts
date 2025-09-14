import { prisma } from '@/lib/prisma';

// Define PermissionLevel locally since it might not be available from @prisma/client yet
enum PermissionLevel {
  READ_ONLY = 'READ_ONLY',
  CONFIGURE = 'CONFIGURE',
  EDIT = 'EDIT'
}

export interface PropertyAccess {
  hasAccess: boolean;
  permission: PermissionLevel | null;
  isOwner: boolean;
}

export interface PropertyPermissions {
  canRead: boolean;
  canConfigure: boolean; // Change settings like compliance options, analysis settings
  canEdit: boolean; // Upload files, edit data, create/delete resources
  canShare: boolean; // Only owners can share
  canDelete: boolean; // Only owners can delete
}

/**
 * Check what level of access a user has to a property
 */
export async function checkPropertyAccess(
  propertyId: string, 
  userId: string
): Promise<PropertyAccess> {
  try {
    // First check if user is the owner
    const property = await prisma.property.findUnique({
      where: { id: propertyId },
      select: { ownerId: true }
    });

    if (!property) {
      return { hasAccess: false, permission: null, isOwner: false };
    }

    if (property.ownerId === userId) {
      // For property owners, check payment status
      const subscription = await (prisma as any).propertySubscription.findUnique({
        where: { propertyId },
        include: {
          adminGrant: {
            where: { isActive: true }
          }
        }
      });

      // Check for unit count discrepancies
      const discrepancies = await (prisma as any).unitCountDiscrepancy.findMany({
        where: {
          propertyId,
          status: 'PENDING'
        }
      });

      const propertyWithPayment = {
        id: propertyId,
        PropertySubscription: subscription,
        UnitCountDiscrepancy: discrepancies
      };

      // Import payment utils dynamically to avoid circular imports
      const { hasPropertyAccess } = await import('@/lib/payment-utils');
      const hasPaymentAccess = hasPropertyAccess(propertyWithPayment as any);

      if (!hasPaymentAccess) {
        return { hasAccess: false, permission: null, isOwner: true };
      }

      return { hasAccess: true, permission: PermissionLevel.EDIT, isOwner: true };
    }

    // Check if user has shared access
    const share = await prisma.propertyShare.findUnique({
      where: {
        propertyId_userId: {
          propertyId,
          userId
        }
      },
      select: { permission: true }
    });

    if (share) {
      return { hasAccess: true, permission: share.permission as any, isOwner: false };
    }

    return { hasAccess: false, permission: null, isOwner: false };
  } catch (error) {
    console.error('Error checking property access:', error);
    return { hasAccess: false, permission: null, isOwner: false };
  }
}

/**
 * Get detailed permissions for a user on a property
 */
export async function getPropertyPermissions(
  propertyId: string, 
  userId: string
): Promise<PropertyPermissions> {
  const access = await checkPropertyAccess(propertyId, userId);

  if (!access.hasAccess) {
    return {
      canRead: false,
      canConfigure: false,
      canEdit: false,
      canShare: false,
      canDelete: false
    };
  }

  if (access.isOwner) {
    return {
      canRead: true,
      canConfigure: true,
      canEdit: true,
      canShare: true,
      canDelete: true
    };
  }

  // Shared access permissions
  switch (access.permission) {
    case PermissionLevel.EDIT:
      return {
        canRead: true,
        canConfigure: true,
        canEdit: true,
        canShare: false,
        canDelete: false
      };
    case PermissionLevel.CONFIGURE:
      return {
        canRead: true,
        canConfigure: true,
        canEdit: false,
        canShare: false,
        canDelete: false
      };
    case PermissionLevel.READ_ONLY:
      return {
        canRead: true,
        canConfigure: false,
        canEdit: false,
        canShare: false,
        canDelete: false
      };
    default:
      return {
        canRead: false,
        canConfigure: false,
        canEdit: false,
        canShare: false,
        canDelete: false
      };
  }
}

/**
 * Middleware function to check if user has required permission level
 */
export async function requirePermission(
  propertyId: string,
  userId: string,
  requiredPermission: 'read' | 'configure' | 'edit' | 'share' | 'delete'
): Promise<boolean> {
  const permissions = await getPropertyPermissions(propertyId, userId);

  switch (requiredPermission) {
    case 'read':
      return permissions.canRead;
    case 'configure':
      return permissions.canConfigure;
    case 'edit':
      return permissions.canEdit;
    case 'share':
      return permissions.canShare;
    case 'delete':
      return permissions.canDelete;
    default:
      return false;
  }
}

/**
 * Get all properties a user has access to (owned + shared)
 */
export async function getUserAccessibleProperties(userId: string) {
  const [ownedProperties, sharedProperties] = await Promise.all([
    // Owned properties
    prisma.property.findMany({
      where: { ownerId: userId },
      include: {
        User: {
          select: { name: true, email: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    }),
    
    // Shared properties
    prisma.propertyShare.findMany({
      where: { userId },
      include: {
        property: {
          include: {
            User: {
              select: { name: true, email: true }
            }
          }
        },
        sharedBy: {
          select: { name: true, email: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    })
  ]);

  // Get subscription data separately to avoid TypeScript issues
  const allPropertyIds = [
    ...ownedProperties.map(p => p.id),
    ...sharedProperties.map(s => s.property.id)
  ];

  const subscriptions = await (prisma as any).propertySubscription.findMany({
    where: {
      propertyId: { in: allPropertyIds }
    },
    include: {
      adminGrant: {
        where: { isActive: true }
      }
    }
  });

  // Fetch unit count discrepancies
  const discrepancies = await (prisma as any).unitCountDiscrepancy.findMany({
    where: {
      propertyId: { in: allPropertyIds },
      status: 'PENDING'
    }
  });

  const subscriptionMap = new Map(subscriptions.map((s: any) => [s.propertyId, s]));
  const discrepancyMap = new Map();
  
  // Group discrepancies by property ID
  discrepancies.forEach((d: any) => {
    if (!discrepancyMap.has(d.propertyId)) {
      discrepancyMap.set(d.propertyId, []);
    }
    discrepancyMap.get(d.propertyId).push(d);
  });

  // Add subscription and discrepancy data to properties
  const ownedWithSubscriptions = ownedProperties.map(property => ({
    ...property,
    PropertySubscription: subscriptionMap.get(property.id) || null,
    UnitCountDiscrepancy: discrepancyMap.get(property.id) || []
  }));

  const sharedWithSubscriptions = sharedProperties.map(share => ({
    ...share,
    property: {
      ...share.property,
      PropertySubscription: subscriptionMap.get(share.property.id) || null,
      UnitCountDiscrepancy: discrepancyMap.get(share.property.id) || []
    }
  }));

  return {
    owned: ownedWithSubscriptions,
    shared: sharedWithSubscriptions
  };
}

/**
 * Get all users a property is shared with
 */
export async function getPropertyShares(propertyId: string, ownerId: string) {
  // Verify ownership first
  const property = await prisma.property.findUnique({
    where: { id: propertyId },
    select: { ownerId: true }
  });

  if (!property || property.ownerId !== ownerId) {
    throw new Error('Property not found or access denied');
  }

  return prisma.propertyShare.findMany({
    where: { propertyId },
    include: {
      user: {
        select: { id: true, name: true, email: true }
      },
      sharedBy: {
        select: { name: true, email: true }
      }
    },
    orderBy: { createdAt: 'desc' }
  });
} 