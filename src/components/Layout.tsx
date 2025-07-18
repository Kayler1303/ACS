"use client";

import React, { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { useSession, signOut } from 'next-auth/react';

const Header = () => {
    const pathname = usePathname();
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const { data: session } = useSession();
    const navLinks = [
        { href: '/solutions', label: 'Solutions' },
        { href: '/about', label: 'About Us' },
        { href: '/contact', label: 'Contact' },
    ];
    return (
    <header className="bg-white">
        <div className="container mx-auto px-6 py-4">
            <div className="flex items-center justify-between">
                <div className="flex-shrink-0">
                    <Link href="/">
                        <Image src="/logo-main.svg" alt="Apartment Compliance Solutions" width={300} height={83} />
                    </Link>
                </div>
                {/* Hamburger Menu Button */}
                <div className="md:hidden">
                    <button onClick={() => setIsMenuOpen(!isMenuOpen)} className="text-brand-blue focus:outline-none">
                        <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            {isMenuOpen ? (
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            ) : (
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16m-7 6h7" />
                            )}
                        </svg>
                    </button>
                </div>
                {/* Desktop Navigation */}
                <nav className="hidden md:flex space-x-6 relative top-4">
                    {navLinks.map(({ href, label }) => (
                        <Link
                            key={href}
                            href={href}
                            className={`text-2xl hover:text-gray-600 ${
                                pathname === href ? 'text-brand-accent' : 'text-brand-blue'
                            }`}
                        >
                            {label}
                        </Link>
                    ))}
                    {session ? (
                        <>
                            <Link href="/dashboard" className={`text-2xl hover:text-gray-600 ${pathname === '/dashboard' ? 'text-brand-accent' : 'text-brand-blue'}`}>
                                Dashboard
                            </Link>
                            <button onClick={() => signOut()} className="text-2xl hover:text-gray-600 text-brand-blue">
                                Logout
                            </button>
                        </>
                    ) : (
                        <Link href="/auth/signin" className={`text-2xl hover:text-gray-600 ${pathname === '/api/auth/signin' ? 'text-brand-accent' : 'text-brand-blue'}`}>
                            Login
                        </Link>
                    )}
                </nav>
            </div>
            {/* Mobile Navigation Menu */}
            {isMenuOpen && (
                <nav className="mt-4 md:hidden">
                    {navLinks.map(({ href, label }) => (
                        <Link
                            key={href}
                            href={href}
                            onClick={() => setIsMenuOpen(false)}
                            className={`block py-2 text-center text-lg ${
                                pathname === href ? 'text-brand-accent' : 'text-brand-blue'
                            }`}
                        >
                            {label}
                        </Link>
                    ))}
                    {session ? (
                        <>
                            <Link href="/dashboard" onClick={() => setIsMenuOpen(false)} className={`block py-2 text-center text-lg ${pathname === '/dashboard' ? 'text-brand-accent' : 'text-brand-blue'}`}>
                                Dashboard
                            </Link>
                            <button onClick={() => { signOut(); setIsMenuOpen(false); }} className="block py-2 text-center text-lg text-brand-blue w-full">
                                Logout
                            </button>
                        </>
                    ) : (
                        <Link href="/auth/signin" onClick={() => setIsMenuOpen(false)} className={`block py-2 text-center text-lg ${pathname === '/api/auth/signin' ? 'text-brand-accent' : 'text-brand-blue'}`}>
                            Login
                        </Link>
                    )}
                </nav>
            )}
        </div>
    </header>
)};

// The Footer component displays the copyright information.
const Footer = ({ isContactPage }: { isContactPage: boolean }) => {
  const footerClasses = isContactPage
    ? "bg-brand-blue text-white p-4 mt-8"
    : "text-brand-blue p-4 mt-8";

  return (
    <footer className={footerClasses}>
      <div className="container mx-auto text-center flex flex-col items-center">
        <p>&copy; {new Date().getFullYear()} Apartment Compliance Solutions. All Rights Reserved.</p>
        <Link href="/privacy-policy" className="text-sm mt-2 hover:underline">
          Privacy Policy
        </Link>
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
      <main className="flex-grow">
        {children}
      </main>
      <Footer isContactPage={isContactPage} />
    </div>
  );
};

export default Layout; 