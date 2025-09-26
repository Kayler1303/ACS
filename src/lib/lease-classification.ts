/**
 * Lease Classification Utilities
 * 
 * Provides consistent logic for determining if a lease is current or future
 * using the explicit leaseType field instead of date-based classification.
 * 
 * This replaces the previous date-based logic with explicit lease types.
 */

export interface LeaseClassificationInput {
  leaseType: 'CURRENT' | 'FUTURE';
  leaseStartDate?: Date | string | null; // Optional for backward compatibility
  rentRollDate?: Date | string; // Optional for backward compatibility
}

export interface LeaseWithType {
  leaseType: 'CURRENT' | 'FUTURE';
  leaseStartDate?: Date | string | null;
  name?: string;
  [key: string]: any;
}

/**
 * Determines if a lease is a future lease using explicit leaseType
 * @param lease - Lease object with leaseType
 * @returns true if lease is a future lease, false if current lease
 */
export function isFutureLease(lease: LeaseWithType): boolean {
  return lease.leaseType === 'FUTURE';
}

/**
 * Determines if a lease is a current lease using explicit leaseType
 * @param lease - Lease object with leaseType
 * @returns true if lease is a current lease, false if future lease
 */
export function isCurrentLease(lease: LeaseWithType): boolean {
  return lease.leaseType === 'CURRENT';
}

/**
 * Filters an array of leases to only future leases
 * @param leases - Array of lease objects with leaseType
 * @returns Array of future leases
 */
export function filterFutureLeases<T extends LeaseWithType>(leases: T[]): T[] {
  return leases.filter(lease => isFutureLease(lease));
}

/**
 * Filters an array of leases to only current leases
 * @param leases - Array of lease objects with leaseType
 * @returns Array of current leases
 */
export function filterCurrentLeases<T extends LeaseWithType>(leases: T[]): T[] {
  return leases.filter(lease => isCurrentLease(lease));
}

/**
 * Gets lease classification as a string
 * @param lease - Lease object with leaseType
 * @returns 'current' or 'future'
 */
export function getLeaseType(lease: LeaseWithType): 'current' | 'future' {
  return lease.leaseType === 'FUTURE' ? 'future' : 'current';
}

/**
 * Debug helper to log lease classification details
 * @param lease - Lease object with leaseType
 * @param context - Optional context for logging
 */
export function debugLeaseClassification(
  lease: LeaseWithType, 
  context?: string
): void {
  const leaseStart = lease.leaseStartDate ? new Date(lease.leaseStartDate) : null;
  const type = getLeaseType(lease);
  
  const prefix = context ? `[${context}]` : '[LEASE CLASSIFICATION]';
  console.log(`${prefix} Lease: ${lease.name || 'Unnamed'}`);
  console.log(`${prefix} - Start Date: ${leaseStart?.toISOString() || 'null'}`);
  console.log(`${prefix} - Lease Type: ${lease.leaseType}`);
  console.log(`${prefix} - Classification: ${type.toUpperCase()}`);
  console.log(`${prefix} - Logic: Explicit leaseType field (no date comparison needed)`);
}

/**
 * Legacy function for backward compatibility - converts date-based classification to leaseType
 * @deprecated Use explicit leaseType field instead
 */
export function classifyLeaseByDate(
  leaseStartDate: Date | string | null,
  rentRollDate: Date | string
): 'CURRENT' | 'FUTURE' {
  console.warn('[LEASE CLASSIFICATION] Using deprecated date-based classification. Please migrate to explicit leaseType field.');
  
  if (!leaseStartDate) {
    return 'FUTURE';
  }

  const leaseStart = new Date(leaseStartDate);
  const rollDate = new Date(rentRollDate);
  
  return leaseStart > rollDate ? 'FUTURE' : 'CURRENT';
}
