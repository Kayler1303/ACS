"use client";

import { useState } from 'react';
import Image from 'next/image';

const ContactForm = () => {
  const [formData, setFormData] = useState({
    name: '',
    organization: '',
    email: '',
    phone: '',
    message: '',
  });

  const [errors, setErrors] = useState<{ name?: string; email?: string, api?: string }>({});
  const [status, setStatus] = useState<'idle' | 'submitting' | 'submitted' | 'error'>('idle');

  const validate = () => {
    const newErrors: { name?: string; email?: string } = {};
    if (!formData.name) {
      newErrors.name = 'Name is required.';
    }
    if (!formData.email) {
      newErrors.email = 'Email is required.';
    } else if (!/\\S+@\\S+\\.\\S+/.test(formData.email)) {
      newErrors.email = 'Email address is invalid.';
    }
    return newErrors;
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const validationErrors = validate();
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      setStatus('error');
      return;
    }
    
    setErrors({});
    setStatus('submitting');

    try {
      const response = await fetch('/api/contact', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });

      if (!response.ok) {
        throw new Error('Something went wrong.');
      }

      setStatus('submitted');
      setFormData({ name: '', organization: '', email: '', phone: '', message: '' });
    } catch (err) {
      setStatus('error');
      setErrors({ api: 'Failed to send message. Please try again later.' });
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  if (status === 'submitted') {
    return (
      <div className="text-center py-20">
        <h2 className="text-2xl font-bold text-brand-blue">Thank you!</h2>
        <p className="mt-4 text-lg">Your message has been sent successfully. We'll be in touch soon.</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
        <div className="relative rounded-lg shadow-xl overflow-hidden">
            <Image 
            src="/julia-aX1TTOuq83M-unsplash.jpg" 
            alt="A modern, sunlit living room with wooden floors and a comfortable armchair." 
            fill
            className="object-cover"
            sizes="(max-width: 768px) 100vw, 50vw"
            />
        </div>
        
        <div className="bg-gray-50 p-8 rounded-lg shadow-lg">
            <form onSubmit={handleSubmit} noValidate>
            <div className="grid grid-cols-1 gap-y-6">
                <div>
                <label htmlFor="name" className="sr-only">Name</label>
                <input type="text" name="name" id="name" autoComplete="name" className="block w-full shadow-sm py-3 px-4 placeholder-gray-500 focus:ring-brand-blue focus:border-brand-blue border-gray-300 rounded-md" placeholder="Name" value={formData.name} onChange={handleChange} />
                {errors.name && <p className="mt-2 text-sm text-red-600">{errors.name}</p>}
                </div>
                <div>
                <label htmlFor="organization" className="sr-only">Organization</label>
                <input type="text" name="organization" id="organization" autoComplete="organization" className="block w-full shadow-sm py-3 px-4 placeholder-gray-500 focus:ring-brand-blue focus:border-brand-blue border-gray-300 rounded-md" placeholder="Organization" value={formData.organization} onChange={handleChange} />
                </div>
                <div>
                <label htmlFor="email" className="sr-only">Email</label>
                <input id="email" name="email" type="email" autoComplete="email" className="block w-full shadow-sm py-3 px-4 placeholder-gray-500 focus:ring-brand-blue focus:border-brand-blue border-gray-300 rounded-md" placeholder="Email Address" value={formData.email} onChange={handleChange} />
                {errors.email && <p className="mt-2 text-sm text-red-600">{errors.email}</p>}
                </div>
                <div>
                <label htmlFor="phone" className="sr-only">Phone</label>
                <input type="text" name="phone" id="phone" autoComplete="tel" className="block w-full shadow-sm py-3 px-4 placeholder-gray-500 focus:ring-brand-blue focus:border-brand-blue border-gray-300 rounded-md" placeholder="Phone Number (optional)" value={formData.phone} onChange={handleChange} />
                </div>
                <div>
                <label htmlFor="message" className="sr-only">Message</label>
                <textarea id="message" name="message" rows={4} className="block w-full shadow-sm py-3 px-4 placeholder-gray-500 focus:ring-brand-blue focus:border-brand-blue border-gray-300 rounded-md" placeholder="Tell us about your property, program participation, or compliance concerns" value={formData.message} onChange={handleChange}></textarea>
                </div>
            </div>
            <div className="mt-6">
                <button 
                type="submit" 
                className="w-full inline-flex items-center justify-center px-6 py-3 border border-transparent rounded-md shadow-sm text-base font-medium text-white bg-brand-blue hover:bg-brand-blue-light focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand-blue disabled:opacity-50"
                disabled={status === 'submitting'}
                >
                {status === 'submitting' ? 'Submitting...' : 'Submit'}
                </button>
            </div>
            </form>
            {errors.api && <p className="mt-4 text-center text-sm text-red-600">{errors.api}</p>}
            <p className="mt-6 text-center text-sm text-gray-600">
            or send us an email at <a href="mailto:contact@apartmentcompliance.com" className="font-medium text-brand-blue hover:text-brand-blue-light">contact@apartmentcompliance.com</a>
            </p>
        </div>
    </div>
  );
};

export default ContactForm; 