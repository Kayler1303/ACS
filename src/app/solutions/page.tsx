import type { Metadata } from 'next';
import Link from 'next/link';
import { CheckCircleIcon } from '@heroicons/react/24/solid';
import Image from 'next/image';
import LogoText from '@/components/LogoText';

export const metadata: Metadata = {
  title: 'Our Solutions | Apartment Compliance Solutions',
  description: 'Specialized compliance monitoring, auditing, and consulting for affordable housing partnerships in North and South Carolina.',
};

export default function SolutionsPage() {
  const playfairFontStyle = { fontFamily: "'Playfair Display', serif" };

  return (
    <div className="bg-white">
      <div className="bg-green-500 text-white text-center p-4 font-bold">
        DEBUD: Deployment successful!
      </div>
      {/* Hero Section */}
      <section className="relative rounded-lg overflow-hidden">
        <div className="absolute inset-0">
          <Image
            src="/patrick-perkins-G3qlZQXsBOE-unsplash.jpg"
            alt="Modern building interior"
            className="object-cover"
            fill
            priority
            sizes="100vw"
          />
        </div>
        <div className="absolute inset-0 bg-brand-blue opacity-60"></div>
        <div className="relative flex items-center justify-center text-center min-h-80 md:min-h-64 py-12 px-4">
          <h1 className="text-4xl md:text-5xl font-bold text-white leading-tight max-w-4xl" style={playfairFontStyle}>
            Comprehensive Compliance Solutions for Affordable Housing Partnerships
          </h1>
        </div>
      </section>

      {/* Intro Paragraph */}
      <section className="py-20 bg-white">
        <div className="container mx-auto px-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
            <div className="text-lg text-gray-800 space-y-6">
              <p>
                At <LogoText /> we offer specialized independent services that support both nonprofit partners and property owners/operators in meeting the requirements of property tax abatement programs. Our goal is simple: to provide clarity, accountability, and confidence — ensuring compliance today while safeguarding long-term program participation and tax benefits. Our role is to serve as a neutral, third-party resource, providing nonprofits and property owners/operators with clear, accurate insights into compliance status.
              </p>
              <p>
                Whether you&apos;re seeking proactive oversight or help resolving current compliance gaps, we deliver practical, high-impact solutions tailored to your needs.
              </p>
            </div>
            <div>
              <Image 
                src="/zac-gudakov-Xl4irfaAg5M-unsplash.jpg" 
                alt="A person working at a desk with paperwork" 
                width={600} 
                height={400}
                className="rounded-lg shadow-xl object-cover"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Core Services Section */}
      <section className="py-20 bg-gray-50">
        <div className="container mx-auto px-6">
          <h2 className="text-5xl font-bold text-center text-brand-blue uppercase mb-12" style={playfairFontStyle}>Our Core Services</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 text-left">

            {/* Service 1: Ongoing Compliance Monitoring */}
            <div className="bg-white p-8 rounded-lg shadow-lg">
              <h3 className="text-2xl font-bold text-brand-blue mb-4" style={playfairFontStyle}>Ongoing Compliance Monitoring</h3>
              <p className="text-gray-700 mb-4">
                We act as a third-party compliance partner, conducting recurring and ongoing, unbiased verification that your property is meeting program requirements. From income certifications to occupancy tracking, we document the details so you don't have to.
              </p>
              <ul className="space-y-2 text-gray-600">
                <li className="flex items-start"><CheckCircleIcon className="h-6 w-6 text-brand-accent mr-2 flex-shrink-0" />Custom monitoring schedules based on program and agreement terms</li>
                <li className="flex items-start"><CheckCircleIcon className="h-6 w-6 text-brand-accent mr-2 flex-shrink-0" />Verification of tenant eligibility and unit set-asides</li>
                <li className="flex items-start"><CheckCircleIcon className="h-6 w-6 text-brand-accent mr-2 flex-shrink-0" />Ongoing documentation and reporting</li>
                <li className="flex items-start"><CheckCircleIcon className="h-6 w-6 text-brand-accent mr-2 flex-shrink-0" />Alerts for emerging compliance risks</li>
              </ul>
              <p className="mt-4 text-sm text-gray-800 italic">Nonprofits gain peace of mind knowing compliance is being independently tracked. Owners/operators stay ahead of potential issues with clear reporting and actionable insights.</p>
            </div>

            {/* Service 2: Compliance Auditing */}
            <div className="bg-white p-8 rounded-lg shadow-lg">
              <h3 className="text-2xl font-bold text-brand-blue mb-4" style={playfairFontStyle}>Compliance Auditing</h3>
              <p className="text-gray-700 mb-4">
                Our auditing services provide a deep, indepedent, detailed review of property compliance status — ideal for annual reviews, pre-sale due diligence, or when program compliance is uncertain.
              </p>
              <ul className="space-y-2 text-gray-600">
                <li className="flex items-start"><CheckCircleIcon className="h-6 w-6 text-brand-accent mr-2 flex-shrink-0" />Full audit of tenant files, income qualification, and lease data</li>
                <li className="flex items-start"><CheckCircleIcon className="h-6 w-6 text-brand-accent mr-2 flex-shrink-0" />Identification of current or historical noncompliance</li>
                <li className="flex items-start"><CheckCircleIcon className="h-6 w-6 text-brand-accent mr-2 flex-shrink-0" />Written findings with recommended corrective actions</li>
                <li className="flex items-start"><CheckCircleIcon className="h-6 w-6 text-brand-accent mr-2 flex-shrink-0" />Optional follow-up monitoring to track remediation</li>
              </ul>
              <p className="mt-4 text-sm text-gray-800 italic">Nonprofits ensure they&apos;re upholding their fiduciary responsibilities with independent, verifiable documentation. Owners/operators can demonstrate good faith compliance with clear third-party confirmation, building trust with stakeholders and regulators alike.</p>
            </div>

            {/* Service 3: Compliance Consulting & Advisory */}
            <div className="bg-white p-8 rounded-lg shadow-lg">
              <h3 className="text-2xl font-bold text-brand-blue mb-4" style={playfairFontStyle}>Compliance Consulting & Advisory</h3>
              <p className="text-gray-700 mb-4">
                Need help setting up processes, responding to state or local inquiries, or aligning your property strategy with compliance obligations? We offer on-call expertise.
              </p>
              <ul className="space-y-2 text-gray-600">
                <li className="flex items-start"><CheckCircleIcon className="h-6 w-6 text-brand-accent mr-2 flex-shrink-0" />Compliance program setup for new developments</li>
                <li className="flex items-start"><CheckCircleIcon className="h-6 w-6 text-brand-accent mr-2 flex-shrink-0" />Owner/nonprofit partnership agreement reviews</li>
                <li className="flex items-start"><CheckCircleIcon className="h-6 w-6 text-brand-accent mr-2 flex-shrink-0" />Remediation planning and coordination</li>
                <li className="flex items-start"><CheckCircleIcon className="h-6 w-6 text-brand-accent mr-2 flex-shrink-0" />Consulting for local/state agency questions or responses</li>
              </ul>
              <p className="mt-4 text-sm text-gray-800 italic">Developers and nonprofits alike can tap into expert guidance when stakes are high or internal resources are limited.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Why Choose Us Section */}
      <section className="py-20 bg-white">
        <div className="container mx-auto px-6 max-w-4xl">
          <div className="text-center">
            <h2 className="text-5xl font-bold text-brand-blue uppercase mb-4" style={playfairFontStyle}>
              Why Choose
            </h2>
            <div className="mb-12">
              <Image 
                src="/logo-main.svg" 
                alt="Apartment Compliance Solutions" 
                width={350} 
                height={97} 
                className="block mx-auto max-w-xs w-full h-auto"
              />
            </div>
          </div>
          <div className="max-w-3xl mx-auto">
            <ul className="space-y-6">
              <li className="flex items-start text-lg">
                <CheckCircleIcon className="h-7 w-7 text-brand-accent mr-4 flex-shrink-0" />
                <span className="text-gray-700">Deep understanding of North and South Carolina tax abatement program requirements</span>
              </li>
              <li className="flex items-start text-lg">
                <CheckCircleIcon className="h-7 w-7 text-brand-accent mr-4 flex-shrink-0" />
                <span className="text-gray-700">Dedicated focus on protecting nonprofit 501(c)(3) status and tax benefit viability</span>
              </li>
              <li className="flex items-start text-lg">
                <CheckCircleIcon className="h-7 w-7 text-brand-accent mr-4 flex-shrink-0" />
                <span className="text-gray-700">Professional, neutral third-party approach that supports both sides of the partnership</span>
              </li>
            </ul>
          </div>
        </div>
      </section>

      {/* Call to Action Section */}
      <section className="bg-brand-blue">
        <div className="mx-auto max-w-7xl py-12 px-4 sm:px-6 lg:flex lg:items-center lg:justify-between lg:py-16 lg:px-8">
          <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl" style={playfairFontStyle}>
            <span className="block">Let&apos;s build confidence into your compliance strategy.</span>
            <span className="block text-brand-accent">Contact us to learn more about how our services can support your property and partnership.</span>
          </h2>
          <div className="mt-8 flex lg:mt-0 lg:flex-shrink-0">
            <div className="inline-flex rounded-md shadow">
              <Link href="/contact" className="inline-flex items-center justify-center rounded-md border border-transparent bg-white px-5 py-3 text-base font-medium text-brand-blue hover:bg-gray-200">
                Learn More
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}