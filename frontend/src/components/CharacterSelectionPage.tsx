import { useRef, useEffect, useState, useLayoutEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { GestureCursorController, SceneCard } from '../services/gesture-cursor';
import './CharacterSelectionPage.css';

export interface CharacterOption {
  id: string;
  name: string;
  thumbnail_path: string | null;
  is_default: boolean;
  display_order: number;
}

interface CharacterSelectionPageProps {
  characters: CharacterOption[];
  sceneName: string;
  videoElement?: HTMLVideoElement | null;
  handPosition?: { x: number; y: number } | null;
  onCharacterSelect?: (characterId: string) => void;
  onBack?: () => void;
  apiBaseUrl?: string;
}

/**
 * CharacterSelectionPage - Character selection interface with gesture cursor
 * Displays character cards with hover-to-select interaction
 * Requirements 7.1, 7.2
 */
export const CharacterSelectionPage = ({
  characters,
  sceneName,
  videoElement,
  handPosition,
  onCharacterSelect,
  onBack: _onBack,
  apiBaseUrl = '',
}: CharacterSelectionPageProps) => {
  const { i18n } = useTranslation();
  // Note: onBack is available for future use (e.g., back button)
  void _onBack;
  const videoCanvasRef = useRef<HTMLCanvasElement>(null);
  const cursorCanvasRef = useRef<HTMLCanvasElement>(null);
  const cursorControllerRef = useRef<GestureCursorController>(new GestureCursorController());
  const cardsContainerRef = useRef<HTMLDivElement>(null);
  
  const [hoveredCharacterId, setHoveredCharacterId] = useState<string | null>(null);
  const [hoverProgress, setHoverProgress] = useState<number>(0);
  const [cardDimensions, setCardDimensions] = useState<Map<string, { width: number; height: number }>>(new Map());

  const isChineseLanguage = i18n.language === 'zh' || i18n.language === 'zh-CN';

  // Sort characters by display_order, with default character first
  const sortedCharacters = [...characters].sort((a, b) => {
    if (a.is_default && !b.is_default) return -1;
    if (!a.is_default && b.is_default) return 1;
    return a.display_order - b.display_order;
  });


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
        const id = entry.target.id.replace('character-card-', '');
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
    
    sortedCharacters.forEach((character) => {
      const element = document.getElementById(`character-card-${character.id}`);
      if (element) observer.observe(element);
    });
    
    return () => observer.disconnect();
  }, [sortedCharacters]);

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
    let animationFrameId: number;

    const updateHover = () => {
      const characterCards: SceneCard[] = [];
      
      sortedCharacters.forEach((character) => {
        const element = document.getElementById(`character-card-${character.id}`);
        if (element) {
          const rect = element.getBoundingClientRect();
          characterCards.push({
            id: character.id,
            bounds: {
              x: rect.left,
              y: rect.top,
              width: rect.width,
              height: rect.height,
            },
          });
        }
      });

      if (characterCards.length === 0) {
        animationFrameId = requestAnimationFrame(updateHover);
        return;
      }
      
      const normalizedPos = controller.getCursorPosition();
      const screenPos = getScreenCoordinates(
        normalizedPos.x, 
        normalizedPos.y, 
        viewWidth, 
        viewHeight
      );
      
      controller.updateHoverStateWithScreenPos(
        characterCards,
        screenPos.x,
        screenPos.y,
        3000,
        (characterId) => {
          console.log('Character selected via hover:', characterId);
          if (onCharacterSelect) {
            onCharacterSelect(characterId);
          }
        }
      );

      setHoveredCharacterId(controller.getHoveredCardId());
      setHoverProgress(controller.getHoverProgress());

      animationFrameId = requestAnimationFrame(updateHover);
    };

    animationFrameId = requestAnimationFrame(updateHover);

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [sortedCharacters, onCharacterSelect, handPosition, getScreenCoordinates]);


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

  // Get thumbnail URL - use the public character thumbnail API endpoint
  const getThumbnailUrl = (characterId: string, _path: string | null): string | null => {
    // Always use the public API endpoint for character thumbnails
    // This ensures consistent access regardless of the stored path format
    return `${apiBaseUrl}/api/characters/${characterId}/thumbnail.png`;
  };


  return (
    <div className="character-selection-page">
      <canvas ref={videoCanvasRef} className="video-feed-layer" />
      
      <div className="character-selection-overlay">
        <div className="character-selection-header">
          <h1>{isChineseLanguage ? '选择角色' : 'Choose Character'}</h1>
          <p className="character-selection-scene">{sceneName}</p>
          <p className="character-selection-hint">
            {isChineseLanguage ? '将手悬停在角色上进行选择' : 'Hover over a character to select'}
          </p>
        </div>

        <div className="character-cards-container" ref={cardsContainerRef}>
          {sortedCharacters.map((character) => {
            const isHovered = hoveredCharacterId === character.id;
            const thumbnailUrl = getThumbnailUrl(character.id, character.thumbnail_path);
            
            const dims = cardDimensions.get(character.id) || { width: 0, height: 0 };
            
            // 进度条参数 - 与场景选择页面一致
            const strokeWidth = 24;
            const expansion = 12;
            const shadowOffset = 3;
            
            const pathWidth = dims.width + (expansion * 2);
            const pathHeight = dims.height + (expansion * 2);
            const perimeter = 2 * (pathWidth + pathHeight);
            
            const progress = isHovered ? hoverProgress : 0;
            const dashOffset = perimeter * (1 - progress);
            
            const pathRadius = 24 + expansion; // 圆角卡片
            
            const rectX = 12;
            const rectY = 12 + shadowOffset;

            return (
              <div
                key={character.id}
                id={`character-card-${character.id}`}
                className={`character-card ${isHovered ? 'hovered' : ''} ${character.is_default ? 'default' : ''}`}
              >
                <div className="character-card-bg">
                  {thumbnailUrl ? (
                    <img 
                      src={thumbnailUrl} 
                      alt={character.name}
                      className="character-thumbnail"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = 'none';
                      }}
                    />
                  ) : (
                    <div className="character-placeholder">
                      <span className="character-placeholder-icon">🎭</span>
                    </div>
                  )}
                </div>

                <svg className="character-card-border" width="100%" height="100%">
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
                
                <div className="character-card-content">
                  <h3 className="character-name">{character.name}</h3>
                  {character.is_default && (
                    <span className="character-default-badge">
                      {isChineseLanguage ? '推荐' : 'Recommended'}
                    </span>
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
