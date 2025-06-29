"use client";

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';

const Header = () => (
    <header className="bg-white shadow-md">
        <div className="container mx-auto px-6 py-4">
            <div className="flex items-center justify-between">
                <div className="flex-shrink-0">
                    <Link href="/">
                        <Image src="/SVG FILE.svg" alt="Apartment Compliance Solutions" width={420} height={116} />
                    </Link>
                </div>
                <nav className="space-x-6 relative top-4">
                    <Link href="/solutions" className="text-brand-blue hover:text-gray-600 text-2xl">Solutions</Link>
                    <Link href="/about" className="text-brand-blue hover:text-gray-600 text-2xl">About Us</Link>
                    <Link href="/contact" className="text-brand-blue hover:text-gray-600 text-2xl">Contact</Link>
                </nav>
            </div>
        </div>
    </header>
);

const Footer = ({ isContactPage }: { isContactPage: boolean }) => {
  const footerClasses = isContactPage
    ? "bg-brand-blue text-white p-4 mt-8"
    : "text-brand-blue p-4 mt-8";

  return (
    <footer className={footerClasses}>
      <div className="container mx-auto text-center">
        <p>&copy; {new Date().getFullYear()} Apartment Compliance Solutions. All Rights Reserved.</p>
      </div>
    </footer>
  );
};

const Layout = ({ children }: { children: React.ReactNode }) => {
  const pathname = usePathname();
  const isContactPage = pathname === '/contact';
  
  return (
    <div className="flex flex-col min-h-screen">
      <Header />
      <main className="flex-grow container mx-auto p-4">
        {children}
      </main>
      <Footer isContactPage={isContactPage} />
    </div>
  );
};

export default Layout; 