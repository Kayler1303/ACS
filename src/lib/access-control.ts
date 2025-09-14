import { prisma } from '@/lib/prisma';
import { hasPropertyAccess } from '@/lib/payment-utils';

/**
 * Check if a user has access to a property based on payment status and admin grants
 */
export async function checkPropertyAccess(propertyId: string, userId: string): Promise<{
  hasAccess: boolean;
  reason?: string;
  redirectTo?: string;
}> {
  try {
    // First check if user owns or has shared access to the property
    const property = await prisma.property.findFirst({
      where: {
        id: propertyId,
        OR: [
          { ownerId: userId },
          {
            PropertyShare: {
              some: { userId }
            }
          }
        ]
      },
      include: {
        PropertyShare: {
          where: { userId }
        }
      }
    });

    if (!property) {
      return {
        hasAccess: false,
        reason: 'Property not found or access denied',
        redirectTo: '/dashboard'
      };
    }

    // If user doesn't own the property, they have shared access - allow it
    if (property.ownerId !== userId) {
      return { hasAccess: true };
    }

    // For owned properties, check payment status
    const subscription = await (prisma as any).propertySubscription.findUnique({
      where: { propertyId },
      include: {
        adminGrant: {
          where: { isActive: true }
        }
      }
    });

    const propertyWithPayment = {
      ...property,
      address: property.address || undefined,
      numberOfUnits: property.numberOfUnits || undefined,
      PropertySubscription: subscription
    };

    const hasPaymentAccess = hasPropertyAccess(propertyWithPayment as any);

    if (!hasPaymentAccess) {
      return {
        hasAccess: false,
        reason: 'Payment required for property access',
        redirectTo: `/property/${propertyId}/payment-setup`
      };
    }

    return { hasAccess: true };

  } catch (error) {
    console.error('Error checking property access:', error);
    return {
      hasAccess: false,
      reason: 'Error checking access permissions',
      redirectTo: '/dashboard'
    };
  }
}

/**
 * Middleware function to protect property routes
 */
export async function requirePropertyAccess(propertyId: string, userId: string) {
  const accessCheck = await checkPropertyAccess(propertyId, userId);
  
  if (!accessCheck.hasAccess) {
    throw new Error(accessCheck.reason || 'Access denied');
  }
  
  return accessCheck;
}
