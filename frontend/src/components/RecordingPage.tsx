import { useEffect, useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { MotionCaptureRecorder, PoseLandmark } from '../services/motion-capture';
import './RecordingPage.css';

interface RecordingPageProps {
  segmentIndex: number;
  segmentDuration: number; // seconds
  videoElement?: HTMLVideoElement | null;
  recorder: MotionCaptureRecorder;
  onRecordingComplete?: () => void;
  onPoseDetected?: (landmarks: PoseLandmark[]) => void;
}

/**
 * RecordingPage - Displays recording interface with progress indicator
 * Captures pose data during recording and auto-stops when duration is reached
 */
export const RecordingPage = ({
  segmentIndex,
  segmentDuration,
  videoElement,
  recorder,
  onRecordingComplete,
  onPoseDetected,
}: RecordingPageProps) => {
  const { t } = useTranslation();
  const [elapsedTime, setElapsedTime] = useState(0);
  const [isRecording, setIsRecording] = useState(false);
  const recordingStartedRef = useRef(false);

  // Start recording when component mounts
  useEffect(() => {
    if (!recordingStartedRef.current) {
      recordingStartedRef.current = true;
      
      try {
        recorder.startRecording(segmentIndex, segmentDuration, (elapsed, total) => {
          setElapsedTime(elapsed);
        });
        setIsRecording(true);
        console.log(`Started recording segment ${segmentIndex} for ${segmentDuration}s`);
      } catch (error) {
        console.error('Failed to start recording:', error);
      }
    }

    return () => {
      // Cleanup: stop recording if still active
      if (recorder.isRecordingActive()) {
        recorder.cancelRecording();
      }
    };
  }, [recorder, segmentIndex, segmentDuration]);

  // Monitor elapsed time and auto-stop when duration is reached
  useEffect(() => {
    if (isRecording && elapsedTime >= segmentDuration) {
      setIsRecording(false);
      
      // Stop recording and trigger completion
      if (onRecordingComplete) {
        setTimeout(() => {
          onRecordingComplete();
        }, 500); // Small delay for smooth transition
      }
    }
  }, [elapsedTime, segmentDuration, isRecording, onRecordingComplete]);

  // Listen for pose detection events from parent
  useEffect(() => {
    if (onPoseDetected && isRecording) {
      // This will be called by the parent component when pose is detected
      // The parent should call recorder.addFrame() with the landmarks
    }
  }, [onPoseDetected, isRecording]);

  const progress = Math.min(elapsedTime / segmentDuration, 1);
  const remainingTime = Math.max(segmentDuration - elapsedTime, 0);

  return (
    <div className="recording-page">
      {videoElement && (
        <video
          className="video-feed-background"
          ref={(el) => {
            if (el && videoElement) {
              el.srcObject = videoElement.srcObject;
              el.play();
            }
          }}
          autoPlay
          muted
          playsInline
        />
      )}

      <div className="recording-overlay">
        <div className="recording-header">
          <div className="recording-indicator">
            <div className="recording-dot" />
            <span className="recording-label">{t('recording.recording')}</span>
          </div>
        </div>

        <div className="recording-content">
          <div className="recording-timer">
            <div className="timer-display">
              {remainingTime.toFixed(1)}s
            </div>
            <p className="timer-label">{t('recording.remaining')}</p>
          </div>

          <div className="recording-progress-container">
            <div className="recording-progress-ring">
              <svg width="400" height="400" viewBox="0 0 400 400">
                <circle
                  cx="200"
                  cy="200"
                  r="180"
                  fill="none"
                  stroke="rgba(255, 255, 255, 0.2)"
                  strokeWidth="12"
                />
                <circle
                  cx="200"
                  cy="200"
                  r="180"
                  fill="none"
                  stroke="#ff4444"
                  strokeWidth="12"
                  strokeLinecap="round"
                  strokeDasharray={`${2 * Math.PI * 180}`}
                  strokeDashoffset={`${2 * Math.PI * 180 * (1 - progress)}`}
                  transform="rotate(-90 200 200)"
                  style={{
                    transition: 'stroke-dashoffset 0.1s linear',
                  }}
                />
              </svg>
            </div>
          </div>
        </div>

        <div className="recording-footer">
          <p className="recording-hint">{t('recording.hint')}</p>
        </div>
      </div>
    </div>
  );
};
