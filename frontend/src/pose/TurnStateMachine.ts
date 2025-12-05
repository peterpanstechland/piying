/**
 * TurnStateMachine - 转身状态机
 * 
 * 功能：
 * - 迟滞比较器：只有超过死区阈值才切换朝向
 * - 使用肩膀或头部的深度差值检测朝向
 * - 防止在边界附近频繁切换
 */

import type {
  TurnConfig,
  TurnState,
  Facing,
  PoseLandmarks,
} from './types'
import { DEFAULT_CONFIG, LANDMARK_INDEX } from './types'

export class TurnStateMachine {
  private config: TurnConfig
  private state: TurnState = {
    currentFacing: 'right',
    currentDepthDiff: 0,
    inDeadzone: true,
    isTurning: false,
  }
  private turnStartTime = 0
  private onTurnCallback: ((facing: Facing) => void) | null = null

  constructor(config?: Partial<TurnConfig>) {
    this.config = { ...DEFAULT_CONFIG.turn, ...config }
  }

  /**
   * 更新配置
   */
  updateConfig(config: Partial<TurnConfig>): void {
    this.config = { ...this.config, ...config }
  }

  /**
   * 获取当前配置
   */
  getConfig(): TurnConfig {
    return { ...this.config }
  }

  /**
   * 设置转身回调
   */
  setOnTurn(callback: (facing: Facing) => void): void {
    this.onTurnCallback = callback
  }

  /**
   * 获取当前状态
   */
  getState(): TurnState {
    return { ...this.state }
  }

  /**
   * 获取当前朝向
   */
  getFacing(): Facing {
    return this.state.currentFacing
  }

  /**
   * 手动设置朝向
   */
  setFacing(facing: Facing): void {
    this.state.currentFacing = facing
  }

  /**
   * 重置状态
   */
  reset(): void {
    this.state = {
      currentFacing: 'right',
      currentDepthDiff: 0,
      inDeadzone: true,
      isTurning: false,
    }
    this.turnStartTime = 0
  }

  /**
   * 处理姿态数据，更新转身状态
   */
  process(landmarks: PoseLandmarks | null): TurnState {
    if (!landmarks) {
      return this.state
    }

    // 检查转身动画是否完成
    if (this.state.isTurning) {
      const elapsed = performance.now() - this.turnStartTime
      if (elapsed >= this.config.animationDuration) {
        this.state.isTurning = false
      }
      return this.state
    }

    // 计算深度差值
    const depthDiff = this.computeDepthDiff(landmarks)
    if (depthDiff === null) {
      return this.state
    }

    this.state.currentDepthDiff = depthDiff

    // 迟滞比较器逻辑
    const { deadzone } = this.config
    const currentFacing = this.state.currentFacing

    // 检查是否在死区内
    this.state.inDeadzone = Math.abs(depthDiff) < deadzone

    // 只有超出死区才考虑切换
    if (!this.state.inDeadzone) {
      // depthDiff > 0: 左肩在前（相对于摄像头），人面朝右
      // depthDiff < 0: 右肩在前，人面朝左
      const newFacing: Facing = depthDiff > 0 ? 'right' : 'left'

      if (newFacing !== currentFacing) {
        this.triggerTurn(newFacing)
      }
    }

    return this.state
  }

  /**
   * 计算深度差值
   */
  private computeDepthDiff(landmarks: PoseLandmarks): number | null {
    if (this.config.depthSource === 'head') {
      return this.computeHeadDepthDiff(landmarks)
    }
    return this.computeShoulderDepthDiff(landmarks)
  }

  /**
   * 使用肩膀计算深度差值
   * 返回值: 正值 = 左肩更靠近摄像头（面朝右），负值 = 右肩更靠近（面朝左）
   */
  private computeShoulderDepthDiff(landmarks: PoseLandmarks): number | null {
    const leftShoulder = landmarks[LANDMARK_INDEX.LEFT_SHOULDER]
    const rightShoulder = landmarks[LANDMARK_INDEX.RIGHT_SHOULDER]

    if (!leftShoulder || !rightShoulder) return null
    
    const leftVis = leftShoulder.visibility ?? 0
    const rightVis = rightShoulder.visibility ?? 0

    // 如果置信度太低，使用可见度差值作为深度代理
    if (leftVis < 0.3 && rightVis < 0.3) {
      return null
    }

    // 使用 z 值差异（MediaPipe 的 z 值表示相对深度）
    // z 值越小表示越靠近摄像头
    const depthDiff = rightShoulder.z - leftShoulder.z

    // 也可以考虑可见度差异作为辅助信号
    // 被遮挡的一侧可见度较低
    const visibilityDiff = leftVis - rightVis

    // 综合深度和可见度信息
    // z 值差异通常在 -0.5 到 0.5 之间
    // 可见度差异在 -1 到 1 之间
    return depthDiff + visibilityDiff * 0.2
  }

  /**
   * 使用头部（耳朵和眼睛）计算深度差值
   * 头部关键点距离较近，Z 值差异较小，需要放大系数以便触发阈值
   */
  private computeHeadDepthDiff(landmarks: PoseLandmarks): number | null {
    const leftEar = landmarks[LANDMARK_INDEX.LEFT_EAR]
    const rightEar = landmarks[LANDMARK_INDEX.RIGHT_EAR]
    const leftEye = landmarks[LANDMARK_INDEX.LEFT_EYE]
    const rightEye = landmarks[LANDMARK_INDEX.RIGHT_EYE]

    let depthDiff = 0
    let weight = 0

    // 1. 使用耳朵 Z 值（最可靠）
    if (leftEar && rightEar) {
      // Z 值越小越近。右耳近(Z小) -> 差值 > 0 -> 向右转
      depthDiff += (rightEar.z - leftEar.z) * 2.0 
      weight += 1
    }

    // 2. 使用眼睛 Z 值
    if (leftEye && rightEye) {
      depthDiff += (rightEye.z - leftEye.z) * 2.0
      weight += 1
    }

    // 3. 使用可见度辅助（权重较低）
    if (leftEar && rightEar) {
      const leftVis = leftEar.visibility ?? 0
      const rightVis = rightEar.visibility ?? 0
      // 左耳可见度高 -> 向右转
      depthDiff += (leftVis - rightVis) * 0.5
    }

    if (weight === 0) return null

    // 放大最终结果，使其能通过 0.15 的死区
    // 头部转动幅度通常较小，给一个较大的增益
    return depthDiff * 2.0
  }

  /**
   * 触发转身
   */
  private triggerTurn(newFacing: Facing): void {
    this.state.currentFacing = newFacing
    this.state.isTurning = true
    this.turnStartTime = performance.now()

    // 调用回调
    if (this.onTurnCallback) {
      this.onTurnCallback(newFacing)
    }
  }

  /**
   * 获取调试信息
   */
  getDebugInfo(): {
    facing: Facing
    depthDiff: number
    deadzone: number
    inDeadzone: boolean
    isTurning: boolean
    deadzoneProgress: number
  } {
    const { deadzone } = this.config
    const { currentDepthDiff, inDeadzone, isTurning, currentFacing } = this.state

    // 计算在死区中的位置（0-1，0.5 表示正中）
    const deadzoneProgress = deadzone > 0
      ? Math.min(Math.abs(currentDepthDiff) / deadzone, 1)
      : 1

    return {
      facing: currentFacing,
      depthDiff: currentDepthDiff,
      deadzone,
      inDeadzone,
      isTurning,
      deadzoneProgress,
    }
  }
}





