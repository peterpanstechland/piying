import { useEffect, useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { PoseLandmark } from '../services/camera-detection';
import './SegmentGuidancePage.css';

interface SegmentGuidancePageProps {
  segmentIndex: number;
  totalSegments: number;
  videoElement?: HTMLVideoElement | null;
  currentPose?: PoseLandmark[] | null;
  onGuidanceComplete?: () => void;
}

/**
 * SegmentGuidancePage - Displays guidance for the current motion capture segment
 * Shows action description and example poses before recording begins
 * NOW: Includes a detection box that users must step into to start
 */
export const SegmentGuidancePage = ({
  segmentIndex,
  totalSegments,
  videoElement,
  currentPose,
  onGuidanceComplete,
}: SegmentGuidancePageProps) => {
  const { t } = useTranslation();
  const [isInBox, setIsInBox] = useState(false);
  const [isStableInBox, setIsStableInBox] = useState(false); // Debounced state
  const [countdown, setCountdown] = useState<number | null>(null);
  
  // Config: Detection Box Area (Normalized 0-1)
  const BOX_CONFIG = {
    x: 0.25, // Starts at 25% width
    y: 0.15, // Starts at 15% height
    width: 0.5, // 50% width
    height: 0.7, // 70% height
  };

  // Hysteresis buffer: make it easier to stay in than to get in
  const HYSTERESIS = 0.1; // 10% expansion when already active

  // Check if pose is inside the box
  useEffect(() => {
    if (!currentPose) {
      console.log('[SegmentGuidance] No pose data received');
      setIsInBox(false);
      return;
    }

    // Key landmarks to check: Nose (0), Shoulders (11, 12), Hips (23, 24)
    // We check if the center of the body is roughly within bounds
    const nose = currentPose[0];
    const leftShoulder = currentPose[11];
    const rightShoulder = currentPose[12];
    
    // Ensure landmarks are visible enough
    const isVisible = (p: PoseLandmark) => p.visibility > 0.6;

    console.log('[SegmentGuidance] Pose check:', {
      hasNose: !!nose,
      hasLeftShoulder: !!leftShoulder,
      hasRightShoulder: !!rightShoulder,
      noseVisibility: nose?.visibility,
      leftShoulderVisibility: leftShoulder?.visibility,
      rightShoulderVisibility: rightShoulder?.visibility,
    });

    if (nose && leftShoulder && rightShoulder && 
        isVisible(nose) && isVisible(leftShoulder) && isVisible(rightShoulder)) {
      
      // Calculate body center (approximate)
      const bodyX = (leftShoulder.x + rightShoulder.x) / 2;

      // Determine bounds based on current state (Hysteresis)
      // Note: We use isStableInBox here to prevent flickering borders
      const buffer = isStableInBox ? HYSTERESIS : 0;
      
      const minX = BOX_CONFIG.x - buffer;
      const maxX = BOX_CONFIG.x + BOX_CONFIG.width + buffer;
      const minY = BOX_CONFIG.y - buffer;
      const maxY = BOX_CONFIG.y + BOX_CONFIG.height + buffer;

      // Check if body center is within the box horizontal range
      // And nose is within vertical range (roughly)
      const inHorizontal = bodyX > minX && bodyX < maxX;
      const inVertical = nose.y > minY && nose.y < maxY;

      console.log('[SegmentGuidance] Position check:', {
        bodyX,
        noseY: nose.y,
        bounds: { minX, maxX, minY, maxY },
        inHorizontal,
        inVertical,
      });

      if (inHorizontal && inVertical) {
        setIsInBox(true);
      } else {
        setIsInBox(false);
      }
    } else {
      console.log('[SegmentGuidance] Landmarks not visible enough');
      setIsInBox(false);
    }
  }, [currentPose, isStableInBox]); 

  // Stabilize the isInBox state (Grace Period)
  // This prevents the countdown from resetting if detection flickers for < 500ms
  useEffect(() => {
    let timeout: number;
    if (isInBox) {
      setIsStableInBox(true);
    } else {
      // If user leaves, wait 500ms before accepting it
      timeout = window.setTimeout(() => {
        setIsStableInBox(false);
      }, 500);
    }
    return () => clearTimeout(timeout);
  }, [isInBox]);

  // Store callback in ref to avoid dependency issues
  const onGuidanceCompleteRef = useRef(onGuidanceComplete);
  onGuidanceCompleteRef.current = onGuidanceComplete;

  // Handle countdown logic based on STABLE state
  useEffect(() => {
    let timer: number;

    console.log('[SegmentGuidance] Countdown effect:', { isStableInBox, countdown });

    if (isStableInBox) {
      if (countdown === null) {
        console.log('[SegmentGuidance] Starting countdown from 3');
        setCountdown(3); // Start 3s countdown
      } else if (countdown > 0) {
        console.log('[SegmentGuidance] Countdown tick:', countdown);
        timer = window.setTimeout(() => setCountdown(countdown - 1), 1000);
      } else if (countdown === 0) {
        // Complete!
        console.log('[SegmentGuidance] Countdown complete, calling onGuidanceComplete');
        if (onGuidanceCompleteRef.current) {
          onGuidanceCompleteRef.current();
        }
      }
    } else {
      // Reset only when stable state is lost
      if (countdown !== null) {
        console.log('[SegmentGuidance] Resetting countdown (left box)');
      }
      setCountdown(null);
    }

    return () => clearTimeout(timer);
  }, [isStableInBox, countdown]); // Removed onGuidanceComplete from deps

  // Video ref to prevent repeated play() calls
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const videoInitializedRef = useRef(false);

  // Setup video only once
  useEffect(() => {
    if (videoRef.current && videoElement && !videoInitializedRef.current) {
      videoRef.current.srcObject = videoElement.srcObject;
      videoRef.current.play().catch((err) => {
        if (err.name !== 'AbortError') {
          console.error('Video play error:', err);
        }
      });
      videoInitializedRef.current = true;
    }
  }, [videoElement]);

  return (
    <div className="segment-guidance-page">
      {videoElement && (
        <video
          className="video-feed-background"
          ref={videoRef}
          autoPlay
          muted
          playsInline
        />
      )}

      <div className="guidance-overlay">
        <div className="guidance-header">
          <h1>{t('guidance.title')}</h1>
          <p className="segment-counter">
            {t('guidance.segment', { current: segmentIndex + 1, total: totalSegments })}
          </p>
        </div>

        {/* Detection Box Visualization */}
        {/* Use isStableInBox for visual feedback so it doesn't flicker */}
        <div 
          className={`detection-box ${isStableInBox ? 'active' : ''}`}
          style={{
            left: `${BOX_CONFIG.x * 100}%`,
            top: `${BOX_CONFIG.y * 100}%`,
            width: `${BOX_CONFIG.width * 100}%`,
            height: `${BOX_CONFIG.height * 100}%`,
          }}
        >
          {/* Corner Decors */}
          <div className="box-corner top-left" />
          <div className="box-corner top-right" />
          <div className="box-corner bottom-left" />
          <div className="box-corner bottom-right" />
          
          {/* Countdown or Prompt */}
          <div className="box-status">
            {isStableInBox ? (
              <div key={countdown} className="countdown-number">{countdown}</div>
            ) : (
              <div className="stand-here-prompt">请站在这里</div>
            )}
          </div>
        </div>

        <div className="guidance-content">
          {/* Only show text content, rely on box for positioning */}
          <h2 className="guidance-action">
            {t(`guidance.segment${segmentIndex + 1}.action`)}
          </h2>
          <p className="guidance-description">
            {t(`guidance.segment${segmentIndex + 1}.description`)}
          </p>
        </div>
      </div>
    </div>
  );
};
