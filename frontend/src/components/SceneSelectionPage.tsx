import { useRef, useEffect, useState } from 'react';
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
  
  const [hoveredSceneId, setHoveredSceneId] = useState<string | null>(null);
  const [hoverProgress, setHoverProgress] = useState<number>(0);

  // Update cursor position when hand position changes
  useEffect(() => {
    if (handPosition) {
      cursorControllerRef.current.updateCursorPosition(handPosition);
    }
  }, [handPosition]);

  // Update hover state and progress
  useEffect(() => {
    if (!canvasRef.current) return;

    const canvas = canvasRef.current;
    const controller = cursorControllerRef.current;

    // Build scene cards array from DOM elements
    const sceneCards: SceneCard[] = [];
    sceneCardsRef.current.forEach((bounds, id) => {
      sceneCards.push({
        id,
        bounds: {
          x: bounds.left,
          y: bounds.top,
          width: bounds.width,
          height: bounds.height,
        },
      });
    });

    // Update hover state
    const updateHover = () => {
      controller.updateHoverState(
        sceneCards,
        canvas.width,
        canvas.height,
        5000, // 5 second hover duration
        (sceneId) => {
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
  }, [scenes, onSceneSelect]);

  // Render video feed to canvas
  useEffect(() => {
    if (!videoElement || !canvasRef.current) {
      return;
    }

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;

    const renderFrame = () => {
      if (videoElement.readyState === videoElement.HAVE_ENOUGH_DATA) {
        canvas.width = videoElement.videoWidth;
        canvas.height = videoElement.videoHeight;
        
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

        <div className="scene-cards-container">
          {scenes.map((scene) => {
            const isHovered = hoveredSceneId === scene.id;
            const sceneName = isChineseLanguage ? scene.name : scene.name_en;
            const sceneDescription = isChineseLanguage ? scene.description : scene.description_en;

            return (
              <div
                key={scene.id}
                id={`scene-card-${scene.id}`}
                className={`scene-card ${isHovered ? 'hovered' : ''}`}
              >
                <div className="scene-icon">{scene.icon}</div>
                <h2 className="scene-name">{sceneName}</h2>
                <p className="scene-description">{sceneDescription}</p>
                
                {isHovered && (
                  <div className="hover-progress-container">
                    <div 
                      className="hover-progress-bar"
                      style={{ width: `${hoverProgress * 100}%` }}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
