import React from 'react';

interface CurrencyFlagProps {
  currencyCode: string;
  className?: string;
  size?: number;
}

// SVG прапори для валют та мов (точні кольори та пропорції)
const flagSVGs: Record<string, string> = {
  // Валюти
  UAH: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 3 2" width="100%" height="100%" preserveAspectRatio="none"><rect width="3" height="1" fill="#005BBB"/><rect width="3" height="1" y="1" fill="#FFD500"/></svg>`,
  USD: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 38 20" width="100%" height="100%" preserveAspectRatio="none"><rect width="38" height="20" fill="#B22234"/><path d="M0,1.54h38M0,3.08h38M0,4.62h38M0,6.16h38M0,7.7h38M0,9.24h38M0,10.78h38M0,12.32h38M0,13.86h38M0,15.4h38" stroke="#fff" stroke-width="1.54" fill="none"/><rect width="15.2" height="10.77" fill="#3C3B6E"/><g transform="translate(7.6,5.385)"><circle cx="0" cy="0" r="1.1" fill="#fff" opacity="1"/><circle cx="0" cy="-2" r="0.5" fill="#fff"/><circle cx="1" cy="-1.65" r="0.5" fill="#fff"/><circle cx="1.65" cy="-0.6" r="0.5" fill="#fff"/><circle cx="1.65" cy="0.6" r="0.5" fill="#fff"/><circle cx="1" cy="1.65" r="0.5" fill="#fff"/><circle cx="0" cy="2" r="0.5" fill="#fff"/><circle cx="-1" cy="1.65" r="0.5" fill="#fff"/><circle cx="-1.65" cy="0.6" r="0.5" fill="#fff"/><circle cx="-1.65" cy="-0.6" r="0.5" fill="#fff"/><circle cx="-1" cy="-1.65" r="0.5" fill="#fff"/><circle cx="0.45" cy="-0.95" r="0.5" fill="#fff"/><circle cx="1.25" cy="0" r="0.5" fill="#fff"/><circle cx="0.45" cy="0.95" r="0.5" fill="#fff"/><circle cx="-0.45" cy="0.95" r="0.5" fill="#fff"/><circle cx="-1.25" cy="0" r="0.5" fill="#fff"/><circle cx="-0.45" cy="-0.95" r="0.5" fill="#fff"/></g></svg>`,
  EUR: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 30 20" width="100%" height="100%" preserveAspectRatio="none"><rect width="30" height="20" fill="#003399"/><g transform="translate(15,10)"><circle cx="0" cy="-4.2" r="1.1" fill="#FFCC00"/><circle cx="3.64" cy="-2.1" r="1.1" fill="#FFCC00"/><circle cx="3.64" cy="2.1" r="1.1" fill="#FFCC00"/><circle cx="0" cy="4.2" r="1.1" fill="#FFCC00"/><circle cx="-3.64" cy="2.1" r="1.1" fill="#FFCC00"/><circle cx="-3.64" cy="-2.1" r="1.1" fill="#FFCC00"/><circle cx="2.1" cy="-3.64" r="1.1" fill="#FFCC00"/><circle cx="2.1" cy="3.64" r="1.1" fill="#FFCC00"/><circle cx="-2.1" cy="3.64" r="1.1" fill="#FFCC00"/><circle cx="-2.1" cy="-3.64" r="1.1" fill="#FFCC00"/><circle cx="1.05" cy="-3.64" r="1.1" fill="#FFCC00"/><circle cx="1.05" cy="3.64" r="1.1" fill="#FFCC00"/></g></svg>`,
  PLN: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 3 2" width="100%" height="100%" preserveAspectRatio="none"><rect width="3" height="1" fill="#fff"/><rect width="3" height="1" y="1" fill="#DC143C"/></svg>`,
  RON: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 3 2" width="100%" height="100%" preserveAspectRatio="none"><rect width="1" height="2" fill="#002B7F"/><rect width="1" height="2" x="1" fill="#FCD116"/><rect width="1" height="2" x="2" fill="#CE1126"/></svg>`,
  CZK: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 3 2" width="100%" height="100%" preserveAspectRatio="none"><rect width="3" height="1" fill="#fff"/><rect width="3" height="1" y="1" fill="#D7141A"/><polygon points="0,0 1,0 0,2" fill="#11457E"/></svg>`,
  // Мови
  'uk': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 3 2" width="100%" height="100%" preserveAspectRatio="none"><rect width="3" height="1" fill="#005BBB"/><rect width="3" height="1" y="1" fill="#FFD500"/></svg>`,
  'en': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 60 30" width="100%" height="100%" preserveAspectRatio="none"><rect width="60" height="30" fill="#012169"/><path d="M0,0L30,15M60,0L30,15M0,30L30,15M60,30L30,15" stroke="#fff" stroke-width="2.5" fill="none"/><path d="M0,15L60,15M30,0L30,30" stroke="#fff" stroke-width="5" fill="none"/><path d="M0,0L60,30M60,0L0,30" stroke="#C8102E" stroke-width="3" fill="none"/><path d="M0,0L60,30M60,0L0,30" stroke="#fff" stroke-width="2" fill="none"/></svg>`
};

const CurrencyFlag: React.FC<CurrencyFlagProps> = ({ currencyCode, className = '', size = 20 }) => {
  const flagSVG = flagSVGs[currencyCode];
  
  if (!flagSVG) {
    // Fallback на емодзі, якщо прапора немає
    const emojiMap: Record<string, string> = {
      UAH: '🇺🇦',
      USD: '🇺🇸',
      EUR: '🇪🇺',
      PLN: '🇵🇱',
      RON: '🇷🇴',
      CZK: '🇨🇿',
      'uk': '🇺🇦',
      'en': '🇬🇧'
    };
    return (
      <span className={`currency-emoji ${className}`} style={{ fontSize: `${size}px` }}>
        {emojiMap[currencyCode] || currencyCode}
      </span>
    );
  }

  return (
    <span 
      className={`inline-block currency-flag ${className}`}
      style={{ 
        width: `${size}px`, 
        height: `${size * 2 / 3}px`,
        lineHeight: 1,
        verticalAlign: 'middle',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}
      dangerouslySetInnerHTML={{ __html: flagSVG }}
    />
  );
};

export default CurrencyFlag;

