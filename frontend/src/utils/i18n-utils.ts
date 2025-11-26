/**
 * Utility functions for i18n language management
 */
import i18n from 'i18next';

/**
 * Change the application language without page reload
 * @param language - Language code ('en' or 'zh')
 */
export const changeLanguage = async (language: string): Promise<void> => {
  try {
    await i18n.changeLanguage(language);
    console.log(`Language changed to: ${language}`);
  } catch (error) {
    console.error('Failed to change language:', error);
    throw error;
  }
};

/**
 * Get the current language
 * @returns Current language code
 */
export const getCurrentLanguage = (): string => {
  return i18n.language;
};

/**
 * Get available languages
 * @returns Array of available language codes
 */
export const getAvailableLanguages = (): string[] => {
  return Object.keys(i18n.options.resources || {});
};

/**
 * Check if a translation key exists
 * @param key - Translation key to check
 * @param language - Optional language code (defaults to current language)
 * @returns True if the key exists
 */
export const hasTranslation = (key: string, language?: string): boolean => {
  const lng = language || i18n.language;
  return i18n.exists(key, { lng });
};
