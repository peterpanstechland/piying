import { GestureCursorController, SceneCard } from './gesture-cursor';

describe('GestureCursorController', () => {
  let controller: GestureCursorController;

  beforeEach(() => {
    jest.useFakeTimers();
    controller = new GestureCursorController();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  describe('updateCursorPosition', () => {
    it('should update cursor position with valid coordinates', () => {
      controller.updateCursorPosition({ x: 0.5, y: 0.5 });
      const position = controller.getCursorPosition();
      
      expect(position.x).toBe(0.5);
      expect(position.y).toBe(0.5);
    });

    it('should clamp coordinates to [0, 1] range', () => {
      controller.updateCursorPosition({ x: 1.5, y: -0.5 });
      controller.forceUpdatePosition(); // Force immediate update for testing
      
      const position = controller.getCursorPosition();
      
      expect(position.x).toBe(1);
      expect(position.y).toBe(0);
    });

    it('should handle NaN values by defaulting to 0.5', () => {
      controller.updateCursorPosition({ x: NaN, y: NaN });
      const position = controller.getCursorPosition();
      
      expect(position.x).toBe(0.5);
      expect(position.y).toBe(0.5);
    });

    it('should handle Infinity values by defaulting to 0.5', () => {
      controller.updateCursorPosition({ x: Infinity, y: -Infinity });
      const position = controller.getCursorPosition();
      
      expect(position.x).toBe(0.5);
      expect(position.y).toBe(0.5);
    });
  });

  describe('checkHover', () => {
    const sceneCards: SceneCard[] = [
      {
        id: 'scene1',
        bounds: { x: 100, y: 100, width: 200, height: 150 },
      },
      {
        id: 'scene2',
        bounds: { x: 400, y: 100, width: 200, height: 150 },
      },
    ];

    it('should detect hover when cursor is inside a card', () => {
      controller.updateCursorPosition({ x: 0.25, y: 0.25 }); // 200, 150 on 800x600 canvas
      controller.forceUpdatePosition(); // Force immediate update for testing
      
      const hoveredCard = controller.checkHover(sceneCards, 800, 600);
      
      expect(hoveredCard).toBe('scene1');
    });

    it('should return null when cursor is outside all cards', () => {
      controller.updateCursorPosition({ x: 0.05, y: 0.05 }); // 40, 30 on 800x600 canvas
      const hoveredCard = controller.checkHover(sceneCards, 800, 600);
      
      expect(hoveredCard).toBeNull();
    });

    it('should return null for invalid canvas dimensions', () => {
      controller.updateCursorPosition({ x: 0.5, y: 0.5 });
      const hoveredCard = controller.checkHover(sceneCards, 0, 0);
      
      expect(hoveredCard).toBeNull();
    });
  });

  describe('hover timer', () => {
    it('should start hover timer and track progress', () => {
      const callback = jest.fn();
      
      controller.startHoverTimer('scene1', 1000, callback);
      
      expect(controller.getHoveredCardId()).toBe('scene1');
      expect(controller.getHoverProgress()).toBeGreaterThanOrEqual(0);
      expect(controller.getHoverProgress()).toBeLessThanOrEqual(1);
    });

    it('should call callback after hover duration', () => {
      const callback = jest.fn();
      
      controller.startHoverTimer('scene1', 100, callback);
      
      // Advance timers to trigger the callback
      jest.advanceTimersByTime(100);
      
      expect(callback).toHaveBeenCalledWith('scene1');
    });

    it('should cancel hover timer', () => {
      const callback = jest.fn();
      
      controller.startHoverTimer('scene1', 1000, callback);
      controller.cancelHoverTimer(true); // Force immediate cancellation (bypass grace period)
      
      expect(controller.getHoveredCardId()).toBeNull();
      expect(controller.getHoverProgress()).toBe(0);
    });

    it('should not restart timer if already hovering same card', () => {
      const callback = jest.fn();
      
      controller.startHoverTimer('scene1', 1000, callback);
      const firstProgress = controller.getHoverProgress();
      
      // Try to start again
      controller.startHoverTimer('scene1', 1000, callback);
      const secondProgress = controller.getHoverProgress();
      
      // Progress should have continued, not reset
      expect(secondProgress).toBeGreaterThanOrEqual(firstProgress);
    });
  });

  describe('updateHoverState', () => {
    const sceneCards: SceneCard[] = [
      {
        id: 'scene1',
        bounds: { x: 100, y: 100, width: 200, height: 150 },
      },
    ];

    it('should start hover when cursor enters card', () => {
      const callback = jest.fn();
      
      controller.updateCursorPosition({ x: 0.25, y: 0.25 }); // Inside scene1
      controller.forceUpdatePosition(); // Force immediate update for testing
      
      controller.updateHoverState(sceneCards, 800, 600, 5000, callback);
      
      expect(controller.getHoveredCardId()).toBe('scene1');
    });

    it('should cancel hover when cursor leaves card', () => {
      const callback = jest.fn();
      
      // Start hovering
      controller.updateCursorPosition({ x: 0.25, y: 0.25 });
      controller.forceUpdatePosition(); // Force immediate update for testing
      controller.updateHoverState(sceneCards, 800, 600, 5000, callback);
      expect(controller.getHoveredCardId()).toBe('scene1');
      
      // Move outside
      controller.updateCursorPosition({ x: 0.05, y: 0.05 });
      controller.forceUpdatePosition(); // Force immediate update for testing
      controller.updateHoverState(sceneCards, 800, 600, 5000, callback);
      
      // Advance past grace period (300ms)
      jest.advanceTimersByTime(350);
      
      expect(controller.getHoveredCardId()).toBeNull();
    });
  });

  describe('reset', () => {
    it('should reset all state', () => {
      const callback = jest.fn();
      
      controller.updateCursorPosition({ x: 0.7, y: 0.8 });
      controller.startHoverTimer('scene1', 5000, callback);
      
      controller.reset();
      
      const position = controller.getCursorPosition();
      expect(position.x).toBe(0.5);
      expect(position.y).toBe(0.5);
      expect(controller.getHoveredCardId()).toBeNull();
      expect(controller.getHoverProgress()).toBe(0);
    });
  });

  describe('getCursorLatency', () => {
    it('should return latency since last update', () => {
      controller.updateCursorPosition({ x: 0.5, y: 0.5 });
      
      // Advance time by 50ms
      jest.advanceTimersByTime(50);
      
      const latency = controller.getCursorLatency();
      expect(latency).toBeGreaterThanOrEqual(40);
      expect(latency).toBeLessThan(100);
    });
  });
});
