/**
 * PixiJS Character Renderer Types
 */

export interface JointConfig {
  id: string
  name: string
  part: string
  position: { x: number; y: number }
  connectedTo?: string | null
}

export interface BoneConfig {
  from: string
  to: string
}

export interface SkeletonConfig {
  joints: JointConfig[]
  bones: BoneConfig[]
}

export interface BindingConfig {
  landmarks: number[]
  rotationLandmark: number | null
  scaleLandmarks: number[]
}

export interface CharacterConfig {
  id: string
  name: string
  spritesheet: string
  spritesheetImage: string
  skeleton: SkeletonConfig
  bindings: Record<string, BindingConfig>
  renderOrder: string[]
}

export interface FrameData {
  frame: { x: number; y: number; w: number; h: number }
  rotated: boolean
  trimmed: boolean
  spriteSourceSize: { x: number; y: number; w: number; h: number }
  sourceSize: { w: number; h: number }
  pivot?: { x: number; y: number }
  zIndex?: number
}

export interface SpritesheetData {
  frames: Record<string, FrameData>
  meta: {
    app: string
    version: string
    image: string
    format: string
    size: { w: number; h: number }
    scale: string
  }
}

// MediaPipe Pose Landmark
export interface PoseLandmark {
  x: number  // 0-1 normalized
  y: number  // 0-1 normalized
  z: number
  visibility?: number
}

export type PoseLandmarks = PoseLandmark[]
