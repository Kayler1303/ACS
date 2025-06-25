import React from 'react';

const Header = () => (
  <header className="bg-gray-800 text-white p-4">
    <div className="container mx-auto">
      <h1 className="text-xl">Apartment Compliance Solutions</h1>
      {/* Navigation will go here */}
    </div>
  </header>
);

const Footer = () => (
  <footer className="bg-gray-800 text-white p-4 mt-8">
    <div className="container mx-auto text-center">
      <p>&copy; {new Date().getFullYear()} Apartment Compliance Solutions. All Rights Reserved.</p>
    </div>
  </footer>
);

const Layout = ({ children }: { children: React.ReactNode }) => {
  return (
    <div className="flex flex-col min-h-screen">
      <Header />
      <main className="flex-grow container mx-auto p-4">
        {children}
      </main>
      <Footer />
    </div>
  );
};

export default Layout; 