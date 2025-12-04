/**
 * IKSolver - 逆向运动学解算器
 * 
 * 功能：
 * - 双骨骼 IK（使用余弦定理）
 * - 地面吸附
 * - NaN 保护（钳制 acos 输入）
 */

import {
  LegIntent,
  type IKConfig,
  type IKResult,
  type IKState,
  type PoseLandmarks,
  type CalibrationData,
  type LegState,
} from './types'
import { DEFAULT_CONFIG, LANDMARK_INDEX } from './types'

export class IKSolver {
  private config: IKConfig
  private state: IKState = {
    left: this.createDefaultResult(),
    right: this.createDefaultResult(),
  }
  private thighLength = 0
  private shinLength = 0

  constructor(config?: Partial<IKConfig>) {
    this.config = { ...DEFAULT_CONFIG.ik, ...config }
  }

  /**
   * 创建默认结果
   */
  private createDefaultResult(): IKResult {
    return {
      thighAngle: 0,
      kneeAngle: 0,
      distance: 0,
      valid: true,
    }
  }

  /**
   * 更新配置
   */
  updateConfig(config: Partial<IKConfig>): void {
    this.config = { ...this.config, ...config }
  }

  /**
   * 获取当前配置
   */
  getConfig(): IKConfig {
    return { ...this.config }
  }

  /**
   * 获取当前状态
   */
  getState(): IKState {
    return JSON.parse(JSON.stringify(this.state))
  }

  /**
   * 设置骨骼长度（从校准数据）
   */
  setLengthsFromCalibration(calibration: CalibrationData): void {
    this.thighLength = calibration.baseThighLength
    this.shinLength = calibration.baseShinLength
  }

  /**
   * 手动设置骨骼长度
   */
  setLengths(thigh: number, shin: number): void {
    this.thighLength = thigh
    this.shinLength = shin
  }

  /**
   * 重置状态
   */
  reset(): void {
    this.state = {
      left: this.createDefaultResult(),
      right: this.createDefaultResult(),
    }
  }

  /**
   * 处理姿态数据，计算 IK
   */
  process(
    landmarks: PoseLandmarks | null,
    calibration: CalibrationData | null,
    legState: LegState | null
  ): IKState {
    if (!this.config.enabled) {
      return this.state
    }

    if (!landmarks || !calibration) {
      return this.state
    }

    // 确保骨骼长度已设置
    if (this.thighLength === 0 || this.shinLength === 0) {
      this.setLengthsFromCalibration(calibration)
    }

    // 根据腿部状态决定是否使用 IK
    // 站立和行走时使用地面 IK，其他动作使用 FK
    const useIK = !legState || this.shouldUseIK(legState)

    // 左腿 IK
    this.state.left = this.solveLeg(
      landmarks,
      'left',
      useIK && (legState?.left.intent !== LegIntent.HIGH_KICK),
      legState?.left.intent
    )

    // 右腿 IK
    this.state.right = this.solveLeg(
      landmarks,
      'right',
      useIK && (legState?.right.intent !== LegIntent.HIGH_KICK),
      legState?.right.intent
    )

    return this.state
  }

  /**
   * 判断是否应该使用 IK
   */
  private shouldUseIK(legState: LegState): boolean {
    // 跳跃时不使用地面 IK
    if (legState.isFlying || legState.overallIntent === LegIntent.JUMPING) {
      return false
    }
    return true
  }

  /**
   * 解算单腿 IK
   */
  private solveLeg(
    landmarks: PoseLandmarks,
    side: 'left' | 'right',
    useGroundIK: boolean,
    intent?: LegIntent
  ): IKResult {
    const hipIdx = side === 'left' ? LANDMARK_INDEX.LEFT_HIP : LANDMARK_INDEX.RIGHT_HIP
    const kneeIdx = side === 'left' ? LANDMARK_INDEX.LEFT_KNEE : LANDMARK_INDEX.RIGHT_KNEE
    const ankleIdx = side === 'left' ? LANDMARK_INDEX.LEFT_ANKLE : LANDMARK_INDEX.RIGHT_ANKLE

    const hip = landmarks[hipIdx]
    const knee = landmarks[kneeIdx]
    const ankle = landmarks[ankleIdx]

    if (!hip || !knee || !ankle) {
      return this.state[side]
    }

    // 检查有效性
    const minVis = Math.min(
      hip.visibility ?? 0,
      knee.visibility ?? 0,
      ankle.visibility ?? 0
    )

    if (minVis < 0.3) {
      return this.state[side]
    }

    // 如果使用地面 IK，计算到地面的距离
    if (useGroundIK) {
      return this.solveGroundIK(hip, this.config.groundY)
    }

    // 否则使用 FK（直接从关键点计算角度）
    return this.solveFK(hip, knee, ankle, intent)
  }

  /**
   * 地面 IK 解算（双骨骼 IK）
   * 使用余弦定理计算髋部和膝盖角度
   */
  private solveGroundIK(hip: { x: number; y: number }, groundY: number): IKResult {
    const L1 = this.thighLength // 大腿长度
    const L2 = this.shinLength  // 小腿长度

    // 髋到地面的距离（归一化坐标）
    let D = groundY - hip.y

    // 钳制距离到有效范围
    const maxReach = L1 + L2 - this.config.epsilon
    const minReach = Math.abs(L1 - L2) + this.config.epsilon

    D = Math.max(minReach, Math.min(maxReach, D))

    // 使用余弦定理计算膝盖角度（两骨之间的角度）
    // cos(α) = (L1² + L2² - D²) / (2·L1·L2)
    const cosAlpha = this.safeAcosInput(
      (L1 * L1 + L2 * L2 - D * D) / (2 * L1 * L2)
    )
    const kneeAngle = Math.PI - Math.acos(cosAlpha) // 膝盖弯曲角度

    // 计算大腿角度
    // 使用余弦定理计算髋关节角度
    // cos(β) = (L1² + D² - L2²) / (2·L1·D)
    const cosBeta = this.safeAcosInput(
      (L1 * L1 + D * D - L2 * L2) / (2 * L1 * D)
    )
    const thighAngle = Math.acos(cosBeta) // 大腿相对于垂直方向的角度

    return {
      thighAngle,
      kneeAngle,
      distance: D,
      valid: true,
    }
  }

  /**
   * FK 解算（直接从关键点计算）
   */
  private solveFK(
    hip: { x: number; y: number },
    knee: { x: number; y: number },
    ankle: { x: number; y: number },
    intent?: LegIntent
  ): IKResult {
    // 计算大腿角度（相对于垂直方向）
    const thighDx = knee.x - hip.x
    const thighDy = knee.y - hip.y
    const thighAngle = Math.atan2(thighDx, thighDy) // 使用 atan2(dx, dy) 得到相对于垂直的角度

    // 计算小腿角度（相对于大腿方向）
    const shinDx = ankle.x - knee.x
    const shinDy = ankle.y - knee.y
    const shinAngle = Math.atan2(shinDx, shinDy)

    // 膝盖角度 = 小腿方向 - 大腿方向
    let kneeAngle = shinAngle - thighAngle

    // 应用关节约束：膝盖只能向后弯曲
    // 对于皮影（侧面视图），正值表示正常弯曲，负值是不自然的
    if (intent === LegIntent.HIGH_KICK) {
      // 高抬腿时允许更大的弯曲范围
      kneeAngle = Math.max(-0.5, Math.min(Math.PI * 0.8, kneeAngle))
    } else {
      // 正常站立/行走时限制膝盖角度
      kneeAngle = Math.max(0, Math.min(Math.PI * 0.6, kneeAngle))
    }

    // 计算距离（用于调试）
    const distance = Math.sqrt(
      (ankle.x - hip.x) ** 2 + (ankle.y - hip.y) ** 2
    )

    return {
      thighAngle,
      kneeAngle,
      distance,
      valid: true,
    }
  }

  /**
   * 安全的 acos 输入（防止 NaN）
   */
  private safeAcosInput(value: number): number {
    return Math.max(-1, Math.min(1, value))
  }

  /**
   * 获取调试信息
   */
  getDebugInfo(): {
    enabled: boolean
    thighLength: number
    shinLength: number
    groundY: number
    leftResult: IKResult
    rightResult: IKResult
  } {
    return {
      enabled: this.config.enabled,
      thighLength: this.thighLength,
      shinLength: this.shinLength,
      groundY: this.config.groundY,
      leftResult: this.state.left,
      rightResult: this.state.right,
    }
  }

  /**
   * 转换为皮影角度
   * 将 IK 结果转换为角色渲染器使用的角度格式
   */
  toPartAngles(facing: 'left' | 'right'): {
    leftThigh: number
    leftShin: number
    rightThigh: number
    rightShin: number
  } {
    // 根据朝向调整角度
    const flip = facing === 'left' ? -1 : 1

    return {
      leftThigh: this.state.left.thighAngle * flip,
      leftShin: this.state.left.kneeAngle * flip,
      rightThigh: this.state.right.thighAngle * flip,
      rightShin: this.state.right.kneeAngle * flip,
    }
  }
}



