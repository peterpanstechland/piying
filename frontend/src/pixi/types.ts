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
  /**
   * 初始姿势偏移量（弧度）
   * 记录素材默认姿势与"自然垂下"姿势之间的角度差
   * 例如：手臂素材是水平伸出的，则偏移量为 -Math.PI/2
   * 动画角度 = restPoseOffset + 动作角度
   */
  restPoseOffsets?: Record<string, number>
  /**
   * 角色默认朝向
   * 'left' = 角色面向左（如嫦娥），'right' = 角色面向右（如宇航员）
   * 影响动画旋转方向的计算
   */
  defaultFacing?: 'left' | 'right';
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
