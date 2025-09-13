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
    console.log(`[NAVIGATION] Navigating back to property ${propertyId} - scroll position will be restored`);
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
