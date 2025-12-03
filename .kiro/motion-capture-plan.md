# 动捕系统完善方案

## 问题分析

### 当前问题
1. **手臂方向相反**：双手放下时皮影手臂举高，双手举高时皮影手臂放下
2. **坐标系混乱**：镜像翻转、素材朝向、默认姿势等多个坐标系没有统一处理

### 根本原因
1. `updatePose` 中对 MediaPipe 坐标做了镜像翻转 `(1 - x)`
2. 没有正确使用 `rest_pose_offset`（默认姿势偏移）
3. `rotation_offset`（素材朝向偏移）和实际旋转计算混淆

## 坐标系统一

### 1. MediaPipe 坐标系
- 原点：左上角 (0, 0)
- X 轴：向右为正
- Y 轴：向下为正
- 角度：`atan2(dy, dx)`，水平向右为 0°，逆时针为正

### 2. 素材坐标系
- 每个素材有自己的"自然朝向"
- 通过 `rotation_offset` 记录素材朝向与"水平向右"的角度差
- 例如：手臂素材如果是垂直向下，则 `rotation_offset = Math.PI/2`

### 3. 默认姿势坐标系
- 角色的"自然站立"姿势
- 通过 `rest_pose_offset` 记录每个部件在默认姿势下的角度
- 例如：手臂自然下垂时，`rest_pose_offset = Math.PI/2`（垂直向下）

### 4. 角色朝向
- `defaultFacing`: 'left' | 'right'
- 影响动画旋转方向的计算
- 面向左的角色，正值旋转是顺时针（向前）
- 面向右的角色，正值旋转是逆时针（向前）

## 旋转角度计算公式

### 最终公式
```typescript
// 1. 从 MediaPipe 计算绝对角度（不镜像）
const dx = endLm.x - startLm.x
const dy = endLm.y - startLm.y
const mediaPipeAngle = Math.atan2(dy, dx)

// 2. 获取配置
const rotationOffset = getRotationOffset(partName)  // 素材朝向偏移
const restPoseOffset = getRestPoseOffset(partName)  // 默认姿势偏移

// 3. 计算最终旋转
// mediaPipeAngle: MediaPipe 检测到的角度
// restPoseOffset: 默认姿势下该部件应该的角度
// rotationOffset: 素材本身的朝向偏移
const sprite.rotation = mediaPipeAngle - restPoseOffset + rotationOffset
```

### 公式解释
- `mediaPipeAngle`: 当前检测到的实际角度
- `restPoseOffset`: 默认姿势的角度（作为基准）
- `mediaPipeAngle - restPoseOffset`: 相对于默认姿势的旋转量
- `+ rotationOffset`: 补偿素材本身的朝向

## 实现步骤

### Step 1: 修复 updatePose 中的镜像问题
移除 `(1 - x)` 的镜像翻转，使用原始 MediaPipe 坐标

### Step 2: 正确使用 rest_pose_offset
从 spritesheet.json 中读取 `rest_pose_offset`，在计算旋转时使用

### Step 3: 统一 rotation_offset 的使用
确保 `rotation_offset` 只用于补偿素材朝向，不参与动画计算

### Step 4: 添加旋转限制
为每个部件添加合理的旋转范围限制，防止不自然的动作

### Step 5: 测试和调试
在摄像头测试页面验证各种姿势的正确性

## 配置示例

### spritesheet.json
```json
{
  "frames": {
    "left-arm": {
      "rotationOffset": 1.57,  // 素材朝向：垂直向下 (90°)
      "restPoseOffset": 1.57,  // 默认姿势：垂直向下 (90°)
      "jointPivot": { "x": 0.5, "y": 0.1 }  // 肩膀位置
    }
  }
}
```

### 角色配置
```json
{
  "defaultFacing": "left",  // 角色面向左
  "restPoseOffsets": {
    "left-arm": 1.57,   // 手臂自然下垂
    "right-arm": 1.57,
    "left-hand": 0,     // 手自然放松
    "right-hand": 0
  }
}
```
