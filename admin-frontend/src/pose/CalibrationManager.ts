/**
 * CalibrationManager - T-Pose 校准管理器
 * 
 * 功能：
 * - T-Pose 校准时记录身体比例
 * - 记录 baseTorsoLength, baseShoulderWidth 等
 * - 后续使用比率计算而非绝对像素值
 * - 解决儿童/成人身高差异问题
 */

import type {
  CalibrationData,
  CalibrationConfig,
  PoseLandmarks,
  Vector2,
} from './types'
import { LANDMARK_INDEX, DEFAULT_CONFIG } from './types'

export class CalibrationManager {
  private config: CalibrationConfig
  private calibrationData: CalibrationData | null = null
  private consecutiveFrames = 0
  private lastPosePositions: Vector2[] | null = null

  constructor(config?: Partial<CalibrationConfig>) {
    this.config = { ...DEFAULT_CONFIG.calibration, ...config }
  }

  /**
   * 更新配置
   */
  updateConfig(config: Partial<CalibrationConfig>): void {
    this.config = { ...this.config, ...config }
  }

  /**
   * 获取当前配置
   */
  getConfig(): CalibrationConfig {
    return { ...this.config }
  }

  /**
   * 检查是否已校准
   */
  isCalibrated(): boolean {
    return this.calibrationData !== null
  }

  /**
   * 获取校准数据
   */
  getCalibrationData(): CalibrationData | null {
    return this.calibrationData
  }

  /**
   * 手动设置校准数据（从外部加载）
   */
  setCalibrationData(data: CalibrationData): void {
    this.calibrationData = data
  }

  /**
   * 清除校准数据
   */
  clearCalibration(): void {
    this.calibrationData = null
    this.consecutiveFrames = 0
    this.lastPosePositions = null
  }

  /**
   * 从姿态数据进行手动校准
   */
  calibrate(landmarks: PoseLandmarks): CalibrationData | null {
    if (!this.validateLandmarks(landmarks)) {
      return null
    }

    const data = this.computeCalibrationData(landmarks)
    this.calibrationData = data
    return data
  }

  /**
   * 自动校准 - 检测稳定姿态并自动校准
   * 返回当前连续稳定帧数
   */
  autoCalibrate(landmarks: PoseLandmarks): {
    progress: number
    calibrated: boolean
    data: CalibrationData | null
  } {
    // 如果已校准，直接返回
    if (this.calibrationData) {
      return {
        progress: this.config.autoCalibrationFrames,
        calibrated: true,
        data: this.calibrationData,
      }
    }

    // 验证关键点
    if (!this.validateLandmarks(landmarks)) {
      this.consecutiveFrames = 0
      this.lastPosePositions = null
      return { progress: 0, calibrated: false, data: null }
    }

    // 提取当前位置
    const currentPositions = this.extractKeyPositions(landmarks)

    // 检查稳定性
    if (this.lastPosePositions) {
      const isStable = this.checkStability(currentPositions, this.lastPosePositions)
      if (isStable) {
        this.consecutiveFrames++
      } else {
        this.consecutiveFrames = 0
      }
    } else {
      this.consecutiveFrames = 1
    }

    this.lastPosePositions = currentPositions

    // 达到阈值则校准
    if (this.consecutiveFrames >= this.config.autoCalibrationFrames) {
      this.calibrationData = this.computeCalibrationData(landmarks)
      return {
        progress: this.config.autoCalibrationFrames,
        calibrated: true,
        data: this.calibrationData,
      }
    }

    return {
      progress: this.consecutiveFrames,
      calibrated: false,
      data: null,
    }
  }

  /**
   * 验证关键点是否有效
   */
  private validateLandmarks(landmarks: PoseLandmarks): boolean {
    const requiredIndices = [
      LANDMARK_INDEX.LEFT_SHOULDER,
      LANDMARK_INDEX.RIGHT_SHOULDER,
      LANDMARK_INDEX.LEFT_HIP,
      LANDMARK_INDEX.RIGHT_HIP,
      LANDMARK_INDEX.LEFT_KNEE,
      LANDMARK_INDEX.RIGHT_KNEE,
      LANDMARK_INDEX.LEFT_ANKLE,
      LANDMARK_INDEX.RIGHT_ANKLE,
    ]

    for (const idx of requiredIndices) {
      const lm = landmarks[idx]
      if (!lm || (lm.visibility ?? 0) < 0.3) {
        return false
      }
    }

    return true
  }

  /**
   * 提取关键位置用于稳定性检测
   */
  private extractKeyPositions(landmarks: PoseLandmarks): Vector2[] {
    const indices = [
      LANDMARK_INDEX.LEFT_SHOULDER,
      LANDMARK_INDEX.RIGHT_SHOULDER,
      LANDMARK_INDEX.LEFT_HIP,
      LANDMARK_INDEX.RIGHT_HIP,
    ]

    return indices.map(idx => ({
      x: landmarks[idx].x,
      y: landmarks[idx].y,
    }))
  }

  /**
   * 检查姿态稳定性
   */
  private checkStability(current: Vector2[], previous: Vector2[]): boolean {
    for (let i = 0; i < current.length; i++) {
      const dx = current[i].x - previous[i].x
      const dy = current[i].y - previous[i].y
      const dist = Math.sqrt(dx * dx + dy * dy)
      if (dist > this.config.stabilityThreshold) {
        return false
      }
    }
    return true
  }

  /**
   * 计算校准数据
   */
  private computeCalibrationData(landmarks: PoseLandmarks): CalibrationData {
    const leftShoulder = landmarks[LANDMARK_INDEX.LEFT_SHOULDER]
    const rightShoulder = landmarks[LANDMARK_INDEX.RIGHT_SHOULDER]
    const leftHip = landmarks[LANDMARK_INDEX.LEFT_HIP]
    const rightHip = landmarks[LANDMARK_INDEX.RIGHT_HIP]
    const leftKnee = landmarks[LANDMARK_INDEX.LEFT_KNEE]
    const rightKnee = landmarks[LANDMARK_INDEX.RIGHT_KNEE]
    const leftAnkle = landmarks[LANDMARK_INDEX.LEFT_ANKLE]
    const rightAnkle = landmarks[LANDMARK_INDEX.RIGHT_ANKLE]

    // 计算肩宽
    const shoulderWidth = this.distance(leftShoulder, rightShoulder)

    // 计算躯干高度（肩膀中点到髋部中点）
    const shoulderCenter = {
      x: (leftShoulder.x + rightShoulder.x) / 2,
      y: (leftShoulder.y + rightShoulder.y) / 2,
    }
    const hipCenter = {
      x: (leftHip.x + rightHip.x) / 2,
      y: (leftHip.y + rightHip.y) / 2,
    }
    const torsoLength = this.distance(shoulderCenter, hipCenter)

    // 计算大腿长度（取平均）
    const leftThighLength = this.distance(leftHip, leftKnee)
    const rightThighLength = this.distance(rightHip, rightKnee)
    const thighLength = (leftThighLength + rightThighLength) / 2

    // 计算小腿长度（取平均）
    const leftShinLength = this.distance(leftKnee, leftAnkle)
    const rightShinLength = this.distance(rightKnee, rightAnkle)
    const shinLength = (leftShinLength + rightShinLength) / 2

    return {
      baseTorsoLength: torsoLength,
      baseShoulderWidth: shoulderWidth,
      baseThighLength: thighLength,
      baseShinLength: shinLength,
      referencePose: JSON.parse(JSON.stringify(landmarks)), // Deep copy
      timestamp: Date.now(),
    }
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
   * 获取相对于参考姿态的角度变化
   */
  getRelativeAngle(
    landmarks: PoseLandmarks,
    startIdx: number,
    endIdx: number
  ): number | null {
    if (!this.calibrationData) return null

    const start = landmarks[startIdx]
    const end = landmarks[endIdx]
    const refStart = this.calibrationData.referencePose[startIdx]
    const refEnd = this.calibrationData.referencePose[endIdx]

    if (!start || !end || !refStart || !refEnd) return null
    if ((start.visibility ?? 0) < 0.3 || (end.visibility ?? 0) < 0.3) return null

    // 当前角度
    const currentAngle = Math.atan2(end.y - start.y, end.x - start.x)
    // 参考角度
    const refAngle = Math.atan2(refEnd.y - refStart.y, refEnd.x - refStart.x)

    return currentAngle - refAngle
  }

  /**
   * 获取躯干高度比率（当前/参考）
   */
  getTorsoRatio(landmarks: PoseLandmarks): number {
    if (!this.calibrationData) return 1

    const leftShoulder = landmarks[LANDMARK_INDEX.LEFT_SHOULDER]
    const rightShoulder = landmarks[LANDMARK_INDEX.RIGHT_SHOULDER]
    const leftHip = landmarks[LANDMARK_INDEX.LEFT_HIP]
    const rightHip = landmarks[LANDMARK_INDEX.RIGHT_HIP]

    if (!leftShoulder || !rightShoulder || !leftHip || !rightHip) return 1

    const shoulderCenter = {
      x: (leftShoulder.x + rightShoulder.x) / 2,
      y: (leftShoulder.y + rightShoulder.y) / 2,
    }
    const hipCenter = {
      x: (leftHip.x + rightHip.x) / 2,
      y: (leftHip.y + rightHip.y) / 2,
    }
    const currentTorso = this.distance(shoulderCenter, hipCenter)

    return currentTorso / this.calibrationData.baseTorsoLength
  }
}









