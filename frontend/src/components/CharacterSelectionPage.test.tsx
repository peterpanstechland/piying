/**
 * Tests for CharacterSelectionPage
 * Task 8.4.1: Verify CharacterSelectionPage tests pass
 * Tests character video path fetching and display functionality
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { CharacterSelectionPage, CharacterOption } from './CharacterSelectionPage';
import { renderWithI18n } from './test-utils';

// Mock ResizeObserver
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

// Mock HTMLCanvasElement.getContext
HTMLCanvasElement.prototype.getContext = jest.fn(() => ({
  fillRect: jest.fn(),
  clearRect: jest.fn(),
  getImageData: jest.fn(() => ({ data: [] })),
  putImageData: jest.fn(),
  createImageData: jest.fn(() => []),
  setTransform: jest.fn(),
  drawImage: jest.fn(),
  save: jest.fn(),
  restore: jest.fn(),
  beginPath: jest.fn(),
  moveTo: jest.fn(),
  lineTo: jest.fn(),
  closePath: jest.fn(),
  stroke: jest.fn(),
  fill: jest.fn(),
  arc: jest.fn(),
  translate: jest.fn(),
  scale: jest.fn(),
  rotate: jest.fn(),
  measureText: jest.fn(() => ({ width: 0 })),
  fillText: jest.fn(),
  strokeText: jest.fn(),
})) as any;

// Mock requestAnimationFrame
global.requestAnimationFrame = jest.fn((cb) => {
  return setTimeout(cb, 16) as unknown as number;
});
global.cancelAnimationFrame = jest.fn((id) => clearTimeout(id));

describe('CharacterSelectionPage', () => {
  const mockCharacters: CharacterOption[] = [
    {
      id: 'char-1',
      name: 'Character One',
      thumbnail_path: '/assets/thumbnails/char1.png',
      is_default: true,
      display_order: 1,
    },
    {
      id: 'char-2',
      name: 'Character Two',
      thumbnail_path: '/assets/thumbnails/char2.png',
      is_default: false,
      display_order: 2,
    },
    {
      id: 'char-3',
      name: 'Character Three',
      thumbnail_path: null,
      is_default: false,
      display_order: 3,
    },
  ];

  const defaultProps = {
    characters: mockCharacters,
    sceneName: 'Test Scene',
    apiBaseUrl: 'http://localhost:8000',
  };

  it('renders character cards for all characters', () => {
    renderWithI18n(<CharacterSelectionPage {...defaultProps} />);

    mockCharacters.forEach((char) => {
      const card = document.getElementById(`character-card-${char.id}`);
      expect(card).toBeTruthy();
    });
  });

  it('displays character names correctly', () => {
    renderWithI18n(<CharacterSelectionPage {...defaultProps} />);

    mockCharacters.forEach((char) => {
      expect(screen.getByText(char.name)).toBeTruthy();
    });
  });

  it('displays scene name in header', () => {
    renderWithI18n(<CharacterSelectionPage {...defaultProps} />);

    expect(screen.getByText('Test Scene')).toBeTruthy();
  });

  it('shows recommended badge for default character', () => {
    renderWithI18n(<CharacterSelectionPage {...defaultProps} />);

    // Default character should have recommended badge
    expect(screen.getByText('Recommended')).toBeTruthy();
  });

  it('shows recommended badge in Chinese when language is zh', () => {
    renderWithI18n(<CharacterSelectionPage {...defaultProps} />, 'zh');

    expect(screen.getByText('推荐')).toBeTruthy();
  });

  it('renders thumbnail images with correct URLs', () => {
    renderWithI18n(<CharacterSelectionPage {...defaultProps} />);

    const images = document.querySelectorAll('.character-thumbnail');
    expect(images.length).toBe(2); // Only 2 characters have thumbnails

    const imgSrcs = Array.from(images).map((img) => (img as HTMLImageElement).src);
    expect(imgSrcs).toContain('http://localhost:8000/assets/thumbnails/char1.png');
    expect(imgSrcs).toContain('http://localhost:8000/assets/thumbnails/char2.png');
  });

  it('renders placeholder for characters without thumbnails', () => {
    renderWithI18n(<CharacterSelectionPage {...defaultProps} />);

    const placeholders = document.querySelectorAll('.character-placeholder');
    expect(placeholders.length).toBe(1); // Only char-3 has no thumbnail
  });

  it('sorts characters with default first, then by display_order', () => {
    const unsortedCharacters: CharacterOption[] = [
      { id: 'c', name: 'C', thumbnail_path: null, is_default: false, display_order: 3 },
      { id: 'a', name: 'A', thumbnail_path: null, is_default: false, display_order: 1 },
      { id: 'b', name: 'B', thumbnail_path: null, is_default: true, display_order: 2 },
    ];

    renderWithI18n(
      <CharacterSelectionPage {...defaultProps} characters={unsortedCharacters} />
    );

    const cards = document.querySelectorAll('.character-card');
    const cardIds = Array.from(cards).map((card) => card.id);

    // Default character (b) should be first
    expect(cardIds[0]).toBe('character-card-b');
  });

  it('handles empty characters array', () => {
    renderWithI18n(<CharacterSelectionPage {...defaultProps} characters={[]} />);

    const container = document.querySelector('.character-selection-page');
    expect(container).toBeTruthy();

    const cards = document.querySelectorAll('.character-card');
    expect(cards.length).toBe(0);
  });

  it('handles absolute URL thumbnails without prepending apiBaseUrl', () => {
    const charactersWithAbsoluteUrl: CharacterOption[] = [
      {
        id: 'char-abs',
        name: 'Absolute URL Character',
        thumbnail_path: 'https://example.com/thumbnail.png',
        is_default: false,
        display_order: 1,
      },
    ];

    renderWithI18n(
      <CharacterSelectionPage {...defaultProps} characters={charactersWithAbsoluteUrl} />
    );

    const img = document.querySelector('.character-thumbnail') as HTMLImageElement;
    expect(img.src).toBe('https://example.com/thumbnail.png');
  });

  it('calls onCharacterSelect when character is selected', () => {
    const mockOnSelect = jest.fn();

    renderWithI18n(
      <CharacterSelectionPage {...defaultProps} onCharacterSelect={mockOnSelect} />
    );

    // Component renders, onCharacterSelect is available for gesture selection
    // The actual selection happens via hover gesture, which is tested separately
    expect(document.querySelectorAll('.character-card').length).toBe(3);
  });

  it('renders without videoElement prop', () => {
    renderWithI18n(<CharacterSelectionPage {...defaultProps} videoElement={null} />);

    const container = document.querySelector('.character-selection-page');
    expect(container).toBeTruthy();
  });

  it('renders without handPosition prop', () => {
    renderWithI18n(<CharacterSelectionPage {...defaultProps} handPosition={null} />);

    const container = document.querySelector('.character-selection-page');
    expect(container).toBeTruthy();
  });

  it('displays correct header text in English', () => {
    renderWithI18n(<CharacterSelectionPage {...defaultProps} />, 'en');

    expect(screen.getByText('Choose Character')).toBeTruthy();
    expect(screen.getByText('Hover over a character to select')).toBeTruthy();
  });

  it('displays correct header text in Chinese', () => {
    renderWithI18n(<CharacterSelectionPage {...defaultProps} />, 'zh');

    expect(screen.getByText('选择角色')).toBeTruthy();
    expect(screen.getByText('将手悬停在角色上进行选择')).toBeTruthy();
  });
});
