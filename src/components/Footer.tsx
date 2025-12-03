import React from 'react';
import { useTranslation } from 'react-i18next';

interface FooterProps {
  language?: string;
}

const Footer: React.FC<FooterProps> = ({ language = 'uk' }) => {
  const { t } = useTranslation();
  
  return (
    <footer className="mt-6 bg-white/70 backdrop-blur border-t border-slate-200">
      <div className="max-w-7xl mx-auto px-4 py-3 flex flex-col sm:flex-row items-center justify-center gap-1 text-xs sm:text-sm text-slate-600">
        <span>
          {t('footer.copyright')}{' '}
          <a
            href="https://www.linkedin.com/in/vlad-zaplitnyi-39b3022b2/"
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-slate-700 hover:text-indigo-600 hover:underline transition-colors"
          >
            {t('footer.by')}
          </a>
        </span>
      </div>
    </footer>
  );
};

export default React.memo(Footer);

