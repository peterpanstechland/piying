/**
 * Property-Based Tests for SceneSelectionPage
 * Feature: shadow-puppet-interactive-system, Property 4: All scenes contain required display elements
 * Validates: Requirements 3.2
 */

import * as fc from 'fast-check';
import { SceneSelectionPage, Scene } from './SceneSelectionPage';
import { renderWithI18n } from './test-utils';

// Generator for valid scene objects
const sceneArbitrary = fc.record({
  id: fc.stringOf(fc.constantFrom('a', 'b', 'c', '0', '1', '2', '3', '4', '5', '6', '7', '8', '9'), { minLength: 1, maxLength: 20 }),
  name: fc.string({ minLength: 1, maxLength: 50 }),
  name_en: fc.string({ minLength: 1, maxLength: 50 }),
  description: fc.string({ minLength: 1, maxLength: 200 }),
  description_en: fc.string({ minLength: 1, maxLength: 200 }),
  icon: fc.constantFrom('🥋', '💃', '📖', '🎭', '🎨', '🎵', '⚽', '🎮'),
  segments: fc.array(
    fc.record({
      duration: fc.integer({ min: 1, max: 30 }),
      path_type: fc.constantFrom('enter_left', 'enter_right', 'static', 'exit_left', 'exit_right'),
      offset_start: fc.tuple(fc.integer({ min: -500, max: 500 }), fc.integer({ min: -500, max: 500 })),
      offset_end: fc.tuple(fc.integer({ min: -500, max: 500 }), fc.integer({ min: -500, max: 500 })),
    }),
    { minLength: 1, maxLength: 5 }
  ),
});

describe('SceneSelectionPage Property Tests', () => {
  /**
   * Property 4: All scenes contain required display elements
   * For any scene in the scene selection interface, the rendered output should contain
   * scene name, description, and icon element.
   */
  it('Property 4: All scenes contain required display elements', () => {
    fc.assert(
      fc.property(
        fc.array(sceneArbitrary, { minLength: 1, maxLength: 10 }),
        fc.constantFrom('en', 'zh'),
        (scenes: Scene[], language: string) => {
          // Ensure unique IDs to avoid React key warnings
          const uniqueScenes = scenes.map((scene, index) => ({
            ...scene,
            id: `${scene.id}-${index}`,
          }));

          // Render component with language
          const { container } = renderWithI18n(
            <SceneSelectionPage scenes={uniqueScenes} />,
            language
          );

          // For each scene, verify required elements are present
          uniqueScenes.forEach((scene) => {
            const sceneCard = container.querySelector(`#scene-card-${scene.id}`);
            
            // Scene card should exist
            expect(sceneCard).toBeTruthy();
            
            if (sceneCard) {
              // Check for icon element
              const iconElement = sceneCard.querySelector('.scene-icon');
              expect(iconElement).toBeTruthy();
              expect(iconElement?.textContent).toBe(scene.icon);

              // Check for name element
              const nameElement = sceneCard.querySelector('.scene-name');
              expect(nameElement).toBeTruthy();
              
              // Name should be either Chinese or English depending on language
              const expectedName = language === 'zh' ? scene.name : scene.name_en;
              expect(nameElement?.textContent).toBe(expectedName);

              // Check for description element
              const descriptionElement = sceneCard.querySelector('.scene-description');
              expect(descriptionElement).toBeTruthy();
              
              // Description should be either Chinese or English depending on language
              const expectedDescription = language === 'zh' ? scene.description : scene.description_en;
              expect(descriptionElement?.textContent).toBe(expectedDescription);
            }
          });
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Additional property: Scene cards should have unique IDs
   */
  it('Property: Scene cards have unique IDs', () => {
    fc.assert(
      fc.property(
        fc.array(sceneArbitrary, { minLength: 2, maxLength: 10 }),
        (scenes: Scene[]) => {
          // Ensure unique IDs for this test
          const uniqueScenes = scenes.map((scene, index) => ({
            ...scene,
            id: `scene-${index}`,
          }));

          const { container } = renderWithI18n(
            <SceneSelectionPage scenes={uniqueScenes} />
          );

          // Collect all scene card IDs
          const sceneCards = container.querySelectorAll('[id^="scene-card-"]');
          const ids = Array.from(sceneCards).map((card) => card.id);

          // All IDs should be unique
          const uniqueIds = new Set(ids);
          expect(uniqueIds.size).toBe(ids.length);
          expect(ids.length).toBe(uniqueScenes.length);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Additional property: Empty scenes array should render without crashing
   */
  it('Property: Empty scenes array renders without errors', () => {
    const { container } = renderWithI18n(
      <SceneSelectionPage scenes={[]} />
    );

    // Should render the container
    expect(container.querySelector('.scene-selection-page')).toBeTruthy();
    
    // Should have no scene cards
    const sceneCards = container.querySelectorAll('.scene-card');
    expect(sceneCards.length).toBe(0);
  });

  /**
   * Additional property: Scene cards render without hover state by default
   */
  it('Property: Scene cards render without hover state by default', () => {
    fc.assert(
      fc.property(
        fc.array(sceneArbitrary, { minLength: 1, maxLength: 5 }),
        (scenes: Scene[]) => {
          // Ensure unique IDs
          const uniqueScenes = scenes.map((scene, index) => ({
            ...scene,
            id: `scene-${index}`,
          }));

          const { container } = renderWithI18n(
            <SceneSelectionPage scenes={uniqueScenes} />
          );

          // No scene cards should have 'hovered' class initially
          uniqueScenes.forEach((scene) => {
            const sceneCard = container.querySelector(`#scene-card-${scene.id}`);
            expect(sceneCard?.classList.contains('hovered')).toBe(false);
            
            // Should not have progress bar when not hovered
            const progressBar = sceneCard?.querySelector('.hover-progress-bar');
            expect(progressBar).toBeFalsy();
          });
        }
      ),
      { numRuns: 100 }
    );
  });
});
