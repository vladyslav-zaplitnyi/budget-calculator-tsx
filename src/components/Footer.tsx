import React from 'react';

interface FooterProps {
  language?: string;
}

const Footer: React.FC<FooterProps> = ({ language = 'uk' }) => {
  const isUk = language === 'uk';
  
  return (
    <footer className="mt-6 bg-white/70 backdrop-blur border-t border-slate-200">
      <div className="max-w-7xl mx-auto px-4 py-3 flex flex-col sm:flex-row items-center justify-center gap-1 text-xs sm:text-sm text-slate-600">
        <span>
          {isUk ? (
            <>
              © 2025 Розроблено{' '}
              <a
                href="https://www.linkedin.com/in/vlad-zaplitnyi-39b3022b2/"
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold text-slate-700 hover:text-indigo-600 hover:underline transition-colors"
              >
                Владиславом Заплітним
              </a>
            </>
          ) : (
            <>
              © 2025 Developed by{' '}
              <a
                href="https://www.linkedin.com/in/vlad-zaplitnyi-39b3022b2/"
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold text-slate-700 hover:text-indigo-600 hover:underline transition-colors"
              >
                Vladyslav Zaplitnyi
              </a>
            </>
          )}
        </span>
      </div>
    </footer>
  );
};

export default React.memo(Footer);

