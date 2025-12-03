/**
 * Canvas Recorder Service
 * Records a canvas element to a video blob using MediaRecorder API
 */

export interface CanvasRecorderOptions {
  frameRate?: number;
  videoBitsPerSecond?: number;
}

/**
 * CanvasRecorder - Records a canvas element to WebM video
 */
export class CanvasRecorder {
  private mediaRecorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private isRecording = false;
  private stream: MediaStream | null = null;

  /**
   * Start recording a canvas element
   * @param canvas - The canvas element to record
   * @param options - Recording options
   */
  startRecording(canvas: HTMLCanvasElement, options: CanvasRecorderOptions = {}): void {
    if (this.isRecording) {
      console.warn('CanvasRecorder: Already recording');
      return;
    }

    const { frameRate = 30, videoBitsPerSecond = 5000000 } = options;

    this.chunks = [];

    try {
      // Capture canvas stream
      this.stream = canvas.captureStream(frameRate);
      
      // Try WebM with VP9 (supports alpha), fallback to VP8
      const mimeTypes = [
        'video/webm;codecs=vp9',
        'video/webm;codecs=vp8',
        'video/webm',
        'video/mp4',
      ];

      let selectedMimeType = '';
      for (const mimeType of mimeTypes) {
        if (MediaRecorder.isTypeSupported(mimeType)) {
          selectedMimeType = mimeType;
          break;
        }
      }

      if (!selectedMimeType) {
        throw new Error('No supported video format found');
      }

      console.log(`CanvasRecorder: Using format ${selectedMimeType}`);

      this.mediaRecorder = new MediaRecorder(this.stream, {
        mimeType: selectedMimeType,
        videoBitsPerSecond,
      });

      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this.chunks.push(event.data);
        }
      };

      this.mediaRecorder.onerror = (event) => {
        console.error('CanvasRecorder: MediaRecorder error', event);
      };

      this.mediaRecorder.start(100); // Collect data every 100ms
      this.isRecording = true;

      console.log('CanvasRecorder: Recording started');
    } catch (error) {
      console.error('CanvasRecorder: Failed to start recording', error);
      throw error;
    }
  }

  /**
   * Stop recording and return the video blob
   * @returns Promise<Blob> - The recorded video as a Blob
   */
  stopRecording(): Promise<Blob> {
    return new Promise((resolve, reject) => {
      if (!this.mediaRecorder || !this.isRecording) {
        reject(new Error('Not recording'));
        return;
      }

      this.mediaRecorder.onstop = () => {
        const blob = new Blob(this.chunks, { type: this.mediaRecorder?.mimeType || 'video/webm' });
        
        console.log(`CanvasRecorder: Recording stopped, blob size: ${(blob.size / 1024 / 1024).toFixed(2)} MB`);
        
        // Cleanup
        this.cleanup();
        
        resolve(blob);
      };

      this.mediaRecorder.stop();
      this.isRecording = false;
    });
  }

  /**
   * Cancel recording without returning data
   */
  cancelRecording(): void {
    if (this.mediaRecorder && this.isRecording) {
      this.mediaRecorder.stop();
    }
    this.cleanup();
    console.log('CanvasRecorder: Recording cancelled');
  }

  /**
   * Check if currently recording
   */
  isRecordingActive(): boolean {
    return this.isRecording;
  }

  /**
   * Cleanup resources
   */
  private cleanup(): void {
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }
    this.mediaRecorder = null;
    this.chunks = [];
    this.isRecording = false;
  }
}

