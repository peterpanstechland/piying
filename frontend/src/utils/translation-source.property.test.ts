/**
 * Property-Based Tests for Translation Source
 * Feature: shadow-puppet-interactive-system, Property 46: UI text comes from translation files
 * Validates: Requirements 23.2
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

describe('Property 46: UI text comes from translation files', () => {
  /**
   * Property: For any valid translation key, the text should exist in translation files
   * and not be hardcoded in components
   */
  it('should have all UI text defined in translation files', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(
          'idle.waiting',
          'sceneSelection.title',
          'sceneSelection.hover',
          'guidance.title',
          'guidance.segment',
          'guidance.segment1.action',
          'guidance.segment1.description',
          'guidance.segment2.action',
          'guidance.segment2.description',
          'guidance.segment3.action',
          'guidance.segment3.description',
          'guidance.tips.position',
          'guidance.tips.ready',
          'guidance.starting',
          'countdown.getReady',
          'countdown.go',
          'recording.recording',
          'recording.remaining',
          'recording.hint',
          'review.title',
          'review.segmentComplete',
          'review.recorded',
          'review.frames',
          'review.rerecord',
          'review.continue',
          'review.finish',
          'review.nextSegment',
          'review.allComplete',
          'review.uploading',
          'review.uploadFailed',
          'result.processing',
          'result.processingHint',
          'result.ready',
          'result.scanQR',
          'result.autoReset',
          'multiPerson.detected',
          'multiPerson.trackingCenter',
          'multiPerson.trackingOriginal',
          'errors.cameraAccess',
          'errors.networkError',
          'errors.renderFailed'
        ),
        fc.constantFrom('en', 'zh'),
        (key, language) => {
          // Get translation from the appropriate file
          const translations = language === 'en' ? enTranslations : zhTranslations;
          const translation = getNestedValue(translations, key);
          
          // Verify translation exists in the file
          expect(translation).toBeDefined();
          expect(translation).not.toBe('');
          
          // Verify translation is a string
          expect(typeof translation).toBe('string');
          
          // Verify translation is not just the key (which would indicate it's hardcoded)
          expect(translation).not.toBe(key);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: For any translation key with interpolation placeholders, 
   * the text should be defined in translation files with proper placeholder syntax
   */
  it('should have interpolation placeholders in translation files', () => {
    fc.assert(
      fc.property(
        fc.record({
          key: fc.constantFrom(
            'guidance.segment',
            'review.segmentComplete',
            'review.nextSegment',
            'result.autoReset'
          ),
          language: fc.constantFrom('en', 'zh'),
        }),
        ({ key, language }) => {
          // Get translation from the appropriate file
          const translations = language === 'en' ? enTranslations : zhTranslations;
          const translation = getNestedValue(translations, key);
          
          // Verify translation exists
          expect(translation).toBeDefined();
          expect(typeof translation).toBe('string');
          
          // Verify translation contains interpolation placeholders ({{...}})
          const hasPlaceholder = /\{\{[^}]+\}\}/.test(translation);
          expect(hasPlaceholder).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: All translation keys should exist in both language files
   */
  it('should have all keys present in both English and Chinese translation files', () => {
    const getAllKeys = (obj: any, prefix = ''): string[] => {
      let keys: string[] = [];
      
      for (const key in obj) {
        const fullKey = prefix ? `${prefix}.${key}` : key;
        
        if (typeof obj[key] === 'object' && obj[key] !== null) {
          keys = keys.concat(getAllKeys(obj[key], fullKey));
        } else {
          keys.push(fullKey);
        }
      }
      
      return keys;
    };
    
    const enKeys = getAllKeys(enTranslations);
    const zhKeys = getAllKeys(zhTranslations);
    
    // Verify both files have the same keys
    expect(enKeys.sort()).toEqual(zhKeys.sort());
    
    // Verify all keys have non-empty values in both languages
    fc.assert(
      fc.property(
        fc.constantFrom(...enKeys),
        fc.constantFrom('en', 'zh'),
        (key, language) => {
          const translations = language === 'en' ? enTranslations : zhTranslations;
          const translation = getNestedValue(translations, key);
          
          expect(translation).toBeDefined();
          expect(translation).not.toBe('');
          expect(typeof translation).toBe('string');
        }
      ),
      { numRuns: 100 }
    );
  });
});
