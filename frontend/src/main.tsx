import React from 'react'
import ReactDOM from 'react-dom/client'
import i18n from 'i18next'
import { initReactI18next, I18nextProvider } from 'react-i18next'
import App from './App.tsx'
import './index.css'

import enTranslations from './locales/en.json'
import zhTranslations from './locales/zh.json'

// Initialize i18next
i18n
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: enTranslations },
      zh: { translation: zhTranslations },
    },
    lng: 'zh', // Default language (Chinese)
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false,
    },
  });

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <I18nextProvider i18n={i18n}>
      <App />
    </I18nextProvider>
  </React.StrictMode>,
)
