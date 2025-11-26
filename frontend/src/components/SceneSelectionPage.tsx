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
  const videoCanvasRef = useRef<HTMLCanvasElement>(null);
  const cursorCanvasRef = useRef<HTMLCanvasElement>(null);
  
  const sceneCardsRef = useRef<Map<string, DOMRect>>(new Map());
  const cursorControllerRef = useRef<GestureCursorController>(new GestureCursorController());
  const cardsContainerRef = useRef<HTMLDivElement>(null);
  
  const [hoveredSceneId, setHoveredSceneId] = useState<string | null>(null);
  const [hoverProgress, setHoverProgress] = useState<number>(0);
  const [cardDimensions, setCardDimensions] = useState<Map<string, { width: number; height: number }>>(new Map());

  // Helper to calculate screen coordinates
  const getScreenCoordinates = useCallback((normalizedX: number, normalizedY: number, canvasWidth: number, canvasHeight: number) => {
    if (!videoElement || videoElement.videoWidth === 0 || videoElement.videoHeight === 0) {
      return {
        x: normalizedX * canvasWidth,
        y: normalizedY * canvasHeight
      };
    }

    const vRatio = videoElement.videoWidth / videoElement.videoHeight;
    const cRatio = canvasWidth / canvasHeight;
    
    let drawWidth, drawHeight, startX, startY;

    if (vRatio > cRatio) {
      drawHeight = canvasHeight;
      drawWidth = drawHeight * vRatio;
      startX = (canvasWidth - drawWidth) / 2;
      startY = 0;
    } else {
      drawWidth = canvasWidth;
      drawHeight = drawWidth / vRatio;
      startX = 0;
      startY = (canvas.height - drawHeight) / 2;
    }

    return {
      x: startX + normalizedX * drawWidth,
      y: startY + normalizedY * drawHeight
    };
  }, [videoElement]);

  // Monitor card dimensions
  useLayoutEffect(() => {
    const observer = new ResizeObserver((entries) => {
      const newDimensions = new Map(cardDimensions);
      let hasChanges = false;
      
      entries.forEach((entry) => {
        const id = entry.target.id.replace('scene-card-', '');
        if (id) {
          let width, height;
          if (entry.borderBoxSize && entry.borderBoxSize.length > 0) {
            width = entry.borderBoxSize[0].inlineSize;
            height = entry.borderBoxSize[0].blockSize;
          } else {
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

  // Update cursor position
  useEffect(() => {
    if (handPosition) {
      cursorControllerRef.current.updateCursorPosition(handPosition);
    }
  }, [handPosition]);

  // Update hover state
  useEffect(() => {
    if (!handPosition) return;

    const controller = cursorControllerRef.current;
    const viewWidth = window.innerWidth;
    const viewHeight = window.innerHeight;

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

    const updateHover = () => {
      if (sceneCards.length === 0) return;
      
      const normalizedPos = controller.getCursorPosition();
      
      const screenPos = getScreenCoordinates(
        normalizedPos.x, 
        normalizedPos.y, 
        viewWidth, 
        viewHeight
      );
      
      controller.updateHoverStateWithScreenPos(
        sceneCards,
        screenPos.x,
        screenPos.y,
        5000,
        (sceneId) => {
          console.log('Scene selected via hover:', sceneId);
          if (onSceneSelect) {
            onSceneSelect(sceneId);
          }
        }
      );

      setHoveredSceneId(controller.getHoveredCardId());
      setHoverProgress(controller.getHoverProgress());
    };

    const intervalId = setInterval(updateHover, 50);

    return () => {
      clearInterval(intervalId);
    };
  }, [scenes, onSceneSelect, handPosition, getScreenCoordinates]);

  // Render video feed
  useEffect(() => {
    if (!videoElement || !videoCanvasRef.current) return;

    const canvas = videoCanvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    let animationFrameId: number;

    const renderVideo = () => {
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

  // Render cursor
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

      const cursorPos = cursorControllerRef.current.getCursorPosition();
      const screenPos = getScreenCoordinates(cursorPos.x, cursorPos.y, canvas.width, canvas.height);
      
      const cursorX = screenPos.x;
      const cursorY = screenPos.y;

      ctx.beginPath();
      ctx.arc(cursorX, cursorY, 20, 0, 2 * Math.PI);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.5)';
      ctx.lineWidth = 3;
      ctx.stroke();

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
  }, [getScreenCoordinates]);

  const isChineseLanguage = i18n.language === 'zh' || i18n.language === 'zh-CN';

  return (
    <div className="scene-selection-page">
      <canvas ref={videoCanvasRef} className="video-feed-layer" />
      
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
            
            const dims = cardDimensions.get(scene.id) || { width: 0, height: 0 };
            
            // Use a very thick stroke to simulate a solid border background
            // This creates a "filled" progress effect behind the card
            const strokeWidth = 24; 
            
            // Expansion amount on each side (half of the total extra size)
            const expansion = 12;
            
            // SVG size needs to be larger to contain the stroke
            const expandedWidth = dims.width + (expansion * 2);
            const expandedHeight = dims.height + (expansion * 2);
            
            // Perimeter for dash array
            const perimeter = 2 * (expandedWidth + expandedHeight); 
            
            const progress = isHovered ? hoverProgress : 0;
            const dashOffset = perimeter * (1 - progress);
            
            // Radius calculation
            // Outer radius = Inner radius (24px) + Expansion (12px)
            const outerRadius = 36;
            
            // Position the rect to align with the expansion
            // Rect coordinates are relative to the SVG
            // We want the stroke's centerline to be at expansion distance
            // x, y = expansion
            const rectX = expansion;
            const rectY = expansion;

            return (
              <div
                key={scene.id}
                id={`scene-card-${scene.id}`}
                className={`scene-card ${isHovered ? 'hovered' : ''}`}
              >
                {/* New Background Layer */}
                <div className="scene-card-bg" />

                {/* SVG progress border - NOW BEHIND */}
                <svg className="scene-card-border" width="100%" height="100%">
                  <rect
                    x={rectX}
                    y={rectY}
                    width={Math.max(0, dims.width)}
                    height={Math.max(0, dims.height)}
                    rx={outerRadius}
                    ry={outerRadius}
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
                
                {/* Content Layer */}
                <div className="scene-card-content">
                  <div className="scene-icon">{scene.icon}</div>
                  <h2 className="scene-name">{sceneName}</h2>
                  <p className="scene-description">{sceneDescription}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <canvas ref={cursorCanvasRef} className="cursor-layer" />
    </div>
  );
};
