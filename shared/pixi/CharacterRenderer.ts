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
  RenderTexture,
  ColorMatrixFilter,
} from 'pixi.js'
import type {
  CharacterConfig,
  SpritesheetData,
  PoseLandmarks,
  FrameData,
} from './types'
import type { ProcessedPose, PartAngles, Facing } from '@pose/types'

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
  'right-hand': { x: 0.9, y: 0.5 }, // 右手腕
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
    // 手臂和手的默认偏移
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

// 默认连接点配置（用于没有骨骼数据时的 fallback）
// 定义子部件如何连接到父部件
// parentConnection: 父部件上的连接点（0-1 坐标）
// childConnection: 子部件上的连接点（0-1 坐标）
// 
// 重要：childConnection 应该与该部件的旋转轴点（pivot）一致
// 这样旋转时连接点才能保持正确位置
// const DEFAULT_CONNECTION_POINTS: Record<string, {
//   parentConnection: { x: number; y: number };
//   childConnection: { x: number; y: number };
// }> = {
//   // 手连接到手臂末端
//   // 注意：手的连接点需要与 DEFAULT_JOINT_PIVOTS 中的 pivot 一致
//   'left-hand': {
//     parentConnection: { x: 0.5, y: 0.9 },   // 手臂底部（手腕位置）
//     childConnection: { x: 0.9, y: 0.5 },    // 左手的 pivot 在右侧（手腕位置）
//   },
//   'right-hand': {
//     parentConnection: { x: 0.5, y: 0.9 },   // 手臂底部（手腕位置）
//     childConnection: { x: 0.9, y: 0.5 },    // 右手的 pivot 在右侧
//   },
//   // 头连接到身体顶部
//   'head': {
//     parentConnection: { x: 0.5, y: 0.1 },   // 身体顶部（脖子位置）
//     childConnection: { x: 0.5, y: 0.9 },    // 头底部（脖子位置）- 与 pivot 一致
//   },
//   // 手臂连接到身体肩部
//   'left-arm': {
//     parentConnection: { x: 0.3, y: 0.15 },  // 身体左肩位置
//     childConnection: { x: 0.5, y: 0.1 },    // 手臂顶部（肩膀位置）- 与 pivot 一致
//   },
//   'right-arm': {
//     parentConnection: { x: 0.7, y: 0.15 },  // 身体右肩位置
//     childConnection: { x: 0.5, y: 0.1 },    // 手臂顶部（肩膀位置）- 与 pivot 一致
//   },
//   // 裙子/下身连接到身体底部
//   'skirt': {
//     parentConnection: { x: 0.5, y: 0.9 },   // 身体底部（腰部）
//     childConnection: { x: 0.5, y: 0.1 },    // 裙子顶部 - 与 pivot 一致
//   },
//   // 大腿连接到身体/裙子底部
//   'left-thigh': {
//     parentConnection: { x: 0.4, y: 0.9 },   // 身体左髋位置
//     childConnection: { x: 0.5, y: 0.1 },    // 大腿顶部 - 与 pivot 一致
//   },
//   'right-thigh': {
//     parentConnection: { x: 0.6, y: 0.9 },   // 身体右髋位置
//     childConnection: { x: 0.5, y: 0.1 },    // 大腿顶部 - 与 pivot 一致
//   },
//   // 脚连接到大腿/裙子底部
//   'left-foot': {
//     parentConnection: { x: 0.5, y: 0.9 },   // 大腿底部（膝盖位置）
//     childConnection: { x: 0.5, y: 0.1 },    // 脚顶部（脚踝位置）- 与 pivot 一致
//   },
//   'right-foot': {
//     parentConnection: { x: 0.5, y: 0.9 },   // 大腿底部（膝盖位置）
//     childConnection: { x: 0.5, y: 0.1 },    // 脚顶部（脚踝位置）- 与 pivot 一致
//   },
// }

/**
 * 皮影部件默认 Z-Index 层级系统
 * 
 * 皮影戏的层级逻辑（从后到前）- 三明治结构：
 * 
 *   【前面的手臂/手】 - 最顶层（在头部前面）
 *         ↓
 *       【头部】 - 中间层
 *         ↓
 *   【背后的手臂/手】 - 在头部后面
 *         ↓
 *       【身体】
 *         ↓
 *     【腿/脚】 - 最底层
 * 
 * 关键点：
 * - 前面的手臂/手在头部前面（可以遮挡头部）
 * - 背后的手臂/手在头部后面（被头部遮挡）
 * 
 * "背后"和"前面"取决于角色的朝向：
 * - 面朝右：左侧肢体在背后，右侧在前面
 * - 面朝左：右侧肢体在背后，左侧在前面
 */
const Z_INDEX_LAYERS = {
  BACK_LEG: -20,    // 背后的腿/脚
  FRONT_LEG: -15,   // 前面的腿/脚
  BACK_ARM: -10,    // 背后的手臂（在头部后面）
  BACK_HAND: -8,    // 背后的手（在头部后面）
  BODY: 0,          // 身体
  HEAD: 10,         // 头部
  FRONT_ARM: 15,    // 前面的手臂（在头部前面）
  FRONT_HAND: 18,   // 前面的手（在头部前面）
}

/**
 * 根据角色朝向计算部件的 z-index
 * 这是一个通用函数，适用于所有皮影角色
 * 
 * 三明治结构：
 * - 前面的手臂/手在头部前面（z-index > HEAD）
 * - 背后的手臂/手在头部后面（z-index < HEAD）
 * - 腿/脚在身体后面
 */
function calculatePartZIndex(partName: string, defaultFacing: CharacterFacing, _isFlipped: boolean = false): number {
  // 重要：Z-index 只基于默认朝向，不因转身而改变！
  // 原因：转身是通过 scale.x = -1 实现的，所有精灵一起翻转
  // 所以视觉上的前后关系已经自动正确了，不需要调整 z-index
  
  // 判断是否为"背后"部件（基于默认朝向）
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

  // Flag for external position control (used by RecordingPage for path-based movement)
  private useExternalPosition = false

  // Bone mapping for handling facing direction
  // Maps PoseProcessor part names (user perspective) to Character part names
  private boneMap: Record<string, string> = {}

  // Side-by-side Rendering Properties
  private renderMode: 'chromakey' | 'side_by_side' = 'chromakey'
  private renderTexture: RenderTexture | null = null
  private previewSprite: Sprite | null = null
  private maskSprite: Sprite | null = null
  private colorMatrix: ColorMatrixFilter | null = null

  private canvas: HTMLCanvasElement | null = null
  private width: number = 800
  private height: number = 600
  private imageUrl: string | null = null
  private onPartSelected: ((partName: string) => void) | null = null

  constructor(options: {
    canvas?: HTMLCanvasElement
    width?: number
    height?: number
    config?: CharacterConfig
    spritesheetData?: SpritesheetData
    imageUrl?: string
    onPartSelected?: (partName: string) => void
  } = {}) {
    console.log('[CharacterRenderer] Constructor called with:', {
      hasCanvas: !!options.canvas,
      hasConfig: !!options.config,
      hasSpritesheetData: !!options.spritesheetData,
      imageUrl: options.imageUrl
    })

    if (options.canvas) this.canvas = options.canvas
    if (options.width) this.width = options.width
    if (options.height) this.height = options.height
    if (options.config) this.config = options.config
    if (options.spritesheetData) this.spritesheetData = options.spritesheetData
    if (options.imageUrl) this.imageUrl = options.imageUrl
    if (options.onPartSelected) this.onPartSelected = options.onPartSelected
  }

  /**
   * Initialize the PixiJS application
   * Supports legacy signature: init(canvas, width, height, options)
   * And new signature: init(options) - relies on constructor props
   */
  async init(
    arg1?: HTMLCanvasElement | Record<string, any>,
    arg2?: number,
    arg3?: number,
    arg4: Record<string, any> = {}
  ): Promise<void> {
    // Handle overload
    let options = arg4
    
    if (arg1 instanceof HTMLCanvasElement) {
      // Legacy: init(canvas, width, height, options)
      this.canvas = arg1
      if (arg2) this.width = arg2
      if (arg3) this.height = arg3
    } else if (arg1) {
      // New: init(options)
      options = { ...arg1, ...arg4 }
      if (options.width) this.width = options.width
      if (options.height) this.height = options.height
    }

    if (!this.canvas) throw new Error('Canvas not provided')
    
    console.log('CharacterRenderer.init called, initialized:', this.initialized)
    
    if (this.initialized || this.app) {
      await this.destroy()
    }

    const app = new Application()
    
    // Determine Render Mode
    const compositionMode = options.compositionMode || 'chromakey'
    this.renderMode = compositionMode as 'chromakey' | 'side_by_side'
    
    // 绿幕设置
    const useGreenScreen = options.useGreenScreen === true
    
    let bgColor: number | string | undefined = undefined
    let bgAlpha = 0
    let canvasWidth = this.width // Use logical width as base
    
    if (this.renderMode === 'chromakey') {
      if (useGreenScreen) {
        bgColor = 0x00ff00
        bgAlpha = 1
      } else {
        bgAlpha = 0
      }
    } else {
      // side_by_side mode
      // Double the width: Left = Color, Right = Mask
      canvasWidth = this.width * 2
      console.log(`[CharacterRenderer] Side-by-side mode enabled, canvas width: ${canvasWidth}, logical width: ${this.width}`)
      
      // Background must be pure black for the mask to work correctly
      bgColor = 0x000000
      bgAlpha = 1
    }
    
    await app.init({
      canvas: this.canvas,
      width: canvasWidth,
      height: this.height,
      backgroundColor: bgColor,
      backgroundAlpha: bgAlpha,
      antialias: true,
      resolution: window.devicePixelRatio || 1,
      autoDensity: true,
      ...options
    })

    if (!app.stage) {
      app.destroy()
      throw new Error('PixiJS Application stage not initialized')
    }

    this.app = app
    this.container = new Container()
    
    // 默认居中于逻辑画面
    this.container.x = this.width / 2
    this.container.y = this.height / 2
    this.container.sortableChildren = true
    
    if (this.renderMode === 'chromakey') {
      this.app.stage.addChild(this.container)
    } else {
      // Side-by-Side Setup
      console.log('[CharacterRenderer] Setting up Side-by-Side rendering...')
      
      // 1. Create RenderTexture (single frame size - logical width)
      this.renderTexture = RenderTexture.create({ width: this.width, height: this.height }) as RenderTexture
      
      // 2. Create Sprites
      // Left: Color Preview
      this.previewSprite = new Sprite(this.renderTexture)
      this.app.stage.addChild(this.previewSprite)
      
      // Right: Alpha Mask
      this.maskSprite = new Sprite(this.renderTexture)
      this.maskSprite.x = this.width // Offset to right half
      
      // 3. Apply Filter for Mask
      // Convert Alpha to Grayscale (R=A, G=A, B=A)
      this.colorMatrix = new ColorMatrixFilter()
      // Matrix to map Alpha to RGB:
      // R = 0*R + 0*G + 0*B + 1*A + 0
      this.colorMatrix.matrix = [
        0, 0, 0, 1, 0,
        0, 0, 0, 1, 0,
        0, 0, 0, 1, 0,
        0, 0, 0, 1, 0
      ]
      this.maskSprite.filters = [this.colorMatrix]
      this.app.stage.addChild(this.maskSprite)
      
      // 4. Hook into Ticker to render container to texture
      this.app.ticker.add(this.renderToTexture, this)
    }

    this.initialized = true
    
    console.log('[CharacterRenderer.init] Checking data availability:', {
      hasConfig: !!this.config,
      hasSpritesheetData: !!this.spritesheetData
    })

    // Initialize if data is available (from constructor)
    if (this.config && this.spritesheetData) {
      await this.loadBaseTexture()
      this.createParts()
      this.updateChildPositions(true)
    }
    
    console.log('CharacterRenderer.init completed successfully')
  }

  /**
   * Render the character container to the render texture
   * Used in side-by-side mode
   */
  private renderToTexture(): void {
    if (!this.app || !this.container || !this.renderTexture) return
    
    // Manually render the container to the texture
    this.app.renderer.render({
      container: this.container,
      target: this.renderTexture,
      clear: true
    })
  }

  private async loadBaseTexture(): Promise<void> {
    console.log('[loadBaseTexture] START', { imageUrl: this.imageUrl, configImage: this.config?.spritesheetImage })
    if (this.baseTexture) return
    
    try {
      if (this.imageUrl) {
        console.log('[loadBaseTexture] Loading from imageUrl:', this.imageUrl)
        this.baseTexture = await Assets.load(this.imageUrl)
      } else if (this.config?.spritesheetImage) {
        console.log('[loadBaseTexture] Loading from config:', this.config.spritesheetImage)
        this.baseTexture = await Assets.load(this.config.spritesheetImage)
      } else {
        console.warn('No image URL found for base texture')
      }
      console.log('[loadBaseTexture] Done, texture:', !!this.baseTexture)
    } catch (e) {
      console.error('Failed to load base texture:', e)
    }
  }

  /**
   * Check if a part is rendered behind the body (based on renderOrder)
   * Used to determine which limbs are "inner/back" and need rotation inversion
   */
  private isPartBehindBody(partName: string): boolean {
    if (!this.config?.renderOrder) return false
    
    const bodyIndex = this.config.renderOrder.indexOf('body')
    const partIndex = this.config.renderOrder.indexOf(partName)
    
    // If either part not found, assume false
    if (bodyIndex === -1 || partIndex === -1) return false
    
    // In renderOrder array: earlier index = rendered first = behind
    return partIndex < bodyIndex
  }

  /**
   * Get the pivot point for a part.
   * Prioritizes spritesheet data (jointPivot or pivot).
   * Falls back to DEFAULT_JOINT_PIVOTS.
   * Handles mirroring for right-facing characters if using defaults.
   */
  private getPartPivot(partName: string): { x: number, y: number } {
    const frameData = this.spritesheetData?.frames[partName] as FrameDataWithAssembly | undefined
    
    // 1. Try explicit jointPivot from spritesheet (Highest Priority)
    if (frameData?.jointPivot) {
      return frameData.jointPivot
    }
    
    // 2. Try default joint pivot
    const defaultPivot = DEFAULT_JOINT_PIVOTS[partName]
    if (defaultPivot) {
      // If using default and character faces RIGHT, we mirror the X coordinate
      // Defaults are assumed to be for LEFT facing characters
      if (this.defaultFacing === 'right') {
        return { x: 1 - defaultPivot.x, y: defaultPivot.y }
      }
      return defaultPivot
    }
    
    // 3. Fallback to sprite pivot or center
    return { 
      x: frameData?.pivot?.x ?? 0.5, 
      y: frameData?.pivot?.y ?? 0.5 
    }
  }

  private createParts(): void {
    console.log('[createParts] Checking requirements:', {
        hasConfig: !!this.config,
        hasSpritesheetData: !!this.spritesheetData,
        hasBaseTexture: !!this.baseTexture,
        hasContainer: !!this.container
    })

    if (!this.config || !this.spritesheetData || !this.baseTexture || !this.container) {
        console.warn('[createParts] Requirements not met, skipping creation')
        return
    }

    console.log('=== createParts START ===')
    
    // Clear existing parts
    this.clearParts()
    
    // Set default facing
    if (this.config.defaultFacing) {
      this.defaultFacing = this.config.defaultFacing as CharacterFacing
    }
    
    this.updateBoneMap()

    const tempSprites: Map<string, { sprite: Sprite, container: Container }> = new Map()
    
    // Ensure renderOrder exists
    const renderOrder = this.config.renderOrder || Object.keys(this.spritesheetData.frames)
    console.log('Rendering parts in order:', renderOrder)

    for (const partName of renderOrder) {
      const frameData = this.spritesheetData?.frames[partName] as FrameDataWithAssembly
      if (!frameData) continue

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

      // Joint Pivot
      const pivot = this.getPartPivot(partName)
      sprite.anchor.set(pivot.x, pivot.y)
      
      // Interaction
      sprite.eventMode = 'static'
      sprite.cursor = 'pointer'
      sprite.on('pointerdown', () => {
        if (this.onPartSelected) this.onPartSelected!(partName)
      })

      const partContainer = new Container()
      partContainer.addChild(sprite)
      
      // Z-Index
      const zIndex = calculatePartZIndex(partName, this.defaultFacing)
      partContainer.zIndex = zIndex
      
      // Assembly Data
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

    // Add to main container
    for (const [_, { container }] of tempSprites) {
      this.container.addChild(container)
    }
    
    this.container.sortChildren()
    this.resetPose()
    this.container.visible = this.showStaticPose
    
    console.log('=== createParts END ===')
  }

  /**
   * Load character from config URL
   */
  async loadCharacter(configUrl: string): Promise<void> {
    if (!this.app || !this.container) {
      throw new Error('Renderer not initialized')
    }

    const configResponse = await fetch(configUrl)
    this.config = await configResponse.json()

    if (!this.config) throw new Error('Failed to load config')
    
    const sheetResponse = await fetch(this.config!.spritesheet)
    this.spritesheetData = await sheetResponse.json()

    await this.loadBaseTexture()
    this.createParts()
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

    console.log('[resetPose] Layout:', {
        hasAssemblyData,
        bounds: { minX, minY, maxX, maxY },
        content: { width: contentWidth, height: contentHeight },
        canvas: { width: canvasWidth, height: canvasHeight },
        scale: this.globalScale,
        center: { centerX, centerY }
    })

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
      // 同时应用素材朝向偏移量（rotationOffset）
      const restOffset = this.getRestPoseOffset(partName)
      const rotationOffset = this.getRotationOffset(partName)
      sprite.rotation = restOffset + rotationOffset

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

  /**
   * Set the container position (normalized 0-1 coordinates)
   * Used for path-based movement during recording
   * @param x - X position (0 = left edge, 1 = right edge)
   * @param y - Y position (0 = top edge, 1 = bottom edge)
   */
  setPosition(x: number, y: number): void {
    if (!this.container || !this.app) return
    
    // 使用 logicalWidth 计算 X 坐标
    // 在 side_by_side 模式下，container 是绘制在 renderTexture 上的
    // renderTexture 的宽度是 logicalWidth
    // 所以这里的 x 映射到 [0, logicalWidth]
    this.container.x = x * this.width
    this.container.y = y * this.height
    
    // Mark that we're using external position control
    this.useExternalPosition = true
  }

  /**
   * Reset to auto-center mode (position controlled by updatePose)
   */
  resetPositionControl(): void {
    this.useExternalPosition = false
  }

  /**
   * Get current container position (normalized 0-1 coordinates)
   */
  getPosition(): { x: number; y: number } {
    if (!this.container || !this.app) return { x: 0.5, y: 0.5 }
    
    return {
      x: this.container.x / this.app.screen.width,
      y: this.container.y / this.app.screen.height
    }
  }

  /**
   * Set container opacity (for fade in/out animations)
   * @param alpha - Alpha value (0 = transparent, 1 = opaque)
   */
  setOpacity(alpha: number): void {
    if (!this.container) return
    this.container.alpha = Math.max(0, Math.min(1, alpha))
  }

  /**
   * Set container scale (for entry/exit scale animations)
   * @param scale - Scale value
   */
  setScale(scale: number): void {
    if (!this.container) return
    // Preserve the flip state (negative scale means flipped)
    const flipSign = this.container.scale.x < 0 ? -1 : 1
    this.container.scale.set(scale * flipSign, scale)
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
  // Format: [minAngle, maxAngle] relative to default pose (arm hanging down)
  // 负值 = 向前/向上抬起
  // 正值 = 向后
  private static readonly ROTATION_LIMITS: Record<string, [number, number] | null> = {
    'head': [-Math.PI / 4, Math.PI / 4],  // ±45 degrees
    'body': [-Math.PI / 6, Math.PI / 6],  // ±30 degrees
    
    // 手臂和手部：暂时移除限制以便调试
    // 完全自由旋转 (-360° to +360°)
    'left-arm': [-Math.PI * 2, Math.PI * 2],
    'right-arm': [-Math.PI * 2, Math.PI * 2],
    'left-hand': [-Math.PI * 2, Math.PI * 2],
    'right-hand': [-Math.PI * 2, Math.PI * 2],
    
    // 裙子不旋转
    'skirt': null,
    
    // 左右大腿
    'left-thigh': [-Math.PI, Math.PI],
    'right-thigh': [-Math.PI, Math.PI],
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
    // Only set position if not controlled externally (via setPosition)
    if (!this.useExternalPosition) {
    const canvasWidth = this.app.screen.width
    const canvasHeight = this.app.screen.height
    this.container.x = canvasWidth / 2
    this.container.y = canvasHeight / 2
    }
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

    // Apply root offset (Jumping/Squatting)
    if (processedPose.rootOffset && this.container && !this.useExternalPosition) {
      const baseY = this.height / 2
      // rootOffset.y is normalized (0-1), convert to pixels
      // Jump is negative Y in MediaPipe, so we add it to move up in Pixi
      // Scaling factor 1.5 (reduced from 2.5) to make jump more natural
      const jumpOffset = processedPose.rootOffset.y * this.height * 1.5
      this.container.y = baseY + jumpOffset
    }

    // Update facing direction based on pipeline turn state
    // Use animated turn if we are in a turning state
    if (processedPose.turnState) {
      this.setFacingDirection(
        processedPose.turnState.currentFacing,
        processedPose.turnState.isTurning
      )
    }

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
   * 
   * 关键逻辑：用户的"左手"应该总是控制画面中"外侧"的手
   * 
   * 1. 当角色面朝左时（无论是默认还是转身后）：
   *    - 外侧是 left-arm，内侧是 right-arm
   *    - 用户左手 → left-arm（外侧）
   *    - 用户右手 → right-arm（内侧）
   * 
   * 2. 当角色面朝右时（无论是默认还是转身后）：
   *    - 外侧是 right-arm，内侧是 left-arm
   *    - 用户左手 → right-arm（外侧）
   *    - 用户右手 → left-arm（内侧）
   */
  private mapPartName(sourceName: string): string {
    // 计算当前视觉朝向
    const flipped = this.isFlipped()
    const currentVisualFacing = flipped 
      ? (this.defaultFacing === 'left' ? 'right' : 'left')
      : this.defaultFacing
    
    // 如果当前视觉面朝右，需要交换左右绑定
    const needsSwap = currentVisualFacing === 'right'
    
    if (needsSwap) {
      if (sourceName.startsWith('left-')) {
        return sourceName.replace('left-', 'right-')
      } else if (sourceName.startsWith('right-')) {
        return sourceName.replace('right-', 'left-')
      }
    }
    
    return sourceName
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
    // 每 30 帧记录一次详细日志（更频繁以便调试）
    const logMapping = this.frameCount % 30 === 1
    
    // 计算当前视觉朝向
    const flipped = this.isFlipped()
    const currentVisualFacing = flipped 
      ? (this.defaultFacing === 'left' ? 'right' : 'left')
      : this.defaultFacing
    
    if (logMapping) {
      console.log('=== applyPartAngles Debug ===')
      console.log('defaultFacing:', this.defaultFacing, '| isFlipped:', flipped, '| currentVisualFacing:', currentVisualFacing)
      console.log('Received angles:', JSON.stringify(angles, (_, v) => typeof v === 'number' ? (v * 180 / Math.PI).toFixed(1) + '°' : v))
      console.log('Available parts:', Array.from(this.parts.keys()))
    }
    
    for (const [sourcePartName, angle] of Object.entries(angles)) {
      // 使用映射逻辑获取目标部件名
      const targetPartName = this.mapPartName(sourcePartName)
      
      // 详细日志：每次映射（所有部件）
      if (logMapping) {
        console.log(`  MAP: "${sourcePartName}" -> "${targetPartName}" (angle: ${(angle * 180 / Math.PI).toFixed(1)}°)`)
      }

      const sprite = this.parts.get(targetPartName)
      if (!sprite) {
        if (logMapping) console.log(`  SKIP: sprite not found for "${targetPartName}"`)
        continue
      }

      const restPoseOffset = this.getRestPoseOffset(targetPartName)
      const rotationOffset = this.getRotationOffset(targetPartName)
      
      // 角度处理：
      // 
      // PoseProcessor 返回的角度反映了 atan2 的几何特性：
      // - 当用户举起双手时，left-arm ≈ +110°，right-arm ≈ -110°
      // - 符号相反是因为用户的左右手在屏幕的不同位置
      // 
      // 对于皮影戏角色（面朝左）：
      // - 外侧手臂（left-arm）：使用 rest + angle
      // - 内侧手臂（right-arm）：使用 rest - angle
      // 
      // 翻转后：
      // - scale.x = -1 会镜像所有旋转方向
      // - 所以需要交换公式
      let useAddition = false
      
      if (targetPartName.includes('arm') || targetPartName.includes('hand')) {
        // 视觉上的"内侧"部件（包括手臂和手）都需要用减法
        // - 面朝左时 (!flipped)：right-arm, right-hand 是内侧
        // - 面朝右时 (flipped)：left-arm, left-hand 是内侧
        const isVisuallyInner = 
          (!flipped && (targetPartName === 'right-arm' || targetPartName === 'right-hand')) || 
          (flipped && (targetPartName === 'left-arm' || targetPartName === 'left-hand'))
        
        // 内侧用减法，外侧用加法
        useAddition = !isVisuallyInner
      }
      
      // 不需要对角度本身做 inversion，而是改变公式
      // 
      // 增强腿部动作幅度：
      // 皮影戏的腿部通常需要更夸张的动作才能看清楚
      let adjustedAngle = angle
      if (targetPartName.includes('thigh') || targetPartName.includes('foot')) {
        adjustedAngle = angle * 1.5 
      }
      
      // Apply rotation limits to the RELATIVE angle (movement), not the final absolute rotation
      // This ensures limits work consistently regardless of sprite drawing direction
      let limitedAngle = adjustedAngle
      const limits = CharacterRenderer.ROTATION_LIMITS[targetPartName]
      if (limits) {
        const [minAngle, maxAngle] = limits
        limitedAngle = Math.max(minAngle, Math.min(maxAngle, limitedAngle))
      }

      // 根据部件位置选择不同的公式
      // - 外侧手臂：rest + angle
      // - 内侧手臂：rest - angle
      const finalRotation = useAddition 
        ? (restPoseOffset + limitedAngle + rotationOffset)
        : (restPoseOffset - limitedAngle + rotationOffset)

      sprite.rotation = finalRotation

      if (logMapping || shouldLog) {
        const isBehind = targetPartName.includes('arm') || targetPartName.includes('hand') 
          ? this.isPartBehindBody(targetPartName) : false
        const formula = useAddition ? 'rest+angle' : 'rest-angle'
        console.log(`  ${targetPartName}: angle=${(angle * 180 / Math.PI).toFixed(1)}° behind=${isBehind} flip=${flipped} formula=${formula} rest=${(restPoseOffset * 180 / Math.PI).toFixed(1)}° FINAL=${(finalRotation * 180 / Math.PI).toFixed(1)}°`)
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
   * 
   * If no skeleton data exists, uses DEFAULT_CONNECTION_POINTS as fallback
   */
  // 调试计数器
  private updateChildCallCount = 0
  
  private updateChildPositions(shouldLog: boolean): void {
    this.updateChildCallCount++
    const hasSkeleton = this.config?.skeleton?.joints && this.config?.skeleton?.bones
    
    // 每100次调用输出一次调试信息
    const debugHands = this.updateChildCallCount % 100 === 1
    
    if (debugHands) {
      console.log(`[updateChildPositions] called #${this.updateChildCallCount}, hasSkeleton=${hasSkeleton}, parts:`, Array.from(this.parts.keys()))
    }

    const joints = this.config?.skeleton?.joints || []
    const bones = this.config?.skeleton?.bones || []
    
    if (shouldLog && hasSkeleton) {
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
      
      // 对手部件进行详细调试
      const isHandPart = childName.includes('hand')
      if (isHandPart && debugHands) {
        console.log(`[Hand Debug] ${childName}:`, {
          hasChildContainer: !!childContainer,
          hasParentContainer: !!parentContainer,
          hasParentSprite: !!parentSprite,
          allPartContainers: Array.from(this.partContainers.keys()),
          allParts: Array.from(this.parts.keys())
        })
      }
      
      if (!childContainer || !parentContainer || !parentSprite) {
        if (isHandPart && debugHands) {
          console.log(`[Hand Debug] ${childName}: SKIPPED - missing container or sprite`)
        }
        continue
      }

      // Get assembly data
      const parentAssembly = this.assemblyData.get(parentName)
      const childAssembly = this.assemblyData.get(childName)
      
      if (isHandPart && debugHands) {
        console.log(`[Hand Debug] ${childName}: assembly data:`, {
          hasParentAssembly: !!parentAssembly,
          hasChildAssembly: !!childAssembly
        })
      }
      
      if (!parentAssembly || !childAssembly) {
        if (isHandPart && debugHands) {
          console.log(`[Hand Debug] ${childName}: SKIPPED - missing assembly data`)
        }
        continue
      }

      // 尝试从骨骼数据获取连接点，否则使用默认值
      let parentConnectionPoint: { x: number; y: number } | null = null
      let childConnectionPoint: { x: number; y: number } | null = null

      if (hasSkeleton && bones.length > 0) {
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

        if (parentJointId && childJointId) {
          // Find the actual joint objects
          const parentJoint = joints.find(j => j.part === parentName && j.id === parentJointId)
          const childJoint = joints.find(j => j.part === childName && j.id === childJointId)

          if (parentJoint && childJoint) {
            parentConnectionPoint = parentJoint.position
            childConnectionPoint = childJoint.position
            
            if (shouldLog) {
              console.log(`${childName} -> ${parentName}: using skeleton bone connection`, {
                parentJointId,
                childJointId
              })
            }
          }
        }
      }

      // Fallback: 使用默认连接点
      if (!parentConnectionPoint || !childConnectionPoint) {
        // Use getPartPivot to handle defaults and facing
        const childPivotForConn = this.getPartPivot(childName)
        const parentPivotForConn = this.getPartPivot(parentName)
        
        // 子部件连接点 = 子部件的 jointPivot（旋转轴就是连接点，比如手的手腕位置）
        childConnectionPoint = childPivotForConn
        
        // 父部件连接点：根据父部件的 pivot 计算对角位置
        // 核心逻辑：子部件连接到父部件 pivot 的对角位置
        // 例如：手臂 pivot 在肩膀（上方），则手腕在下方
        if (parentName === 'body' && parentPivotForConn.x === 0.5 && parentPivotForConn.y === 0.5) {
          // Special fallback for Body: connect at bottom center if no specific pivot
          parentConnectionPoint = { x: 0.5, y: 0.9 }
        } else {
          // 计算 pivot 的对角位置作为连接点
          parentConnectionPoint = {
            x: 1 - parentPivotForConn.x,
            y: 1 - parentPivotForConn.y
          }
        }
        
        // 调试输出
        if (debugHands && (childName.includes('hand') || childName.includes('arm'))) {
          console.log(`[Connection] ${childName} -> ${parentName}:`, {
            parentPivot: parentPivotForConn,
            parentConn: parentConnectionPoint,
            childPivot: childPivotForConn,
            childConn: childConnectionPoint
          })
        }
      }

      // Use parent container's CURRENT position (not initial position)
      // This ensures child follows parent even when parent has moved
      const parentCurrentX = parentContainer.position.x
      const parentCurrentY = parentContainer.position.y

      // Get parent's current rotation
      const parentRotation = parentSprite.rotation

      // Get parent's pivot point (the anchor point for rotation)
      const parentPivot = this.getPartPivot(parentName)
      const parentPivotX = parentPivot.x
      const parentPivotY = parentPivot.y

      // Calculate parent connection point position relative to parent's PIVOT (not center)
      // Connection point position is in 0-1 coordinates, pivot is also in 0-1 coordinates
      const parentJointFromPivotX = (parentConnectionPoint.x - parentPivotX) * parentAssembly.width * this.globalScale
      const parentJointFromPivotY = (parentConnectionPoint.y - parentPivotY) * parentAssembly.height * this.globalScale

      // Rotate the parent connection point position by parent's rotation
      const cos = Math.cos(parentRotation)
      const sin = Math.sin(parentRotation)
      const rotatedParentJointX = parentJointFromPivotX * cos - parentJointFromPivotY * sin
      const rotatedParentJointY = parentJointFromPivotX * sin + parentJointFromPivotY * cos

      // Parent connection point's world position after rotation
      // Use current container position instead of initial position
      const parentJointWorldX = parentCurrentX + rotatedParentJointX
      const parentJointWorldY = parentCurrentY + rotatedParentJointY

      // Get child's pivot point
      const childPivot = this.getPartPivot(childName)
      const childPivotX = childPivot.x
      const childPivotY = childPivot.y

      // Child connection point position relative to child's PIVOT (before rotation)
      const childJointFromPivotX = (childConnectionPoint.x - childPivotX) * childAssembly.width * this.globalScale
      const childJointFromPivotY = (childConnectionPoint.y - childPivotY) * childAssembly.height * this.globalScale

      // Get child's current rotation to rotate the joint offset
      const childSprite = this.parts.get(childName)
      const childRotation = childSprite?.rotation ?? 0
      
      // Rotate child connection point offset by child's rotation
      const childCos = Math.cos(childRotation)
      const childSin = Math.sin(childRotation)
      const rotatedChildJointX = childJointFromPivotX * childCos - childJointFromPivotY * childSin
      const rotatedChildJointY = childJointFromPivotX * childSin + childJointFromPivotY * childCos

      // Child's new pivot position: move child so its connection point aligns with parent's connection point
      // childNewPivot + rotatedChildJoint = parentJointWorld
      // childNewPivot = parentJointWorld - rotatedChildJoint
      const newChildX = parentJointWorldX - rotatedChildJointX
      const newChildY = parentJointWorldY - rotatedChildJointY

      childContainer.position.set(newChildX, newChildY)

      // 调试：对于手部件，输出详细信息
      if (shouldLog || (debugHands && isHandPart)) {
        console.log(`${childName} position update:`, {
          parentName,
          parentPos: { x: parentCurrentX.toFixed(1), y: parentCurrentY.toFixed(1) },
          parentRot: (parentRotation * 180 / Math.PI).toFixed(1) + '°',
          parentConn: parentConnectionPoint,
          childConn: childConnectionPoint,
          newPos: { x: newChildX.toFixed(1), y: newChildY.toFixed(1) }
        })
      }
    }
  }

  /**
   * Update Z-Index for all parts based on current facing
   */
  private updateZIndices(forceFlipped?: boolean): void {
    const isFlipped = forceFlipped ?? (this.container?.scale.x ? this.container.scale.x < 0 : false)
    
    for (const [partName, container] of this.partContainers) {
      const zIndex = calculatePartZIndex(partName, this.defaultFacing, isFlipped)
      container.zIndex = zIndex
    }
    
    // Trigger sort
    if (this.container) {
      this.container.sortChildren()
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

    let canvasWidth = width
    if (this.renderMode === 'side_by_side') {
      canvasWidth = width * 2
    }

    this.app.renderer.resize(canvasWidth, height)
    
    // Update stored dimensions
    this.width = width
    this.height = height
    
    // Handle side-by-side resizing
    if (this.renderMode === 'side_by_side' && this.renderTexture) {
      this.renderTexture.resize(width, height)
      if (this.maskSprite) this.maskSprite.x = width
    }

    // Only reset position if not using external control
    if (!this.useExternalPosition) {
      this.container.x = width / 2
      this.container.y = height / 2
    }
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
      const rotationOffset = this.getRotationOffset(partName)
      sprite.rotation = rotation + offset + rotationOffset
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
    const rotationOffset = this.getRotationOffset(partName)
    return sprite.rotation - offset - rotationOffset
  }

  /**
   * Get all part names
   */
  getPartNames(): string[] {
    return Array.from(this.parts.keys())
  }

  /**
   * 将局部姿势转换为全局姿势（处理父子旋转继承）
   * @param localPose 局部姿势数据
   */
  private computeGlobalPose(localPose: Record<string, number>): Record<string, number> {
    const globalPose: Record<string, number> = {}
    const parentMap = new Map<string, string>()
    
    // 构建父子关系映射
    CharacterRenderer.CHILD_PARENT_PAIRS.forEach(([child, parent]) => {
      parentMap.set(child, parent)
    })
    // 动态添加脚部的父级关系
    const leftFootParent = this.getFootParent('left-foot')
    if (leftFootParent) parentMap.set('left-foot', leftFootParent)
    const rightFootParent = this.getFootParent('right-foot')
    if (rightFootParent) parentMap.set('right-foot', rightFootParent)

    // 递归计算全局旋转
    const getPartGlobal = (part: string): number => {
      // 如果已经计算过，直接返回
      if (globalPose[part] !== undefined) return globalPose[part]
      
      let rot = 0
      
      // 1. 获取自身的局部旋转
      if (localPose[part] !== undefined) {
        rot = localPose[part]
      } else {
        // 如果不在 pose 中，获取当前的"局部"旋转？
        // 实际上，如果父级也在 pose 中，我们希望未指定的子级保持当前的相对关系吗？
        // 简化处理：如果不在 pose 中，我们使用当前的全局旋转减去父级的全局旋转
        // 但这里我们只关心在 localPose 中存在的部件（以及它们的父级）
        // 如果部件不在 localPose 中，但在递归链中被需要（作为父级），
        // 我们直接使用它当前的全局旋转作为基准。
        return this.getPartRotation(part)
      }
      
      // 2. 获取父级的全局旋转并累加
      const parent = parentMap.get(part)
      if (parent) {
        rot += getPartGlobal(parent)
      }
      
      globalPose[part] = rot
      return rot
    }

    // 只计算 localPose 中包含的部件
    Object.keys(localPose).forEach(part => {
      globalPose[part] = getPartGlobal(part)
    })

    return globalPose
  }

  /**
   * Apply a preset pose (set multiple part rotations at once)
   * @param pose Record of part name to rotation angle (in radians), relative to rest pose
   */
  applyPresetPose(pose: Record<string, number>): void {
    const adjustedPose = this.adjustPoseForFacing(pose)
    const globalPose = this.computeGlobalPose(adjustedPose)
    
    for (const [partName, rotation] of Object.entries(globalPose)) {
      const sprite = this.parts.get(partName)
      if (sprite) {
        const offset = this.getRestPoseOffset(partName)
        const rotationOffset = this.getRotationOffset(partName)
        sprite.rotation = rotation + offset + rotationOffset
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
      const rotationOffset = this.getRotationOffset(partName)
      sprite.rotation = offset + rotationOffset
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
    // 将局部姿势转换为全局目标姿势（处理父子旋转继承）
    const globalTargetPose = this.computeGlobalPose(adjustedPose)
    
    for (const partName of Object.keys(globalTargetPose)) {
      // 当前的相对角度
      startPose[partName] = this.getPartRotation(partName)
      // 目标的全局角度
      targetPose[partName] = globalTargetPose[partName]
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
        const rotationOffset = this.getRotationOffset(partName)
        const sprite = this.parts.get(partName)
        if (sprite) {
          sprite.rotation = currentRelativeRotation + offset + rotationOffset
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
    this.updateZIndices()
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
    let zIndexUpdated = false

    const animate = () => {
      if (!this.container) return

      const elapsed = Date.now() - startTime
      const progress = Math.min(elapsed / duration, 1)

      // Update Z-Index when crossing the middle point (when character is "flat")
      if (progress >= 0.5 && !zIndexUpdated) {
        this.updateZIndices(targetScaleX < 0)
        zIndexUpdated = true
      }

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
        // Final ensure
        if (!zIndexUpdated) this.updateZIndices()
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
    // 更新 z-index 以反映新的朝向
    this.updateZIndices()
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
   * Update configuration and rebuild character
   */
  async updateConfig(config: CharacterConfig, spritesheetData: SpritesheetData): Promise<void> {
    this.config = config
    this.spritesheetData = spritesheetData
    
    // Clear existing parts
    if (this.container) {
      this.container.removeChildren()
    }
    this.parts.clear()
    this.partContainers.clear()
    this.assemblyData.clear()
    
    // Re-create parts with new config
    this.createParts()
    this.updateChildPositions(true)
  }

  /**
   * Manual render trigger (mostly for initial setup)
   * PixiJS handles the loop automatically, but we might want to force an update
   */
  render(): void {
    this.updateChildPositions(true)
    this.app?.render()
  }

  /**
   * Destroy the renderer
   */
  async destroy(): Promise<void> {
    // 先标记为未初始化，防止其他方法继续操作
    this.initialized = false
    
    if (this.app?.ticker) {
      // Check if renderToTexture exists before removing (it might be bound)
      // Note: this.renderToTexture needs to be bound or use arrow function if passed directly
      // In init: this.app.ticker.add(this.renderToTexture, this) handles binding context
      this.app.ticker.remove(this.renderToTexture, this)
    }

    this.clearParts()
    
    // Cleanup Side-by-Side resources
    if (this.renderTexture) {
      this.renderTexture.destroy(true)
      this.renderTexture = null
    }
    this.previewSprite = null
    this.maskSprite = null
    this.colorMatrix = null

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
