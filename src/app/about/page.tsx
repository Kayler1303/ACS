import type { Metadata } from 'next';
import Link from 'next/link';
import { BeakerIcon, BuildingLibraryIcon, UserGroupIcon, ShieldCheckIcon } from '@heroicons/react/24/outline';
import Image from 'next/image';
import LogoText from '@/components/LogoText';

export const metadata: Metadata = {
  title: 'About Us | Apartment Compliance Solutions',
  description: 'Learn about our mission to bring clarity, accountability, and peace of mind to the affordable housing industry in North and South Carolina.',
};

const AboutPage = () => {
  const playfairFontStyle = { fontFamily: "'Playfair Display', serif" };

  return (
    <>
      {/* Hero Section */}
      <section className="relative h-64 rounded-lg overflow-hidden">
        <Image
          src="/francesca-tosolini-21xbUDIN8ao-unsplash.jpg"
          alt="A professional, welcoming office environment."
          className="object-cover"
          fill
          priority
          sizes="100vw"
        />
        <div className="absolute inset-0 bg-brand-blue opacity-60"></div>
        <div className="relative h-full flex items-center justify-center text-center">
          <h1 className="text-5xl font-bold text-white leading-tight max-w-4xl" style={playfairFontStyle}>
            Focused on Compliance. Committed to Partnership.
          </h1>
        </div>
      </section>

      {/* Intro Paragraph */}
      <section className="py-20 bg-white">
        <div className="container mx-auto px-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
            <div className="text-lg text-gray-800 space-y-6">
              <p>
                At <LogoText /> we exist to bring clarity, accountability, and peace of mind to the affordable housing industry. We specialize in independent, third-party compliance services for properties participating in tax abatement programs — with a deep focus on nonprofit-developer partnerships in North and South Carolina.
              </p>
              <p>
                We understand the complexities of these programs, the risks they carry, and the high stakes for all involved. Our mission is simple: to protect the long-term viability of these partnerships by helping ensure everyone is meeting their obligations and maintaining program compliance.
              </p>
            </div>
            <div>
              <Image 
                src="/francesca-tosolini-21xbUDIN8ao-unsplash.jpg" 
                alt="Two people collaborating at a table with laptops" 
                width={600} 
                height={400}
                className="rounded-lg shadow-xl object-cover"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Why We Do This Work Section */}
      <section className="py-20 bg-gray-50">
        <div className="container mx-auto px-6 max-w-4xl">
          <h2 className="text-5xl font-bold text-center text-brand-blue uppercase mb-12" style={playfairFontStyle}>Why We Do This Work</h2>
          <div className="text-lg text-gray-800 space-y-6 text-left">
            <p>
              Tax abatement programs are powerful tools for expanding affordable housing. But with those incentives come detailed and evolving compliance requirements. For nonprofits, the risk of losing 501(c)(3) status — and the revenue generated through these partnerships — can be significant. For property owners and developers, maintaining compliance is critical to preserving valuable tax benefits and avoiding reputational risk.
            </p>
          </div>
        </div>
      </section>

      {/* Who We Serve Section */}
      <section className="py-20 bg-white">
        <div className="container mx-auto px-6 max-w-4xl">
          <h2 className="text-5xl font-bold text-center text-brand-blue uppercase mb-12" style={playfairFontStyle}>Who We Serve</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 text-center">
            <div className="bg-gray-50 p-8 rounded-lg shadow-md">
              <BuildingLibraryIcon className="w-16 h-16 mx-auto text-brand-accent mb-4"/>
              <h3 className="text-2xl font-bold text-brand-blue font-serif mb-2">501(c)(3) Nonprofit Organizations</h3>
              <p className="text-gray-700">Who serve as managing members in affordable housing partnerships.</p>
            </div>
            <div className="bg-gray-50 p-8 rounded-lg shadow-md">
              <UserGroupIcon className="w-16 h-16 mx-auto text-brand-accent mb-4"/>
              <h3 className="text-2xl font-bold text-brand-blue font-serif mb-2">Developers & Property Owners</h3>
              <p className="text-gray-700">Participating in local and state tax abatement programs.</p>
            </div>
          </div>
          <p className="mt-12 text-lg text-gray-800 text-center max-w-3xl mx-auto">
            Whether contracted directly by the nonprofit or engaged collaboratively with the ownership group, our role remains the same: deliver objective, informed compliance insight that strengthens the partnership and protects everyone&apos;s interests.
          </p>
        </div>
      </section>
      
      {/* Our Values Section */}
      <section className="py-20 bg-gray-50">
        <div className="container mx-auto px-6 max-w-5xl">
          <h2 className="text-5xl font-bold text-center text-brand-blue uppercase mb-12" style={playfairFontStyle}>Our Values</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 text-left">
            <div className="flex items-start">
              <ShieldCheckIcon className="w-8 h-8 text-brand-accent mr-4 flex-shrink-0" />
              <div>
                <h3 className="text-xl font-bold text-brand-blue font-serif mb-2">Integrity</h3>
                <p className="text-gray-700">We call things as they are - professionally, respectfully and clearly, all in the spirit of collaboration.</p>
              </div>
            </div>
            <div className="flex items-start">
              <BeakerIcon className="w-8 h-8 text-brand-accent mr-4 flex-shrink-0" />
              <div>
                <h3 className="text-xl font-bold text-brand-blue font-serif mb-2">Expertise</h3>
                <p className="text-gray-700">We specialize in the programs and requirements that matter to our clients, particularly in North and South Carolina.</p>
              </div>
            </div>
             <div className="flex items-start">
                <UserGroupIcon className="w-8 h-8 text-brand-accent mr-4 flex-shrink-0" />
              <div>
                <h3 className="text-xl font-bold text-brand-blue font-serif mb-2">Independence</h3>
                <p className="text-gray-700">Our work is fact-based and impartial, helping nonprofits and owners make confident, compliance-driven decisions.</p>
              </div>
            </div>
            <div className="flex items-start">
                 <BuildingLibraryIcon className="w-8 h-8 text-brand-accent mr-4 flex-shrink-0" />
              <div>
                <h3 className="text-xl font-bold text-brand-blue font-serif mb-2">Partnership</h3>
                <p className="text-gray-700">We&apos;re here to support long-term success — not just one-time checklists.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Call to Action Section */}
      <section className="bg-brand-blue">
        <div className="mx-auto max-w-7xl py-12 px-4 sm:px-6 lg:flex lg:items-center lg:justify-between lg:py-16 lg:px-8">
          <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl" style={playfairFontStyle}>
            <span className="block">Let&apos;s Work Together.</span>
            <span className="block text-brand-accent">Reach out to start the conversation.</span>
          </h2>
          <div className="mt-8 flex lg:mt-0 lg:flex-shrink-0">
            <div className="inline-flex rounded-md shadow">
              <Link href="/contact" className="inline-flex items-center justify-center rounded-md border border-transparent bg-white px-5 py-3 text-base font-medium text-brand-blue hover:bg-gray-200">
                Get In Touch
              </Link>
            </div>
          </div>
        </div>
      </section>
    </>
  );
};

export default AboutPage; 