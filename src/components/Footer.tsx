import React from 'react';
import { useTranslation } from 'react-i18next';
import { TOUR_START_EVENT } from './GuidedTour';

interface FooterProps {
  language?: string;
}

const LinkedInIcon = () => (
  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
    <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
  </svg>
);

const Footer: React.FC<FooterProps> = ({ language = 'uk' }) => {
  const { t } = useTranslation();
  
  return (
    <footer className="mt-6 bg-gradient-to-r from-white/80 via-indigo-50/70 to-white/80 backdrop-blur-sm border-t border-indigo-200/50 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-5">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 sm:gap-4">
          
          {/* Left Side: Copyright & Feedback */}
          <div className="text-xs sm:text-sm text-slate-600 order-2 sm:order-1 flex flex-col sm:flex-row items-center gap-2 sm:gap-4">
            <span className="font-medium text-center sm:text-left">{t('footer.copyright')}</span>
            
            {/* Роздільник (тільки на ПК) */}
            <span className="hidden sm:block text-slate-300">|</span>
            
            {/* Посилання на форму */}
            <a 
              href="https://forms.gle/qq7XcvNYDSWDhBrZ9"
              target="_blank" 
              rel="noopener noreferrer"
              className="group flex items-center gap-1.5 text-slate-500 hover:text-indigo-600 transition-colors duration-200"
              title={t('footer.feedback')}
            >
              {/* Емодзі трохи збільшене для кращої видимості */}
              <span className="group-hover:underline decoration-indigo-300 underline-offset-2">
                {t('footer.feedback')}
              </span>
            </a>

            {/* Роздільник (тільки на ПК) */}
            <span className="hidden sm:block text-slate-300">|</span>

            {/* Перезапуск туторіалу */}
            <button
              type="button"
              onClick={() => window.dispatchEvent(new CustomEvent(TOUR_START_EVENT))}
              className="group flex items-center gap-1.5 text-slate-500 hover:text-indigo-600 transition-colors duration-200"
              title={t('tour.restart')}
            >
              <span aria-hidden="true">🎓</span>
              <span className="group-hover:underline decoration-indigo-300 underline-offset-2">
                {t('tour.restart')}
              </span>
            </button>
          </div>
          
          {/* Right Side: Actions (Donate & Social) */}
          <div className="flex items-center gap-3 sm:gap-4 order-1 sm:order-2">
            <a
              href="https://send.monobank.ua/jar/3iKJRe8Mcm"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 sm:px-5 py-2 sm:py-2.5 rounded-full font-semibold text-sm text-white bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 hover:from-indigo-700 hover:via-purple-700 hover:to-pink-700 transition-all duration-300 shadow-lg hover:shadow-xl transform hover:scale-105 active:scale-95"
            >
              <span className="text-base sm:text-lg">☕</span>
              <span className="hidden sm:inline">{t('footer.cookie')}</span>
              <span className="sm:hidden">{t('footer.cookie')}</span>
            </a>
            <a
              href="https://www.linkedin.com/in/vladyslav-zaplitnyi-39b3022b2"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center w-10 h-10 rounded-full bg-white text-slate-700 hover:text-white hover:bg-[#0077B5] transition-all duration-300 shadow-md hover:shadow-lg transform hover:scale-110 active:scale-95"
              aria-label="LinkedIn"
              title="LinkedIn Profile"
            >
              <LinkedInIcon />
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default React.memo(Footer);