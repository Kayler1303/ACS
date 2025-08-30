import { ActivityType } from '@prisma/client';

export interface ActivityMetadata {
  [key: string]: any;
}

/**
 * Track user activity
 */
export async function trackActivity(
  activityType: ActivityType,
  description?: string,
  metadata?: ActivityMetadata
): Promise<void> {
  try {
    const response = await fetch('/api/analytics/activity', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        activityType,
        description,
        metadata,
      }),
    });

    if (!response.ok) {
      console.error('Failed to track activity:', await response.text());
    }
  } catch (error) {
    console.error('Error tracking activity:', error);
    // Don't throw error to avoid breaking the app
  }
}

/**
 * Track page view
 */
export function trackPageView(page: string, metadata?: ActivityMetadata): void {
  trackActivity('PAGE_VIEW', `Viewed ${page}`, {
    page,
    ...metadata,
  });
}

/**
 * Track property view
 */
export function trackPropertyView(propertyId: string, propertyName: string): void {
  trackActivity('PROPERTY_VIEW', `Viewed property: ${propertyName}`, {
    propertyId,
    propertyName,
  });
}

/**
 * Track snapshot upload
 */
export function trackSnapshotUpload(propertyId: string, filename?: string): void {
  trackActivity('SNAPSHOT_UPLOAD', `Uploaded snapshot: ${filename || 'Unknown'}`, {
    propertyId,
    filename,
  });
}

/**
 * Track document upload
 */
export function trackDocumentUpload(documentType: string, filename?: string): void {
  trackActivity('DOCUMENT_UPLOAD', `Uploaded ${documentType}: ${filename || 'Unknown'}`, {
    documentType,
    filename,
  });
}

/**
 * Track admin action
 */
export function trackAdminAction(action: string, details?: ActivityMetadata): void {
  trackActivity('ADMIN_ACTION', action, details);
}

/**
 * React hook for tracking page views
 */
export function usePageTracking(pageName: string, enabled: boolean = true): void {
  React.useEffect(() => {
    if (enabled && typeof window !== 'undefined') {
      // Track page view after a short delay to ensure the page has loaded
      const timer = setTimeout(() => {
        trackPageView(pageName, {
          url: window.location.pathname,
          referrer: document.referrer,
        });
      }, 1000);

      return () => clearTimeout(timer);
    }
  }, [pageName, enabled]);
}

// Import React for the hook
import React from 'react';
