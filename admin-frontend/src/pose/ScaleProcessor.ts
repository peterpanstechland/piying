/**
 * ScaleProcessor - 缩放处理器
 * 
 * 功能：
 * - 使用躯干高度（肩到髋距离）而非肩宽作为缩放基准
 * - 缩放值 Lerp 平滑，避免忽大忽小
 * - 配合 CalibrationManager 使用
 */

import type {
  ScaleConfig,
  ScaleState,
  PoseLandmarks,
  CalibrationData,
} from './types'
import { DEFAULT_CONFIG, LANDMARK_INDEX } from './types'

export class ScaleProcessor {
  private config: ScaleConfig
  private state: ScaleState = {
    currentScale: 1,
    currentTorsoHeight: 0,
    referenceTorsoHeight: 0,
  }

  constructor(config?: Partial<ScaleConfig>) {
    this.config = { ...DEFAULT_CONFIG.scale, ...config }
  }

  /**
   * 更新配置
   */
  updateConfig(config: Partial<ScaleConfig>): void {
    this.config = { ...this.config, ...config }
  }

  /**
   * 获取当前配置
   */
  getConfig(): ScaleConfig {
    return { ...this.config }
  }

  /**
   * 获取当前状态
   */
  getState(): ScaleState {
    return { ...this.state }
  }

  /**
   * 获取当前缩放值
   */
  getScale(): number {
    return this.state.currentScale
  }

  /**
   * 重置状态
   */
  reset(): void {
    this.state = {
      currentScale: 1,
      currentTorsoHeight: 0,
      referenceTorsoHeight: 0,
    }
  }

  /**
   * 设置参考躯干高度（从校准数据）
   */
  setReferenceFromCalibration(calibration: CalibrationData): void {
    this.state.referenceTorsoHeight = calibration.baseTorsoLength
  }

  /**
   * 处理姿态数据，计算缩放
   */
  process(landmarks: PoseLandmarks | null, calibration: CalibrationData | null): number {
    // 如果没有校准数据，返回默认缩放
    if (!calibration || !landmarks) {
      return this.state.currentScale
    }

    // 确保参考高度已设置
    if (this.state.referenceTorsoHeight === 0) {
      this.state.referenceTorsoHeight = calibration.baseTorsoLength
    }

    // 计算当前躯干高度
    const currentHeight = this.computeTorsoHeight(landmarks)
    if (currentHeight === null) {
      return this.state.currentScale
    }

    this.state.currentTorsoHeight = currentHeight

    // 计算目标缩放
    const targetScale = currentHeight / this.state.referenceTorsoHeight

    // 钳制缩放范围
    const clampedScale = Math.max(
      this.config.minScale,
      Math.min(this.config.maxScale, targetScale)
    )

    // 平滑缩放变化
    this.state.currentScale = this.lerp(
      this.state.currentScale,
      clampedScale,
      this.config.smoothFactor
    )

    return this.state.currentScale
  }

  /**
   * 计算躯干高度（肩膀中点到髋部中点的距离）
   */
  private computeTorsoHeight(landmarks: PoseLandmarks): number | null {
    const leftShoulder = landmarks[LANDMARK_INDEX.LEFT_SHOULDER]
    const rightShoulder = landmarks[LANDMARK_INDEX.RIGHT_SHOULDER]
    const leftHip = landmarks[LANDMARK_INDEX.LEFT_HIP]
    const rightHip = landmarks[LANDMARK_INDEX.RIGHT_HIP]

    // 检查关键点有效性
    if (!leftShoulder || !rightShoulder || !leftHip || !rightHip) {
      return null
    }

    const minVis = Math.min(
      leftShoulder.visibility ?? 0,
      rightShoulder.visibility ?? 0,
      leftHip.visibility ?? 0,
      rightHip.visibility ?? 0
    )

    if (minVis < 0.3) {
      return null
    }

    // 计算中点
    const shoulderCenterX = (leftShoulder.x + rightShoulder.x) / 2
    const shoulderCenterY = (leftShoulder.y + rightShoulder.y) / 2
    const hipCenterX = (leftHip.x + rightHip.x) / 2
    const hipCenterY = (leftHip.y + rightHip.y) / 2

    // 计算距离
    const dx = shoulderCenterX - hipCenterX
    const dy = shoulderCenterY - hipCenterY
    return Math.sqrt(dx * dx + dy * dy)
  }

  /**
   * 线性插值
   */
  private lerp(a: number, b: number, t: number): number {
    return a + (b - a) * t
  }

  /**
   * 获取调试信息
   */
  getDebugInfo(): {
    currentScale: number
    currentTorsoHeight: number
    referenceTorsoHeight: number
    scaleRange: [number, number]
  } {
    return {
      currentScale: this.state.currentScale,
      currentTorsoHeight: this.state.currentTorsoHeight,
      referenceTorsoHeight: this.state.referenceTorsoHeight,
      scaleRange: [this.config.minScale, this.config.maxScale],
    }
  }
}




