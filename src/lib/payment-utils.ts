/**
 * Utility functions for payment status and access control
 */

export type PaymentStatus = 
  | 'PAYMENT_NEEDED'     // No payment setup or setup fee not paid
  | 'SETUP_PENDING'      // Setup fee paid but monthly subscription not active
  | 'ACTIVE'             // Fully paid and active
  | 'PAST_DUE'           // Monthly payment failed
  | 'ADMIN_GRANTED'      // Admin granted free access
  | 'CANCELED'           // Subscription canceled
  | 'UNIT_DISCREPANCY';  // Unit count mismatch detected

export interface PropertyWithPayment {
  id: string;
  name: string;
  address?: string;
  numberOfUnits?: number;
  PropertySubscription?: {
    setupFeePaid: boolean;
    subscriptionStatus: string;
    isManualPayment?: boolean;
    nextPaymentDue?: string;
    adminGrant?: { isActive: boolean } | null;
  } | null;
  UnitCountDiscrepancy?: Array<{
    status: string;
    paymentDifference: number;
    declaredUnitCount: number;
    actualUnitCount: number;
  }>;
}

/**
 * Determine the payment status for a property
 */
export function getPropertyPaymentStatus(property: PropertyWithPayment): PaymentStatus {
  const subscription = property.PropertySubscription;
  
  // Check for unit count discrepancy first (highest priority)
  if (property.UnitCountDiscrepancy?.some(d => d.status === 'PENDING')) {
    return 'UNIT_DISCREPANCY';
  }
  
  // Check for admin grant
  if (subscription?.adminGrant?.isActive) {
    return 'ADMIN_GRANTED';
  }
  
  // No subscription at all
  if (!subscription) {
    return 'PAYMENT_NEEDED';
  }
  
  // Setup fee not paid
  if (!subscription.setupFeePaid) {
    return 'PAYMENT_NEEDED';
  }
  
  // Setup fee paid but subscription status check
  switch (subscription.subscriptionStatus) {
    case 'ACTIVE':
      // For manual payments, check if payment is overdue
      if (subscription.isManualPayment && subscription.nextPaymentDue) {
        const nextDue = new Date(subscription.nextPaymentDue);
        const now = new Date();
        if (now > nextDue) {
          return 'PAST_DUE';
        }
      }
      return 'ACTIVE';
    case 'PAST_DUE':
      return 'PAST_DUE';
    case 'CANCELED':
      return 'CANCELED';
    case 'INACTIVE':
    case 'UNPAID':
      return 'SETUP_PENDING';
    default:
      return 'SETUP_PENDING';
  }
}

/**
 * Check if a property has access (can be viewed/used)
 */
export function hasPropertyAccess(property: PropertyWithPayment): boolean {
  const status = getPropertyPaymentStatus(property);
  return status === 'ACTIVE' || status === 'ADMIN_GRANTED';
}

/**
 * Get display information for payment status
 */
export function getPaymentStatusDisplay(status: PaymentStatus): {
  label: string;
  color: string;
  bgColor: string;
  description: string;
} {
  switch (status) {
    case 'PAYMENT_NEEDED':
      return {
        label: 'Payment Needed for Access',
        color: 'text-red-700',
        bgColor: 'bg-red-50 border-red-200',
        description: 'Set up payment to access this property'
      };
    case 'SETUP_PENDING':
      return {
        label: 'Setup in Progress',
        color: 'text-yellow-700',
        bgColor: 'bg-yellow-50 border-yellow-200',
        description: 'Payment setup is being processed'
      };
    case 'ACTIVE':
      return {
        label: 'Active',
        color: 'text-green-700',
        bgColor: 'bg-green-50 border-green-200',
        description: 'Property access is active'
      };
    case 'PAST_DUE':
      return {
        label: 'Payment Past Due - Access Restricted',
        color: 'text-red-700',
        bgColor: 'bg-red-50 border-red-200',
        description: 'Monthly payment failed. Update payment method to restore access.'
      };
    case 'ADMIN_GRANTED':
      return {
        label: 'Admin Access Granted',
        color: 'text-blue-700',
        bgColor: 'bg-blue-50 border-blue-200',
        description: 'Free access granted by administrator'
      };
    case 'CANCELED':
      return {
        label: 'Subscription Canceled',
        color: 'text-gray-700',
        bgColor: 'bg-gray-50 border-gray-200',
        description: 'Subscription has been canceled'
      };
    case 'UNIT_DISCREPANCY':
      return {
        label: 'Unit Count Discrepancy - Access Restricted',
        color: 'text-red-700',
        bgColor: 'bg-red-50 border-red-200',
        description: 'Property has more units than paid for. Additional payment required.'
      };
    default:
      return {
        label: 'Unknown Status',
        color: 'text-gray-700',
        bgColor: 'bg-gray-50 border-gray-200',
        description: 'Payment status unknown'
      };
  }
}
