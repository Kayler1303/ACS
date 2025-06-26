import type { Metadata } from 'next';
import Link from 'next/link';
import { CheckCircleIcon } from '@heroicons/react/24/solid';
import Image from 'next/image';

export const metadata: Metadata = {
  title: 'Our Solutions | Apartment Compliance Solutions',
  description: 'Specialized compliance monitoring, auditing, and consulting for affordable housing partnerships in North and South Carolina.',
};

const SolutionsPage = () => {
  return (
    <>
      {/* Hero Section */}
      <section className="relative h-64 rounded-lg overflow-hidden">
        <Image
          src="/nathan-bird-ko8EF15KJxU-unsplash.jpg"
          alt="Modern building interior"
          className="object-cover"
          fill
        />
        <div className="absolute inset-0 bg-brand-blue opacity-60"></div>
        <div className="relative h-full flex items-center justify-center text-center">
          <h1 className="text-5xl font-bold text-white font-serif leading-tight max-w-4xl">
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
                At Apartment Compliance Solutions, we offer specialized independent services that support both nonprofit partners and property owners/operators in meeting the requirements of property tax abatement programs. Our goal is simple: to provide clarity, accountability, and confidence — ensuring compliance today while safeguarding long-term program participation and tax benefits. Our role is to serve as a neutral, third-party resource, providing nonprofits and property owners/operators with clear, accurate insights into compliance status.
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
          <h2 className="text-4xl font-bold text-center text-brand-blue font-serif mb-12">Our Core Services</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 text-left">

            {/* Service 1: Ongoing Compliance Monitoring */}
            <div className="bg-white p-8 rounded-lg shadow-lg">
              <h3 className="text-2xl font-bold text-brand-blue font-serif mb-4">Ongoing Compliance Monitoring</h3>
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
              <h3 className="text-2xl font-bold text-brand-blue font-serif mb-4">Compliance Auditing</h3>
              <p className="text-gray-700 mb-4">
                Our auditing services provide a deep, indepedent, detailed review of property compliance status — ideal for annual reviews, pre-sale due diligence, or when program compliance is uncertain.
              </p>
              <ul className="space-y-2 text-gray-600">
                <li className="flex items-start"><CheckCircleIcon className="h-6 w-6 text-brand-accent mr-2 flex-shrink-0" />Full audit of tenant files, income qualification, and lease data</li>
                <li className="flex items-start"><CheckCircleIcon className="h-6 w-6 text-brand-accent mr-2 flex-shrink-0" />Identification of current or historical noncompliance</li>
                <li className="flex items-start"><CheckCircleIcon className="h-6 w-6 text-brand-accent mr-2 flex-shrink-0" />Written findings with recommended corrective actions</li>
                <li className="flex items-start"><CheckCircleIcon className="h-6 w-6 text-brand-accent mr-2 flex-shrink-0" />Optional follow-up monitoring to track remediation</li>
              </ul>
              <p className="mt-4 text-sm text-gray-800 italic">Nonprofits ensure they're upholding their fiduciary responsibilities with independent, verifiable documentation. Owners/operators can demonstrate good faith compliance with clear third-party confirmation, building trust with stakeholders and regulators alike.</p>
            </div>

            {/* Service 3: Compliance Consulting & Advisory */}
            <div className="bg-white p-8 rounded-lg shadow-lg">
              <h3 className="text-2xl font-bold text-brand-blue font-serif mb-4">Compliance Consulting & Advisory</h3>
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
        <div className="container mx-auto px-6 text-center max-w-4xl">
          <h2 className="text-4xl font-bold text-brand-blue font-serif mb-8">Why Choose Apartment Compliance Solutions?</h2>
          <div className="space-y-4 text-lg text-gray-700">
            <p>Deep understanding of North and South Carolina tax abatement program requirements</p>
            <p>Dedicated focus on protecting nonprofit 501(c)(3) status and tax benefit viability</p>
            <p>Professional, neutral third-party approach that supports both sides of the partnership</p>
          </div>
        </div>
      </section>

      {/* Call to Action Section */}
      <section className="bg-brand-blue">
        <div className="mx-auto max-w-7xl py-12 px-4 sm:px-6 lg:flex lg:items-center lg:justify-between lg:py-16 lg:px-8">
          <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl font-serif">
            <span className="block">Let's build confidence into your compliance strategy.</span>
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
    </>
  );
};

export default SolutionsPage; 