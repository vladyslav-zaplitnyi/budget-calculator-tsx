import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

export type AppTheme = 'light' | 'neon';

const THEME_STORAGE_KEY = 'budget_tracker_theme';
const NEON_THEME_CLASS = 'theme-neon';

interface ThemeContextValue {
  theme: AppTheme;
  isNeon: boolean;
  setTheme: (theme: AppTheme) => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

const getInitialTheme = (): AppTheme => {
  try {
    if (typeof window === 'undefined') return 'light';
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === 'light' || stored === 'neon') return stored;
  } catch {
    // ignore storage errors
  }
  return 'light';
};

const applyThemeToDocument = (theme: AppTheme) => {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.classList.toggle(NEON_THEME_CLASS, theme === 'neon');
  root.style.colorScheme = theme === 'neon' ? 'dark' : 'light';
};

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [theme, setThemeState] = useState<AppTheme>(getInitialTheme);

  useEffect(() => {
    applyThemeToDocument(theme);
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // ignore storage errors
    }
  }, [theme]);

  const setTheme = useCallback((next: AppTheme) => {
    setThemeState(next);
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeState((prev) => (prev === 'neon' ? 'light' : 'neon'));
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({ theme, isNeon: theme === 'neon', setTheme, toggleTheme }),
    [theme, setTheme, toggleTheme]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

export const useTheme = (): ThemeContextValue => {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return ctx;
};
