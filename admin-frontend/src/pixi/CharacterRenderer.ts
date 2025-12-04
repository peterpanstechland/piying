/**
 * PixiJS Character Renderer
 * Renders shadow puppet characters with pose-driven animation
 * 
 * Uses hierarchical bone structure to ensure limbs stay connected:
 * - body (root)
 *   - head
 *   - left-arm
 *     - left-hand
 *   - right-arm
 *     - right-hand
 *   - upper-leg
 *     - left-foot
 *     - right-foot
 */
import {
  Application,
  Container,
  Sprite,
  Texture,
  Assets,
  Rectangle,
  Graphics,
  Text,
  TextStyle,
} from 'pixi.js'
import type {
  CharacterConfig,
  SpritesheetData,
  PoseLandmarks,
  FrameData,
} from './types'
import type { ProcessedPose, PartAngles, Facing } from '../pose/types'

// Extended frame data with assembly info and animation config
interface FrameDataWithAssembly extends FrameData {
  assembly?: {
    x: number
    y: number
    width: number
    height: number
  }
  // Joint pivot for rotation animation (关节锚点)
  jointPivot?: {
    x: number
    y: number
  }
  // Rotation offset based on sprite orientation (旋转偏移量)
  rotationOffset?: number
}

// Bone hierarchy: child -> parent
// Used for calculating hand positions that follow arm rotation
const BONE_HIERARCHY: Record<string, string | null> = {
  'body': null,           // root node
  'head': 'body',
  'left-arm': 'body',
  'right-arm': 'body',
  'left-hand': 'left-arm',   // hand follows arm
  'right-hand': 'right-arm',
  // 裙子（一体式下身）
  'skirt': 'body',
  // 左右大腿（分体式下身）
  'left-thigh': 'body',
  'right-thigh': 'body',
  // 脚跟随下身部件
  'left-foot': null,  // 动态确定：skirt 或 left-thigh
  'right-foot': null, // 动态确定：skirt 或 right-thigh
}

// Export to prevent unused variable error
export { BONE_HIERARCHY }

// 默认关节锚点 (0-1)，当 spritesheet.json 中没有配置时使用
const DEFAULT_JOINT_PIVOTS: Record<string, { x: number; y: number }> = {
  'head': { x: 0.5, y: 0.9 },       // 脖子处（头部底部）
  'body': { x: 0.5, y: 0.5 },       // 身体中心
  'left-arm': { x: 0.5, y: 0.1 },   // 左肩
  'right-arm': { x: 0.5, y: 0.1 },  // 右肩
  'left-hand': { x: 0.9, y: 0.5 },  // 左手腕
  'right-hand': { x: 0.1, y: 0.5 }, // 右手腕
  'skirt': { x: 0.5, y: 0.1 },      // 裙子顶部
  'left-thigh': { x: 0.5, y: 0.1 }, // 左大腿顶部
  'right-thigh': { x: 0.5, y: 0.1 },// 右大腿顶部
  'left-foot': { x: 0.5, y: 0.1 },  // 脚踝
  'right-foot': { x: 0.5, y: 0.1 }, // 脚踝
}

// 默认旋转偏移量（弧度），当 spritesheet.json 中没有配置时使用
// 这个值表示素材的"自然朝向"与"水平向右"之间的角度差
// 
// MediaPipe 角度计算：atan2(dy, dx)，水平向右为 0 度
// 
// 嫦娥素材特殊性：
// 1. 左臂/左手是【水平向左】画的（指向 180度/PI）
// 2. 右臂/右手是【水平向右】画的（指向 0度）
// 3. 但我们希望默认状态（Rotation=0）是【垂直向下】（90度/PI/2）
//
// 修正逻辑（基于 updatePose 中的公式：finalRotation = absoluteAngle - rotationOffset）：
// - 左臂：素材指向 PI，目标是让 0 度输入时显示为垂直向下（PI/2）
//   需要 offset = PI，这样当 absoluteAngle = PI/2 时，finalRotation = PI/2 - PI = -PI/2（向下）
// - 右臂：素材指向 0，目标是让 0 度输入时显示为垂直向下（PI/2）
//   需要 offset = -PI/2，这样当 absoluteAngle = PI/2 时，finalRotation = PI/2 - (-PI/2) = PI（需要调整）
//
// 实际测试后的修正值：
const DEFAULT_ROTATION_OFFSETS: Record<string, number> = {
  'head': 0,                    // 头部不旋转
  'body': 0,                    // 身体不旋转
  // 手臂和手的默认偏移设为 0，让配置文件中的值生效
  // 如果配置文件没有设置，则不做额外偏移
  'left-arm': 0,
  'right-arm': 0,
  'left-hand': 0,
  'right-hand': 0,
  // 裙子（一体式下身）- 通常不旋转
  'skirt': 0,
  // 左右大腿（分体式下身）
  'left-thigh': 0,
  'right-thigh': 0,
  'left-foot': 0,
  'right-foot': 0,
}

// 默认初始姿势偏移量（弧度）
// 这个值表示素材默认姿势与"自然垂下"姿势之间的角度差
// 
// 注意：现在通过"默认姿势编辑器"让用户自己设置每个角色的偏移量
// 这里只保留空的默认值，具体值由用户在编辑器中配置并保存到角色配置中
//
// 在 PixiJS 中（Y轴向下）：
// - 负值 = 逆时针旋转 = 通常是手臂向下
// - 正值 = 顺时针旋转 = 通常是手臂向上
const DEFAULT_REST_POSE_OFFSETS: Record<string, number> = {
  // 所有部件默认为 0，由用户通过编辑器设置具体值
}

/**
 * 皮影部件默认 Z-Index 层级系统
 * 
 * 皮影戏的层级逻辑（从后到前）- 三明治结构：
 * 
 *   【前面的手臂/手】 - 最顶层
 *         ↓
 *   【背后的手臂/手】 - 也在头部前面！
 *         ↓
 *       【头部】
 *         ↓
 *       【身体】
 *         ↓
 *     【腿/脚】 - 最底层
 * 
 * 关键点：所有手臂都在头部前面，这样无论哪只手举起来都不会被头"穿模"
 * 
 * "背后"和"前面"取决于角色的朝向：
 * - 面朝右：左侧肢体在背后，右侧在前面
 * - 面朝左：右侧肢体在背后，左侧在前面
 */
const Z_INDEX_LAYERS = {
  BACK_LEG: -20,    // 背后的腿/脚
  FRONT_LEG: -15,   // 前面的腿/脚（也在身体后面）
  BODY: 0,          // 身体
  HEAD: 10,         // 头部
  BACK_ARM: 15,     // 背后的手臂（在头部前面！）
  BACK_HAND: 16,    // 背后的手
  FRONT_ARM: 20,    // 前面的手臂（最顶层）
  FRONT_HAND: 22,   // 前面的手
}

/**
 * 根据角色朝向计算部件的 z-index
 * 这是一个通用函数，适用于所有皮影角色
 * 
 * 三明治结构：
 * - 所有手臂/手都在头部前面（避免举手时穿模）
 * - 前面的手臂在背后的手臂前面（保持前后关系）
 * - 腿/脚在身体后面
 */
function calculatePartZIndex(partName: string, defaultFacing: CharacterFacing): number {
  // 判断是否为"背后"部件
  // 面朝右：左侧是背后；面朝左：右侧是背后
  const isBackSide = (defaultFacing === 'right' && partName.startsWith('left-')) ||
                     (defaultFacing === 'left' && partName.startsWith('right-'))
  
  // 根据部件类型和前后位置返回 z-index
  if (partName === 'head') {
    return Z_INDEX_LAYERS.HEAD
  }
  if (partName === 'body') {
    return Z_INDEX_LAYERS.BODY
  }
  // 手臂：都在头部前面，但前面的手臂在背后的手臂前面
  if (partName.includes('arm')) {
    return isBackSide ? Z_INDEX_LAYERS.BACK_ARM : Z_INDEX_LAYERS.FRONT_ARM
  }
  if (partName.includes('hand')) {
    return isBackSide ? Z_INDEX_LAYERS.BACK_HAND : Z_INDEX_LAYERS.FRONT_HAND
  }
  // 腿部：都在身体后面
  if (partName.includes('thigh') || partName.includes('leg') || partName === 'skirt') {
    return isBackSide ? Z_INDEX_LAYERS.BACK_LEG : Z_INDEX_LAYERS.FRONT_LEG
  }
  if (partName.includes('foot')) {
    // 脚在大腿后面一点
    return isBackSide ? Z_INDEX_LAYERS.BACK_LEG - 2 : Z_INDEX_LAYERS.FRONT_LEG - 2
  }
  
  // 默认：与身体同层
  return Z_INDEX_LAYERS.BODY
}

// 角色朝向类型
export type CharacterFacing = 'left' | 'right'

export class CharacterRenderer {
  private app: Application | null = null
  private container: Container | null = null
  private parts: Map<string, Sprite> = new Map()
  private partContainers: Map<string, Container> = new Map()  // Containers for hierarchical structure
  private config: CharacterConfig | null = null
  private spritesheetData: SpritesheetData | null = null
  private baseTexture: Texture | null = null
  private initialized = false
  private showStaticPose = true  // Whether to show static pose when no detection
  
  // 角色默认朝向（素材绘制时的朝向）
  // 'left' = 角色面向左（如嫦娥），'right' = 角色面向右
  private defaultFacing: CharacterFacing = 'left'

  // Store assembly data for position calculations
  private assemblyData: Map<string, { x: number, y: number, width: number, height: number }> = new Map()
  private globalScale = 1

  // Reference pose for calculating relative transforms
  private referencePose: PoseLandmarks | null = null
  private useReferencePose = false

  // Bone mapping for handling facing direction
  // Maps PoseProcessor part names (user perspective) to Character part names
  private boneMap: Record<string, string> = {}

  /**
   * Initialize the PixiJS application
   */
  async init(canvas: HTMLCanvasElement, width: number, height: number): Promise<void> {
    console.log('CharacterRenderer.init called, initialized:', this.initialized)
    
    // 如果已经初始化过，先销毁
    if (this.initialized || this.app) {
      console.log('Destroying previous instance...')
      await this.destroy()
      console.log('Previous instance destroyed')
    }

    console.log('Creating new PixiJS Application...')
    
    // 创建新的 Application 实例
    const app = new Application()
    
    console.log('Calling app.init...')
    await app.init({
      canvas,
      width,
      height,
      backgroundColor: 0x1a1a2e,
      antialias: true,
      resolution: window.devicePixelRatio || 1,
      autoDensity: true,
    })
    console.log('app.init completed, stage:', app.stage)

    // 确保 app.stage 存在
    if (!app.stage) {
      app.destroy()
      throw new Error('PixiJS Application stage not initialized')
    }

    // 初始化成功后再赋值给实例变量
    this.app = app
    this.container = new Container()
    this.container.x = width / 2
    this.container.y = height / 2
    // 开启 Z轴排序，防止层级错乱
    this.container.sortableChildren = true
    this.app.stage.addChild(this.container)

    this.initialized = true
    console.log('CharacterRenderer.init completed successfully')
  }

  /**
   * Load character from config URL
   */
  async loadCharacter(configUrl: string): Promise<void> {
    if (!this.app || !this.container) {
      throw new Error('Renderer not initialized')
    }

    console.log('=== loadCharacter START ===')
    console.log('Container children BEFORE clear:', this.container.children.length)
    console.log('Parts map size BEFORE clear:', this.parts.size)

    // Clear existing parts
    this.clearParts()
    
    console.log('Container children AFTER clear:', this.container.children.length)
    console.log('Parts map size AFTER clear:', this.parts.size)

    // Load config
    const configResponse = await fetch(configUrl)
    this.config = await configResponse.json()

    if (!this.config) {
      throw new Error('Failed to load character config')
    }

    console.log('=== Loaded Character Config ===')
    console.log('defaultFacing:', this.config.defaultFacing)
    console.log('restPoseOffsets:', this.config.restPoseOffsets)

    // 设置角色默认朝向
    if (this.config.defaultFacing) {
      this.defaultFacing = this.config.defaultFacing as CharacterFacing
      console.log('Set defaultFacing to:', this.defaultFacing)
    } else {
      console.warn('No defaultFacing in config, using default:', this.defaultFacing)
    }
    
    // 更新骨骼映射
    this.updateBoneMap()
    console.log('Bone Map updated:', this.boneMap)

    // Load spritesheet JSON
    const sheetResponse = await fetch(this.config.spritesheet)
    this.spritesheetData = await sheetResponse.json()

    // Load spritesheet image
    this.baseTexture = await Assets.load(this.config.spritesheetImage)

    // Step 1: Create all sprites and their containers
    const tempSprites: Map<string, { sprite: Sprite, container: Container }> = new Map()
    
    for (const partName of this.config.renderOrder) {
      const frameData = this.spritesheetData?.frames[partName] as FrameDataWithAssembly
      if (!frameData || !this.baseTexture) continue

      // Create texture from spritesheet region
      const texture = new Texture({
        source: this.baseTexture.source,
        frame: new Rectangle(
          frameData.frame.x,
          frameData.frame.y,
          frameData.frame.w,
          frameData.frame.h
        ),
      })

      const sprite = new Sprite(texture)

      // 使用 JSON 中配置的 jointPivot（关节锚点），否则用默认值
      const jointPivot = frameData.jointPivot
      const defaultPivot = DEFAULT_JOINT_PIVOTS[partName]
      const pivotX = jointPivot?.x ?? defaultPivot?.x ?? frameData.pivot?.x ?? 0.5
      const pivotY = jointPivot?.y ?? defaultPivot?.y ?? frameData.pivot?.y ?? 0.5
      sprite.anchor.set(pivotX, pivotY)

      // Create a container for this part (for hierarchical transforms)
      const partContainer = new Container()
      partContainer.addChild(sprite)
      
      // 应用 Z-Index：使用通用的层级计算函数
      // 如果配置中有指定 zIndex，优先使用配置值；否则使用自动计算的值
      const configZIndex = frameData.zIndex
      const calculatedZIndex = calculatePartZIndex(partName, this.defaultFacing)
      const zIndex = configZIndex !== undefined ? configZIndex : calculatedZIndex
      
      if (partName.includes('arm') || partName.includes('hand') || partName === 'head') {
        console.log(`  Z-Index: ${partName} = ${zIndex} (config: ${configZIndex}, calculated: ${calculatedZIndex}, facing: ${this.defaultFacing})`)
      }
      
      partContainer.zIndex = zIndex
      
      // Store assembly data for later calculations
      if (frameData.assembly) {
        this.assemblyData.set(partName, {
          x: frameData.assembly.x,
          y: frameData.assembly.y,
          width: frameData.assembly.width || frameData.frame.w,
          height: frameData.assembly.height || frameData.frame.h,
        })
      }

      tempSprites.set(partName, { sprite, container: partContainer })
      this.parts.set(partName, sprite)
      this.partContainers.set(partName, partContainer)
    }

    // Step 2: Add all containers directly to main container (FLAT structure)
    // We handle parent-child relationships in updatePose by calculating positions
    console.log('Adding', tempSprites.size, 'containers to main container (flat)')
    for (const [partName, { container }] of tempSprites) {
      this.container.addChild(container)
      console.log('Added', partName, 'to root')
    }
    console.log('Container children AFTER adding:', this.container.children.length)

    // Position parts in default pose with hierarchy
    this.resetPose()
    console.log('=== loadCharacter END ===')
    
    // Apply initial visibility based on showStaticPose setting
    this.container.visible = this.showStaticPose
    console.log('Character loaded with hierarchy:', {
      showStaticPose: this.showStaticPose,
      partsCount: this.parts.size,
      parts: Array.from(this.parts.keys()),
      bindings: this.config.bindings,
      hasBindings: Object.keys(this.config.bindings).length > 0,
    })
  }


  /**
   * Reset parts to assembled pose (using saved assembly coordinates)
   * 
   * With hierarchical structure:
   * 1. Calculate global positions for all parts
   * 2. Convert to local positions relative to parent
   * 3. Position containers (not sprites) for proper hierarchy
   */
  resetPose(): void {
    if (!this.config || !this.spritesheetData || !this.app) return

    // Calculate bounding box of all assembly positions
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    let hasAssemblyData = false

    for (const partName of this.config.renderOrder) {
      const frameData = this.spritesheetData.frames[partName] as FrameDataWithAssembly
      if (frameData?.assembly?.x != null) {
        hasAssemblyData = true
        const ax = frameData.assembly.x
        const ay = frameData.assembly.y
        const aw = frameData.assembly.width || frameData.frame.w
        const ah = frameData.assembly.height || frameData.frame.h
        minX = Math.min(minX, ax)
        minY = Math.min(minY, ay)
        maxX = Math.max(maxX, ax + aw)
        maxY = Math.max(maxY, ay + ah)
      }
    }

    // Calculate scale to fit in canvas with padding
    const contentWidth = hasAssemblyData ? maxX - minX : 400
    const contentHeight = hasAssemblyData ? maxY - minY : 600
    const canvasWidth = this.app.screen.width
    const canvasHeight = this.app.screen.height
    const padding = 40
    
    const scaleX = (canvasWidth - padding * 2) / contentWidth
    const scaleY = (canvasHeight - padding * 2) / contentHeight
    this.globalScale = Math.min(scaleX, scaleY, 1.5) // Allow scaling up to 1.5x for better visibility

    // Calculate center offset
    const centerX = hasAssemblyData ? (minX + maxX) / 2 : 0
    const centerY = hasAssemblyData ? (minY + maxY) / 2 : 0

    // Fallback positions if no assembly data
    const fallbackPositions: Record<string, { x: number; y: number }> = {
      head: { x: 0, y: -150 },
      body: { x: 0, y: 0 },
      'left-arm': { x: -80, y: -50 },
      'right-arm': { x: 80, y: -50 },
      'left-hand': { x: -120, y: 20 },
      'right-hand': { x: 120, y: 20 },
      'upper-leg': { x: 0, y: 100 },
      'left-foot': { x: -40, y: 180 },
      'right-foot': { x: 40, y: 180 },
    }

    // Step 1: Calculate global (world) positions for all parts
    const globalPositions: Map<string, { x: number, y: number, width: number, height: number, scaleX: number, scaleY: number }> = new Map()

    for (const [partName] of this.parts) {
      const frameData = this.spritesheetData.frames[partName] as FrameDataWithAssembly
      
      let posX: number, posY: number, partScaleX: number, partScaleY: number
      let width: number, height: number
      
      if (frameData?.assembly?.x != null) {
        const ax = frameData.assembly.x
        const ay = frameData.assembly.y
        const aw = frameData.assembly.width || frameData.frame.w
        const ah = frameData.assembly.height || frameData.frame.h
        
        // 使用 jointPivot（关节锚点）计算位置，与 sprite.anchor 保持一致
        const jointPivot = frameData.jointPivot
        const defaultPivot = DEFAULT_JOINT_PIVOTS[partName]
        const pivotX = jointPivot?.x ?? defaultPivot?.x ?? frameData.pivot?.x ?? 0.5
        const pivotY = jointPivot?.y ?? defaultPivot?.y ?? frameData.pivot?.y ?? 0.5
        // 公式：位置 = (Assembly左上角 + 宽*Pivot - 中心点) * 缩放
        posX = (ax + aw * pivotX - centerX) * this.globalScale
        posY = (ay + ah * pivotY - centerY) * this.globalScale
        
        // Apply scale
        partScaleX = (aw / frameData.frame.w) * this.globalScale
        partScaleY = (ah / frameData.frame.h) * this.globalScale
        width = aw * this.globalScale
        height = ah * this.globalScale
      } else {
        const pos = fallbackPositions[partName] || { x: 0, y: 0 }
        posX = pos.x
        posY = pos.y
        partScaleX = 0.5
        partScaleY = 0.5
        width = frameData ? frameData.frame.w * 0.5 : 100
        height = frameData ? frameData.frame.h * 0.5 : 100
      }
      
      globalPositions.set(partName, { x: posX, y: posY, width, height, scaleX: partScaleX, scaleY: partScaleY })
    }

    // Step 2: Position all parts using global coordinates (flat structure)
    // Also save initial positions for child-parent calculations
    this.initialPositions.clear()
    
    for (const [partName, sprite] of this.parts) {
      const container = this.partContainers.get(partName)
      if (!container) continue

      const globalPos = globalPositions.get(partName)
      if (!globalPos) continue

      // Set sprite scale (sprite is at origin of its container)
      sprite.scale.set(globalPos.scaleX, globalPos.scaleY)
      sprite.position.set(0, 0)  // Sprite at container origin
      // 应用初始姿势偏移量（使用 getRestPoseOffset 以支持默认值）
      const restOffset = this.getRestPoseOffset(partName)
      sprite.rotation = restOffset

      // Use global position directly (flat structure)
      container.position.set(globalPos.x, globalPos.y)
      container.rotation = 0
      
      // Save initial position for child-parent calculations
      this.initialPositions.set(partName, { x: globalPos.x, y: globalPos.y })
    }

    // 更新子部件位置（手跟随手臂）
    this.updateChildPositions(false)
  }

  /**
   * Set reference pose for relative transforms
   */
  setReferencePose(landmarks: PoseLandmarks): void {
    this.referencePose = landmarks
    this.useReferencePose = true
  }

  /**
   * Clear reference pose
   */
  clearReferencePose(): void {
    this.referencePose = null
    this.useReferencePose = false
    this.isFlying = false // 重置飞行状态
  }

  // Default rotation bindings for parts (MediaPipe Pose landmarks)
  // Maps part name to [startLandmark, endLandmark] for rotation calculation
  // 0: nose, 11: left_shoulder, 12: right_shoulder, 13: left_elbow, 14: right_elbow
  // 15: left_wrist, 16: right_wrist, 23: left_hip, 24: right_hip, 25: left_knee, 26: right_knee
  private static DEFAULT_ROTATION_BINDINGS: Record<string, [number, number] | null> = {
    'head': [0, 0],            // 头部使用特殊处理（鼻子到肩膀中点）
    'body': [11, 23],          // 身体：左肩到左髋
    'left-arm': [11, 13],      // left shoulder to left elbow
    'right-arm': [12, 14],     // right shoulder to right elbow
    'left-hand': [13, 15],     // left elbow to left wrist
    'right-hand': [14, 16],    // right elbow to right wrist
    // 裙子（一体式下身）- 不旋转
    'skirt': null,
    // 左右大腿（分体式下身）
    'left-thigh': [23, 25],    // left hip to left knee
    'right-thigh': [24, 26],   // right hip to right knee
    'left-foot': null,         // feet don't rotate
    'right-foot': null,        // feet don't rotate
  }

  // Rotation limits for parts (in radians)
  // Format: [minAngle, maxAngle] relative to default pose
  private static readonly ROTATION_LIMITS: Record<string, [number, number] | null> = {
    'head': null,
    'body': null,
    'left-arm': null,          // arms can rotate freely
    'right-arm': null,
    'left-hand': null,
    'right-hand': null,
    // 裙子不旋转
    'skirt': null,
    // 左右大腿有旋转限制
    'left-thigh': [-Math.PI / 4, Math.PI / 4],   // ±45 degrees
    'right-thigh': [-Math.PI / 4, Math.PI / 4],  // ±45 degrees
    'left-foot': null,
    'right-foot': null,
  }

  // Store absolute angles for each part (used for relative rotation calculation)
  private absoluteAngles: Map<string, number> = new Map()

  /**
   * Update character pose from MediaPipe landmarks
   * 
   * With hierarchical structure:
   * 1. Overall scale and position based on detected body
   * 2. Calculate ABSOLUTE angles from MediaPipe for all parts
   * 3. Convert to RELATIVE angles for child parts (subtract parent's absolute angle)
   * 4. Rotate CONTAINERS (not sprites) so children follow parent rotation
   */
  // Frame counter for debugging
  private frameCount = 0

  updatePose(landmarks: PoseLandmarks | null): void {
    this.frameCount++
    
    // Debug: log every 120 frames (about once per 2 seconds)
    const shouldLog = this.frameCount % 120 === 0

    if (shouldLog) {
      console.log('[updatePose] Called, frame:', this.frameCount, 'hasLandmarks:', !!landmarks)
    }

    if (!this.config || !this.app || !this.spritesheetData || !this.container) {
      if (shouldLog) {
        console.warn('[updatePose] Early return - missing:', {
          config: !!this.config,
          app: !!this.app,
          spritesheetData: !!this.spritesheetData,
          container: !!this.container
        })
      }
      return
    }

    // If no landmarks, show/hide based on showStaticPose setting
    if (!landmarks) {
      this.container.visible = this.showStaticPose
      if (shouldLog) {
        console.log('[updatePose] No landmarks, showStaticPose:', this.showStaticPose)
      }
      return
    }

    // Always show container when we have pose data
    this.container.visible = true
    
    if (shouldLog) {
      console.log('[updatePose] Processing pose with', landmarks.length, 'landmarks')
    }

    // Get shoulder landmarks for body reference
    const leftShoulder = landmarks[11]
    const rightShoulder = landmarks[12]
    
    if (!leftShoulder || !rightShoulder) {
      this.container.visible = this.showStaticPose
      return
    }

    // Keep the character centered and at a fixed scale
    // Don't move/scale based on body position - just rotate the parts
    const canvasWidth = this.app.screen.width
    const canvasHeight = this.app.screen.height
    this.container.x = canvasWidth / 2
    this.container.y = canvasHeight / 2
    // Use the global scale from resetPose, don't change it based on detection
    // this.container.scale is already set in resetPose()

    // Check if we have custom bindings configured (may be empty object or have empty arrays)
    const hasValidBindings = this.config.bindings && 
      Object.keys(this.config.bindings).length > 0 &&
      Object.values(this.config.bindings).some(
        (b) => b.landmarks && b.landmarks.length > 0
      )

    // Clear previous absolute angles
    this.absoluteAngles.clear()

    const shouldLogFrame = this.frameCount % 60 === 0

    if (shouldLogFrame) {
      console.log('Parts:', Array.from(this.parts.keys()))
      console.log('hasValidBindings:', hasValidBindings)
    }

    // Calculate body center for arm rotation reference
    const bodyCenter = {
      x: (leftShoulder.x + rightShoulder.x) / 2,
      y: (leftShoulder.y + rightShoulder.y) / 2
    }

    // Step 1: Calculate absolute angles for all parts first
    for (const [partName] of this.parts) {
      const rotationBinding = this.getRotationBinding(partName, hasValidBindings)
      
      if (shouldLogFrame && rotationBinding) {
        console.log(`${partName} has binding: [${rotationBinding[0]}, ${rotationBinding[1]}]`)
      }
      
      if (rotationBinding) {
        const [startIdx, endIdx] = rotationBinding
        const startLm = landmarks[startIdx]
        const endLm = landmarks[endIdx]
        
        if (shouldLogFrame) {
          console.log(`  ${partName}: start[${startIdx}] vis=${(startLm?.visibility ?? 0).toFixed(2)}, end[${endIdx}] vis=${(endLm?.visibility ?? 0).toFixed(2)}`)
        }
        
        if (startLm && endLm && 
            (startLm.visibility ?? 1) > 0.3 && 
            (endLm.visibility ?? 1) > 0.3) {
          let dx: number, dy: number
          
          // 头部特殊处理：从肩膀中点到鼻子
          if (partName === 'head') {
            const nose = landmarks[0]
            if (nose && (nose.visibility ?? 1) > 0.3) {
              dx = nose.x - bodyCenter.x
              dy = nose.y - bodyCenter.y
            } else {
              continue
            }
          } else {
            // 计算从起点到终点的向量
            dx = endLm.x - startLm.x
            dy = endLm.y - startLm.y
          }
          
          // 计算当前角度
          const currentAngle = Math.atan2(dy, dx)
          
          // 如果有参考姿势，计算相对角度
          let mediaPipeAngle = currentAngle
          if (this.useReferencePose && this.referencePose) {
            const refStartLm = this.referencePose[startIdx]
            const refEndLm = this.referencePose[endIdx]
            
            if (refStartLm && refEndLm) {
              const refDx = refEndLm.x - refStartLm.x
              const refDy = refEndLm.y - refStartLm.y
              const referenceAngle = Math.atan2(refDy, refDx)
              
              // 计算相对于参考姿势的角度变化
              // 注意：这里不取反，在应用时再取反
              mediaPipeAngle = currentAngle - referenceAngle
              
              if (shouldLogFrame) {
                console.log(`  ${partName}: current=${(currentAngle * 180 / Math.PI).toFixed(1)}° ref=${(referenceAngle * 180 / Math.PI).toFixed(1)}° delta=${(mediaPipeAngle * 180 / Math.PI).toFixed(1)}°`)
              }
            }
          }
          
          this.absoluteAngles.set(partName, mediaPipeAngle)
          
          if (shouldLogFrame && !this.useReferencePose) {
            console.log(`  -> MediaPipe Angle: ${(mediaPipeAngle * 180 / Math.PI).toFixed(1)}°`)
          }
        }
      }
    }

    if (shouldLogFrame) {
      console.log('Calculated angles:', Object.fromEntries(this.absoluteAngles))
    }

    // Step 2: Apply rotations to SPRITES
    // 旋转公式: sprite.rotation = mediaPipeAngle - restPoseOffset + rotationOffset
    // - mediaPipeAngle: MediaPipe 检测到的当前角度
    // - restPoseOffset: 默认姿势下该部件的角度（作为基准）
    // - rotationOffset: 素材本身的朝向偏移（补偿素材绘制方向）
    for (const [partName, sprite] of this.parts) {
      const mediaPipeAngle = this.absoluteAngles.get(partName)
      
      if (mediaPipeAngle !== undefined) {
        let finalRotation: number
        
        if (this.useReferencePose) {
          // 使用参考姿势时，mediaPipeAngle 已经是相对角度
          const rotationOffset = this.getRotationOffset(partName)
          
          // 根据角色朝向和部件类型应用不同的角度处理
          const facingLeft = this.defaultFacing === 'left'
          
          if (partName.startsWith('left-')) {
            // 左侧部件：手臂、手、大腿等
            finalRotation = facingLeft ? -mediaPipeAngle : mediaPipeAngle
            finalRotation += rotationOffset
          } else if (partName.startsWith('right-')) {
            // 右侧部件：手臂、手、大腿等
            finalRotation = facingLeft ? mediaPipeAngle : -mediaPipeAngle
            finalRotation += rotationOffset
          } else if (partName === 'head' || partName === 'body') {
            // 头部和身体：根据朝向决定
            finalRotation = facingLeft ? mediaPipeAngle : -mediaPipeAngle
            finalRotation += rotationOffset
          } else {
            // 其他部件（裙子、脚等）
            finalRotation = facingLeft ? -mediaPipeAngle : mediaPipeAngle
            finalRotation += rotationOffset
          }
        } else {
          // 不使用参考姿势时，使用原来的公式
          const restPoseOffset = this.getRestPoseOffset(partName)
          const rotationOffset = this.getRotationOffset(partName)
          finalRotation = mediaPipeAngle - restPoseOffset + rotationOffset
        }
        
        // Apply rotation limits if defined
        const limits = CharacterRenderer.ROTATION_LIMITS[partName]
        if (limits) {
          const [minAngle, maxAngle] = limits
          finalRotation = Math.max(minAngle, Math.min(maxAngle, finalRotation))
        }
        
        // Apply rotation to sprite
        sprite.rotation = finalRotation
        
        if (shouldLogFrame) {
          console.log(`✓ ${partName}: MP=${(mediaPipeAngle * 180 / Math.PI).toFixed(1)}° final=${(finalRotation * 180 / Math.PI).toFixed(1)}°${limits ? ' (limited)' : ''}`)
        }
      }
    }

    // Step 3: Update foot positions based on ankle height (for leg lifting)
    if (this.useReferencePose && this.referencePose) {
      this.updateFootPositions(landmarks, shouldLogFrame)
    }
    
    // Step 4: Update child positions to follow parent rotation
    this.updateChildPositions(shouldLogFrame)
    
    if (shouldLogFrame) {
      console.log('=== End Frame ===\n')
    }
  }

  // Store initial hand offsets from arm (calculated in resetPose)
  // Store initial child offsets from parent (calculated on first update)
  private childOffsets: Map<string, { x: number; y: number }> = new Map()
  
  // Flying state management
  private isFlying: boolean = false

  /**
   * Update character pose from processed pipeline data
   * This is the preferred method when using PoseProcessor
   * 
   * @param processedPose The processed pose data from PoseProcessor
   */
  updatePoseFromProcessed(processedPose: ProcessedPose): void {
    this.frameCount++
    const shouldLog = this.frameCount % 120 === 0

    if (!this.config || !this.app || !this.spritesheetData || !this.container) {
      return
    }

    // If no landmarks, show/hide based on showStaticPose setting
    if (!processedPose.filteredLandmarks) {
      this.container.visible = this.showStaticPose
      return
    }

    // Always show container when we have pose data
    this.container.visible = true

    // Apply part angles from pipeline
    this.applyPartAngles(processedPose.partAngles, processedPose.isCalibrated, shouldLog)

    // Update foot positions based on leg state
    if (processedPose.legState) {
      this.updateFootFromLegState(processedPose)
    }

    // Update child positions to follow parent rotation
    this.updateChildPositions(shouldLog)

    if (shouldLog) {
      console.log('[updatePoseFromProcessed] Applied', Object.keys(processedPose.partAngles).length, 'angles, calibrated:', processedPose.isCalibrated)
    }
  }

  /**
   * Update bone mapping based on default facing
   * 
   * 建立从 PoseProcessor 标准输出（用户视角）到 Character 具体部件的映射。
   * 
   * 映射逻辑：
   * 1. 面向左的角色（defaultFacing = 'left'）：
   *    - 用户左手（画面右侧） -> 控制皮影左手（画面右侧/胸前）
   *    - 用户右手（画面左侧） -> 控制皮影右手（画面左侧/背后）
   *    - 映射：left->left, right->right
   * 
   * 2. 面向右的角色（defaultFacing = 'right'）：
   *    - 用户左手（画面右侧） -> 控制皮影右手（画面右侧/胸前）
   *    - 用户右手（画面左侧） -> 控制皮影左手（画面左侧/背后）
   *    - 映射：left->right, right->left
   * 
   * 通过这种映射，我们可以使用统一的动捕数据驱动不同朝向的角色，
   * 而无需在 PoseProcessor 中根据角色进行特殊处理。
   */
  private updateBoneMap(): void {
    this.boneMap = {}
    
    // Standard parts that might need swapping
    const standardParts = [
      'left-arm', 'right-arm',
      'left-hand', 'right-hand',
      'left-thigh', 'right-thigh',
      'left-foot', 'right-foot',
      'left-leg', 'right-leg'
    ]

    // Default mapping (Identity)
    for (const part of standardParts) {
      this.boneMap[part] = part
    }

    // If facing right, swap sides to match visual position
    if (this.defaultFacing === 'right') {
      for (const part of standardParts) {
        if (part.startsWith('left-')) {
          const rightPart = part.replace('left-', 'right-')
          this.boneMap[part] = rightPart
          this.boneMap[rightPart] = part
        }
      }
    }
  }

  /**
   * Map a source part name (from PoseProcessor) to a target part name (on Character)
   */
  private mapPartName(sourceName: string): string {
    return this.boneMap[sourceName] || sourceName
  }

  /**
   * Apply part angles directly (for manual control or external pipeline)
   * 
   * PoseProcessor 现在始终返回相对角度（相对于参考姿势的变化量）
   * 公式统一为：finalRotation = restPoseOffset + angle + rotationOffset
   * 
   * @param angles Record of part name to angle (in radians) - 相对角度
   * @param _isCalibrated 保留参数但不再使用（角度现在始终是相对的）
   * @param shouldLog Whether to log debug info
   */
  applyPartAngles(angles: PartAngles, _isCalibrated: boolean = false, shouldLog: boolean = false): void {
    // 每 60 帧记录一次详细日志
    const logMapping = this.frameCount % 60 === 1
    
    if (logMapping) {
      console.log('=== applyPartAngles Debug ===')
      console.log('defaultFacing:', this.defaultFacing)
    }
    
    for (const [sourcePartName, angle] of Object.entries(angles)) {
      // 使用映射逻辑获取目标部件名
      const targetPartName = this.mapPartName(sourcePartName)
      
      // 详细日志：每次映射
      if (logMapping && (sourcePartName.includes('arm') || sourcePartName.includes('hand'))) {
        console.log(`  MAP: "${sourcePartName}" -> "${targetPartName}"`)
      }

      const sprite = this.parts.get(targetPartName)
      if (!sprite) {
        if (logMapping) console.log(`  SKIP: sprite not found for "${targetPartName}"`)
        continue
      }

      const restPoseOffset = this.getRestPoseOffset(targetPartName)
      const rotationOffset = this.getRotationOffset(targetPartName)
      
      // 根据角色朝向决定是否取反角度
      // 
      // 原理：
      // - PoseProcessor 输出的角度变化（抬起时）是正值
      // - 面朝左的角色：向前抬 = 顺时针 = 正值 -> 不需要取反
      // - 面朝右的角色：向前抬 = 逆时针 = 负值 -> 需要取反
      // 
      // 这是因为两个朝向的角色在屏幕上是镜像的，它们的"向前"方向相反
      const needsInversion = this.defaultFacing === 'right'
      const adjustedAngle = needsInversion ? -angle : angle
      
      if (logMapping && (sourcePartName.includes('arm') || sourcePartName.includes('hand'))) {
        console.log(`  APPLY: target="${targetPartName}" needsInversion=${needsInversion} angle=${(angle * 180 / Math.PI).toFixed(1)}° -> adjusted=${(adjustedAngle * 180 / Math.PI).toFixed(1)}°`)
      }
      
      const finalRotation = restPoseOffset + adjustedAngle + rotationOffset

      const limits = CharacterRenderer.ROTATION_LIMITS[targetPartName]
      if (limits) {
        const [minAngle, maxAngle] = limits
        sprite.rotation = Math.max(minAngle, Math.min(maxAngle, finalRotation))
      } else {
        sprite.rotation = finalRotation
      }

      if (shouldLog) {
        console.log(`  ${targetPartName} (src:${sourcePartName}): angle=${(angle * 180 / Math.PI).toFixed(1)}° adjusted=${(adjustedAngle * 180 / Math.PI).toFixed(1)}° rest=${(restPoseOffset * 180 / Math.PI).toFixed(1)}° offset=${(rotationOffset * 180 / Math.PI).toFixed(1)}° final=${(sprite.rotation * 180 / Math.PI).toFixed(1)}°`)
      }
    }
  }

  /**
   * Update foot positions based on leg state from pipeline
   */
  private updateFootFromLegState(processedPose: ProcessedPose): void {
    const { legState } = processedPose
    if (!legState) return

    const leftFootContainer = this.partContainers.get('left-foot')
    const rightFootContainer = this.partContainers.get('right-foot')

    if (!leftFootContainer || !rightFootContainer) return
    if (!this.initialPositions.has('left-foot') || !this.initialPositions.has('right-foot')) return

    const leftInitialPos = this.initialPositions.get('left-foot')!
    const rightInitialPos = this.initialPositions.get('right-foot')!

    // Update flying state from pipeline
    this.isFlying = legState.isFlying

    if (legState.isFlying) {
      // Flying state: both feet raised
      const flyingOffset = 80
      leftFootContainer.y = leftInitialPos.y - flyingOffset
      rightFootContainer.y = rightInitialPos.y - flyingOffset
    } else if (legState.left.isLifted || legState.right.isLifted) {
      // Walking state: one foot lifted
      if (legState.left.isLifted && !legState.right.isLifted) {
        const yOffset = legState.left.ankleHeightDelta * 2000
        leftFootContainer.y = leftInitialPos.y - Math.max(0, yOffset)
        rightFootContainer.y = rightInitialPos.y
      } else if (legState.right.isLifted && !legState.left.isLifted) {
        const yOffset = legState.right.ankleHeightDelta * 2000
        rightFootContainer.y = rightInitialPos.y - Math.max(0, yOffset)
        leftFootContainer.y = leftInitialPos.y
      } else {
        // Both lifted but not flying (shouldn't happen often)
        leftFootContainer.y = leftInitialPos.y
        rightFootContainer.y = rightInitialPos.y
      }
    } else {
      // Standing state: restore initial positions
      leftFootContainer.y = leftInitialPos.y
      rightFootContainer.y = rightInitialPos.y
    }
  }

  /**
   * Set character facing direction (called from PoseProcessor turn state)
   * 
   * @param facing 'left' or 'right'
   * @param animated Whether to animate the turn
   * @param duration Animation duration in milliseconds
   */
  setFacingDirection(facing: Facing, animated: boolean = false, duration: number = 300): void {
    if (!this.container) return

    // Determine if we need to be in flipped state (scale.x < 0)
    // If default facing is 'left':
    //   target 'left'  -> not flipped (scale.x > 0)
    //   target 'right' -> flipped (scale.x < 0)
    // If default facing is 'right':
    //   target 'right' -> not flipped (scale.x > 0)
    //   target 'left'  -> flipped (scale.x < 0)
    
    const shouldBeFlipped = facing !== this.defaultFacing
    const currentlyFlipped = this.container.scale.x < 0

    if (currentlyFlipped === shouldBeFlipped) return

    if (animated) {
      this.turnAroundAnimated(duration)
    } else {
      this.turnAround()
    }
  }

  /**
   * Update foot positions based on ankle height changes
   * State machine:
   * - Standing → Jump detected → Flying (stays flying)
   * - Flying → Squat detected → Standing
   */
  private updateFootPositions(landmarks: PoseLandmarks, _shouldLog: boolean): void {
    if (!this.referencePose) return
    
    const leftAnkle = landmarks[27]
    const rightAnkle = landmarks[28]
    const leftHip = landmarks[23]
    const rightHip = landmarks[24]
    const refLeftAnkle = this.referencePose[27]
    const refRightAnkle = this.referencePose[28]
    const refLeftHip = this.referencePose[23]
    const refRightHip = this.referencePose[24]
    
    if (!leftAnkle || !rightAnkle || !refLeftAnkle || !refRightAnkle) return
    if (!leftHip || !rightHip || !refLeftHip || !refRightHip) return
    if ((leftAnkle.visibility ?? 0) < 0.3 || (rightAnkle.visibility ?? 0) < 0.3) return
    
    // 计算两脚的高度变化（向上为正）
    const leftHeightChange = refLeftAnkle.y - leftAnkle.y
    const rightHeightChange = refRightAnkle.y - rightAnkle.y
    
    // 计算髋部高度变化（用于检测下蹲）
    const leftHipChange = refLeftHip.y - leftHip.y
    const rightHipChange = refRightHip.y - rightHip.y
    const avgHipChange = (leftHipChange + rightHipChange) / 2
    
    // 阈值
    const jumpThreshold = 0.08 // 8% 的屏幕高度 - 跳跃检测
    const squatThreshold = -0.05 // -5% 的屏幕高度 - 下蹲检测（髋部下降）
    const liftThreshold = 0.05 // 5% 的屏幕高度 - 单脚抬起
    
    const leftLifted = leftHeightChange > liftThreshold
    const rightLifted = rightHeightChange > liftThreshold
    const bothLifted = leftLifted && rightLifted
    const isJumping = bothLifted && (leftHeightChange + rightHeightChange) / 2 > jumpThreshold
    const isSquatting = avgHipChange < squatThreshold
    
    const leftFootContainer = this.partContainers.get('left-foot')
    const rightFootContainer = this.partContainers.get('right-foot')
    
    if (!leftFootContainer || !rightFootContainer) return
    if (!this.initialPositions.has('left-foot') || !this.initialPositions.has('right-foot')) return
    
    const leftInitialPos = this.initialPositions.get('left-foot')!
    const rightInitialPos = this.initialPositions.get('right-foot')!
    
    // 状态转换
    if (isJumping && !this.isFlying) {
      this.isFlying = true
      if (this.frameCount % 60 === 0) {
        console.log('🚀 Entering flying state')
      }
    } else if (isSquatting && this.isFlying) {
      this.isFlying = false
      if (this.frameCount % 60 === 0) {
        console.log('🧍 Exiting flying state (squat detected)')
      }
    }
    
    // 根据状态应用动作
    if (this.isFlying) {
      // 飞行状态：双脚向后抬起
      const flyingOffset = 80 // 固定的飞行高度
      leftFootContainer.y = leftInitialPos.y - flyingOffset
      rightFootContainer.y = rightInitialPos.y - flyingOffset
      
      if (this.frameCount % 60 === 0) {
        console.log(`✈️ Flying mode active`)
      }
    } else if (leftLifted || rightLifted) {
      // 走路状态：单脚抬起
      if (leftLifted && !rightLifted) {
        const yOffset = leftHeightChange * 2000
        leftFootContainer.y = leftInitialPos.y - yOffset
        rightFootContainer.y = rightInitialPos.y
      } else if (rightLifted && !leftLifted) {
        const yOffset = rightHeightChange * 2000
        rightFootContainer.y = rightInitialPos.y - yOffset
        leftFootContainer.y = leftInitialPos.y
      } else {
        // 双脚都抬起但未达到跳跃阈值
        leftFootContainer.y = leftInitialPos.y
        rightFootContainer.y = rightInitialPos.y
      }
    } else {
      // 站立状态：恢复初始位置
      leftFootContainer.y = leftInitialPos.y
      rightFootContainer.y = rightInitialPos.y
    }
  }

  // Child-Parent pairs for position following
  // Format: [childName, parentName]
  // Note: 脚的父级会根据实际存在的部件动态确定（skirt 或 left-thigh/right-thigh）
  private static readonly CHILD_PARENT_PAIRS: [string, string][] = [
    // 头跟随身体
    ['head', 'body'],
    // 手臂跟随身体
    ['left-arm', 'body'],
    ['right-arm', 'body'],
    // 手跟随手臂（手腕连接）
    ['left-hand', 'left-arm'],
    ['right-hand', 'right-arm'],
    // 裙子跟随身体
    ['skirt', 'body'],
    // 脚的父级在 updateChildPositions 中动态处理
  ]

  // 动态获取脚的父级部件
  private getFootParent(footName: 'left-foot' | 'right-foot'): string | null {
    // 优先检查分体式大腿
    if (footName === 'left-foot') {
      if (this.parts.has('left-thigh')) return 'left-thigh'
      if (this.parts.has('skirt')) return 'skirt'
    } else {
      if (this.parts.has('right-thigh')) return 'right-thigh'
      if (this.parts.has('skirt')) return 'skirt'
    }
    return null
  }

  // Store initial positions for all parts (set in resetPose)
  private initialPositions: Map<string, { x: number; y: number }> = new Map()
  
  // Store connection points from skeleton data
  // Key: "partName:jointName", Value: position in world coordinates
  private connectionPoints: Map<string, { x: number; y: number; partName: string; jointId: string }> = new Map()

  /**
   * Update child part positions to follow parent rotation
   * 
   * Uses skeleton data to find connection points:
   * 1. Find connected joints between parent and child from skeleton.bones
   * 2. When parent rotates, calculate where the parent's connection joint moves to
   * 3. Move the child so its connection joint aligns with parent's connection joint
   */
  private updateChildPositions(shouldLog: boolean): void {
    if (!this.config?.skeleton) {
      if (shouldLog) console.log('No skeleton data, config:', this.config)
      return
    }

    const joints = this.config.skeleton.joints
    const bones = this.config.skeleton.bones
    
    if (shouldLog) {
      console.log('updateChildPositions - skeleton data:', {
        jointsCount: joints?.length,
        bonesCount: bones?.length,
        bones: bones
      })
    }
    
    // 构建完整的子-父对列表，包括动态确定的脚部父级
    const allChildParentPairs: [string, string][] = [
      ...CharacterRenderer.CHILD_PARENT_PAIRS,
    ]
    
    // 动态添加脚部的父级关系
    const leftFootParent = this.getFootParent('left-foot')
    const rightFootParent = this.getFootParent('right-foot')
    if (leftFootParent && this.parts.has('left-foot')) {
      allChildParentPairs.push(['left-foot', leftFootParent])
    }
    if (rightFootParent && this.parts.has('right-foot')) {
      allChildParentPairs.push(['right-foot', rightFootParent])
    }
    
    for (const [childName, parentName] of allChildParentPairs) {
      const childContainer = this.partContainers.get(childName)
      const parentContainer = this.partContainers.get(parentName)
      const parentSprite = this.parts.get(parentName)
      
      if (!childContainer || !parentContainer || !parentSprite) {
        continue
      }

      // Find a bone that connects parent to child (in either direction)
      // Bone format: { from: "partName:jointId", to: "partName:jointId" }
      let parentJointId: string | null = null
      let childJointId: string | null = null
      
      for (const bone of bones) {
        const [fromPart, fromJoint] = bone.from.split(':')
        const [toPart, toJoint] = bone.to.split(':')
        
        if (fromPart === parentName && toPart === childName) {
          parentJointId = fromJoint
          childJointId = toJoint
          break
        } else if (fromPart === childName && toPart === parentName) {
          childJointId = fromJoint
          parentJointId = toJoint
          break
        }
      }

      if (!parentJointId || !childJointId) {
        if (shouldLog) {
          console.log(`${childName}: no bone connection to ${parentName}`, {
            bonesChecked: bones.map(b => `${b.from} -> ${b.to}`)
          })
        }
        continue
      }
      
      if (shouldLog) {
        console.log(`${childName} -> ${parentName}: found bone connection`, {
          parentJointId,
          childJointId
        })
      }

      // Find the actual joint objects
      const parentJoint = joints.find(j => j.part === parentName && j.id === parentJointId)
      const childJoint = joints.find(j => j.part === childName && j.id === childJointId)

      if (!parentJoint || !childJoint) {
        if (shouldLog) {
          console.log(`${childName}: joints not found - parent:${parentJointId}, child:${childJointId}`)
        }
        continue
      }

      // Get assembly data
      const parentAssembly = this.assemblyData.get(parentName)
      const childAssembly = this.assemblyData.get(childName)
      if (!parentAssembly || !childAssembly) continue

      // Use parent container's CURRENT position (not initial position)
      // This ensures child follows parent even when parent has moved
      const parentCurrentX = parentContainer.position.x
      const parentCurrentY = parentContainer.position.y

      // Get parent's current rotation
      const parentRotation = parentSprite.rotation

      // Get parent's pivot point (the anchor point for rotation)
      const parentFrameData = this.spritesheetData?.frames[parentName] as FrameDataWithAssembly | undefined
      const parentPivotX = parentFrameData?.jointPivot?.x ?? DEFAULT_JOINT_PIVOTS[parentName]?.x ?? 0.5
      const parentPivotY = parentFrameData?.jointPivot?.y ?? DEFAULT_JOINT_PIVOTS[parentName]?.y ?? 0.5

      // Calculate parent joint position relative to parent's PIVOT (not center)
      // Joint position is in 0-1 coordinates, pivot is also in 0-1 coordinates
      const parentJointFromPivotX = (parentJoint.position.x - parentPivotX) * parentAssembly.width * this.globalScale
      const parentJointFromPivotY = (parentJoint.position.y - parentPivotY) * parentAssembly.height * this.globalScale

      // Rotate the parent joint position by parent's rotation
      const cos = Math.cos(parentRotation)
      const sin = Math.sin(parentRotation)
      const rotatedParentJointX = parentJointFromPivotX * cos - parentJointFromPivotY * sin
      const rotatedParentJointY = parentJointFromPivotX * sin + parentJointFromPivotY * cos

      // Parent joint's world position after rotation
      // Use current container position instead of initial position
      const parentJointWorldX = parentCurrentX + rotatedParentJointX
      const parentJointWorldY = parentCurrentY + rotatedParentJointY

      // Get child's pivot point
      const childFrameData = this.spritesheetData?.frames[childName] as FrameDataWithAssembly | undefined
      const childPivotX = childFrameData?.jointPivot?.x ?? DEFAULT_JOINT_PIVOTS[childName]?.x ?? 0.5
      const childPivotY = childFrameData?.jointPivot?.y ?? DEFAULT_JOINT_PIVOTS[childName]?.y ?? 0.5

      // Child joint position relative to child's PIVOT (before rotation)
      const childJointFromPivotX = (childJoint.position.x - childPivotX) * childAssembly.width * this.globalScale
      const childJointFromPivotY = (childJoint.position.y - childPivotY) * childAssembly.height * this.globalScale

      // Get child's current rotation to rotate the joint offset
      const childSprite = this.parts.get(childName)
      const childRotation = childSprite?.rotation ?? 0
      
      // Rotate child joint offset by child's rotation
      const childCos = Math.cos(childRotation)
      const childSin = Math.sin(childRotation)
      const rotatedChildJointX = childJointFromPivotX * childCos - childJointFromPivotY * childSin
      const rotatedChildJointY = childJointFromPivotX * childSin + childJointFromPivotY * childCos

      // Child's new pivot position: move child so its joint aligns with parent's joint
      // childNewPivot + rotatedChildJoint = parentJointWorld
      // childNewPivot = parentJointWorld - rotatedChildJoint
      const newChildX = parentJointWorldX - rotatedChildJointX
      const newChildY = parentJointWorldY - rotatedChildJointY

      childContainer.position.set(newChildX, newChildY)

      if (shouldLog) {
        console.log(`${childName}: parentJoint=${parentJoint.name}(${parentJoint.position.x.toFixed(2)},${parentJoint.position.y.toFixed(2)}), childJoint=${childJoint.name}, parentRot=${(parentRotation * 180 / Math.PI).toFixed(1)}°, newPos=(${newChildX.toFixed(1)}, ${newChildY.toFixed(1)})`)
      }
    }
  }

  /**
   * Get rotation binding for a part (custom or default)
   * Always falls back to default bindings if custom binding is not valid
   */
  private getRotationBinding(partName: string, hasValidBindings: boolean): [number, number] | null {
    // Head and body should never rotate in shadow puppet style
    if (partName === 'head' || partName === 'body') {
      return null
    }
    
    // Try custom binding first if available
    if (hasValidBindings && this.config) {
      const binding = this.config.bindings[partName]
      if (binding?.landmarks && binding.landmarks.length >= 2) {
        const start = binding.landmarks[0]
        const end = binding.landmarks[1]
        // 如果起点和终点相同，使用默认绑定
        if (start !== end) {
          return [start, end]
        }
      } else if (binding?.rotationLandmark != null && binding?.landmarks?.length >= 1) {
        const start = binding.landmarks[0]
        const end = binding.rotationLandmark
        // 如果起点和终点相同，使用默认绑定
        if (start !== end) {
          return [start, end]
        }
      }
    }
    // Always fall back to default bindings
    return CharacterRenderer.DEFAULT_ROTATION_BINDINGS[partName] || null
  }

  /**
   * 根据素材实际绘制方向获取旋转偏移量
   * 
   * 根据素材实际绘制方向获取旋转偏移量
   * 
   * 优先从 spritesheet.json 的 rotationOffset 字段读取，
   * 如果没有配置则使用默认值。
   * 
   * 嫦娥素材特殊性：
   * 1. 左臂/左手是【水平向左】画的（默认状态手臂是抬起的）
   * 2. 右臂/右手是【水平向右】画的（默认状态手臂是抬起的）
   * 3. 但我们希望默认状态（Rotation=0）是【垂直向下】
   * 
   * 这导致了 90度（π/2）的偏差：
   * - 当系统想要手臂"自然下垂"时（发送 0 度指令），皮影手臂实际上是平举的
   * - 当系统想要手臂"前后摆动"时，皮影手臂在平举位置上下拍动
   * 
   * 修正方案：
   * - 左臂/左手：偏移 Math.PI（素材指向左，即 180度）
   * - 右臂/右手：偏移 -Math.PI/2（素材指向右，需要转 90 度到垂直）
   */
  private getRotationOffset(partName: string): number {
    // 1. 优先从 spritesheet.json 读取配置（如果在编辑器里手动调过，以此为准）
    if (this.spritesheetData) {
      const frameData = this.spritesheetData.frames[partName] as FrameDataWithAssembly
      if (frameData?.rotationOffset !== undefined) {
        return frameData.rotationOffset
      }
    }
    
    // 2. 使用默认值（0 表示不做额外旋转补偿）
    return DEFAULT_ROTATION_OFFSETS[partName] ?? 0
  }

  /**
   * Clear all parts and containers
   */
  private clearParts(): void {
    console.log('clearParts called, current children:', this.container?.children.length)
    
    // Remove all part containers from main container first
    if (this.container) {
      // Remove children one by one to ensure proper cleanup
      while (this.container.children.length > 0) {
        this.container.removeChildAt(0)
      }
    }
    
    // Then destroy sprites and containers
    for (const sprite of this.parts.values()) {
      sprite.destroy({ children: true, texture: false })
    }
    this.parts.clear()
    
    for (const container of this.partContainers.values()) {
      container.destroy({ children: true })
    }
    this.partContainers.clear()
    this.assemblyData.clear()
    this.absoluteAngles.clear()
    this.childOffsets.clear()
    this.initialPositions.clear()
    this.connectionPoints.clear()
    
    console.log('clearParts done, children after:', this.container?.children.length)
  }

  /**
   * Resize the renderer
   */
  resize(width: number, height: number): void {
    if (!this.app || !this.container) return

    this.app.renderer.resize(width, height)
    this.container.x = width / 2
    this.container.y = height / 2
  }

  /**
   * Get the PixiJS application
   */
  getApp(): Application | null {
    return this.app
  }

  /**
   * Set whether to show static pose (when no pose detection)
   */
  setShowStaticPose(show: boolean): void {
    this.showStaticPose = show
    if (this.container) {
      this.container.visible = show
    }
  }

  /**
   * Show the character (make visible)
   */
  show(): void {
    if (this.container) {
      this.container.visible = true
    }
  }

  /**
   * Hide the character (make invisible)
   */
  hide(): void {
    if (this.container) {
      this.container.visible = false
    }
  }

  /**
   * Check if character is visible
   */
  isVisible(): boolean {
    return this.container?.visible ?? false
  }

  /**
   * 获取部件的初始姿势偏移量（弧度）
   * 这个偏移量表示素材默认姿势与"自然垂下"姿势之间的角度差
   * 优先使用配置中的值，否则使用默认值
   */
  getRestPoseOffset(partName: string): number {
    // 优先使用配置中的值
    const configOffset = this.config?.restPoseOffsets?.[partName]
    if (configOffset !== undefined) {
      return configOffset
    }
    // 使用默认值
    return DEFAULT_REST_POSE_OFFSETS[partName] ?? 0
  }

  /**
   * Set rotation for a specific part (in radians)
   * Used for manual control and preset animations
   * @param rotation 相对于"自然垂下"姿势的角度，会自动加上 restPoseOffset
   * @param absolute 如果为 true，则直接设置绝对角度（不加偏移）
   */
  setPartRotation(partName: string, rotation: number, absolute: boolean = false): void {
    const sprite = this.parts.get(partName)
    if (sprite) {
      const offset = absolute ? 0 : this.getRestPoseOffset(partName)
      sprite.rotation = rotation + offset
      // Update child positions after rotation change
      this.updateChildPositions(false)
    }
  }

  /**
   * Get current rotation of a part (relative to rest pose)
   * @param absolute 如果为 true，返回绝对角度（不减偏移）
   */
  getPartRotation(partName: string, absolute: boolean = false): number {
    const sprite = this.parts.get(partName)
    if (!sprite) return 0
    const offset = absolute ? 0 : this.getRestPoseOffset(partName)
    return sprite.rotation - offset
  }

  /**
   * Get all part names
   */
  getPartNames(): string[] {
    return Array.from(this.parts.keys())
  }

  /**
   * Apply a preset pose (set multiple part rotations at once)
   * @param pose Record of part name to rotation angle (in radians), relative to rest pose
   */
  applyPresetPose(pose: Record<string, number>): void {
    for (const [partName, rotation] of Object.entries(pose)) {
      const sprite = this.parts.get(partName)
      if (sprite) {
        const offset = this.getRestPoseOffset(partName)
        sprite.rotation = rotation + offset
      }
    }
    // Update child positions after all rotations are set
    this.updateChildPositions(false)
  }

  /**
   * Reset all parts to default pose (rest pose with offsets applied)
   */
  resetToDefaultPose(): void {
    for (const [partName, sprite] of this.parts) {
      const offset = this.getRestPoseOffset(partName)
      sprite.rotation = offset
    }
    this.updateChildPositions(false)
  }

  /**
   * Animate to a preset pose over time
   * @param pose Target pose (relative to rest pose)
   * @param duration Animation duration in milliseconds
   * @param onComplete Callback when animation completes
   */
  animateToPose(
    pose: Record<string, number>,
    duration: number = 500,
    onComplete?: () => void
  ): void {
    if (!this.app) return

    // 获取当前姿势（相对值）和目标姿势的绝对值
    const startPose: Record<string, number> = {}
    const targetPose: Record<string, number> = {}
    
    // 对于面向右的角色，需要调整姿势
    const adjustedPose = this.adjustPoseForFacing(pose)
    
    for (const partName of Object.keys(adjustedPose)) {
      // 当前的相对角度
      startPose[partName] = this.getPartRotation(partName)
      // 目标的相对角度（已经根据朝向调整过）
      targetPose[partName] = adjustedPose[partName]
    }

    const startTime = Date.now()
    
    const animate = () => {
      const elapsed = Date.now() - startTime
      const progress = Math.min(elapsed / duration, 1)
      
      // Ease out cubic
      const eased = 1 - Math.pow(1 - progress, 3)
      
      for (const [partName, targetRotation] of Object.entries(targetPose)) {
        const startRotation = startPose[partName] ?? 0
        // 插值计算相对角度
        const currentRelativeRotation = startRotation + (targetRotation - startRotation) * eased
        // 加上偏移量得到绝对角度
        const offset = this.getRestPoseOffset(partName)
        const sprite = this.parts.get(partName)
        if (sprite) {
          sprite.rotation = currentRelativeRotation + offset
        }
      }
      
      this.updateChildPositions(false)
      
      if (progress < 1) {
        requestAnimationFrame(animate)
      } else {
        onComplete?.()
      }
    }
    
    requestAnimationFrame(animate)
  }

  /**
   * Get the main container for mouse interaction
   */
  getContainer(): Container | null {
    return this.container
  }

  /**
   * 瞬间转身 - 通过翻转容器的 scale.x 实现镜像
   * 皮影戏中人物转身就是翻转皮影片
   */
  turnAround(): void {
    if (!this.container) return
    this.container.scale.x *= -1
  }

  /**
   * 动画转身 - 模拟皮影戏的"变薄再变宽"效果
   * 真实的皮影戏在转身时，皮影会贴着幕布有一个由宽变窄，再由窄变宽的过程
   * 
   * @param duration 动画时长（毫秒），默认 300ms
   * @param onComplete 动画完成回调
   */
  turnAroundAnimated(duration: number = 300, onComplete?: () => void): void {
    if (!this.container) return

    const targetScaleX = this.container.scale.x > 0 ? -1 : 1
    const startScaleX = this.container.scale.x
    const startTime = Date.now()

    const animate = () => {
      if (!this.container) return

      const elapsed = Date.now() - startTime
      const progress = Math.min(elapsed / duration, 1)

      // 使用 ease-in-out 缓动，模拟皮影的物理特性
      // 先快速收缩到 0，再展开到目标值
      if (progress < 0.5) {
        // 前半段：从当前值收缩到 0
        const halfProgress = progress * 2  // 0 -> 1
        const eased = 1 - Math.pow(1 - halfProgress, 2)  // ease-out
        this.container.scale.x = startScaleX * (1 - eased)
      } else {
        // 后半段：从 0 展开到目标值
        const halfProgress = (progress - 0.5) * 2  // 0 -> 1
        const eased = Math.pow(halfProgress, 2)  // ease-in
        this.container.scale.x = targetScaleX * eased
      }

      if (progress < 1) {
        requestAnimationFrame(animate)
      } else {
        this.container.scale.x = targetScaleX
        onComplete?.()
      }
    }

    requestAnimationFrame(animate)
  }

  /**
   * 检查角色当前是否已翻转（面向左侧）
   */
  isFlipped(): boolean {
    return (this.container?.scale.x ?? 1) < 0
  }

  /**
   * 获取角色默认朝向
   */
  getDefaultFacing(): CharacterFacing {
    return this.defaultFacing
  }

  /**
   * 设置角色默认朝向
   * @param facing 'left' 或 'right'
   */
  setDefaultFacing(facing: CharacterFacing): void {
    this.defaultFacing = facing
  }

  /**
   * 根据角色朝向调整旋转方向
   * 预设动画是为"面向左"的角色设计的
   * 对于面向右的角色，需要取反旋转值
   * 
   * @param rotation 预设动画的旋转值（为面向左设计）
   * @returns 调整后的实际旋转值
   */
  adjustRotationForFacing(rotation: number): number {
    // 预设动画是为面向左的角色设计的
    // 面向右的角色需要取反旋转方向
    if (this.defaultFacing === 'right') {
      return -rotation
    }
    return rotation
  }

  /**
   * 根据角色朝向调整整个姿势
   * 对于面向右的角色：
   * 1. 旋转方向取反
   * 2. 左右对称部件的值交换（走路时保持手脚交叉协调）
   * 
   * @param pose 原始姿势（为面向左设计）
   * @returns 调整后的姿势
   */
  private adjustPoseForFacing(pose: Record<string, number>): Record<string, number> {
    if (this.defaultFacing === 'left') {
      // 面向左的角色，直接使用原始姿势
      return pose
    }

    // 面向右的角色，需要：
    // 1. 交换左右部件的值
    // 2. 取反旋转方向
    const adjusted: Record<string, number> = {}
    
    // 左右对称部件的映射
    const leftRightPairs: Record<string, string> = {
      'left-arm': 'right-arm',
      'right-arm': 'left-arm',
      'left-hand': 'right-hand',
      'right-hand': 'left-hand',
      'left-thigh': 'right-thigh',
      'right-thigh': 'left-thigh',
      'left-foot': 'right-foot',
      'right-foot': 'left-foot',
    }

    for (const [partName, rotation] of Object.entries(pose)) {
      // 检查是否是左右对称部件
      const mirrorPart = leftRightPairs[partName]
      
      if (mirrorPart && pose[mirrorPart] !== undefined) {
        // 交换左右部件的值，并取反旋转方向
        adjusted[partName] = -pose[mirrorPart]
      } else {
        // 非对称部件（如 body, head），只取反旋转方向
        adjusted[partName] = -rotation
      }
    }

    return adjusted
  }

  /**
   * 设置角色朝向
   * @param faceLeft true 表示面向左侧（翻转），false 表示面向右侧（正常）
   * @param animated 是否使用动画
   * @param duration 动画时长
   */
  setFacing(faceLeft: boolean, animated: boolean = false, duration: number = 300): void {
    if (!this.container) return
    
    const currentlyFlipped = this.container.scale.x < 0
    const needsFlip = faceLeft !== currentlyFlipped

    if (!needsFlip) return

    if (animated) {
      this.turnAroundAnimated(duration)
    } else {
      this.turnAround()
    }
  }

  /**
   * Get sprite for a specific part (for hit testing)
   */
  getPartSprite(partName: string): Sprite | undefined {
    return this.parts.get(partName)
  }

  // Debug overlay container
  private debugContainer: Container | null = null

  /**
   * 显示/隐藏关节点和旋转点（用于调试）
   */
  setShowJoints(show: boolean): void {
    if (!this.container || !this.config?.skeleton) return

    if (!show) {
      // 隐藏调试信息
      if (this.debugContainer) {
        this.debugContainer.visible = false
      }
      return
    }

    // 创建或显示调试容器
    if (!this.debugContainer) {
      this.debugContainer = new Container()
      this.debugContainer.zIndex = 9999
      this.container.addChild(this.debugContainer)
    } else {
      // 清除旧的调试图形
      this.debugContainer.removeChildren()
    }
    this.debugContainer.visible = true

    // 绘制关节点和旋转点
    this.drawDebugPoints()
  }

  /**
   * 绘制调试点（关节点和旋转点）
   */
  private drawDebugPoints(): void {
    if (!this.debugContainer || !this.config?.skeleton || !this.spritesheetData) return

    const joints = this.config.skeleton.joints
    const labelStyle = new TextStyle({
      fontSize: 10,
      fill: 0xffffff,
      stroke: { color: 0x000000, width: 2 },
    })

    // 绘制每个部件的关节点和旋转点
    for (const [partName, sprite] of this.parts) {
      const container = this.partContainers.get(partName)
      if (!container) continue

      const assembly = this.assemblyData.get(partName)
      if (!assembly) continue

      const frameData = this.spritesheetData.frames[partName] as FrameDataWithAssembly

      // 获取旋转点（jointPivot）
      const jointPivot = frameData?.jointPivot
      const defaultPivot = DEFAULT_JOINT_PIVOTS[partName]
      const pivotX = jointPivot?.x ?? defaultPivot?.x ?? 0.5
      const pivotY = jointPivot?.y ?? defaultPivot?.y ?? 0.5

      // 绘制旋转点（蓝色方块）
      const pivotGraphic = new Graphics()
      pivotGraphic.rect(-4, -4, 8, 8)
      pivotGraphic.fill({ color: 0x4444ff })
      pivotGraphic.stroke({ color: 0xffffff, width: 1 })
      
      // 旋转点位置 = 容器位置（因为 sprite.anchor 就是旋转点）
      pivotGraphic.x = container.x
      pivotGraphic.y = container.y
      this.debugContainer.addChild(pivotGraphic)

      // 添加旋转点标签
      const pivotLabel = new Text({
        text: `${partName}\npivot(${pivotX.toFixed(2)},${pivotY.toFixed(2)})`,
        style: labelStyle,
      })
      pivotLabel.x = container.x + 10
      pivotLabel.y = container.y - 10
      pivotLabel.scale.set(0.8)
      this.debugContainer.addChild(pivotLabel)

      // 绘制该部件的关节点（绿色圆点）
      const partJoints = joints.filter(j => j.part === partName)
      for (const joint of partJoints) {
        const jointGraphic = new Graphics()
        jointGraphic.circle(0, 0, 5)
        jointGraphic.fill({ color: joint.connectedTo ? 0x00ff00 : 0x888888 })
        jointGraphic.stroke({ color: 0xffffff, width: 1 })

        // 关节点位置需要考虑部件的旋转
        const jointLocalX = (joint.position.x - pivotX) * assembly.width * this.globalScale
        const jointLocalY = (joint.position.y - pivotY) * assembly.height * this.globalScale
        
        // 旋转变换
        const cos = Math.cos(sprite.rotation)
        const sin = Math.sin(sprite.rotation)
        const rotatedX = jointLocalX * cos - jointLocalY * sin
        const rotatedY = jointLocalX * sin + jointLocalY * cos

        jointGraphic.x = container.x + rotatedX
        jointGraphic.y = container.y + rotatedY
        this.debugContainer.addChild(jointGraphic)
      }
    }
  }

  /**
   * 更新调试点位置（在部件旋转后调用）
   */
  updateDebugPoints(): void {
    if (this.debugContainer?.visible) {
      this.debugContainer.removeChildren()
      this.drawDebugPoints()
    }
  }

  /**
   * Destroy the renderer
   */
  async destroy(): Promise<void> {
    // 先标记为未初始化，防止其他方法继续操作
    this.initialized = false

    this.clearParts()

    if (this.container) {
      try {
        this.container.destroy({ children: true })
      } catch (e) {
        console.warn('Container destroy error:', e)
      }
      this.container = null
    }

    if (this.app) {
      try {
        // PixiJS 8 的 destroy 方法签名变了
        this.app.destroy(true, { children: true, texture: false, textureSource: false })
      } catch (e) {
        console.warn('App destroy error:', e)
      }
      this.app = null
    }

    this.config = null
    this.spritesheetData = null
    this.baseTexture = null
  }
}

// Note: Don't use singleton - each component should create its own instance
// to avoid shared state issues
