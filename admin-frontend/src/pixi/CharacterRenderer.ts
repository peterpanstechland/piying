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
} from 'pixi.js'
import type {
  CharacterConfig,
  SpritesheetData,
  PoseLandmarks,
  FrameData,
} from './types'

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
  'upper-leg': 'body',
  'left-foot': 'upper-leg',
  'right-foot': 'upper-leg',
}

// Export to prevent unused variable error
export { BONE_HIERARCHY }

// 默认关节锚点 (0-1)，当 spritesheet.json 中没有配置时使用
// 根据嫦娥素材调整：手臂垂直绘制，手水平绘制
const DEFAULT_JOINT_PIVOTS: Record<string, { x: number; y: number }> = {
  'head': { x: 0.5, y: 0.9 },       // 脖子处（头部底部）
  'body': { x: 0.5, y: 0.5 },       // 身体中心
  'left-arm': { x: 0.5, y: 0.1 },   // 左肩（素材顶部，垂直绘制）
  'right-arm': { x: 0.5, y: 0.1 },  // 右肩（素材顶部，垂直绘制）
  'left-hand': { x: 0.9, y: 0.5 },  // 左手腕（水平绘制，连接点在右侧）
  'right-hand': { x: 0.1, y: 0.5 }, // 右手腕（水平绘制，连接点在左侧）
  'upper-leg': { x: 0.5, y: 0.1 },  // 腿根部
  'left-foot': { x: 0.5, y: 0.1 },  // 脚踝
  'right-foot': { x: 0.5, y: 0.1 }, // 脚踝
}

// 默认旋转偏移量（弧度），当 spritesheet.json 中没有配置时使用
// 这个值表示素材的"自然朝向"与"水平向右"之间的角度差
// 
// MediaPipe 角度计算：atan2(dy, dx)，水平向右为 0 度
// 如果素材是垂直向下绘制的，需要偏移 -Math.PI/2 (或 3*Math.PI/2)
// 如果素材是水平向右绘制的，偏移为 0
// 如果素材是水平向左绘制的，偏移为 Math.PI
//
// 嫦娥素材分析：
// - 手臂：垂直向下绘制 -> 偏移 Math.PI/2
// - 手：水平绘制
const DEFAULT_ROTATION_OFFSETS: Record<string, number> = {
  'head': 0,                    // 头部不旋转
  'body': 0,                    // 身体不旋转
  'left-arm': Math.PI / 2,      // 垂直向下绘制
  'right-arm': Math.PI / 2,     // 垂直向下绘制
  'left-hand': Math.PI / 2,     // 需要根据实际素材调整
  'right-hand': Math.PI / 2,    // 需要根据实际素材调整
  'upper-leg': Math.PI / 2,
  'left-foot': Math.PI / 2,
  'right-foot': Math.PI / 2,
}

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

  // Store assembly data for position calculations
  private assemblyData: Map<string, { x: number, y: number, width: number, height: number }> = new Map()
  private globalScale = 1

  // Reference pose for calculating relative transforms (reserved for future use)
  // @ts-expect-error Reserved for future relative pose calculation
  private referencePose: PoseLandmarks | null = null
  // @ts-expect-error Reserved for future relative pose calculation  
  private useReferencePose = false

  /**
   * Initialize the PixiJS application
   */
  async init(canvas: HTMLCanvasElement, width: number, height: number): Promise<void> {
    if (this.initialized) {
      await this.destroy()
    }

    this.app = new Application()
    await this.app.init({
      canvas,
      width,
      height,
      backgroundColor: 0x1a1a2e,
      antialias: true,
      resolution: window.devicePixelRatio || 1,
      autoDensity: true,
    })

    this.container = new Container()
    this.container.x = width / 2
    this.container.y = height / 2
    // 【关键修复 3】开启 Z轴排序，防止层级错乱
    this.container.sortableChildren = true
    this.app.stage.addChild(this.container)

    this.initialized = true
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

      // 优先使用 JSON 中配置的 jointPivot（关节锚点），否则用默认值
      // jointPivot 用于旋转动画，pivot 用于组装位置
      const jointPivot = frameData.jointPivot
      const defaultPivot = DEFAULT_JOINT_PIVOTS[partName]
      const pivotX = jointPivot?.x ?? defaultPivot?.x ?? frameData.pivot?.x ?? 0.5
      const pivotY = jointPivot?.y ?? defaultPivot?.y ?? frameData.pivot?.y ?? 0.5
      sprite.anchor.set(pivotX, pivotY)

      // Create a container for this part (for hierarchical transforms)
      const partContainer = new Container()
      partContainer.addChild(sprite)
      
      // 【关键修复 3】应用 Z-Index
      partContainer.zIndex = frameData.zIndex || 0
      
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
    this.globalScale = Math.min(scaleX, scaleY, 1) // Don't scale up, only down

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
      sprite.rotation = 0

      // Use global position directly (flat structure)
      container.position.set(globalPos.x, globalPos.y)
      container.rotation = 0
      
      // Save initial position for child-parent calculations
      this.initialPositions.set(partName, { x: globalPos.x, y: globalPos.y })
    }
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
  }

  // Default rotation bindings for parts (MediaPipe Pose landmarks)
  // Maps part name to [startLandmark, endLandmark] for rotation calculation
  // 0: nose, 11: left_shoulder, 12: right_shoulder, 13: left_elbow, 14: right_elbow
  // 15: left_wrist, 16: right_wrist, 23: left_hip, 24: right_hip
  private static DEFAULT_ROTATION_BINDINGS: Record<string, [number, number] | null> = {
    'head': null,              // head doesn't rotate for now
    'body': null,              // body doesn't rotate
    'left-arm': [11, 13],      // left shoulder to left elbow
    'right-arm': [12, 14],     // right shoulder to right elbow
    'left-hand': [13, 15],     // left elbow to left wrist
    'right-hand': [14, 16],    // right elbow to right wrist
    'upper-leg': [23, 25],     // left hip to left knee (use left leg as reference)
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
    'upper-leg': [-Math.PI / 6, Math.PI / 6],  // ±30 degrees for legs
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

    if (!this.config || !this.app || !this.spritesheetData || !this.container) {
      if (shouldLog) {
        console.warn('updatePose early return - missing:', {
          config: !this.config,
          app: !this.app,
          spritesheetData: !this.spritesheetData,
          container: !this.container
        })
      }
      return
    }

    // If no landmarks, show/hide based on showStaticPose setting
    if (!landmarks) {
      this.container.visible = this.showStaticPose
      return
    }

    // Always show container when we have pose data
    this.container.visible = true

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
          const dx = (1 - endLm.x) - (1 - startLm.x)
          const dy = endLm.y - startLm.y
          const absoluteAngle = Math.atan2(dy, dx)
          
          this.absoluteAngles.set(partName, absoluteAngle)
          
          if (shouldLogFrame) {
            console.log(`  -> Angle: ${(absoluteAngle * 180 / Math.PI).toFixed(1)}°`)
          }
        }
      }
    }

    if (shouldLogFrame) {
      console.log('Calculated angles:', Object.fromEntries(this.absoluteAngles))
    }

    // Step 2: Apply rotations to SPRITES
    // We rotate sprites directly because container positions are set up for hierarchy
    for (const [partName, sprite] of this.parts) {
      const absoluteAngle = this.absoluteAngles.get(partName)
      
      if (absoluteAngle !== undefined) {
        const rotationOffset = this.getRotationOffset(partName)
        let finalRotation = absoluteAngle - rotationOffset
        
        // Apply rotation limits if defined
        const limits = CharacterRenderer.ROTATION_LIMITS[partName]
        if (limits) {
          const [minAngle, maxAngle] = limits
          finalRotation = Math.max(minAngle, Math.min(maxAngle, finalRotation))
        }
        
        // Apply rotation to sprite
        sprite.rotation = finalRotation
        
        if (shouldLogFrame) {
          console.log(`✓ ROTATION ${partName}: ${(finalRotation * 180 / Math.PI).toFixed(1)}°${limits ? ' (limited)' : ''}`)
        }
      }
    }

    // Step 3: Update hand positions to follow arm rotation
    // Hands should be positioned at the end of the arm (wrist position)
    // Step 3: Update child positions to follow parent rotation
    this.updateChildPositions(shouldLogFrame)
    
    if (shouldLogFrame) {
      console.log('=== End Frame ===\n')
    }
  }

  // Store initial hand offsets from arm (calculated in resetPose)
  // Store initial child offsets from parent (calculated on first update)
  private childOffsets: Map<string, { x: number; y: number }> = new Map()

  // Child-Parent pairs for position following
  // Format: [childName, parentName]
  private static readonly CHILD_PARENT_PAIRS: [string, string][] = [
    ['left-hand', 'left-arm'],
    ['right-hand', 'right-arm'],
    ['left-foot', 'upper-leg'],
    ['right-foot', 'upper-leg'],
  ]

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
      if (shouldLog) console.log('No skeleton data')
      return
    }

    const joints = this.config.skeleton.joints
    const bones = this.config.skeleton.bones
    
    for (const [childName, parentName] of CharacterRenderer.CHILD_PARENT_PAIRS) {
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
          console.log(`${childName}: no bone connection to ${parentName}`)
        }
        continue
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

      // Get initial positions (pivot positions from resetPose)
      const parentInitial = this.initialPositions.get(parentName)
      if (!parentInitial) continue

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
      // parentInitial is the pivot position
      const parentJointWorldX = parentInitial.x + rotatedParentJointX
      const parentJointWorldY = parentInitial.y + rotatedParentJointY

      // Get child's pivot point
      const childFrameData = this.spritesheetData?.frames[childName] as FrameDataWithAssembly | undefined
      const childPivotX = childFrameData?.jointPivot?.x ?? DEFAULT_JOINT_PIVOTS[childName]?.x ?? 0.5
      const childPivotY = childFrameData?.jointPivot?.y ?? DEFAULT_JOINT_PIVOTS[childName]?.y ?? 0.5

      // Child joint position relative to child's PIVOT
      const childJointFromPivotX = (childJoint.position.x - childPivotX) * childAssembly.width * this.globalScale
      const childJointFromPivotY = (childJoint.position.y - childPivotY) * childAssembly.height * this.globalScale

      // Child's new pivot position: move child so its joint aligns with parent's joint
      // childNewPivot + childJointFromPivot = parentJointWorld
      // childNewPivot = parentJointWorld - childJointFromPivot
      const newChildX = parentJointWorldX - childJointFromPivotX
      const newChildY = parentJointWorldY - childJointFromPivotY

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
        return [binding.landmarks[0], binding.landmarks[1]]
      } else if (binding?.rotationLandmark != null && binding?.landmarks?.length >= 1) {
        return [binding.landmarks[0], binding.rotationLandmark]
      }
    }
    // Always fall back to default bindings
    return CharacterRenderer.DEFAULT_ROTATION_BINDINGS[partName] || null
  }

  /**
   * 根据素材实际绘制方向获取旋转偏移量
   * 
   * 优先从 spritesheet.json 的 rotationOffset 字段读取，
   * 如果没有配置则使用默认值。
   * 
   * 素材朝向说明：
   * - 如果素材是垂直向下画的 -> 偏移 Math.PI / 2 (1.5708)
   * - 如果素材是水平向右画的 -> 偏移 0
   * - 如果素材是水平向左画的 -> 偏移 Math.PI (3.1416)
   */
  private getRotationOffset(partName: string): number {
    // 优先从 spritesheet.json 读取配置
    if (this.spritesheetData) {
      const frameData = this.spritesheetData.frames[partName] as FrameDataWithAssembly
      if (frameData?.rotationOffset !== undefined) {
        return frameData.rotationOffset
      }
    }
    // 使用默认值
    return DEFAULT_ROTATION_OFFSETS[partName] ?? Math.PI / 2
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
   * Destroy the renderer
   */
  async destroy(): Promise<void> {
    this.clearParts()

    if (this.container) {
      this.container.destroy()
      this.container = null
    }

    if (this.app) {
      this.app.destroy()
      this.app = null
    }

    this.config = null
    this.spritesheetData = null
    this.baseTexture = null
    this.initialized = false
  }
}

// Note: Don't use singleton - each component should create its own instance
// to avoid shared state issues
