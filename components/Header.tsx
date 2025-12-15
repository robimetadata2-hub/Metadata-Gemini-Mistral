import logo from "/assets/images/logo.png";
import React, { useState } from 'react';

interface HeaderProps {
    onTutorialClick: () => void;
    user: any;
    onLogout: () => void;
    onLogin: () => void;
}

export const Header: React.FC<HeaderProps> = ({ onTutorialClick, user, onLogout, onLogin }) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const toggleMenu = () => setIsMenuOpen(!isMenuOpen);

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
        
        <div className="flex items-center space-x-4 lg:space-x-6">
          <a 
            href="https://mail.robiaistore.com/" 
            className="hidden md:flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-2.5 rounded-lg text-base font-bold transition-all shadow-md border border-emerald-500/50 hover:shadow-emerald-500/20 whitespace-nowrap"
          >
             <i className="bi bi-cash-coin text-lg"></i>
             <span>জিমেইল বিক্রি করে আয় করুন</span>
          </a>

          <div className="hidden lg:flex items-center space-x-6 text-sm">
            <a href="https://robitechnology.com" target="_blank" rel="noopener noreferrer" className="text-gray-300 hover:text-white transition-colors">OUR SERVICE</a>
            <a href="https://robiaistore.com/" target="_blank" rel="noopener noreferrer" className="text-gray-300 hover:text-white transition-colors">BUY AI</a>
            <a href="#" className="text-gray-300 hover:text-white transition-colors">CONTACT US</a>
          </div>

          <button 
            onClick={onTutorialClick}
            className="relative overflow-hidden bg-gradient-to-r from-red-700 to-red-500 text-white px-5 py-2 rounded-lg text-sm font-medium shadow-lg transition-transform hover:scale-105 hover:shadow-red-500/30 flex items-center gap-2 group border border-red-500/50 whitespace-nowrap"
          >
            <span className="absolute inset-0 w-full h-full bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:animate-shimmer"></span>
            <i className="bi bi-play-circle-fill animate-pulse"></i>
            <span className="hidden sm:inline">Tutorial</span>
          </button>

          {user ? (
            <div className="relative">
              <button onClick={toggleMenu} className="flex items-center focus:outline-none">
                <img 
                  src={user.user_metadata?.avatar_url || "/assets/images/profile.png"} 
                  alt="Profile" 
                  className="w-10 h-10 rounded-full border-2 border-[color:var(--theme-color)] object-cover"
                />
              </button>
              
              {isMenuOpen && (
                <div className="absolute right-0 mt-2 w-48 bg-[#202123] rounded-md shadow-lg py-1 border border-gray-700 z-50">
                   <div className="px-4 py-2 border-b border-gray-700">
                        <p className="text-sm text-white font-medium truncate">{user.user_metadata?.full_name || user.email}</p>
                        <p className="text-xs text-gray-500 truncate">{user.email}</p>
                   </div>
                  <button 
                    onClick={() => {
                        onLogout();
                        setIsMenuOpen(false);
                    }}
                    className="block w-full text-left px-4 py-2 text-sm text-red-400 hover:bg-gray-700 transition-colors"
                  >
                    <i className="bi bi-box-arrow-right mr-2"></i>Logout
                  </button>
                </div>
              )}
            </div>
          ) : (
            <button 
                onClick={onLogin}
                className="flex items-center gap-2 bg-[#2a2b2e] hover:bg-[#3b3b3e] text-white px-4 py-2 rounded-lg text-sm font-medium border border-gray-600 transition-colors shadow-sm"
            >
                <i className="bi bi-person-circle"></i>
                <span>Login</span>
            </button>
          )}
          
           {isMenuOpen && (
                <div className="fixed inset-0 z-40" onClick={() => setIsMenuOpen(false)}></div>
            )}
        </div>
      </nav>
    </header>
  );
};
