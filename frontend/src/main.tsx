import React from 'react'
import ReactDOM from 'react-dom/client'
import i18n from 'i18next'
import { initReactI18next, I18nextProvider } from 'react-i18next'
import App from './App.tsx'
import './index.css'

import enTranslations from './locales/en.json'
import zhTranslations from './locales/zh.json'

// Load language setting from settings.json
const loadLanguageSetting = async (): Promise<string> => {
  try {
    const response = await fetch('/config/settings.json');
    const settings = await response.json();
    return settings.system?.language || 'zh';
  } catch (error) {
    console.error('Failed to load language setting:', error);
    return 'zh'; // Default to Chinese
  }
};

// Initialize i18next with language from settings
const initializeI18n = async () => {
  const language = await loadLanguageSetting();
  
  await i18n
    .use(initReactI18next)
    .init({
      resources: {
        en: { translation: enTranslations },
        zh: { translation: zhTranslations },
      },
      lng: language,
      fallbackLng: 'en',
      interpolation: {
        escapeValue: false,
      },
      // Log missing translation keys
      saveMissing: true,
      missingKeyHandler: (lngs, ns, key, fallbackValue) => {
        console.warn(`Missing translation key: ${key} for language: ${lngs[0]}`);
      },
    });

  // Render app after i18n is initialized
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <I18nextProvider i18n={i18n}>
        <App />
      </I18nextProvider>
    </React.StrictMode>,
  );
};

// Initialize i18n and render app
initializeI18n();
