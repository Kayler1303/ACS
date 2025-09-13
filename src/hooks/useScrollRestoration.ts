import { useEffect, useCallback } from 'react';
import { useRouter, usePathname } from 'next/navigation';

/**
 * Custom hook to handle scroll position restoration for better UX
 * Stores scroll position when navigating away and restores it when returning
 */
export function useScrollRestoration(key?: string) {
  const router = useRouter();
  const pathname = usePathname();
  
  // Create a unique key for this page's scroll position
  const scrollKey = key || `scroll-${pathname}`;
  
  // Save current scroll position to sessionStorage
  const saveScrollPosition = useCallback(() => {
    const scrollY = window.scrollY;
    sessionStorage.setItem(scrollKey, scrollY.toString());
    console.log(`[SCROLL] Saved scroll position: ${scrollY} for key: ${scrollKey}`);
  }, [scrollKey]);
  
  // Restore scroll position from sessionStorage
  const restoreScrollPosition = useCallback(() => {
    const savedScrollY = sessionStorage.getItem(scrollKey);
    if (savedScrollY) {
      const scrollPosition = parseInt(savedScrollY, 10);
      console.log(`[SCROLL] Restoring scroll position: ${scrollPosition} for key: ${scrollKey}`);
      
      // Use requestAnimationFrame to ensure DOM is ready
      requestAnimationFrame(() => {
        window.scrollTo({
          top: scrollPosition,
          behavior: 'instant' // Instant scroll, no animation
        });
      });
      
      // Clean up the stored position after restoring
      sessionStorage.removeItem(scrollKey);
    }
  }, [scrollKey]);
  
  // Save scroll position before navigating away
  const handleBeforeUnload = useCallback(() => {
    saveScrollPosition();
  }, [saveScrollPosition]);
  
  // Set up scroll restoration on mount and cleanup on unmount
  useEffect(() => {
    // Restore scroll position when component mounts
    restoreScrollPosition();
    
    // Save scroll position before page unload
    window.addEventListener('beforeunload', handleBeforeUnload);
    
    // Cleanup
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [restoreScrollPosition, handleBeforeUnload]);
  
  // Return function to manually save scroll position (for programmatic navigation)
  return {
    saveScrollPosition,
    restoreScrollPosition
  };
}

/**
 * Hook specifically for "Back to Property" navigation
 * Saves scroll position with a property-specific key
 */
export function usePropertyScrollRestoration(propertyId: string) {
  return useScrollRestoration(`property-${propertyId}-scroll`);
}
