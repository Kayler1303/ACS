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
      
      // Robust scroll restoration that waits for content to load
      const attemptScroll = (attempt = 1, maxAttempts = 10) => {
        const currentDocHeight = document.documentElement.scrollHeight;
        const viewportHeight = window.innerHeight;
        const maxScrollPosition = currentDocHeight - viewportHeight;
        
        console.log(`📏 [SCROLL RESTORE] Attempt ${attempt}: Document height: ${currentDocHeight}, Max scroll: ${maxScrollPosition}, Target: ${scrollPosition}`);
        
        // If the document is tall enough for our target scroll position, scroll now
        if (maxScrollPosition >= scrollPosition || attempt >= maxAttempts) {
          console.log(`📍 [SCROLL RESTORE] Scrolling to: ${Math.min(scrollPosition, maxScrollPosition)}`);
          window.scrollTo({
            top: Math.min(scrollPosition, maxScrollPosition),
            behavior: 'instant'
          });
          
          // Verify the scroll worked
          setTimeout(() => {
            const currentScroll = window.scrollY;
            console.log(`✅ [SCROLL RESTORE] Final scroll position: ${currentScroll} (target was ${scrollPosition})`);
            if (Math.abs(currentScroll - scrollPosition) > 50) {
              console.log(`⚠️ [SCROLL RESTORE] Scroll position differs by more than 50px from target`);
            }
          }, 100);
          
          // Clean up the stored position after successful restoration
          sessionStorage.removeItem(scrollKey);
          console.log(`🧹 [SCROLL RESTORE] Cleaned up stored position for key: ${scrollKey}`);
        } else {
          // Document not tall enough yet, wait and try again
          console.log(`⏳ [SCROLL RESTORE] Document not tall enough yet, waiting... (attempt ${attempt}/${maxAttempts})`);
          setTimeout(() => attemptScroll(attempt + 1, maxAttempts), 100);
        }
      };
      
      // Start attempting to scroll
      attemptScroll();
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
