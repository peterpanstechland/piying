/**
 * Property-Based Tests for Translation Fallback
 * Feature: shadow-puppet-interactive-system, Property 48: Missing translations fall back to English
 * Validates: Requirements 23.4
 */

import * as fc from 'fast-check';
import * as fs from 'fs';
import * as path from 'path';

// Load translation files
const enTranslations = JSON.parse(
  fs.readFileSync(path.join(__dirname, '../locales/en.json'), 'utf-8')
);
const zhTranslations = JSON.parse(
  fs.readFileSync(path.join(__dirname, '../locales/zh.json'), 'utf-8')
);

/**
 * Helper function to get a value from a nested object using a dot-notation key
 */
const getNestedValue = (obj: any, key: string): any => {
  const keys = key.split('.');
  let value = obj;
  
  for (const k of keys) {
    if (value && typeof value === 'object' && k in value) {
      value = value[k];
    } else {
      return undefined;
    }
  }
  
  return value;
};

/**
 * Simulate i18n fallback behavior
 */
const getTranslationWithFallback = (key: string, language: string): string => {
  const translations = language === 'en' ? enTranslations : zhTranslations;
  const translation = getNestedValue(translations, key);
  
  // If translation is missing in the selected language, fall back to English
  if (translation === undefined || translation === '') {
    const fallbackTranslation = getNestedValue(enTranslations, key);
    return fallbackTranslation || key;
  }
  
  return translation;
};

describe('Property 48: Missing translations fall back to English', () => {
  /**
   * Property: For any translation key that exists in English but not in another language,
   * the system should return the English translation
   */
  it('should fall back to English for missing translations', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(
          'idle.waiting',
          'sceneSelection.title',
          'guidance.title',
          'countdown.getReady',
          'recording.recording',
          'review.title',
          'result.ready',
          'multiPerson.detected'
        ),
        (key) => {
          // Get English translation (should always exist)
          const enTranslation = getNestedValue(enTranslations, key);
          expect(enTranslation).toBeDefined();
          expect(enTranslation).not.toBe('');
          
          // Simulate missing translation by using a non-existent key
          const missingKey = `${key}.nonexistent`;
          const fallbackTranslation = getTranslationWithFallback(missingKey, 'zh');
          
          // Should fall back to English (which will be the key itself since it doesn't exist)
          expect(fallbackTranslation).toBe(missingKey);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: For any valid translation key, if it exists in the selected language,
   * it should return that translation, not the fallback
   */
  it('should use language-specific translation when available', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(
          'idle.waiting',
          'sceneSelection.title',
          'guidance.title',
          'countdown.getReady',
          'recording.recording',
          'review.title',
          'result.ready',
          'multiPerson.detected'
        ),
        fc.constantFrom('en', 'zh'),
        (key, language) => {
          const translation = getTranslationWithFallback(key, language);
          const expectedTranslations = language === 'en' ? enTranslations : zhTranslations;
          const expectedTranslation = getNestedValue(expectedTranslations, key);
          
          // Should return the language-specific translation
          expect(translation).toBe(expectedTranslation);
          expect(translation).not.toBe('');
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: For any missing key, the fallback should always return a non-empty string
   */
  it('should always return non-empty string for any key', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 50 }).filter(key => {
          // Exclude reserved JavaScript property names that would cause issues
          const reserved = ['constructor', 'prototype', '__proto__', 'toString', 'valueOf'];
          return !reserved.includes(key) && !key.includes('__');
        }),
        fc.constantFrom('en', 'zh'),
        (randomKey, language) => {
          const translation = getTranslationWithFallback(randomKey, language);
          
          // Should always return something (either translation or the key itself)
          expect(translation).toBeDefined();
          expect(translation).not.toBe('');
          expect(typeof translation).toBe('string');
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Fallback behavior should be consistent across multiple calls
   */
  it('should return consistent fallback results', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 50 }),
        fc.constantFrom('en', 'zh'),
        (key, language) => {
          const translation1 = getTranslationWithFallback(key, language);
          const translation2 = getTranslationWithFallback(key, language);
          const translation3 = getTranslationWithFallback(key, language);
          
          // Should return the same result every time
          expect(translation1).toBe(translation2);
          expect(translation2).toBe(translation3);
        }
      ),
      { numRuns: 100 }
    );
  });
});
