'use client';

import { useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { trackPageView } from '@/lib/analytics';

interface PageTrackerProps {
  pageName: string;
  metadata?: Record<string, any>;
}

export function PageTracker({ pageName, metadata }: PageTrackerProps) {
  const { data: session } = useSession();

  useEffect(() => {
    if (session?.user && typeof window !== 'undefined') {
      // Track page view after a short delay to ensure the page has loaded
      const timer = setTimeout(() => {
        trackPageView(pageName, {
          url: window.location.pathname,
          referrer: document.referrer,
          userAgent: navigator.userAgent,
          ...metadata,
        });
      }, 1000);

      return () => clearTimeout(timer);
    }
  }, [pageName, metadata, session]);

  return null; // This component doesn't render anything
}
