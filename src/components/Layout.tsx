"use client";

import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { Lora } from 'next/font/google';
import localFont from 'next/font/local';

const lora = Lora({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-lora',
});

const boston = localFont({
  src: [
    {
      path: '../assets/fonts/BostonRegular.otf',
      weight: '400',
      style: 'normal',
    },
    {
      path: '../assets/fonts/BostonBold.otf',
      weight: '700',
      style: 'normal',
    },
  ],
  variable: '--font-boston',
});

const Header = () => (
    <header className="bg-white text-black py-3 px-6">
      <div className="container mx-auto flex justify-between items-center">
        <Link href="/">
          <Image src="/logo.svg" alt="Apartment Compliance Solutions Logo" width={350} height={95} />
        </Link>
        <nav className="mt-7">
          <ul className="flex space-x-6">
            <li>
              <Link href="/solutions" className="text-xl text-brand-blue hover:text-brand-accent transition-colors">Solutions</Link>
            </li>
            <li>
              <Link href="/about" className="text-xl text-brand-blue hover:text-brand-accent transition-colors">About Us</Link>
            </li>
            <li>
              <Link href="/contact" className="text-xl text-brand-blue hover:text-brand-accent transition-colors">Contact Us</Link>
            </li>
          </ul>
        </nav>
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
    <div className={`flex flex-col min-h-screen ${boston.variable} ${lora.variable} font-sans`}>
      <Header />
      <main className="flex-grow container mx-auto p-4">
        {children}
      </main>
      <Footer isContactPage={isContactPage} />
    </div>
  );
};

export default Layout; 