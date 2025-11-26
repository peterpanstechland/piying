import { useRef, useEffect, useState, useLayoutEffect, useCallback } from 'react';
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
  // Canvas for rendering video background (Layer 0)
  const videoCanvasRef = useRef<HTMLCanvasElement>(null);
  // Canvas for rendering cursor (Layer 2 - Top)
  const cursorCanvasRef = useRef<HTMLCanvasElement>(null);
  
  const sceneCardsRef = useRef<Map<string, DOMRect>>(new Map());
  const cursorControllerRef = useRef<GestureCursorController>(new GestureCursorController());
  const cardsContainerRef = useRef<HTMLDivElement>(null);
  
  const [hoveredSceneId, setHoveredSceneId] = useState<string | null>(null);
  const [hoverProgress, setHoverProgress] = useState<number>(0);
  const [cardDimensions, setCardDimensions] = useState<Map<string, { width: number; height: number }>>(new Map());

  // Helper to calculate screen coordinates from normalized position based on video object-fit: cover
  const getScreenCoordinates = useCallback((normalizedX: number, normalizedY: number, canvasWidth: number, canvasHeight: number) => {
    if (!videoElement || videoElement.videoWidth === 0 || videoElement.videoHeight === 0) {
      // Fallback if no video or video not ready
      return {
        x: normalizedX * canvasWidth,
        y: normalizedY * canvasHeight
      };
    }

    const vRatio = videoElement.videoWidth / videoElement.videoHeight;
    const cRatio = canvasWidth / canvasHeight;
    
    let drawWidth, drawHeight, startX, startY;

    if (vRatio > cRatio) {
      // Video is wider than screen (height fits, width cropped)
      drawHeight = canvasHeight;
      drawWidth = drawHeight * vRatio;
      startX = (canvasWidth - drawWidth) / 2;
      startY = 0;
    } else {
      // Screen is wider than video (width fits, height cropped)
      drawWidth = canvasWidth;
      drawHeight = drawWidth / vRatio;
      startX = 0;
      startY = (canvasHeight - drawHeight) / 2;
    }

    return {
      x: startX + normalizedX * drawWidth,
      y: startY + normalizedY * drawHeight
    };
  }, [videoElement]);

  // Monitor card dimensions for SVG path calculation
  useLayoutEffect(() => {
    const observer = new ResizeObserver((entries) => {
      const newDimensions = new Map(cardDimensions);
      let hasChanges = false;
      
      entries.forEach((entry) => {
        const id = entry.target.id.replace('scene-card-', '');
        if (id) {
          // Use borderBoxSize if available for better accuracy without transforms
          let width, height;
          if (entry.borderBoxSize && entry.borderBoxSize.length > 0) {
            width = entry.borderBoxSize[0].inlineSize;
            height = entry.borderBoxSize[0].blockSize;
          } else {
            // Fallback
            const rect = entry.target.getBoundingClientRect();
            width = rect.width;
            height = rect.height;
          }
          
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
    // We need the window dimensions for normalized coordinate mapping
    if (!handPosition) return;

    const controller = cursorControllerRef.current;
    const viewWidth = window.innerWidth;
    const viewHeight = window.innerHeight;

    // Build scene cards array from DOM elements
    const sceneCards: SceneCard[] = [];
    
    scenes.forEach((scene) => {
      const element = document.getElementById(`scene-card-${scene.id}`);
      if (element) {
        const rect = element.getBoundingClientRect();
        sceneCards.push({
          id: scene.id,
          bounds: {
            x: rect.left,
            y: rect.top,
            width: rect.width,
            height: rect.height,
          },
        });
      }
    });

    // Update hover state
    const updateHover = () => {
      if (sceneCards.length === 0) return;
      
      // Get current normalized position from controller
      const normalizedPos = controller.getCursorPosition();
      
      // Convert to screen coordinates using video mapping logic
      const screenPos = getScreenCoordinates(
        normalizedPos.x, 
        normalizedPos.y, 
        viewWidth, 
        viewHeight
      );
      
      // Use new method that accepts screen coordinates
      controller.updateHoverStateWithScreenPos(
        sceneCards,
        screenPos.x,
        screenPos.y,
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

    const intervalId = setInterval(updateHover, 50); // 20 FPS

    return () => {
      clearInterval(intervalId);
    };
  }, [scenes, onSceneSelect, handPosition, getScreenCoordinates]); // Add getScreenCoordinates dependency

  // Render video feed (Layer 0)
  useEffect(() => {
    if (!videoElement || !videoCanvasRef.current) {
      return;
    }

    const canvas = videoCanvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    let animationFrameId: number;
    let frameCount = 0;

    const renderVideo = () => {
      frameCount++;
      
      if (videoElement.readyState === videoElement.HAVE_ENOUGH_DATA) {
        const vRatio = videoElement.videoWidth / videoElement.videoHeight;
        const cRatio = canvas.width / canvas.height;
        let drawWidth, drawHeight, startX, startY;

        if (vRatio > cRatio) {
          drawHeight = canvas.height;
          drawWidth = drawHeight * vRatio;
          startX = (canvas.width - drawWidth) / 2;
          startY = 0;
        } else {
          drawWidth = canvas.width;
          drawHeight = drawWidth / vRatio;
          startX = 0;
          startY = (canvas.height - drawHeight) / 2;
        }

        ctx.drawImage(videoElement, startX, startY, drawWidth, drawHeight);
      }

      animationFrameId = requestAnimationFrame(renderVideo);
    };

    renderVideo();

    const handleResize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    window.addEventListener('resize', handleResize);

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', handleResize);
    };
  }, [videoElement]);

  // Render cursor (Layer 2 - Top)
  useEffect(() => {
    if (!cursorCanvasRef.current) return;

    const canvas = cursorCanvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    let animationFrameId: number;

    const renderCursor = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Get normalized position
      const cursorPos = cursorControllerRef.current.getCursorPosition();
      
      // Convert to screen coordinates using the shared helper logic
      // Note: We calculate this every frame inside the render loop
      // Ideally we should use the stable helper, but we can't access it easily inside this effect 
      // without adding it to dependencies which might trigger re-renders.
      // Since the logic is dependent on videoElement which is stable enough, we can replicate it or reference it.
      // For cleanliness, we'll replicate the calculation here or use the helper if we make it a ref.
      // Let's use getScreenCoordinates directly since it's memoized with useCallback based on videoElement
      
      const screenPos = getScreenCoordinates(cursorPos.x, cursorPos.y, canvas.width, canvas.height);
      
      const cursorX = screenPos.x;
      const cursorY = screenPos.y;

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

      animationFrameId = requestAnimationFrame(renderCursor);
    };

    renderCursor();

    const handleResize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    window.addEventListener('resize', handleResize);

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', handleResize);
    };
  }, [getScreenCoordinates]); // Re-run if getScreenCoordinates changes (which changes when videoElement changes)

  const isChineseLanguage = i18n.language === 'zh' || i18n.language === 'zh-CN';

  return (
    <div className="scene-selection-page">
      {/* Layer 0: Video Background */}
      <canvas ref={videoCanvasRef} className="video-feed-layer" />
      
      {/* Layer 1: UI Overlay */}
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
            
            // Calculate rounded rectangle perimeter
            const r = 24; 
            const perimeter = 2 * (dims.width + dims.height); 
            
            // Calculate dash offset for progress
            const progress = isHovered ? hoverProgress : 0;
            const dashOffset = perimeter * (1 - progress);

            const strokeWidth = 10;
            const halfStroke = strokeWidth / 2;

            return (
              <div
                key={scene.id}
                id={`scene-card-${scene.id}`}
                className={`scene-card ${isHovered ? 'hovered' : ''}`}
              >
                {/* SVG progress border */}
                <svg className="scene-card-border" width="100%" height="100%">
                  <rect
                    x={halfStroke}
                    y={halfStroke}
                    width={Math.max(0, dims.width - strokeWidth)}
                    height={Math.max(0, dims.height - strokeWidth)}
                    rx={r}
                    ry={r}
                    fill="none"
                    stroke="#76FF03"
                    strokeWidth={strokeWidth}
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

      {/* Layer 2: Cursor Top Layer */}
      <canvas ref={cursorCanvasRef} className="cursor-layer" />
    </div>
  );
};
