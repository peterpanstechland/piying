import { useRef, useEffect, useState, useLayoutEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../contexts/ThemeContext';
import { GestureCursorController, SceneCard } from '../services/gesture-cursor';
import { CoverImage } from '../services/api-client';
import './SceneSelectionPage.css';

export interface Scene {
  id: string;
  name: string;
  name_en: string;
  description: string;
  description_en: string;
  icon: string;
  // New fields from storyline API
  synopsis?: string;
  synopsis_en?: string;
  icon_image?: string | null;
  cover_image?: CoverImage | null;
  video_duration?: number;
  character_count?: number;
  segment_count?: number;
  enabled?: boolean; // Whether storyline is enabled for user selection
  // Legacy segments array for backward compatibility
  segments: Array<{
    duration: number;
    path_type?: string;
    offset_start?: number[];
    offset_end?: number[];
    guidance_text?: string;
    guidance_text_en?: string;
    guidance_image?: string | null;
  }>;
}

interface SceneSelectionPageProps {
  scenes: Scene[];
  videoElement?: HTMLVideoElement | null;
  handPosition?: { x: number; y: number } | null;
  onSceneSelect?: (sceneId: string) => void;
  onBack?: () => void; // Callback to return to IDLE
  apiBaseUrl?: string; // Base URL for cover images
  inactivityAutoBackSeconds?: number; // 多少秒后自动返回（默认20秒），倒计时在一半时间后开始显示
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
  onBack,
  apiBaseUrl = '',
  inactivityAutoBackSeconds = 20,
}: SceneSelectionPageProps) => {
  const { t, i18n } = useTranslation();
  const { theme } = useTheme();
  
  useEffect(() => {
    console.log('Current Theme in SceneSelectionPage:', theme);
    console.log('document.documentElement data-theme:', document.documentElement.getAttribute('data-theme'));
  }, [theme]);

  const videoCanvasRef = useRef<HTMLCanvasElement>(null);
  const cursorCanvasRef = useRef<HTMLCanvasElement>(null);
  const cursorControllerRef = useRef<GestureCursorController>(new GestureCursorController());
  const cardsContainerRef = useRef<HTMLDivElement>(null);
  
  const [hoveredSceneId, setHoveredSceneId] = useState<string | null>(null);
  const [hoverProgress, setHoverProgress] = useState<number>(0);
  const [cardDimensions, setCardDimensions] = useState<Map<string, { width: number; height: number }>>(new Map());
  const [isEntered, setIsEntered] = useState(false); // For entrance animation
  
  // Back button hover state
  const [backButtonHovered, setBackButtonHovered] = useState(false);
  const [backButtonProgress, setBackButtonProgress] = useState(0);
  const backButtonRef = useRef<HTMLButtonElement>(null);
  const backButtonHoverStartRef = useRef<number | null>(null);

  // 无操作自动返回状态
  const [inactivitySeconds, setInactivitySeconds] = useState(0);
  const [showCountdown, setShowCountdown] = useState(false);
  const lastInteractionTimeRef = useRef<number>(Date.now());
  const isReturningRef = useRef(false); // 防止重复调用 onBack
  const onBackRef = useRef(onBack);
  onBackRef.current = onBack;

  // Trigger entrance animation after mount
  useEffect(() => {
    const timer = setTimeout(() => setIsEntered(true), 100);
    return () => clearTimeout(timer);
  }, []);

  // 动态计算倒计时显示时间点（总时间的一半）
  const inactivityShowCountdownSeconds = Math.floor(inactivityAutoBackSeconds / 2);

  // 无操作计时器 - 页面级别的自动返回
  useEffect(() => {
    const timer = setInterval(() => {
      // 如果已经在返回中，停止计时
      if (isReturningRef.current) return;
      
      const elapsed = Math.floor((Date.now() - lastInteractionTimeRef.current) / 1000);
      setInactivitySeconds(elapsed);
      
      // 一半时间后显示倒计时
      if (elapsed >= inactivityShowCountdownSeconds && !showCountdown) {
        setShowCountdown(true);
        console.log('[SceneSelection] Showing countdown after', elapsed, 'seconds of inactivity');
      }
      
      // 超时后自动返回
      if (elapsed >= inactivityAutoBackSeconds && onBackRef.current && !isReturningRef.current) {
        console.log('[SceneSelection] Auto-returning after', elapsed, 'seconds of inactivity');
        isReturningRef.current = true; // 标记正在返回，防止重复调用
        onBackRef.current();
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [inactivityShowCountdownSeconds, inactivityAutoBackSeconds, showCountdown]);

  // 当用户悬停在场景上时重置无操作计时器
  useEffect(() => {
    if (hoveredSceneId !== null || backButtonHovered) {
      // 用户正在交互，重置计时器
      lastInteractionTimeRef.current = Date.now();
      setInactivitySeconds(0);
      setShowCountdown(false);
    }
  }, [hoveredSceneId, backButtonHovered]);

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
      startY = (canvasHeight - drawHeight) / 2;
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

  // Update hover state with requestAnimationFrame for smooth performance
  useEffect(() => {
    if (!handPosition) return;

    const controller = cursorControllerRef.current;
    const viewWidth = window.innerWidth;
    const viewHeight = window.innerHeight;
    let animationFrameId: number;
    const HOVER_DURATION = 3000; // 3 seconds to trigger

    const updateHover = () => {
      const normalizedPos = controller.getCursorPosition();
      const screenPos = getScreenCoordinates(
        normalizedPos.x, 
        normalizedPos.y, 
        viewWidth, 
        viewHeight
      );

      // Check back button hover
      if (backButtonRef.current && onBack) {
        const backRect = backButtonRef.current.getBoundingClientRect();
        const isOverBackButton = 
          screenPos.x >= backRect.left &&
          screenPos.x <= backRect.right &&
          screenPos.y >= backRect.top &&
          screenPos.y <= backRect.bottom;

        if (isOverBackButton) {
          if (backButtonHoverStartRef.current === null) {
            backButtonHoverStartRef.current = Date.now();
          }
          const elapsed = Date.now() - backButtonHoverStartRef.current;
          const progress = Math.min(elapsed / HOVER_DURATION, 1);
          setBackButtonHovered(true);
          setBackButtonProgress(progress);
          
          if (progress >= 1) {
            console.log('Back button triggered via gesture');
            backButtonHoverStartRef.current = null;
            setBackButtonProgress(0);
            onBack();
            return;
          }
        } else {
          backButtonHoverStartRef.current = null;
          setBackButtonHovered(false);
          setBackButtonProgress(0);
        }
      }

      // Check scene cards hover
      const sceneCards: SceneCard[] = [];
      
      // Only include enabled scenes for hover detection
      scenes.forEach((scene) => {
        // Skip disabled scenes - they can't be selected
        if (scene.enabled === false) return;
        
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

      if (sceneCards.length > 0) {
        controller.updateHoverStateWithScreenPos(
          sceneCards,
          screenPos.x,
          screenPos.y,
          HOVER_DURATION,
          (sceneId) => {
            console.log('Scene selected via hover:', sceneId);
            if (onSceneSelect) {
              onSceneSelect(sceneId);
            }
          }
        );

        setHoveredSceneId(controller.getHoveredCardId());
        setHoverProgress(controller.getHoverProgress());
      }

      animationFrameId = requestAnimationFrame(updateHover);
    };

    animationFrameId = requestAnimationFrame(updateHover);

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [scenes, onSceneSelect, onBack, handPosition, getScreenCoordinates]);

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

        // Mirror the video horizontally for natural interaction
        ctx.save();
        ctx.scale(-1, 1);
        ctx.drawImage(videoElement, -startX - drawWidth, startY, drawWidth, drawHeight);
        ctx.restore();
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
      
      // Define cursor coordinates explicitly
      const cursorX = screenPos.x;
      const cursorY = screenPos.y;

      // DEBUG: Draw bounding boxes to visualize hit areas
      // Set to true to debug alignment issues
      const isDebug = false; 
      
      if (isDebug) {
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

        sceneCards.forEach(card => {
          // Draw the bounding box the cursor needs to be inside
          // Add tolerance visualization (20px default + 10px stickiness)
          ctx.strokeStyle = 'rgba(255, 0, 0, 0.8)';
          ctx.lineWidth = 2;
          ctx.strokeRect(card.bounds.x, card.bounds.y, card.bounds.width, card.bounds.height);
          
          // Draw tolerance zone
          ctx.strokeStyle = 'rgba(0, 255, 0, 0.3)';
          ctx.strokeRect(card.bounds.x - 20, card.bounds.y - 20, card.bounds.width + 40, card.bounds.height + 40);
        });
      }

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
  }, [getScreenCoordinates, scenes]); // Added scenes dependency for debug rendering

  const isChineseLanguage = i18n.language === 'zh' || i18n.language === 'zh-CN';

  return (
    <div className={`scene-selection-page ${isEntered ? 'entered' : ''}`}>
      <canvas ref={videoCanvasRef} className="video-feed-layer" />
      
      {/* 皮影装饰元素 - 从两侧推入 */}
      <div className="shadow-puppet-decor left">
        <div className="puppet-silhouette puppet-1"></div>
        <div className="puppet-silhouette puppet-2"></div>
      </div>
      <div className="shadow-puppet-decor right">
        <div className="puppet-silhouette puppet-3"></div>
        <div className="puppet-silhouette puppet-4"></div>
      </div>
      
      <div className="scene-selection-overlay">
        <div className="scene-selection-header">
          <h1>{t('sceneSelection.title')}</h1>
          <p className="scene-selection-hint">{t('sceneSelection.hover')}</p>
        </div>

        {/* Back button to return to IDLE - supports both mouse click and gesture hover */}
        {onBack && (
          <button 
            ref={backButtonRef}
            className={`back-to-idle-button ${backButtonHovered ? 'hovering' : ''}`}
            onClick={onBack}
            aria-label={t('common.back', '返回')}
          >
            <div 
              className="back-button-progress"
              style={{ transform: `scaleX(${backButtonProgress})` }}
            />
            <span className="back-icon">←</span>
            <span className="back-text">{t('common.back', '返回')}</span>
            {backButtonHovered && backButtonProgress > 0 && (
              <span className="back-button-hint">
                {Math.ceil((1 - backButtonProgress) * 3)}s
              </span>
            )}
          </button>
        )}

        {/* 自动返回倒计时提示 - 10秒后显示 */}
        {showCountdown && onBack && (
          <div className="auto-return-countdown">
            {inactivityAutoBackSeconds - inactivitySeconds}s 后自动返回
          </div>
        )}

        <div className="scene-cards-container" ref={cardsContainerRef}>
          {scenes.map((scene, index) => {
            const isHovered = hoveredSceneId === scene.id;
            const sceneName = isChineseLanguage ? scene.name : scene.name_en;
            // sceneDescription is kept for backward compatibility but synopsis is preferred
            const _sceneDescription = isChineseLanguage ? scene.description : scene.description_en;
            void _sceneDescription; // Suppress unused warning
            // Use synopsis if available, otherwise fall back to description
            const sceneSynopsis = isChineseLanguage 
              ? (scene.synopsis || scene.description) 
              : (scene.synopsis_en || scene.description_en);
            
            // Get cover image URL using public API endpoint (prefer medium size for cards)
            // Use the public storyline cover API instead of direct file path
            const coverImageUrl = scene.cover_image?.medium_path 
              ? `${apiBaseUrl}/api/storylines/${scene.id}/cover/medium`
              : null;
            
            const dims = cardDimensions.get(scene.id) || { width: 0, height: 0 };
            
            // CONFIG: Stroke and Offset for perfect alignment
            const strokeWidth = 24; 
            const expansion = 12; // Visual expansion desired
            
            // Shadow compensation: Card has deep shadow
            const shadowOffset = 3; 
            
            // Perimeter for dash array
            const pathWidth = dims.width + (expansion * 2);
            const pathHeight = dims.height + (expansion * 2);
            const perimeter = 2 * (pathWidth + pathHeight); 
            
            const progress = isHovered ? hoverProgress : 0;
            const dashOffset = perimeter * (1 - progress);
            
            // Radius calculation
            // Outer radius (visual) = Inner Radius (12px) + Expansion (12px) = 24px
            const pathRadius = 12 + expansion; // 24px
            
            // Rect Position
            const rectX = 12; // Center horizontally in the expansion zone
            const rectY = 12 + shadowOffset; // Shift down to balance shadow

            // Check if scene is disabled (enabled is false or undefined defaults to true)
            const isDisabled = scene.enabled === false;
            
            // Handle mouse click for scene selection (dual input: mouse + gesture)
            const handleSceneClick = () => {
              if (isDisabled) return;
              console.log('Scene selected via click:', scene.id);
              if (onSceneSelect) {
                onSceneSelect(scene.id);
              }
            };
            
            return (
              <div
                key={scene.id}
                id={`scene-card-${scene.id}`}
                className={`scene-card ${isHovered && !isDisabled ? 'hovered' : ''} ${coverImageUrl ? 'has-cover' : ''} ${isDisabled ? 'disabled' : ''}`}
                style={{ animationDelay: `${index * 0.15}s` }}
                onClick={handleSceneClick}
                role="button"
                tabIndex={isDisabled ? -1 : 0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleSceneClick();
                  }
                }}
              >
                {/* New Background Layer */}
                <div className="scene-card-bg">
                  {coverImageUrl && (
                    <img 
                      src={coverImageUrl} 
                      alt={sceneName}
                      className="scene-card-cover"
                      onError={(e) => {
                        // Hide image on error, fall back to default background
                        (e.target as HTMLImageElement).style.display = 'none';
                      }}
                    />
                  )}
                </div>

                {/* SVG progress border - NOW BEHIND */}
                <svg className="scene-card-border" width="100%" height="100%">
                  <rect
                    x={rectX}
                    y={rectY}
                    width={Math.max(0, dims.width)}
                    height={Math.max(0, dims.height)}
                    rx={pathRadius}
                    ry={pathRadius}
                    fill="none"
                    strokeWidth={strokeWidth}
                    strokeDasharray={perimeter}
                    strokeDashoffset={dashOffset}
                    style={{
                      opacity: isHovered ? 1 : 0,
                      transition: 'opacity 0.2s ease-out',
                    }}
                  />
                </svg>
                
                {/* Content Layer */}
                <div className="scene-card-content">
                  {!coverImageUrl && <div className="scene-icon">{scene.icon}</div>}
                  <h2 className="scene-name">{sceneName}</h2>
                  <p className="scene-description">{sceneSynopsis}</p>
                  {scene.segment_count !== undefined && scene.segment_count > 0 && (
                    <p className="scene-segment-count">
                      {isChineseLanguage ? `${scene.segment_count} 个片段` : `${scene.segment_count} segments`}
                    </p>
                  )}
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
