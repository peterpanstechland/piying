/**
 * PoseFilter - 信号预处理模块
 * 
 * 功能：
 * - 低通滤波：current = lerp(prev, target, smoothFactor)
 * - 置信度门控：visibility < 阈值时保持上一帧
 * - 动态平滑：根据运动速度自动调整系数（快速移动时降低平滑）
 */

import type {
  FilterConfig,
  LandmarkFilterState,
  PoseLandmarks,
  PoseLandmark,
} from './types'
import { DEFAULT_CONFIG } from './types'

export class PoseFilter {
  private config: FilterConfig
  private states: Map<number, LandmarkFilterState> = new Map()
  private lastTimestamp = 0

  constructor(config?: Partial<FilterConfig>) {
    this.config = { ...DEFAULT_CONFIG.filter, ...config }
  }

  /**
   * 更新配置
   */
  updateConfig(config: Partial<FilterConfig>): void {
    this.config = { ...this.config, ...config }
  }

  /**
   * 获取当前配置
   */
  getConfig(): FilterConfig {
    return { ...this.config }
  }

  /**
   * 重置滤波器状态
   */
  reset(): void {
    this.states.clear()
    this.lastTimestamp = 0
  }

  /**
   * 滤波处理姿态数据
   */
  filter(landmarks: PoseLandmarks | null): PoseLandmarks | null {
    if (!landmarks || landmarks.length === 0) {
      // 没有输入时，增加所有状态的丢失计数
      this.incrementLostFrames()
      return this.getHeldPose()
    }

    const currentTime = performance.now()
    const deltaTime = this.lastTimestamp > 0 ? currentTime - this.lastTimestamp : 16
    this.lastTimestamp = currentTime

    const filtered: PoseLandmarks = []

    for (let i = 0; i < landmarks.length; i++) {
      const lm = landmarks[i]
      filtered.push(this.filterLandmark(i, lm, deltaTime))
    }

    return filtered
  }

  /**
   * 滤波单个关键点
   */
  private filterLandmark(
    index: number,
    landmark: PoseLandmark,
    deltaTime: number
  ): PoseLandmark {
    const state = this.states.get(index)
    const visibility = landmark.visibility ?? 0

    // 置信度门控：低于阈值时使用保持的上一帧数据
    if (visibility < this.config.visibilityThreshold) {
      if (state && state.lostFrames < this.config.holdFrames) {
        // 保持上一帧
        this.states.set(index, {
          ...state,
          lostFrames: state.lostFrames + 1,
        })
        return {
          x: state.lastPosition.x,
          y: state.lastPosition.y,
          z: state.lastZ,
          visibility: visibility,
        }
      }
      // 超过保持帧数，返回原始数据（可能会导致跳动，但总比卡住好）
      return landmark
    }

    // 如果没有历史状态，初始化
    if (!state) {
      this.states.set(index, {
        lastPosition: { x: landmark.x, y: landmark.y },
        lastZ: landmark.z,
        lostFrames: 0,
        velocity: 0,
      })
      return landmark
    }

    // 计算速度（用于动态平滑）
    const dx = landmark.x - state.lastPosition.x
    const dy = landmark.y - state.lastPosition.y
    const distance = Math.sqrt(dx * dx + dy * dy)
    const velocity = distance / (deltaTime / 1000) // 归一化坐标/秒

    // 动态平滑系数：速度越快，平滑系数越高（越灵敏）
    let smoothFactor = this.config.smoothFactor
    if (velocity > this.config.velocityThreshold) {
      // 速度超过阈值时，线性增加平滑系数
      const velocityFactor = Math.min(velocity / this.config.velocityThreshold, 3)
      smoothFactor = Math.min(
        this.config.smoothFactor + (this.config.minSmoothFactor - this.config.smoothFactor) * (velocityFactor - 1) / 2,
        this.config.minSmoothFactor
      )
    }

    // 低通滤波：lerp(prev, target, smoothFactor)
    const filteredX = this.lerp(state.lastPosition.x, landmark.x, smoothFactor)
    const filteredY = this.lerp(state.lastPosition.y, landmark.y, smoothFactor)
    const filteredZ = this.lerp(state.lastZ, landmark.z, smoothFactor)

    // 更新状态
    this.states.set(index, {
      lastPosition: { x: filteredX, y: filteredY },
      lastZ: filteredZ,
      lostFrames: 0,
      velocity: velocity,
    })

    return {
      x: filteredX,
      y: filteredY,
      z: filteredZ,
      visibility: visibility,
    }
  }

  /**
   * 线性插值
   */
  private lerp(a: number, b: number, t: number): number {
    return a + (b - a) * t
  }

  /**
   * 增加所有状态的丢失帧计数
   */
  private incrementLostFrames(): void {
    for (const [index, state] of this.states) {
      this.states.set(index, {
        ...state,
        lostFrames: state.lostFrames + 1,
      })
    }
  }

  /**
   * 获取保持的姿态（用于检测丢失时）
   */
  private getHeldPose(): PoseLandmarks | null {
    if (this.states.size === 0) return null

    // 检查是否所有状态都超过保持帧数
    let anyValid = false
    for (const state of this.states.values()) {
      if (state.lostFrames < this.config.holdFrames) {
        anyValid = true
        break
      }
    }

    if (!anyValid) return null

    // 构建保持的姿态
    const held: PoseLandmarks = []
    const maxIndex = Math.max(...this.states.keys())
    
    for (let i = 0; i <= maxIndex; i++) {
      const state = this.states.get(i)
      if (state && state.lostFrames < this.config.holdFrames) {
        held.push({
          x: state.lastPosition.x,
          y: state.lastPosition.y,
          z: state.lastZ,
          visibility: 0.5, // 标记为保持的数据
        })
      } else {
        // 没有有效状态的关键点
        held.push({
          x: 0,
          y: 0,
          z: 0,
          visibility: 0,
        })
      }
    }

    return held
  }

  /**
   * 获取当前平均速度（用于调试）
   */
  getAverageVelocity(): number {
    if (this.states.size === 0) return 0
    
    let sum = 0
    for (const state of this.states.values()) {
      sum += state.velocity
    }
    return sum / this.states.size
  }

  /**
   * 获取滤波器统计信息（用于调试）
   */
  getStats(): {
    activeStates: number
    lostStates: number
    averageVelocity: number
  } {
    let active = 0
    let lost = 0
    let velocitySum = 0

    for (const state of this.states.values()) {
      if (state.lostFrames === 0) {
        active++
      } else if (state.lostFrames < this.config.holdFrames) {
        lost++
      }
      velocitySum += state.velocity
    }

    return {
      activeStates: active,
      lostStates: lost,
      averageVelocity: this.states.size > 0 ? velocitySum / this.states.size : 0,
    }
  }
}




