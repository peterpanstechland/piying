/**
 * SecondaryMotion - 物理惯性处理器
 * 
 * 功能：
 * - 袖子/发梢延迟跟随手臂/头部旋转
 * - SleeveAngle = Lerp(SleeveAngle, ArmAngle, followFactor)
 * - 增加皮影的韵味和生动感
 */

import type {
  SecondaryMotionConfig,
  SecondaryMotionState,
  SecondaryPartState,
  PartAngles,
} from './types'
import { DEFAULT_CONFIG } from './types'

// 二级运动的父子关系映射
// key: 子部件（有惯性的部件），value: 父部件（驱动源）
const PARENT_MAPPING: Record<string, string> = {
  'left_sleeve': 'left_upper_arm',
  'right_sleeve': 'right_upper_arm',
  'left_sleeve_lower': 'left_lower_arm',
  'right_sleeve_lower': 'right_lower_arm',
  'hair': 'head',
  'tassel': 'head',       // 流苏
  'ribbon': 'body',       // 飘带
  'skirt': 'body',        // 裙摆
}

export class SecondaryMotion {
  private config: SecondaryMotionConfig
  private state: SecondaryMotionState = { parts: {} }
  private lastTimestamp = 0

  constructor(config?: Partial<SecondaryMotionConfig>) {
    this.config = { ...DEFAULT_CONFIG.secondary, ...config }
    this.initializeState()
  }

  /**
   * 初始化状态
   */
  private initializeState(): void {
    this.state = { parts: {} }
    for (const part of this.config.parts) {
      this.state.parts[part] = {
        currentAngle: 0,
        angularVelocity: 0,
      }
    }
  }

  /**
   * 更新配置
   */
  updateConfig(config: Partial<SecondaryMotionConfig>): void {
    const oldParts = this.config.parts
    this.config = { ...this.config, ...config }

    // 如果部件列表变化，重新初始化
    if (JSON.stringify(oldParts) !== JSON.stringify(this.config.parts)) {
      this.initializeState()
    }
  }

  /**
   * 获取当前配置
   */
  getConfig(): SecondaryMotionConfig {
    return { ...this.config }
  }

  /**
   * 获取当前状态
   */
  getState(): SecondaryMotionState {
    return JSON.parse(JSON.stringify(this.state))
  }

  /**
   * 重置状态
   */
  reset(): void {
    this.initializeState()
    this.lastTimestamp = 0
  }

  /**
   * 处理角度数据，添加惯性效果
   */
  process(inputAngles: PartAngles): PartAngles {
    if (!this.config.enabled || this.config.parts.length === 0) {
      return inputAngles
    }

    const currentTime = performance.now()
    const deltaTime = this.lastTimestamp > 0
      ? Math.min((currentTime - this.lastTimestamp) / 1000, 0.1) // 最大 100ms，防止异常
      : 0.016 // 默认 60fps
    this.lastTimestamp = currentTime

    // 创建输出角度的副本
    const outputAngles: PartAngles = { ...inputAngles }

    // 处理每个有惯性的部件
    for (const part of this.config.parts) {
      const parentPart = PARENT_MAPPING[part]
      if (!parentPart) continue

      const targetAngle = inputAngles[parentPart] ?? 0
      const state = this.state.parts[part] ?? { currentAngle: 0, angularVelocity: 0 }

      // 使用弹簧-阻尼模型
      const newState = this.simulateSpringDamper(
        state,
        targetAngle,
        deltaTime
      )

      this.state.parts[part] = newState
      outputAngles[part] = newState.currentAngle
    }

    return outputAngles
  }

  /**
   * 弹簧-阻尼模型模拟
   * 简化版 Verlet 积分
   */
  private simulateSpringDamper(
    state: SecondaryPartState,
    targetAngle: number,
    deltaTime: number
  ): SecondaryPartState {
    const { followFactor, damping } = this.config

    // 角度差
    const angleDiff = targetAngle - state.currentAngle

    // 弹簧力 = k * diff（k 是 followFactor 的函数）
    const springForce = angleDiff * followFactor * 10

    // 更新角速度
    let newVelocity = state.angularVelocity + springForce * deltaTime

    // 阻尼
    newVelocity *= damping

    // 更新角度
    const newAngle = state.currentAngle + newVelocity * deltaTime

    return {
      currentAngle: newAngle,
      angularVelocity: newVelocity,
    }
  }

  /**
   * 简单的 Lerp 跟随（备选方案）
   */
  processSimpleLerp(inputAngles: PartAngles): PartAngles {
    if (!this.config.enabled || this.config.parts.length === 0) {
      return inputAngles
    }

    const outputAngles: PartAngles = { ...inputAngles }

    for (const part of this.config.parts) {
      const parentPart = PARENT_MAPPING[part]
      if (!parentPart) continue

      const targetAngle = inputAngles[parentPart] ?? 0
      const state = this.state.parts[part] ?? { currentAngle: 0, angularVelocity: 0 }

      // 简单 Lerp
      const newAngle = this.lerp(state.currentAngle, targetAngle, this.config.followFactor)

      this.state.parts[part] = {
        currentAngle: newAngle,
        angularVelocity: 0,
      }
      outputAngles[part] = newAngle
    }

    return outputAngles
  }

  /**
   * 线性插值
   */
  private lerp(a: number, b: number, t: number): number {
    return a + (b - a) * t
  }

  /**
   * 添加一个需要惯性效果的部件
   */
  addPart(partName: string): void {
    if (!this.config.parts.includes(partName)) {
      this.config.parts.push(partName)
      this.state.parts[partName] = {
        currentAngle: 0,
        angularVelocity: 0,
      }
    }
  }

  /**
   * 移除一个部件
   */
  removePart(partName: string): void {
    const index = this.config.parts.indexOf(partName)
    if (index !== -1) {
      this.config.parts.splice(index, 1)
      delete this.state.parts[partName]
    }
  }

  /**
   * 获取可用的部件映射
   */
  static getAvailableParentMappings(): Record<string, string> {
    return { ...PARENT_MAPPING }
  }

  /**
   * 获取调试信息
   */
  getDebugInfo(): {
    enabled: boolean
    followFactor: number
    damping: number
    parts: Array<{
      name: string
      parent: string
      currentAngle: number
      velocity: number
    }>
  } {
    const partsInfo = this.config.parts.map(part => ({
      name: part,
      parent: PARENT_MAPPING[part] ?? 'unknown',
      currentAngle: this.state.parts[part]?.currentAngle ?? 0,
      velocity: this.state.parts[part]?.angularVelocity ?? 0,
    }))

    return {
      enabled: this.config.enabled,
      followFactor: this.config.followFactor,
      damping: this.config.damping,
      parts: partsInfo,
    }
  }
}











