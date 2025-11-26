import { useRef, useEffect, useState, useLayoutEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { GestureCursorController, SceneCard } from '../services/gesture-cursor';
import './SceneSelectionPage.css';

export interface Scene {
  id: string;
  name: string;
  name_en: string;
  description: string;
  description_en: string;
  icon: string;
  segments: Array<{
    duration: number;
    path_type: string;
    offset_start: number[];
    offset_end: number[];
  }>;
}

interface SceneSelectionPageProps {
  scenes: Scene[];
  videoElement?: HTMLVideoElement | null;
  handPosition?: { x: number; y: number } | null;
  onSceneSelect?: (sceneId: string) => void;
}

/**
 * SceneSelectionPage - Scene selection interface with gesture cursor
 * Displays scene cards with hover-to-select interaction
 */
export const SceneSelectionPage = ({
  scenes,
  videoElement,
  handPosition,
  onSceneSelect,
}: SceneSelectionPageProps) => {
  const { t, i18n } = useTranslation();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneCardsRef = useRef<Map<string, DOMRect>>(new Map());
  const cursorControllerRef = useRef<GestureCursorController>(new GestureCursorController());
  const cardsContainerRef = useRef<HTMLDivElement>(null);
  
  const [hoveredSceneId, setHoveredSceneId] = useState<string | null>(null);
  const [hoverProgress, setHoverProgress] = useState<number>(0);
  const [cardDimensions, setCardDimensions] = useState<Map<string, { width: number; height: number }>>(new Map());

  // Monitor card dimensions for SVG path calculation
  useLayoutEffect(() => {
    const observer = new ResizeObserver((entries) => {
      const newDimensions = new Map(cardDimensions);
      let hasChanges = false;
      
      entries.forEach((entry) => {
        const id = entry.target.id.replace('scene-card-', '');
        if (id) {
          const { width, height } = entry.contentRect;
          newDimensions.set(id, { width, height });
          hasChanges = true;
        }
      });
      
      if (hasChanges) {
        setCardDimensions(newDimensions);
      }
    });
    
    scenes.forEach((scene) => {
      const element = document.getElementById(`scene-card-${scene.id}`);
      if (element) observer.observe(element);
    });
    
    return () => observer.disconnect();
  }, [scenes]);

  // Update cursor position when hand position changes
  useEffect(() => {
    if (handPosition) {
      cursorControllerRef.current.updateCursorPosition(handPosition);
    }
  }, [handPosition]);

  // Update hover state and progress
  useEffect(() => {
    if (!canvasRef.current || !handPosition) return;

    const canvas = canvasRef.current;
    const controller = cursorControllerRef.current;

    // Build scene cards array from DOM elements with canvas-relative coordinates
    const sceneCards: SceneCard[] = [];
    const canvasRect = canvas.getBoundingClientRect();
    
    sceneCardsRef.current.forEach((bounds, id) => {
      // Convert screen coordinates to canvas coordinates
      sceneCards.push({
        id,
        bounds: {
          x: bounds.left - canvasRect.left,
          y: bounds.top - canvasRect.top,
          width: bounds.width,
          height: bounds.height,
        },
      });
    });

    // Update hover state
    const updateHover = () => {
      // Only update if we have valid scene cards
      if (sceneCards.length === 0) return;
      
      controller.updateHoverState(
        sceneCards,
        canvasRect.width,
        canvasRect.height,
        5000, // 5 second hover duration
        (sceneId) => {
          console.log('Scene selected via hover:', sceneId);
          if (onSceneSelect) {
            onSceneSelect(sceneId);
          }
        }
      );

      // Update UI state
      setHoveredSceneId(controller.getHoveredCardId());
      setHoverProgress(controller.getHoverProgress());
    };

    // Update hover state on each animation frame
    const intervalId = setInterval(updateHover, 50); // 20 FPS

    return () => {
      clearInterval(intervalId);
    };
  }, [scenes, onSceneSelect, handPosition]);

  // Render video feed to canvas
  useEffect(() => {
    if (!videoElement || !canvasRef.current) {
      return;
    }

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas size once
    canvas.width = 1280;
    canvas.height = 720;

    let animationFrameId: number;
    let frameCount = 0;

    const renderFrame = () => {
      frameCount++;
      
      // Render at 15 FPS (skip every other frame)
      if (frameCount % 2 === 0 && videoElement.readyState === videoElement.HAVE_ENOUGH_DATA) {
        // Clear canvas
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        // Draw video frame
        ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);

        // Draw cursor
        const cursorPos = cursorControllerRef.current.getCursorPosition();
        const cursorX = cursorPos.x * canvas.width;
        const cursorY = cursorPos.y * canvas.height;

        // Draw cursor circle
        ctx.beginPath();
        ctx.arc(cursorX, cursorY, 20, 0, 2 * Math.PI);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.lineWidth = 3;
        ctx.stroke();

        // Draw inner dot
        ctx.beginPath();
        ctx.arc(cursorX, cursorY, 5, 0, 2 * Math.PI);
        ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
        ctx.fill();
      }

      animationFrameId = requestAnimationFrame(renderFrame);
    };

    renderFrame();

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [videoElement]);

  // Update scene card bounds for collision detection
  useEffect(() => {
    const updateBounds = () => {
      sceneCardsRef.current.clear();
      scenes.forEach((scene) => {
        const element = document.getElementById(`scene-card-${scene.id}`);
        if (element) {
          sceneCardsRef.current.set(scene.id, element.getBoundingClientRect());
        }
      });
    };

    updateBounds();
    window.addEventListener('resize', updateBounds);

    return () => {
      window.removeEventListener('resize', updateBounds);
    };
  }, [scenes]);

  const isChineseLanguage = i18n.language === 'zh' || i18n.language === 'zh-CN';

  return (
    <div className="scene-selection-page">
      <canvas ref={canvasRef} className="video-feed" />
      
      <div className="scene-selection-overlay">
        <div className="scene-selection-header">
          <h1>{t('sceneSelection.title')}</h1>
          <p className="scene-selection-hint">{t('sceneSelection.hover')}</p>
        </div>

        <div className="scene-cards-container" ref={cardsContainerRef}>
          {scenes.map((scene) => {
            const isHovered = hoveredSceneId === scene.id;
            const sceneName = isChineseLanguage ? scene.name : scene.name_en;
            const sceneDescription = isChineseLanguage ? scene.description : scene.description_en;
            
            // Get card dimensions
            const dims = cardDimensions.get(scene.id) || { width: 0, height: 0 };
            
            // Calculate rounded rectangle perimeter (approximate)
            const r = 20; // border radius
            const perimeter = 2 * (dims.width + dims.height) - 8 * r + 2 * Math.PI * r;
            
            // Calculate dash offset for progress
            const progress = isHovered ? hoverProgress : 0;
            const dashOffset = perimeter * (1 - progress);

            return (
              <div
                key={scene.id}
                id={`scene-card-${scene.id}`}
                className={`scene-card ${isHovered ? 'hovered' : ''}`}
              >
                {/* SVG progress border */}
                <svg className="scene-card-border" width="100%" height="100%">
                  <rect
                    x="2"
                    y="2"
                    width={Math.max(0, dims.width - 4)}
                    height={Math.max(0, dims.height - 4)}
                    rx="20"
                    ry="20"
                    fill="none"
                    stroke="#76FF03"
                    strokeWidth="4"
                    strokeDasharray={perimeter}
                    strokeDashoffset={dashOffset}
                    style={{
                      opacity: isHovered ? 1 : 0,
                      transition: isHovered ? 'none' : 'opacity 0.3s',
                    }}
                  />
                </svg>
                
                <div className="scene-icon">{scene.icon}</div>
                <h2 className="scene-name">{sceneName}</h2>
                <p className="scene-description">{sceneDescription}</p>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
