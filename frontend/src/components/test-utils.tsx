import React from 'react';
import { render } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { initReactI18next } from 'react-i18next';

// Create a test i18n instance
export const createTestI18n = () => {
  const i18next = require('i18next');
  const testI18n = i18next.createInstance();
  
  testI18n
    .use(initReactI18next)
    .init({
      lng: 'en',
      fallbackLng: 'en',
      resources: {
        en: {
          translation: {
            'sceneSelection.title': 'Select Your Scene',
            'sceneSelection.hover': 'Hover to select',
          },
        },
        zh: {
          translation: {
            'sceneSelection.title': '选择你的场景',
            'sceneSelection.hover': '悬停选择',
          },
        },
      },
    });
  
  return testI18n;
};

export const renderWithI18n = (ui: React.ReactElement, language = 'en') => {
  const testI18n = createTestI18n();
  testI18n.changeLanguage(language);
  
  return {
    i18n: testI18n,
    ...render(
      <I18nextProvider i18n={testI18n}>
        {ui}
      </I18nextProvider>
    ),
  };
};
