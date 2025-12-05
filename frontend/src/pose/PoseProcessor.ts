/**
 * PoseProcessor - 姿态处理管线控制器
 * 
 * 数据流：
 * MediaPipe -> CalibrationManager -> PoseFilter -> TurnStateMachine
 *           -> ScaleProcessor -> LegProcessor -> IKSolver -> SecondaryMotion
 *           -> CharacterRenderer
 * 
 * 功能：
 * - 串联所有处理模块
 * - 提供统一的配置管理接口
 * - 计算各部件角度
 */

import {
  LegIntent,
  type ProcessorConfig,
  type ProcessedPose,
  type PartAngles,
  type PoseLandmarks,
  type Facing,
  type CalibrationData,
  type LegState,
  type IKState,
} from './types'
import { DEFAULT_CONFIG, LANDMARK_INDEX } from './types'
import { CalibrationManager } from './CalibrationManager'
import { PoseFilter } from './PoseFilter'
import { TurnStateMachine } from './TurnStateMachine'
import { ScaleProcessor } from './ScaleProcessor'
import { LegProcessor } from './LegProcessor'
import { IKSolver } from './IKSolver'
import { SecondaryMotion } from './SecondaryMotion'

export class PoseProcessor {
  private config: ProcessorConfig
  private calibrationManager: CalibrationManager
  private poseFilter: PoseFilter
  private turnStateMachine: TurnStateMachine
  private scaleProcessor: ScaleProcessor
  private legProcessor: LegProcessor
  private ikSolver: IKSolver
  private secondaryMotion: SecondaryMotion

  private frameCount = 0
  private lastProcessTime = 0
  private onTurnCallback: ((facing: Facing) => void) | null = null

  constructor(config?: Partial<ProcessorConfig>) {
    this.config = this.mergeConfig(DEFAULT_CONFIG, config)

    // 初始化所有处理模块
    this.calibrationManager = new CalibrationManager(this.config.calibration)
    this.poseFilter = new PoseFilter(this.config.filter)
    this.turnStateMachine = new TurnStateMachine(this.config.turn)
    this.scaleProcessor = new ScaleProcessor(this.config.scale)
    this.legProcessor = new LegProcessor(this.config.leg)
    this.ikSolver = new IKSolver(this.config.ik)
    this.secondaryMotion = new SecondaryMotion(this.config.secondary)

    // 设置转身回调
    this.turnStateMachine.setOnTurn((facing) => {
      if (this.onTurnCallback) {
        this.onTurnCallback(facing)
      }
    })
  }

  /**
   * 合并配置
   */
  private mergeConfig(base: ProcessorConfig, override?: Partial<ProcessorConfig>): ProcessorConfig {
    if (!override) return { ...base }

    return {
      calibration: { ...base.calibration, ...override.calibration },
      filter: { ...base.filter, ...override.filter },
      turn: { ...base.turn, ...override.turn },
      scale: { ...base.scale, ...override.scale },
      leg: { ...base.leg, ...override.leg },
      ik: { ...base.ik, ...override.ik },
      secondary: { ...base.secondary, ...override.secondary },
    }
  }

  /**
   * 更新配置
   */
  updateConfig(config: Partial<ProcessorConfig>): void {
    if (config.calibration) {
      this.calibrationManager.updateConfig(config.calibration)
    }
    if (config.filter) {
      this.poseFilter.updateConfig(config.filter)
    }
    if (config.turn) {
      this.turnStateMachine.updateConfig(config.turn)
    }
    if (config.scale) {
      this.scaleProcessor.updateConfig(config.scale)
    }
    if (config.leg) {
      this.legProcessor.updateConfig(config.leg)
    }
    if (config.ik) {
      this.ikSolver.updateConfig(config.ik)
    }
    if (config.secondary) {
      this.secondaryMotion.updateConfig(config.secondary)
    }

    this.config = this.mergeConfig(this.config, config)
  }

  /**
   * 获取当前配置
   */
  getConfig(): ProcessorConfig {
    return JSON.parse(JSON.stringify(this.config))
  }

  /**
   * 设置转身回调
   */
  setOnTurn(callback: (facing: Facing) => void): void {
    this.onTurnCallback = callback
  }

  /**
   * 重置所有处理模块
   */
  reset(): void {
    this.poseFilter.reset()
    this.turnStateMachine.reset()
    this.scaleProcessor.reset()
    this.legProcessor.reset()
    this.ikSolver.reset()
    this.secondaryMotion.reset()
    this.frameCount = 0
  }

  /**
   * 手动校准
   */
  calibrate(landmarks: PoseLandmarks): CalibrationData | null {
    const data = this.calibrationManager.calibrate(landmarks)
    if (data) {
      this.scaleProcessor.setReferenceFromCalibration(data)
      this.ikSolver.setLengthsFromCalibration(data)
    }
    return data
  }

  /**
   * 清除校准
   */
  clearCalibration(): void {
    this.calibrationManager.clearCalibration()
    this.scaleProcessor.reset()
    this.ikSolver.reset()
  }

  /**
   * 检查是否已校准
   */
  isCalibrated(): boolean {
    return this.calibrationManager.isCalibrated()
  }

  /**
   * 获取校准数据
   */
  getCalibrationData(): CalibrationData | null {
    return this.calibrationManager.getCalibrationData()
  }

  /**
   * 主处理函数 - 处理原始姿态数据
   */
  process(rawLandmarks: PoseLandmarks | null): ProcessedPose {
    const startTime = performance.now()
    this.frameCount++

    // 1. 滤波处理
    const filteredLandmarks = this.poseFilter.filter(rawLandmarks)

    // 2. 自动校准（如果尚未校准）
    let calibrationData = this.calibrationManager.getCalibrationData()
    if (!calibrationData && filteredLandmarks) {
      const result = this.calibrationManager.autoCalibrate(filteredLandmarks)
      if (result.calibrated && result.data) {
        calibrationData = result.data
        this.scaleProcessor.setReferenceFromCalibration(calibrationData)
        this.ikSolver.setLengthsFromCalibration(calibrationData)
      }
    }

    // 3. 转身检测
    const turnState = this.turnStateMachine.process(filteredLandmarks)

    // 4. 缩放处理
    this.scaleProcessor.process(filteredLandmarks, calibrationData)
    const scaleState = this.scaleProcessor.getState()

    // 5. 腿部意图分析
    const legState = this.legProcessor.process(filteredLandmarks, calibrationData)

    // 6. IK 解算
    const ikState = this.ikSolver.process(filteredLandmarks, calibrationData, legState)

    // 7. 计算部件角度
    let partAngles = this.computePartAngles(
      filteredLandmarks,
      calibrationData,
      turnState.currentFacing,
      legState,
      ikState
    )

    // 8. 物理惯性
    partAngles = this.secondaryMotion.process(partAngles)

    const processingTime = performance.now() - startTime
    this.lastProcessTime = processingTime

    return {
      rawLandmarks,
      filteredLandmarks,
      partAngles,
      turnState,
      scaleState,
      legState,
      ikState,
      calibration: calibrationData,
      isCalibrated: calibrationData !== null,
      frameCount: this.frameCount,
      processingTime,
    }
  }

  /**
   * 计算各部件角度
   * 
   * 注意：角度不在这里做翻转处理，CharacterRenderer 通过 container.scale.x 来处理朝向
   * 这里只计算原始角度值
   */
  private computePartAngles(
    landmarks: PoseLandmarks | null,
    calibration: CalibrationData | null,
    _facing: Facing,
    legState: LegState,
    _ikState: IKState
  ): PartAngles {
    const angles: PartAngles = {}

    if (!landmarks) {
      return angles
    }

    // --- 上身角度 ---

    // 头部角度（暂不处理，头部通常不旋转）
    // const headAngle = this.computeAngle(...)

    // 身体角度（躯干倾斜）- 暂不处理，皮影的身体通常不旋转
    // const bodyAngle = this.computeBodyAngle(landmarks)

    // 左臂（保持原值，抬手为负）
    // 物理含义：从垂直向下（90度）逆时针旋转到向前/上
    const leftArmAngle = this.computeJointAngle(
      landmarks,
      LANDMARK_INDEX.LEFT_SHOULDER,
      LANDMARK_INDEX.LEFT_ELBOW,
      calibration?.referencePose
    )
    if (leftArmAngle !== null) {
      angles['left-arm'] = leftArmAngle
    }

    // 左手（前臂）
    let leftHandAngle = this.computeJointAngle(
      landmarks,
      LANDMARK_INDEX.LEFT_ELBOW,
      LANDMARK_INDEX.LEFT_WRIST,
      calibration?.referencePose
    )
    
    // 应用肘关节约束（防止反关节）
    // 归一化后的角度体系中，抬手/弯曲都是负值（逆时针）
    // 注意：下面的约束参数基于这个体系
    if (leftHandAngle !== null && angles['left-arm'] !== undefined) {
      leftHandAngle = this.constrainJointAngle(
        angles['left-arm'], 
        leftHandAngle,
        -0.2, // 最小相对角度
        2.8   // 最大相对角度
      )
      angles['left-hand'] = leftHandAngle
    }

    // 右臂（标准化处理）
    // 原始计算中，右臂抬起是顺时针旋转（正值）。
    // 为了简化后续处理（如 SecondaryMotion），我们将所有肢体的“向前/向上”运动统一为负值（逆时针）。
    // CharacterRenderer 会根据角色朝向自动处理这种标准化带来的符号差异。
    const rightArmAngle = this.computeJointAngle(
      landmarks,
      LANDMARK_INDEX.RIGHT_SHOULDER,
      LANDMARK_INDEX.RIGHT_ELBOW,
      calibration?.referencePose
    )
    if (rightArmAngle !== null) {
      angles['right-arm'] = -rightArmAngle
    }

    // 右手（标准化处理）
    let rightHandAngle = this.computeJointAngle(
      landmarks,
      LANDMARK_INDEX.RIGHT_ELBOW,
      LANDMARK_INDEX.RIGHT_WRIST,
      calibration?.referencePose
    )
    if (rightHandAngle !== null) {
      // 同样统一为负值（抬手）
      const normalizedRightHand = -rightHandAngle
      
      // 应用约束
      if (angles['right-arm'] !== undefined) {
        const constrained = this.constrainJointAngle(
          angles['right-arm'],
          normalizedRightHand,
          -0.2,
          2.8
        )
        angles['right-hand'] = constrained
      } else {
        angles['right-hand'] = normalizedRightHand
      }
    }

    // --- 下身角度 ---

    // 根据腿部状态选择 FK 或 IK 角度
    if (this.legProcessor.shouldUseFK() && legState.overallIntent !== LegIntent.JUMPING) {
      // 使用 FK（直接从关键点计算）
      this.computeLegAnglesFK(landmarks, calibration, angles)
    } else {
      // 使用 IK 结果（IK 内部已经处理了朝向）
      const ikAngles = this.ikSolver.toPartAngles(_facing)
      angles['left-thigh'] = ikAngles.leftThigh
      angles['left-foot'] = ikAngles.leftShin
      angles['right-thigh'] = ikAngles.rightThigh
      angles['right-foot'] = ikAngles.rightShin
    }

    return angles
  }

  /**
   * 计算两点连线的角度
   * 
   * 返回的是**相对于参考姿势的角度变化量**：
   * - 如果有校准数据，使用校准时的姿势作为参考
   * - 如果没有校准，使用默认参考角度（π/2，即垂直向下）
   * 
   * 注意：返回值取反以匹配 PixiJS 的旋转方向
   * - PixiJS 正值 = 顺时针
   * - 用户向前抬手（角度减小）应该让皮影顺时针旋转（正值）
   */
  private computeJointAngle(
    landmarks: PoseLandmarks,
    startIdx: number,
    endIdx: number,
    referencePose?: PoseLandmarks
  ): number | null {
    const start = landmarks[startIdx]
    const end = landmarks[endIdx]

    if (!start || !end) return null
    if ((start.visibility ?? 0) < 0.3 || (end.visibility ?? 0) < 0.3) return null

    // 当前角度 - 使用 atan2(dy, dx)
    const dx = end.x - start.x
    const dy = end.y - start.y
    const currentAngle = Math.atan2(dy, dx)

    let relativeAngle: number

    // 如果有参考姿态（校准后），计算相对角度
    if (referencePose) {
      const refStart = referencePose[startIdx]
      const refEnd = referencePose[endIdx]
      if (refStart && refEnd) {
        const refDx = refEnd.x - refStart.x
        const refDy = refEnd.y - refStart.y
        const refAngle = Math.atan2(refDy, refDx)
        relativeAngle = currentAngle - refAngle
      } else {
        relativeAngle = currentAngle - Math.PI / 2
      }
    } else {
      // 没有参考姿态时，使用默认参考角度（肢体垂直向下 = π/2）
      relativeAngle = currentAngle - Math.PI / 2
    }

    // 直接返回相对角度，由 CharacterRenderer 根据角色朝向处理
    return relativeAngle
  }

  /**
   * 约束关节角度（防止反关节）
   * 
   * @param parentAngle 父骨骼角度
   * @param childAngle 子骨骼角度
   * @param minRelative 最小相对角度（弧度）
   * @param maxRelative 最大相对角度（弧度）
   */
  private constrainJointAngle(
    parentAngle: number,
    childAngle: number,
    minRelative: number,
    maxRelative: number
  ): number {
    let diff = childAngle - parentAngle
    
    // Normalize to [-PI, PI]
    while (diff > Math.PI) diff -= 2 * Math.PI
    while (diff < -Math.PI) diff += 2 * Math.PI
    
    // Clamp
    const clampedDiff = Math.max(minRelative, Math.min(maxRelative, diff))
    
    return parentAngle + clampedDiff
  }

  /**
   * 使用 FK 计算腿部角度
   */
  private computeLegAnglesFK(
    landmarks: PoseLandmarks,
    calibration: CalibrationData | null,
    angles: PartAngles
  ): void {
    // 左腿（大腿）
    const leftThighAngle = this.computeJointAngle(
      landmarks,
      LANDMARK_INDEX.LEFT_HIP,
      LANDMARK_INDEX.LEFT_KNEE,
      calibration?.referencePose
    )
    if (leftThighAngle !== null) {
      angles['left-thigh'] = leftThighAngle
    }

    // 左脚（小腿）
    const leftFootAngle = this.computeJointAngle(
      landmarks,
      LANDMARK_INDEX.LEFT_KNEE,
      LANDMARK_INDEX.LEFT_ANKLE,
      calibration?.referencePose
    )
    if (leftFootAngle !== null) {
      angles['left-foot'] = leftFootAngle
    }

    // 右腿（大腿）
    const rightThighAngle = this.computeJointAngle(
      landmarks,
      LANDMARK_INDEX.RIGHT_HIP,
      LANDMARK_INDEX.RIGHT_KNEE,
      calibration?.referencePose
    )
    if (rightThighAngle !== null) {
      angles['right-thigh'] = rightThighAngle
    }

    // 右脚（小腿）
    const rightFootAngle = this.computeJointAngle(
      landmarks,
      LANDMARK_INDEX.RIGHT_KNEE,
      LANDMARK_INDEX.RIGHT_ANKLE,
      calibration?.referencePose
    )
    if (rightFootAngle !== null) {
      angles['right-foot'] = rightFootAngle
    }
  }

  /**
   * 获取当前朝向
   */
  getFacing(): Facing {
    return this.turnStateMachine.getFacing()
  }

  /**
   * 手动设置朝向
   */
  setFacing(facing: Facing): void {
    this.turnStateMachine.setFacing(facing)
  }

  /**
   * 获取当前缩放
   */
  getScale(): number {
    return this.scaleProcessor.getScale()
  }

  /**
   * 获取各模块的调试信息
   */
  getDebugInfo(): {
    filter: ReturnType<PoseFilter['getStats']>
    turn: ReturnType<TurnStateMachine['getDebugInfo']>
    scale: ReturnType<ScaleProcessor['getDebugInfo']>
    leg: ReturnType<LegProcessor['getDebugInfo']>
    ik: ReturnType<IKSolver['getDebugInfo']>
    secondary: ReturnType<SecondaryMotion['getDebugInfo']>
    frameCount: number
    lastProcessTime: number
    isCalibrated: boolean
  } {
    return {
      filter: this.poseFilter.getStats(),
      turn: this.turnStateMachine.getDebugInfo(),
      scale: this.scaleProcessor.getDebugInfo(),
      leg: this.legProcessor.getDebugInfo(),
      ik: this.ikSolver.getDebugInfo(),
      secondary: this.secondaryMotion.getDebugInfo(),
      frameCount: this.frameCount,
      lastProcessTime: this.lastProcessTime,
      isCalibrated: this.calibrationManager.isCalibrated(),
    }
  }

  /**
   * 获取各模块实例（用于高级用法）
   */
  getModules(): {
    calibration: CalibrationManager
    filter: PoseFilter
    turn: TurnStateMachine
    scale: ScaleProcessor
    leg: LegProcessor
    ik: IKSolver
    secondary: SecondaryMotion
  } {
    return {
      calibration: this.calibrationManager,
      filter: this.poseFilter,
      turn: this.turnStateMachine,
      scale: this.scaleProcessor,
      leg: this.legProcessor,
      ik: this.ikSolver,
      secondary: this.secondaryMotion,
    }
  }
}





