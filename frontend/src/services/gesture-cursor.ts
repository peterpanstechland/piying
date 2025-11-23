/**
 * GestureCursorController - Manages gesture-based cursor control
 * Handles hand position mapping, collision detection, and hover selection
 */

export interface SceneCard {
  id: string;
  bounds: { x: number; y: number; width: number; height: number };
}

export interface CursorPosition {
  x: number; // Normalized [0, 1]
  y: number; // Normalized [0, 1]
}

export type HoverCallback = (sceneId: string) => void;

/**
 * GestureCursorController manages cursor position and hover selection logic
 */
export class GestureCursorController {
  private cursorPosition: CursorPosition = { x: 0.5, y: 0.5 };
  private hoveredCardId: string | null = null;
  private hoverStartTime: number = 0;
  private hoverTimer: number | null = null;
  private hoverDuration: number = 5000; // 5 seconds default
  private hoverCallback: HoverCallback | null = null;
  private lastUpdateTime: number = 0;

  /**
   * Update cursor position from hand coordinates
   * Hand coordinates are expected to be normalized [0, 1]
   */
  updateCursorPosition(handPos: { x: number; y: number }): void {
    this.lastUpdateTime = performance.now();
    
    // Handle NaN and invalid values
    const x = isNaN(handPos.x) || !isFinite(handPos.x) ? 0.5 : handPos.x;
    const y = isNaN(handPos.y) || !isFinite(handPos.y) ? 0.5 : handPos.y;
    
    // Ensure coordinates are within valid range [0, 1]
    this.cursorPosition = {
      x: Math.max(0, Math.min(1, x)),
      y: Math.max(0, Math.min(1, y)),
    };
  }

  /**
   * Get current cursor position (normalized coordinates)
   */
  getCursorPosition(): CursorPosition {
    return { ...this.cursorPosition };
  }

  /**
   * Get cursor latency (time since last update)
   */
  getCursorLatency(): number {
    return performance.now() - this.lastUpdateTime;
  }

  /**
   * Check which scene card (if any) the cursor is hovering over
   * Returns the scene ID if hovering, null otherwise
   */
  checkHover(cards: SceneCard[], canvasWidth: number, canvasHeight: number): string | null {
    // Handle invalid canvas dimensions
    if (canvasWidth <= 0 || canvasHeight <= 0 || !isFinite(canvasWidth) || !isFinite(canvasHeight)) {
      return null;
    }

    // Convert normalized cursor position to pixel coordinates
    const cursorX = this.cursorPosition.x * canvasWidth;
    const cursorY = this.cursorPosition.y * canvasHeight;

    // Check collision with each card
    for (const card of cards) {
      if (
        cursorX >= card.bounds.x &&
        cursorX <= card.bounds.x + card.bounds.width &&
        cursorY >= card.bounds.y &&
        cursorY <= card.bounds.y + card.bounds.height
      ) {
        return card.id;
      }
    }

    return null;
  }

  /**
   * Start hover timer for a scene card
   * Callback will be invoked after the specified duration if hover is continuous
   */
  startHoverTimer(cardId: string, duration: number, callback: HoverCallback): void {
    // If already hovering over the same card, don't restart timer
    if (this.hoveredCardId === cardId && this.hoverTimer !== null) {
      return;
    }

    // Cancel any existing timer
    this.cancelHoverTimer();

    // Start new hover
    this.hoveredCardId = cardId;
    this.hoverStartTime = performance.now();
    this.hoverDuration = duration;
    this.hoverCallback = callback;

    // Set timer to trigger callback after duration
    this.hoverTimer = window.setTimeout(() => {
      if (this.hoveredCardId === cardId && this.hoverCallback) {
        this.hoverCallback(cardId);
        this.cancelHoverTimer();
      }
    }, duration);
  }

  /**
   * Cancel current hover timer
   */
  cancelHoverTimer(): void {
    if (this.hoverTimer !== null) {
      clearTimeout(this.hoverTimer);
      this.hoverTimer = null;
    }
    this.hoveredCardId = null;
    this.hoverStartTime = 0;
    this.hoverCallback = null;
  }

  /**
   * Get current hover progress (0-1)
   * Returns 0 if not hovering
   */
  getHoverProgress(): number {
    if (this.hoveredCardId === null || this.hoverStartTime === 0) {
      return 0;
    }

    const elapsed = performance.now() - this.hoverStartTime;
    const progress = Math.min(1, elapsed / this.hoverDuration);
    return progress;
  }

  /**
   * Get currently hovered card ID
   */
  getHoveredCardId(): string | null {
    return this.hoveredCardId;
  }

  /**
   * Reset controller state
   */
  reset(): void {
    this.cancelHoverTimer();
    this.cursorPosition = { x: 0.5, y: 0.5 };
    this.lastUpdateTime = 0;
  }

  /**
   * Update hover state based on current cursor position and scene cards
   * This should be called on each frame to maintain hover logic
   */
  updateHoverState(
    cards: SceneCard[],
    canvasWidth: number,
    canvasHeight: number,
    hoverDuration: number,
    callback: HoverCallback
  ): void {
    const hoveredCard = this.checkHover(cards, canvasWidth, canvasHeight);

    if (hoveredCard) {
      // Start or continue hover
      this.startHoverTimer(hoveredCard, hoverDuration, callback);
    } else {
      // Not hovering over any card, cancel timer
      this.cancelHoverTimer();
    }
  }
}
