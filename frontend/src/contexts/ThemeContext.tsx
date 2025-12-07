import React, { createContext, useContext, useEffect, useState } from 'react';

type Theme = 'light' | 'dark';

interface ThemeContextType {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [theme, setTheme] = useState<Theme>(() => {
    const savedTheme = localStorage.getItem('theme');
    return (savedTheme as Theme) || 'dark';
  });

  // Load theme from system settings on mount
  useEffect(() => {
    const loadSystemTheme = async () => {
      try {
        // Try to load from API first (more reliable)
        const apiResponse = await fetch('/api/system/settings');
        if (apiResponse.ok) {
          const settings = await apiResponse.json();
          if (settings.theme) {
            setTheme(settings.theme as Theme);
            return;
          }
        }

        // Fallback to config file if API fails
        const response = await fetch('/config/settings.json');
        if (response.ok) {
          const settings = await response.json();
          if (settings.system?.theme) {
            setTheme(settings.system.theme as Theme);
          }
        }
      } catch (error) {
        console.error('Failed to load system theme:', error);
      }
    };
    
    loadSystemTheme();
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'light' ? 'dark' : 'light'));
  };

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};






