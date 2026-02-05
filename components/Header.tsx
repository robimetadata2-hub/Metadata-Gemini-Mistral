import logo from "/assets/images/logo.png";

import React, { useState } from 'react';

interface HeaderProps {
    onTutorialClick: () => void;
}

export const Header: React.FC<HeaderProps> = ({ onTutorialClick }) => {
  const [logoError, setLogoError] = useState(false);

  // Using string paths relative to the public root. 
  // Imports for images are not supported in native ES modules without a bundler.
  const logoImage = "assets/images/logo.png";
  
  return (
    <header className="bg-[#1f2022] border-b border-gray-700/50 shadow-md sticky top-0 z-50">
      <nav className="container mx-auto px-4 lg:px-6 py-4 flex justify-between items-center">
        {/* Logo wrapped in anchor tag for navigation and flexible sizing */}
      <a href="/" className="flex-shrink-0">
             <img 
                src={logo}
                alt="" 
                className="h-10 sm:h-12 w-auto object-contain"
             />
        </a>
        
        <div className="flex items-center space-x-3 lg:space-x-4">
          <a 
            href="#" 
            className="hidden md:flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg text-sm font-bold transition-all shadow-md border border-emerald-500/50 hover:shadow-emerald-500/20 whitespace-nowrap"
          >
             <i className="bi bi-cash-coin text-lg"></i>
             <span>জিমেইল বিক্রি করে আয় করুন</span>
          </a>

          <button 
            onClick={onTutorialClick}
            className="hidden sm:flex relative overflow-hidden bg-gradient-to-r from-red-700 to-red-500 text-white px-4 py-2 rounded-lg text-sm font-medium shadow-lg transition-transform hover:scale-105 hover:shadow-red-500/30 items-center gap-2 group border border-red-500/50 whitespace-nowrap"
          >
            <span className="absolute inset-0 w-full h-full bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:animate-shimmer"></span>
            <i className="bi bi-play-circle-fill animate-pulse"></i>
            <span>Tutorial</span>
          </button>
        </div>
      </nav>
    </header>
  );
};
