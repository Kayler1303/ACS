'use client';

import Link from 'next/link';

interface BackToPropertyLinkProps {
  propertyId: string;
  className?: string;
  children?: React.ReactNode;
}

/**
 * Custom Link component for "Back to Property" navigation
 * Simply navigates back to property page where scroll position will be restored
 */
export default function BackToPropertyLink({ 
  propertyId, 
  className = "text-brand-blue hover:underline", 
  children = "← Back to Property" 
}: BackToPropertyLinkProps) {
  
  const handleClick = () => {
    console.log(`🔙 [BACK TO PROPERTY] Navigating back to property ${propertyId}`);
    console.log(`🔙 [BACK TO PROPERTY] Current sessionStorage keys:`, Object.keys(sessionStorage));
    console.log(`🔙 [BACK TO PROPERTY] Looking for key: property-${propertyId}-scroll`);
    console.log(`🔙 [BACK TO PROPERTY] Stored value:`, sessionStorage.getItem(`property-${propertyId}-scroll`));
  };
  
  return (
    <Link 
      href={`/property/${propertyId}`}
      className={className}
      onClick={handleClick}
    >
      {children}
    </Link>
  );
}
