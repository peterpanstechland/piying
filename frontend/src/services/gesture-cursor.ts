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
  private targetPosition: CursorPosition = { x: 0.5, y: 0.5 };
  private hoveredCardId: string | null = null;
  private hoverStartTime: number = 0;
  private hoverTimer: number | null = null;
  private hoverDuration: number = 5000; // 5 seconds default
  private hoverCallback: HoverCallback | null = null;
  private lastUpdateTime: number = 0;
  private rafId: number | null = null;
  private smoothingFactor: number = 0.3; // Lower = smoother but more lag
  private testMode: boolean = false;

  // Debounce Logic Variables
  private gracePeriodTimer: number | null = null;
  private readonly GRACE_PERIOD: number = 300; // 300ms to tolerate flickering
  
  /**
   * Enable test mode - disables smooth animation for immediate updates
   */
  setTestMode(enabled: boolean): void {
    this.testMode = enabled;
    if (enabled) {
      this.smoothingFactor = 1.0; // Immediate updates in test mode
    }
  }

  /**
   * Update cursor position from hand coordinates
   * Hand coordinates are expected to be normalized [0, 1]
   * Uses smooth interpolation for fluid cursor movement
   */
  updateCursorPosition(handPos: { x: number; y: number }): void {
    this.lastUpdateTime = performance.now();
    
    // Handle NaN and invalid values
    const x = isNaN(handPos.x) || !isFinite(handPos.x) ? 0.5 : handPos.x;
    const y = isNaN(handPos.y) || !isFinite(handPos.y) ? 0.5 : handPos.y;
    
    // Ensure coordinates are within valid range [0, 1]
    this.targetPosition = {
      x: Math.max(0, Math.min(1, x)),
      y: Math.max(0, Math.min(1, y)),
    };
    
    // In test mode, update position immediately
    if (this.testMode) {
      this.cursorPosition = { ...this.targetPosition };
    } else {
      // Start smooth animation if not already running
      if (this.rafId === null) {
        this.startSmoothUpdate();
      }
    }
  }

  /**
   * Start smooth cursor position updates using requestAnimationFrame
   */
  private startSmoothUpdate(): void {
    const animate = () => {
      // Interpolate towards target position
      const dx = this.targetPosition.x - this.cursorPosition.x;
      const dy = this.targetPosition.y - this.cursorPosition.y;
      
      // Check if we're close enough to target
      const distance = Math.sqrt(dx * dx + dy * dy);
      
      if (distance > 0.001) {
        // Smooth interpolation
        this.cursorPosition.x += dx * this.smoothingFactor;
        this.cursorPosition.y += dy * this.smoothingFactor;
        
        // Continue animation
        this.rafId = requestAnimationFrame(animate);
      } else {
        // Snap to target and stop animation
        this.cursorPosition = { ...this.targetPosition };
        this.rafId = null;
      }
    };
    
    this.rafId = requestAnimationFrame(animate);
  }

  /**
   * Force immediate position update (for testing)
   * Skips smooth interpolation and snaps directly to target
   */
  forceUpdatePosition(): void {
    this.cursorPosition = { ...this.targetPosition };
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
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
   * Check which scene card (if any) the cursor is hovering over
   * Uses pre-calculated screen coordinates
   */
  checkHoverScreenPos(cards: SceneCard[], screenX: number, screenY: number): string | null {
    // Collision buffer/tolerance in pixels to make selection easier
    const tolerance = 40; // Increased from 20 to 40 for easier selection

    // Check collision with each card
    for (const card of cards) {
      // Determine if we are currently hovering this card (sticky selection)
      // If so, we might want an even larger tolerance to prevent flickering
      const isCurrentTarget = this.hoveredCardId === card.id;
      const effectiveTolerance = isCurrentTarget ? tolerance + 20 : tolerance; // Increased sticky bonus

      if (
        screenX >= card.bounds.x - effectiveTolerance &&
        screenX <= card.bounds.x + card.bounds.width + effectiveTolerance &&
        screenY >= card.bounds.y - effectiveTolerance &&
        screenY <= card.bounds.y + card.bounds.height + effectiveTolerance
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
    // If already hovering over the same card, clear any pending loss timer
    if (this.hoveredCardId === cardId) {
      if (this.gracePeriodTimer !== null) {
        clearTimeout(this.gracePeriodTimer);
        this.gracePeriodTimer = null;
      }
      // If timer is already running, do nothing (continue counting)
      if (this.hoverTimer !== null) {
        return;
      }
    }

    // If switching to a different card, cancel everything immediately
    if (this.hoveredCardId !== null && this.hoveredCardId !== cardId) {
      this.cancelHoverTimer(true); // Force cancel
    }

    // Cancel any existing timer if we are starting fresh
    if (this.hoveredCardId !== cardId) {
      this.cancelHoverTimer(true);
    }

    // Start new hover
    this.hoveredCardId = cardId;
    this.hoverDuration = duration;
    this.hoverCallback = callback;

    // Only set start time if not already set (preserving progress during grace period)
    if (this.hoverStartTime === 0) {
      this.hoverStartTime = performance.now();
    }
    
    // Ensure timer is running
    if (this.hoverTimer === null) {
      // Calculate remaining time
      const elapsed = performance.now() - this.hoverStartTime;
      const remaining = Math.max(0, duration - elapsed);
      
      this.hoverTimer = window.setTimeout(() => {
        if (this.hoveredCardId === cardId && this.hoverCallback) {
          this.hoverCallback(cardId);
          this.cancelHoverTimer(true);
        }
      }, remaining);
    }
  }

  /**
   * Cancel current hover timer
   * @param force If true, cancels immediately without grace period
   */
  cancelHoverTimer(force: boolean = false): void {
    if (!force && this.hoveredCardId !== null) {
      // Start grace period if not already started
      if (this.gracePeriodTimer === null) {
        this.gracePeriodTimer = window.setTimeout(() => {
          // Grace period over, really cancel now
          this.cancelHoverTimer(true);
        }, this.GRACE_PERIOD);
      }
      return; // Don't cancel yet
    }

    // Real cancellation logic
    if (this.gracePeriodTimer !== null) {
      clearTimeout(this.gracePeriodTimer);
      this.gracePeriodTimer = null;
    }
    
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
    this.cancelHoverTimer(true);
    
    // Cancel any pending animation frames
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    
    this.cursorPosition = { x: 0.5, y: 0.5 };
    this.targetPosition = { x: 0.5, y: 0.5 };
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
      this.cancelHoverTimer(false); // Allow grace period
    }
  }

  /**
   * Update hover state using specific screen coordinates
   * Use this when the normalized cursor position needs complex mapping to screen coordinates
   */
  updateHoverStateWithScreenPos(
    cards: SceneCard[],
    screenX: number,
    screenY: number,
    hoverDuration: number,
    callback: HoverCallback
  ): void {
    const hoveredCard = this.checkHoverScreenPos(cards, screenX, screenY);

    if (hoveredCard) {
      // Start or continue hover
      this.startHoverTimer(hoveredCard, hoverDuration, callback);
    } else {
      // Not hovering over any card, cancel timer
      this.cancelHoverTimer(false); // Allow grace period
    }
  }
}
