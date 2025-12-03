# 动捕系统修复方案

## 问题分析

### 问题1：下身部件挤在一起
**现象**：裙子、腿和脚都挤在身体中心附近

**原因**：
1. 在动捕模式下，只有手臂有旋转数据（因为只绑定了手臂）
2. 身体、裙子、腿、脚没有绑定 MediaPipe 关键点，所以保持默认位置
3. `updateChildPositions` 计算的是相对位置，但父部件（body, skirt）的位置不对

**解决方案**：
1. 在动捕模式下，不应该移动身体位置，只旋转手臂
2. 身体、裙子、腿、脚应该保持在 `resetPose` 时设置的位置
3. 只有手臂和手需要根据 MediaPipe 数据旋转

### 问题2：手臂旋转不准确
**现象**：手臂角度与实际姿势不完全匹配

**原因**：
1. MediaPipe 的肩膀有宽度（左肩11、右肩12是分开的）
2. 但皮影人物的手臂是从身体中心连接的
3. 这导致旋转中心不匹配

**解决方案**：
1. 计算手臂角度时，使用肩膀到手肘的向量
2. 但要考虑肩膀相对于身体中心的偏移
3. 或者：使用身体中心到手肘的向量（更简单）

## 修复步骤

### Step 1: 修复下身挤压问题

在 `updatePose` 中，确保只更新有绑定的部件的旋转，不要移动它们的位置。

```typescript
// 在 updatePose 中，不要改变 container 的位置
// 只旋转有绑定的部件（手臂、手）
```

### Step 2: 优化手臂旋转计算

选项A：使用身体中心到手肘的向量
```typescript
// 计算身体中心
const bodyCenter = {
  x: (leftShoulder.x + rightShoulder.x) / 2,
  y: (leftShoulder.y + rightShoulder.y) / 2
}

// 左臂：从身体中心到左手肘
const leftElbow = landmarks[13]
const dx = leftElbow.x - bodyCenter.x
const dy = leftElbow.y - bodyCenter.y
const leftArmAngle = Math.atan2(dy, dx)
```

选项B：使用肩膀到手肘，但补偿肩宽
```typescript
// 保持现有的肩膀到手肘计算
// 但在最终角度上加上一个补偿值
const shoulderOffset = Math.atan2(
  leftShoulder.y - bodyCenter.y,
  leftShoulder.x - bodyCenter.x
)
const leftArmAngle = mediaPipeAngle - shoulderOffset
```

### Step 3: 添加平滑滤波

为了减少抖动，添加简单的移动平均滤波：

```typescript
private angleHistory: Map<string, number[]> = new Map()
private readonly SMOOTHING_WINDOW = 3

private smoothAngle(partName: string, angle: number): number {
  if (!this.angleHistory.has(partName)) {
    this.angleHistory.set(partName, [])
  }
  
  const history = this.angleHistory.get(partName)!
  history.push(angle)
  
  if (history.length > this.SMOOTHING_WINDOW) {
    history.shift()
  }
  
  return history.reduce((sum, a) => sum + a, 0) / history.length
}
```

## 测试计划

1. 修复下身挤压问题后，测试：
   - 站立姿势：下身应该正常显示
   - 手臂摆动：只有手臂动，身体和下身不动

2. 优化手臂旋转后，测试：
   - 双手自然下垂：皮影手臂下垂
   - 双手举高：皮影手臂举高
   - 单手侧平举：皮影手臂水平

3. 添加平滑滤波后，测试：
   - 手臂摆动：应该更流畅，减少抖动
