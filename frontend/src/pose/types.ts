/**
 * Motion Capture Pipeline Types
 * 皮影动捕控制系统类型定义
 */

// Re-export from pixi types for convenience
export type { PoseLandmark, PoseLandmarks } from '../pixi/types'
import type { PoseLandmarks } from '../pixi/types'

// ============================================================================
// Common Types
// ============================================================================

/** 角色朝向 */
export type Facing = 'left' | 'right'

/** 2D 向量 */
export interface Vector2 {
  x: number
  y: number
}

/** 角度数据（弧度） */
export interface PartAngles {
  [partName: string]: number
}

// ============================================================================
// Calibration Types
// ============================================================================

/** 校准数据 */
export interface CalibrationData {
  /** 参考躯干长度（肩到髋的距离，归一化坐标） */
  baseTorsoLength: number
  /** 参考肩宽（左肩到右肩的距离，归一化坐标） */
  baseShoulderWidth: number
  /** 参考大腿长度 */
  baseThighLength: number
  /** 参考小腿长度 */
  baseShinLength: number
  /** 参考姿态（T-Pose） */
  referencePose: PoseLandmarks
  /** 校准时间戳 */
  timestamp: number
}

/** 校准配置 */
export interface CalibrationConfig {
  /** 自动校准所需的连续检测帧数 */
  autoCalibrationFrames: number
  /** 校准时的稳定性阈值（关节移动小于此值才算稳定） */
  stabilityThreshold: number
}

// ============================================================================
// Filter Types
// ============================================================================

/** 滤波器配置 */
export interface FilterConfig {
  /** 低通滤波系数 (0.1-0.3)，越低越平滑但延迟越大 */
  smoothFactor: number
  /** 置信度阈值 (0-1)，低于此值的关节数据会被忽略 */
  visibilityThreshold: number
  /** 丢失后保持上一帧状态的帧数 */
  holdFrames: number
  /** 动态平滑的速度阈值，超过此速度会降低平滑系数 */
  velocityThreshold: number
  /** 快速移动时的最小平滑系数 */
  minSmoothFactor: number
}

/** 单个关节的滤波状态 */
export interface LandmarkFilterState {
  /** 上一帧的位置 */
  lastPosition: Vector2
  /** 上一帧的 z 值 */
  lastZ: number
  /** 丢失计数 */
  lostFrames: number
  /** 速度估计（用于动态平滑） */
  velocity: number
}

// ============================================================================
// Turn State Machine Types
// ============================================================================

/** 转身配置 */
export interface TurnConfig {
  /** 死区范围 [-deadzone, +deadzone] */
  deadzone: number
  /** 深度检测来源 */
  depthSource: 'shoulder' | 'head'
  /** 转身动画时长（毫秒） */
  animationDuration: number
}

/** 转身状态 */
export interface TurnState {
  /** 当前朝向 */
  currentFacing: Facing
  /** 当前深度差值 */
  currentDepthDiff: number
  /** 是否在死区内 */
  inDeadzone: boolean
  /** 是否正在转身动画中 */
  isTurning: boolean
}

// ============================================================================
// Scale Processor Types
// ============================================================================

/** 缩放配置 */
export interface ScaleConfig {
  /** 缩放值平滑系数 */
  smoothFactor: number
  /** 最小缩放 */
  minScale: number
  /** 最大缩放 */
  maxScale: number
}

/** 缩放状态 */
export interface ScaleState {
  /** 当前缩放值 */
  currentScale: number
  /** 当前躯干高度 */
  currentTorsoHeight: number
  /** 参考躯干高度 */
  referenceTorsoHeight: number
}

// ============================================================================
// Leg Processor Types
// ============================================================================

/** 腿部动作意图 */
export enum LegIntent {
  /** 站立 */
  STANDING = 'STANDING',
  /** 行走 */
  WALKING = 'WALKING',
  /** 高抬腿 */
  HIGH_KICK = 'HIGH_KICK',
  /** 后踢腿 */
  BACK_KICK = 'BACK_KICK',
  /** 跳跃/飞行 */
  JUMPING = 'JUMPING',
}

/** 单腿状态 */
export interface SingleLegState {
  /** 意图 */
  intent: LegIntent
  /** 膝盖高度变化（相对于参考姿态） */
  kneeHeightDelta: number
  /** 脚踝高度变化 */
  ankleHeightDelta: number
  /** 大腿投影长度比率 */
  thighLengthRatio: number
  /** 是否抬起 */
  isLifted: boolean
}

/** 腿部处理配置 */
export interface LegConfig {
  /** 膝盖上升阈值（触发高抬腿） */
  kneeRiseThreshold: number
  /** 大腿缩短比率阈值（触发高抬腿） */
  thighRatioThreshold: number
  /** 脚踝上升阈值（触发后踢腿） */
  ankleRiseThreshold: number
  /** 单脚抬起阈值（触发行走） */
  liftThreshold: number
  /** 跳跃阈值（双脚同时抬起） */
  jumpThreshold: number
  /** 下蹲阈值（髋部下降，用于退出飞行状态） */
  squatThreshold: number
  /** 跳跃速度阈值（髋部上升速度，负值） */
  jumpVelocityThreshold: number
  /** 跳跃高度阈值（髋部相对静止状态上升的距离） */
  jumpHeightThreshold: number
}

/** 腿部状态 */
export interface LegState {
  /** 左腿状态 */
  left: SingleLegState
  /** 右腿状态 */
  right: SingleLegState
  /** 整体意图（综合左右腿） */
  overallIntent: LegIntent
  /** 是否在飞行状态 */
  isFlying: boolean
}

// ============================================================================
// IK Solver Types
// ============================================================================

/** IK 配置 */
export interface IKConfig {
  /** 是否启用 IK */
  enabled: boolean
  /** 地面高度（0=顶部，1=底部） */
  groundY: number
  /** 安全边距（防止 NaN） */
  epsilon: number
  /** 大腿长度（如果不使用校准值） */
  thighLength?: number
  /** 小腿长度（如果不使用校准值） */
  shinLength?: number
}

/** IK 解算结果 */
export interface IKResult {
  /** 大腿角度（弧度） */
  thighAngle: number
  /** 膝盖角度（弧度） */
  kneeAngle: number
  /** 髋部到脚底的距离 */
  distance: number
  /** 是否有效（没有 NaN） */
  valid: boolean
}

/** IK 状态 */
export interface IKState {
  /** 左腿 IK 结果 */
  left: IKResult
  /** 右腿 IK 结果 */
  right: IKResult
}

// ============================================================================
// Secondary Motion Types
// ============================================================================

/** 物理惯性配置 */
export interface SecondaryMotionConfig {
  /** 是否启用 */
  enabled: boolean
  /** 跟随系数（越低惯性效果越明显） */
  followFactor: number
  /** 阻尼系数（控制摆动衰减） */
  damping: number
  /** 需要惯性效果的部件列表 */
  parts: string[]
}

/** 单个部件的惯性状态 */
export interface SecondaryPartState {
  /** 当前角度 */
  currentAngle: number
  /** 角速度 */
  angularVelocity: number
}

/** 惯性状态 */
export interface SecondaryMotionState {
  /** 各部件状态 */
  parts: Record<string, SecondaryPartState>
}

// ============================================================================
// Pipeline Types
// ============================================================================

/** 管线处理结果 */
export interface ProcessedPose {
  /** 原始姿态数据 */
  rawLandmarks: PoseLandmarks | null
  /** 滤波后的姿态数据 */
  filteredLandmarks: PoseLandmarks | null
  /** 各部件角度 */
  partAngles: PartAngles
  /** 转身状态 */
  turnState: TurnState
  /** 缩放状态 */
  scaleState: ScaleState
  /** 腿部状态 */
  legState: LegState
  /** IK 状态 */
  ikState: IKState
  /** 校准数据 */
  calibration: CalibrationData | null
  /** 是否已校准 */
  isCalibrated: boolean
  /** 帧计数 */
  frameCount: number
  /** 处理时间（毫秒） */
  processingTime: number
}

/** 完整的处理器配置 */
export interface ProcessorConfig {
  /** 校准配置 */
  calibration: CalibrationConfig
  /** 滤波配置 */
  filter: FilterConfig
  /** 转身配置 */
  turn: TurnConfig
  /** 缩放配置 */
  scale: ScaleConfig
  /** 腿部配置 */
  leg: LegConfig
  /** IK 配置 */
  ik: IKConfig
  /** 惯性配置 */
  secondary: SecondaryMotionConfig
}

/** 默认配置 */
export const DEFAULT_CONFIG: ProcessorConfig = {
  calibration: {
    autoCalibrationFrames: 30,
    stabilityThreshold: 0.02,
  },
  filter: {
    smoothFactor: 0.15,
    visibilityThreshold: 0.5,
    holdFrames: 5,
    velocityThreshold: 0.05,
    minSmoothFactor: 0.3,
  },
  turn: {
    deadzone: 0.15,
    depthSource: 'shoulder',
    animationDuration: 300,
  },
  scale: {
    smoothFactor: 0.1,
    minScale: 0.5,
    maxScale: 2.0,
  },
  leg: {
    kneeRiseThreshold: 0.08,
    thighRatioThreshold: 0.7,
    ankleRiseThreshold: 0.1,
    liftThreshold: 0.05,
    jumpThreshold: 0.08,
    squatThreshold: -0.05,
    jumpVelocityThreshold: 0.02,
    jumpHeightThreshold: 0.05,
  },
  ik: {
    enabled: true,
    groundY: 0.9,
    epsilon: 0.01,
  },
  secondary: {
    enabled: false,
    followFactor: 0.05,
    damping: 0.9,
    parts: [],
  },
}

// ============================================================================
// MediaPipe Landmark Indices
// ============================================================================

/** MediaPipe Pose 关键点索引 */
export const LANDMARK_INDEX = {
  NOSE: 0,
  LEFT_EYE_INNER: 1,
  LEFT_EYE: 2,
  LEFT_EYE_OUTER: 3,
  RIGHT_EYE_INNER: 4,
  RIGHT_EYE: 5,
  RIGHT_EYE_OUTER: 6,
  LEFT_EAR: 7,
  RIGHT_EAR: 8,
  MOUTH_LEFT: 9,
  MOUTH_RIGHT: 10,
  LEFT_SHOULDER: 11,
  RIGHT_SHOULDER: 12,
  LEFT_ELBOW: 13,
  RIGHT_ELBOW: 14,
  LEFT_WRIST: 15,
  RIGHT_WRIST: 16,
  LEFT_PINKY: 17,
  RIGHT_PINKY: 18,
  LEFT_INDEX: 19,
  RIGHT_INDEX: 20,
  LEFT_THUMB: 21,
  RIGHT_THUMB: 22,
  LEFT_HIP: 23,
  RIGHT_HIP: 24,
  LEFT_KNEE: 25,
  RIGHT_KNEE: 26,
  LEFT_ANKLE: 27,
  RIGHT_ANKLE: 28,
  LEFT_HEEL: 29,
  RIGHT_HEEL: 30,
  LEFT_FOOT_INDEX: 31,
  RIGHT_FOOT_INDEX: 32,
} as const

/** 用于身体分析的关键点组 */
export const BODY_LANDMARKS = {
  /** 上身关键点 */
  UPPER_BODY: [
    LANDMARK_INDEX.LEFT_SHOULDER,
    LANDMARK_INDEX.RIGHT_SHOULDER,
    LANDMARK_INDEX.LEFT_ELBOW,
    LANDMARK_INDEX.RIGHT_ELBOW,
    LANDMARK_INDEX.LEFT_WRIST,
    LANDMARK_INDEX.RIGHT_WRIST,
  ],
  /** 下身关键点 */
  LOWER_BODY: [
    LANDMARK_INDEX.LEFT_HIP,
    LANDMARK_INDEX.RIGHT_HIP,
    LANDMARK_INDEX.LEFT_KNEE,
    LANDMARK_INDEX.RIGHT_KNEE,
    LANDMARK_INDEX.LEFT_ANKLE,
    LANDMARK_INDEX.RIGHT_ANKLE,
  ],
  /** 躯干关键点 */
  TORSO: [
    LANDMARK_INDEX.LEFT_SHOULDER,
    LANDMARK_INDEX.RIGHT_SHOULDER,
    LANDMARK_INDEX.LEFT_HIP,
    LANDMARK_INDEX.RIGHT_HIP,
  ],
} as const






