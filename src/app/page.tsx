import type { Metadata } from 'next';
import Link from 'next/link';
import { ShieldCheckIcon, UserGroupIcon, ChatBubbleLeftRightIcon, CheckCircleIcon } from '@heroicons/react/24/outline';
import Image from 'next/image';
import LogoText from '@/components/LogoText';

export const metadata: Metadata = {
  title: 'Home | Apartment Compliance Solutions',
  description: 'Independent compliance solutions for affordable housing partnerships in the Carolinas. Safeguarding compliance and strengthening partnerships.',
};

export default function Home() {
  const playfairFontStyle = { fontFamily: "'Playfair Display', serif" };

  return (
    <main>
      <>
        {/* Hero Section */}
        <section className="bg-white pt-8 pb-10">
          <div className="container mx-auto px-6 flex flex-col md:flex-row items-center">
            <div className="md:w-1/2 mb-10 md:mb-0">
              <Image 
                src="https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?q=80&w=2070&auto=format&fit=crop" 
                alt="Modern apartment interior" 
                width={800} 
                height={600}
                className="rounded-lg shadow-2xl"
                priority
                sizes="(max-width: 768px) 100vw, 50vw"
              />
            </div>
            <div className="md:w-1/2 text-center md:text-left md:pl-12">
              <h1 className="text-4xl font-bold text-brand-blue mb-4">
                <span className="block">Safeguarding Compliance.</span>
                <span className="block">Strengthening Partnerships.</span>
              </h1>
              <p className="text-2xl text-gray-800 leading-relaxed tracking-tight">
                Independent compliance solutions for affordable housing partnerships in the Carolinas.
              </p>
            </div>
          </div>
        </section>

        {/* Intro Section */}
        <section className="py-10 bg-white">
          <div className="container mx-auto px-6">
            <div className="flex flex-col md:flex-row items-center gap-12">
              <div className="md:w-1/2 text-lg text-gray-800 space-y-6">
                <p>
                  At <LogoText />
                  {' '}
                  we specialize in third-party compliance monitoring, auditing, and consulting for affordable housing properties participating in tax abatement programs. These programs provide critical incentives – but they also come with detailed and often complex compliance requirements.
                </p>
                <p>
                  Our mission is to help you navigate these complexities with ease and confidence. We provide the expertise and support needed to ensure your properties remain fully compliant, protecting your investments and preserving the critical tax benefits you rely on.
                </p>
              </div>
              <div className="md:w-1/2">
                <Image 
                  src="https://images.unsplash.com/photo-1484154218962-a197022b5858?q=80&w=2074&auto=format&fit=crop" 
                  alt="Modern apartment kitchen" 
                  width={800} 
                  height={600}
                  className="rounded-lg shadow-xl"
                />
              </div>
            </div>
          </div>
        </section>

        {/* Key Value Points Section */}
        <section className="py-20 bg-gray-50">
          <div className="container mx-auto px-6">
            <div className="text-center mb-12">
              <h2 className="text-5xl font-bold text-brand-blue uppercase" style={playfairFontStyle}>Built For Your Needs</h2>
            </div>
            <div className="max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="bg-white p-8 rounded-lg shadow-lg text-center">
                <div className="flex items-center justify-center h-16 w-16 rounded-full bg-brand-accent mx-auto mb-4">
                  <CheckCircleIcon className="h-8 w-8 text-white" />
                </div>
                <h3 className="text-xl leading-6 font-bold text-brand-blue" style={playfairFontStyle}>Independent Compliance Monitoring</h3>
                <p className="mt-4 text-base text-gray-600">Ongoing oversight tailored to program requirements and partnership agreements.</p>
              </div>
               <div className="bg-white p-8 rounded-lg shadow-lg text-center">
                <div className="flex items-center justify-center h-16 w-16 rounded-full bg-brand-accent mx-auto mb-4">
                  <ShieldCheckIcon className="h-8 w-8 text-white" />
                </div>
                <h3 className="text-xl leading-6 font-bold text-brand-blue" style={playfairFontStyle}>Risk Mitigation for Nonprofits</h3>
                <p className="mt-4 text-base text-gray-600">Protect your 501(c)(3) status and revenue by ensuring program adherence.</p>
              </div>
               <div className="bg-white p-8 rounded-lg shadow-lg text-center">
                <div className="flex items-center justify-center h-16 w-16 rounded-full bg-brand-accent mx-auto mb-4">
                  <UserGroupIcon className="h-8 w-8 text-white" />
                </div>
                <h3 className="text-xl leading-6 font-bold text-brand-blue" style={playfairFontStyle}>Support for Developers and Operators</h3>
                <p className="mt-4 text-base text-gray-600">Partner with a compliance specialist to stay ahead of evolving expectations and regulatory scrutiny.</p>
              </div>
               <div className="bg-white p-8 rounded-lg shadow-lg text-center">
                <div className="flex items-center justify-center h-16 w-16 rounded-full bg-brand-accent mx-auto mb-4">
                  <ChatBubbleLeftRightIcon className="h-8 w-8 text-white" />
                </div>
                <h3 className="text-xl leading-6 font-bold text-brand-blue" style={playfairFontStyle}>Custom Consulting</h3>
                <p className="mt-4 text-base text-gray-600">We help optimize property performance while maintaining full program compliance.</p>
              </div>
            </div>
          </div>
        </section>

        {/* Map Section */}
        <section className="py-10 bg-white">
          <div className="container mx-auto px-6 text-center">
            <h2 className="text-3xl font-bold text-brand-blue mb-8" style={playfairFontStyle}>Serving North & South Carolina</h2>
            <div className="max-w-4xl mx-auto">
              <Image 
                src="/map.png"
                alt="A map highlighting North Carolina and South Carolina"
                width={1000}
                height={600}
                className="rounded-lg shadow-xl"
              />
            </div>
          </div>
        </section>

        {/* Call to Action Section */}
        <section className="bg-brand-blue">
          <div className="mx-auto max-w-7xl py-12 px-4 sm:px-6 lg:flex lg:items-center lg:justify-between lg:py-16 lg:px-8">
            <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl" style={playfairFontStyle}>
              <span className="block">Ready to ensure compliance and protect your investment?</span>
              <span className="block text-brand-accent">Contact us today to schedule a consultation.</span>
            </h2>
            <div className="mt-8 flex lg:mt-0 lg:flex-shrink-0">
              <div className="inline-flex rounded-md shadow">
                <Link href="/contact" className="inline-flex items-center justify-center rounded-md border border-transparent bg-white px-5 py-3 text-base font-medium text-brand-blue hover:bg-gray-200">
                  Contact Us Today
                </Link>
              </div>
            </div>
          </div>
        </section>
      </>
    </main>
  );
}