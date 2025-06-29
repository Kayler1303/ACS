import type { Metadata } from 'next';
import Image from 'next/image';
import { Playfair_Display } from 'next/font/google';
import localFont from 'next/font/local';
import ContactForm from '@/components/ContactForm';

export const metadata: Metadata = {
  title: 'Contact Us | Apartment Compliance Solutions',
  description: 'Get in touch with Apartment Compliance Solutions to discuss your compliance needs. We serve nonprofit-developer partnerships in North and South Carolina.',
};

const playfair = Playfair_Display({ subsets: ['latin'] });
const bostonBold = localFont({ src: '../../assets/fonts/BostonBold.otf' });

const ContactPage = () => {
  return (
    <>
      {/* Hero Section */}
      <section className="relative h-64 rounded-lg overflow-hidden">
        <Image
          src="/julia-aX1TTOuq83M-unsplash.jpg"
          alt="A modern, sunlit living room with wooden floors and a comfortable armchair."
          className="object-cover"
          fill
          priority
          sizes="100vw"
        />
        <div className="absolute inset-0 bg-brand-blue opacity-60"></div>
        <div className="relative h-full flex items-center justify-center text-center">
          <h1 className={`text-5xl font-bold text-white leading-tight max-w-4xl ${playfair.className}`}>
            Let's Talk Compliance
          </h1>
        </div>
      </section>

      {/* Intro & Form Section */}
      <section className="py-20 bg-white">
        <div className="container mx-auto px-6">
          <div className="max-w-5xl mx-auto text-center mb-16">
            <p className="mt-4 text-lg text-gray-700">
              Have questions about compliance? Ready to protect your partnership and
              preserve your property tax benefits? Whether you&apos;re a nonprofit
              managing multiple projects or a developer navigating program
              requirements, we&apos;re here to help.
            </p>
            <div className="mt-4 text-lg text-gray-700 flex justify-center items-baseline flex-wrap" style={{ gap: '0.25rem' }}>
              <span>Use the form below or reach out directly — and let&apos;s explore how</span>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25em' }}>
                  <span
                      className={playfair.className}
                      style={{ color: '#0078c6', fontSize: '1.0em', fontWeight: 'bold' }}
                  >
                      APARTMENT
                  </span>
                  <div style={{ display: 'flex', flexDirection: 'column', position: 'relative', top: '1.5px' }}>
                      <span
                          className={bostonBold.className}
                          style={{ color: '#20bbff', fontSize: '0.42em', lineHeight: 1.1 }}
                      >
                          COMPLIANCE
                      </span>
                      <span
                          className={bostonBold.className}
                          style={{ color: '#20bbff', fontSize: '0.42em', lineHeight: 1.1 }}
                      >
                          SOLUTIONS
                      </span>
                  </div>
              </div>
              <span>can support your compliance goals.</span>
            </div>
          </div>
            <ContactForm />
        </div>
      </section>
    </>
  );
};

export default ContactPage; 