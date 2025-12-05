/**
 * LegProcessor - 腿部意图分析处理器
 * 
 * 功能：
 * - 检测腿部动作意图：站立、行走、高抬腿、后踢腿、跳跃
 * - 启发式规则判断
 * - 配合 CalibrationManager 使用参考姿态
 */

import {
  LegIntent,
  type LegConfig,
  type LegState,
  type SingleLegState,
  type PoseLandmarks,
  type CalibrationData,
} from './types'
import { DEFAULT_CONFIG, LANDMARK_INDEX } from './types'

export class LegProcessor {
  private config: LegConfig
  private state: LegState = this.createDefaultState()
  private isInFlyingState = false
  
  // Jump detection state
  private lastHipY: number = 0
  private hipVelocity: number = 0
  private baselineHipY: number | null = null
  private frameCount: number = 0

  constructor(config?: Partial<LegConfig>) {
    this.config = { ...DEFAULT_CONFIG.leg, ...config }
  }

  /**
   * 创建默认状态
   */
  private createDefaultState(): LegState {
    const defaultSingleLeg: SingleLegState = {
      intent: LegIntent.STANDING,
      kneeHeightDelta: 0,
      ankleHeightDelta: 0,
      thighLengthRatio: 1,
      isLifted: false,
    }

    return {
      left: { ...defaultSingleLeg },
      right: { ...defaultSingleLeg },
      overallIntent: LegIntent.STANDING,
      isFlying: false,
    }
  }

  /**
   * 更新配置
   */
  updateConfig(config: Partial<LegConfig>): void {
    this.config = { ...this.config, ...config }
  }

  /**
   * 获取当前配置
   */
  getConfig(): LegConfig {
    return { ...this.config }
  }

  /**
   * 获取当前状态
   */
  getState(): LegState {
    return JSON.parse(JSON.stringify(this.state))
  }

  /**
   * 重置状态
   */
  reset(): void {
    this.state = this.createDefaultState()
    this.isInFlyingState = false
    this.lastHipY = 0
    this.hipVelocity = 0
    this.baselineHipY = null
    this.frameCount = 0
  }

  /**
   * 处理姿态数据，分析腿部意图
   */
  process(landmarks: PoseLandmarks | null, calibration: CalibrationData | null): LegState {
    if (!landmarks || !calibration) {
      return this.state
    }

    this.frameCount++

    // Update jump metrics
    this.updateJumpMetrics(landmarks)

    // 分析左腿
    this.state.left = this.analyzeSingleLeg(
      landmarks,
      calibration,
      'left'
    )

    // 分析右腿
    this.state.right = this.analyzeSingleLeg(
      landmarks,
      calibration,
      'right'
    )

    // 综合判断整体意图
    this.state.overallIntent = this.determineOverallIntent()
    this.state.isFlying = this.isInFlyingState

    return this.state
  }

  /**
   * Update hip position and velocity for jump detection
   */
  private updateJumpMetrics(landmarks: PoseLandmarks): void {
    const leftHip = landmarks[LANDMARK_INDEX.LEFT_HIP]
    const rightHip = landmarks[LANDMARK_INDEX.RIGHT_HIP]

    if (!leftHip || !rightHip) return

    const currentHipY = (leftHip.y + rightHip.y) / 2

    // Initialize if first frame
    if (this.frameCount === 1 || this.baselineHipY === null) {
      this.lastHipY = currentHipY
      this.baselineHipY = currentHipY
      return
    }

    // Calculate velocity (negative is up)
    this.hipVelocity = currentHipY - this.lastHipY
    this.lastHipY = currentHipY

    // Update baseline if standing and stable
    // Only update baseline if we are NOT flying/jumping to avoid dragging baseline up with jump
    if (!this.isInFlyingState && Math.abs(this.hipVelocity) < 0.01) {
      // Slow lerp to adapt to position changes
      this.baselineHipY = this.baselineHipY * 0.95 + currentHipY * 0.05
    }
  }

  /**
   * 分析单腿状态
   */
  private analyzeSingleLeg(
    landmarks: PoseLandmarks,
    calibration: CalibrationData,
    side: 'left' | 'right'
  ): SingleLegState {
    const hipIdx = side === 'left' ? LANDMARK_INDEX.LEFT_HIP : LANDMARK_INDEX.RIGHT_HIP
    const kneeIdx = side === 'left' ? LANDMARK_INDEX.LEFT_KNEE : LANDMARK_INDEX.RIGHT_KNEE
    const ankleIdx = side === 'left' ? LANDMARK_INDEX.LEFT_ANKLE : LANDMARK_INDEX.RIGHT_ANKLE

    const hip = landmarks[hipIdx]
    const knee = landmarks[kneeIdx]
    const ankle = landmarks[ankleIdx]

    const refHip = calibration.referencePose[hipIdx]
    const refKnee = calibration.referencePose[kneeIdx]
    const refAnkle = calibration.referencePose[ankleIdx]

    // 检查关键点有效性
    if (!hip || !knee || !ankle || !refHip || !refKnee || !refAnkle) {
      return this.state[side]
    }

    const minVis = Math.min(
      hip.visibility ?? 0,
      knee.visibility ?? 0,
      ankle.visibility ?? 0
    )

    if (minVis < 0.3) {
      return this.state[side]
    }

    // 计算膝盖高度变化（Y 轴向下为正，所以上升是负值变小）
    // 使用归一化坐标，参考髋部位置作为基准
    const kneeHeightDelta = (refKnee.y - refHip.y) - (knee.y - hip.y)

    // 计算脚踝高度变化
    const ankleHeightDelta = (refAnkle.y - refHip.y) - (ankle.y - hip.y)

    // 计算大腿投影长度比率
    // 正视时大腿应该很长，侧踢时缩短
    const currentThighLength = this.distance(hip, knee)
    const refThighLength = this.distance(refHip, refKnee)
    const thighLengthRatio = refThighLength > 0 ? currentThighLength / refThighLength : 1

    // 判断是否抬起
    const isLifted = ankleHeightDelta > this.config.liftThreshold

    // 判断意图
    const intent = this.determineLegIntent(
      kneeHeightDelta,
      ankleHeightDelta,
      thighLengthRatio,
      isLifted
    )

    return {
      intent,
      kneeHeightDelta,
      ankleHeightDelta,
      thighLengthRatio,
      isLifted,
    }
  }

  /**
   * 判断单腿动作意图
   */
  private determineLegIntent(
    kneeHeightDelta: number,
    ankleHeightDelta: number,
    thighLengthRatio: number,
    isLifted: boolean
  ): LegIntent {
    // 高抬腿：膝盖显著上升 + 大腿投影长度显著缩短
    if (
      kneeHeightDelta > this.config.kneeRiseThreshold &&
      thighLengthRatio < this.config.thighRatioThreshold
    ) {
      return LegIntent.HIGH_KICK
    }

    // 后踢腿：膝盖高度基本不变 + 脚踝显著上升
    if (
      Math.abs(kneeHeightDelta) < this.config.kneeRiseThreshold &&
      ankleHeightDelta > this.config.ankleRiseThreshold
    ) {
      return LegIntent.BACK_KICK
    }

    // 行走：轻微抬起
    if (isLifted && ankleHeightDelta < this.config.ankleRiseThreshold) {
      return LegIntent.WALKING
    }

    // 默认站立
    return LegIntent.STANDING
  }

  /**
   * 综合判断整体意图
   */
  private determineOverallIntent(): LegIntent {
    const { left, right } = this.state
    const { jumpThreshold, squatThreshold, jumpVelocityThreshold, jumpHeightThreshold } = this.config

    // 1. 基于速度和高度的跳跃检测 (Whole Body Jump)
    // Y轴向下为正，所以向上跳跃时 velocity 为负，height (current) < baseline
    const isMovingUpFast = this.hipVelocity < -jumpVelocityThreshold
    const isHighEnough = this.baselineHipY !== null && (this.baselineHipY - this.lastHipY) > jumpHeightThreshold
    
    // 如果检测到明显的向上冲量或高度，触发跳跃
    if (isMovingUpFast && isHighEnough) {
       this.isInFlyingState = true
       return LegIntent.JUMPING
    }

    // 2. 基于双脚抬起的跳跃检测 (Leg Tuck Jump)
    // 跳跃检测：双脚同时抬起
    if (
      left.ankleHeightDelta > jumpThreshold &&
      right.ankleHeightDelta > jumpThreshold
    ) {
      this.isInFlyingState = true
      return LegIntent.JUMPING
    }

    // 3. 落地检测 / 下蹲检测
    // 如果在飞行状态
    if (this.isInFlyingState) {
      // 退出条件 1: 双脚放下 (ankleHeightDelta 变小) 且 髋部回落 (接近 baseline)
      const legsDown = left.ankleHeightDelta < jumpThreshold && right.ankleHeightDelta < jumpThreshold
      const hipsDown = this.baselineHipY !== null && (this.baselineHipY - this.lastHipY) < (jumpHeightThreshold * 0.5)
      
      if (legsDown && hipsDown) {
        this.isInFlyingState = false
      }
      
      // 退出条件 2: 下蹲 (ankleHeightDelta 为负值，表示髋部比脚踝更低/接近)
      // 下蹲检测：髋部下降（用于退出飞行状态）
      if (
        left.ankleHeightDelta < squatThreshold &&
        right.ankleHeightDelta < squatThreshold
      ) {
        this.isInFlyingState = false
      }
    }

    // 如果在飞行状态，保持
    if (this.isInFlyingState) {
      return LegIntent.JUMPING
    }


    // 检测是否有高抬腿或后踢腿
    if (left.intent === LegIntent.HIGH_KICK || right.intent === LegIntent.HIGH_KICK) {
      return LegIntent.HIGH_KICK
    }

    if (left.intent === LegIntent.BACK_KICK || right.intent === LegIntent.BACK_KICK) {
      return LegIntent.BACK_KICK
    }

    // 行走检测：一腿抬起，另一腿站立
    if (
      (left.intent === LegIntent.WALKING && right.intent === LegIntent.STANDING) ||
      (left.intent === LegIntent.STANDING && right.intent === LegIntent.WALKING)
    ) {
      return LegIntent.WALKING
    }

    // 默认站立
    return LegIntent.STANDING
  }

  /**
   * 计算两点距离
   */
  private distance(a: { x: number; y: number }, b: { x: number; y: number }): number {
    const dx = a.x - b.x
    const dy = a.y - b.y
    return Math.sqrt(dx * dx + dy * dy)
  }

  /**
   * 获取调试信息
   */
  getDebugInfo(): {
    leftLeg: SingleLegState
    rightLeg: SingleLegState
    overallIntent: string
    isFlying: boolean
    thresholds: LegConfig
  } {
    return {
      leftLeg: this.state.left,
      rightLeg: this.state.right,
      overallIntent: this.state.overallIntent,
      isFlying: this.state.isFlying,
      thresholds: this.config,
    }
  }

  /**
   * 检查是否可以使用 FK（前向运动学）
   * 当腿部动作简单（站立/行走）时使用 FK，复杂动作使用 IK
   */
  shouldUseFK(): boolean {
    const intent = this.state.overallIntent
    return intent === LegIntent.STANDING || intent === LegIntent.WALKING
  }
}





