'use client';

import { useEffect, useState } from 'react';
import { Sun, Moon } from 'lucide-react';

export default function ThemeToggle() {
  const [theme, setTheme] = useState<'light' | 'dark'>('light');

  useEffect(() => {
    // 1. Initial sync with current document class
    if (document.documentElement.classList.contains('dark')) {
      setTheme('dark');
    } else {
      setTheme('light');
    }

    // 2. Add listener to sync with system theme changes in real-time
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    
    const handleSystemThemeChange = (e: MediaQueryListEvent) => {
      // Only transition automatically if the user has not set a manual override
      if (!localStorage.getItem('theme')) {
        if (e.matches) {
          document.documentElement.classList.add('dark');
          setTheme('dark');
        } else {
          document.documentElement.classList.remove('dark');
          setTheme('light');
        }
      }
    };

    // Modern browsers support addEventListener on MediaQueryList
    mediaQuery.addEventListener('change', handleSystemThemeChange);
    return () => {
      mediaQuery.removeEventListener('change', handleSystemThemeChange);
    };
  }, []);

  const toggleTheme = () => {
    if (theme === 'light') {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
      setTheme('dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
      setTheme('light');
    }
  };

  return (
    <button
      onClick={toggleTheme}
      className="inline-flex items-center justify-center p-2.5 border border-foreground/30 hover:border-foreground hover:bg-foreground/[0.04] transition-all cursor-pointer rounded-none text-foreground focus:outline-none focus:border-foreground"
      aria-label="Toggle theme"
    >
      {theme === 'light' ? (
        <Moon size={14} className="stroke-[2] text-foreground" />
      ) : (
        <Sun size={14} className="stroke-[2] text-foreground" />
      )}
    </button>
  );
}
