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
    console.log(`🔄 [SCROLL SAVE] Saved scroll position: ${scrollY} for key: ${scrollKey}`);
    console.log(`🔄 [SCROLL SAVE] sessionStorage now contains:`, sessionStorage.getItem(scrollKey));
  }, [scrollKey]);
  
  // Restore scroll position from sessionStorage
  const restoreScrollPosition = useCallback(() => {
    console.log(`🔍 [SCROLL RESTORE] Checking for saved scroll position with key: ${scrollKey}`);
    const savedScrollY = sessionStorage.getItem(scrollKey);
    console.log(`🔍 [SCROLL RESTORE] Found saved position:`, savedScrollY);
    
    if (savedScrollY) {
      const scrollPosition = parseInt(savedScrollY, 10);
      console.log(`🚀 [SCROLL RESTORE] Restoring scroll position: ${scrollPosition} for key: ${scrollKey}`);
      
      // Use multiple approaches to ensure scroll restoration works
      const doScroll = () => {
        console.log(`📍 [SCROLL RESTORE] Actually scrolling to: ${scrollPosition}`);
        window.scrollTo({
          top: scrollPosition,
          behavior: 'instant' // Instant scroll, no animation
        });
        
        // Verify the scroll worked
        setTimeout(() => {
          const currentScroll = window.scrollY;
          console.log(`✅ [SCROLL RESTORE] Current scroll after restoration: ${currentScroll} (target was ${scrollPosition})`);
        }, 100);
      };
      
      // Try immediate scroll
      doScroll();
      
      // Also try with requestAnimationFrame
      requestAnimationFrame(doScroll);
      
      // And try with a small delay to ensure DOM is fully ready
      setTimeout(doScroll, 50);
      
      // Clean up the stored position after restoring
      sessionStorage.removeItem(scrollKey);
      console.log(`🧹 [SCROLL RESTORE] Cleaned up stored position for key: ${scrollKey}`);
    } else {
      console.log(`❌ [SCROLL RESTORE] No saved scroll position found for key: ${scrollKey}`);
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
