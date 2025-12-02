import '@testing-library/jest-dom';
import { vi } from 'vitest';

// Mock window.confirm
vi.stubGlobal('confirm', vi.fn(() => true));

// Mock window.alert
vi.stubGlobal('alert', vi.fn());

// Mock localStorage
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
};
vi.stubGlobal('localStorage', localStorageMock);

// Mock HTMLMediaElement
window.HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined);
window.HTMLMediaElement.prototype.pause = vi.fn();
window.HTMLMediaElement.prototype.load = vi.fn();
