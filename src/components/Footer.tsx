import React from 'react';
import { useTranslation } from 'react-i18next';

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
    <footer className="mt-6 bg-white/70 backdrop-blur border-t border-slate-200">
      <div className="max-w-7xl mx-auto px-4 py-3 flex flex-col sm:flex-row items-center justify-center gap-3 text-xs sm:text-sm text-slate-600">
        <span>{t('footer.copyright')}</span>
        <a
          href="https://send.monobank.ua/jar/3iKJRe8Mcm"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-semibold text-white bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 transition-all shadow-md hover:shadow-lg transform hover:scale-105"
        >
          {t('footer.cookie')}
        </a>
        <a
          href="https://www.linkedin.com/in/vlad-zaplitnyi-39b3022b2/"
          target="_blank"
          rel="noopener noreferrer"
          className="text-slate-600 hover:text-indigo-600 transition-colors"
          aria-label="LinkedIn"
        >
          <LinkedInIcon />
        </a>
      </div>
    </footer>
  );
};

export default React.memo(Footer);

