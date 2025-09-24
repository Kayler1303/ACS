/**
 * Lease Classification Utilities
 * 
 * Provides consistent logic for determining if a lease is current or future
 * based on lease start date vs rent roll date comparison.
 */

export interface LeaseClassificationInput {
  leaseStartDate: Date | string | null;
  rentRollDate: Date | string;
}

export interface LeaseWithDates {
  leaseStartDate: Date | string | null;
  name?: string;
  [key: string]: any;
}

/**
 * Determines if a lease is a future lease based on dates
 * @param lease - Lease object with leaseStartDate
 * @param rentRollDate - The rent roll snapshot date
 * @returns true if lease is a future lease, false if current lease
 */
export function isFutureLease(lease: LeaseWithDates, rentRollDate: Date | string): boolean {
  // Manual future lease with no date is always future
  if (!lease.leaseStartDate) {
    return true;
  }

  const leaseStart = new Date(lease.leaseStartDate);
  const rollDate = new Date(rentRollDate);
  
  // Future lease starts after the rent roll date
  return leaseStart > rollDate;
}

/**
 * Determines if a lease is a current lease based on dates
 * @param lease - Lease object with leaseStartDate  
 * @param rentRollDate - The rent roll snapshot date
 * @returns true if lease is a current lease, false if future lease
 */
export function isCurrentLease(lease: LeaseWithDates, rentRollDate: Date | string): boolean {
  return !isFutureLease(lease, rentRollDate);
}

/**
 * Filters an array of leases to only future leases
 * @param leases - Array of lease objects
 * @param rentRollDate - The rent roll snapshot date
 * @returns Array of future leases
 */
export function filterFutureLeases<T extends LeaseWithDates>(
  leases: T[], 
  rentRollDate: Date | string
): T[] {
  return leases.filter(lease => isFutureLease(lease, rentRollDate));
}

/**
 * Filters an array of leases to only current leases
 * @param leases - Array of lease objects
 * @param rentRollDate - The rent roll snapshot date
 * @returns Array of current leases
 */
export function filterCurrentLeases<T extends LeaseWithDates>(
  leases: T[], 
  rentRollDate: Date | string
): T[] {
  return leases.filter(lease => isCurrentLease(lease, rentRollDate));
}

/**
 * Gets lease classification as a string
 * @param lease - Lease object with leaseStartDate
 * @param rentRollDate - The rent roll snapshot date
 * @returns 'current' or 'future'
 */
export function getLeaseType(lease: LeaseWithDates, rentRollDate: Date | string): 'current' | 'future' {
  return isFutureLease(lease, rentRollDate) ? 'future' : 'current';
}

/**
 * Debug helper to log lease classification details
 * @param lease - Lease object
 * @param rentRollDate - The rent roll snapshot date
 * @param context - Optional context for logging
 */
export function debugLeaseClassification(
  lease: LeaseWithDates, 
  rentRollDate: Date | string, 
  context?: string
): void {
  const leaseStart = lease.leaseStartDate ? new Date(lease.leaseStartDate) : null;
  const rollDate = new Date(rentRollDate);
  const type = getLeaseType(lease, rentRollDate);
  
  const prefix = context ? `[${context}]` : '[LEASE CLASSIFICATION]';
  console.log(`${prefix} Lease: ${lease.name || 'Unnamed'}`);
  console.log(`${prefix} - Start Date: ${leaseStart?.toISOString() || 'null'}`);
  console.log(`${prefix} - Rent Roll Date: ${rollDate.toISOString()}`);
  console.log(`${prefix} - Classification: ${type.toUpperCase()}`);
  console.log(`${prefix} - Logic: ${leaseStart ? `${leaseStart.toISOString()} ${leaseStart > rollDate ? '>' : '<='} ${rollDate.toISOString()}` : 'No start date = future'}`);
}
