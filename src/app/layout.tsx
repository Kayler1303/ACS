import { Analytics } from "@vercel/analytics/react"
import { Playfair_Display, Lora } from 'next/font/google';
import './globals.css';
import Layout from '../components/Layout';
import GoogleAnalytics from "@/components/GoogleAnalytics";
import { Suspense } from 'react';

const playfair = Playfair_Display({
  subsets: ['latin'],
  variable: '--font-playfair-display',
});

const lora = Lora({
  subsets: ['latin'],
  variable: '--font-lora',
});

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${playfair.variable} ${lora.variable} font-sans`}>
      <body>
        <Suspense>
          <GoogleAnalytics />
        </Suspense>
        <Layout>
          {children}
        </Layout>
        <Analytics />
      </body>
    </html>
  );
}
