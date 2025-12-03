# 前端动捕系统集成完成

## 完成的工作

### 1. 新的录制页面 (RecordingPage)

**主要改进：**
- ✅ 移除了独立的倒计时页面 (CountdownPage)
- ✅ 主区域显示皮影人物实时动捕（使用 CharacterRenderer）
- ✅ 左下角小窗口显示摄像头画面（320x240，镜像翻转）
- ✅ 顶部显示动作引导文本和倒计时
- ✅ 自动校准（检测到人体后30帧自动校准）
- ✅ 底部进度条显示录制进度

**三种状态：**
1. **校准中**：显示校准进度 (0-30帧)
2. **准备开始**：校准完成，准备录制
3. **录制中**：显示动作引导、倒计时和进度条

### 2. 复制的文件

从 admin-frontend 复制到 frontend：
- `src/pixi/CharacterRenderer.ts` - 角色渲染器
- `src/pixi/types.ts` - 类型定义
- `src/pixi/index.ts` - 导出文件

### 3. 状态机更新

**移除的状态：**
- `SEGMENT_COUNTDOWN` - 倒计时状态

**更新的转换：**
- `SEGMENT_GUIDE` → `SEGMENT_RECORD` (直接跳转，不再经过倒计时)

### 4. 依赖安装

```bash
npm install pixi.js@8.0.0
```

### 5. 数据流

```
CameraDetectionService (检测姿态)
  ↓
handleDetection (App.tsx)
  ↓
poseCallbackRef.current (传递给 RecordingPage)
  ↓
CharacterRenderer.updatePose (更新皮影姿态)
  +
MotionCaptureRecorder.addFrame (录制姿态数据)
```

## 文件修改清单

### 新增文件
- `frontend/src/components/RecordingPage.tsx` (替换旧版本)
- `frontend/src/components/RecordingPage.css` (新样式)
- `frontend/src/pixi/CharacterRenderer.ts`
- `frontend/src/pixi/types.ts`
- `frontend/src/pixi/index.ts`

### 修改文件
- `frontend/src/App.tsx`
  - 移除 CountdownPage 导入
  - 添加 poseCallbackRef
  - 更新 handleDetection 以调用 poseCallbackRef
  - 更新 RecordingPage props
  
- `frontend/src/state/state-machine.ts`
  - 移除 SEGMENT_COUNTDOWN 状态
  - 更新状态转换映射

### 备份文件
- `frontend/src/components/RecordingPage.old.tsx` (旧版本)
- `frontend/src/components/RecordingPage.old.css` (旧样式)

## 下一步

### 需要测试的功能
1. ✅ 摄像头画面显示
2. ✅ 自动校准流程
3. ✅ 皮影人物实时动捕
4. ✅ 动作引导文本显示
5. ✅ 录制进度和倒计时
6. ⏳ 角色配置加载（需要后端 API）
7. ⏳ 动作引导文本配置（需要从故事线获取）

### 待完成的集成
1. **角色配置 API**：
   - 前端需要访问 `/api/characters/{id}/config.json`
   - 需要确保后端提供此接口

2. **动作引导配置**：
   - 从故事线段落配置中获取动作引导文本
   - 更新 `segmentGuidance` prop

3. **场景背景**：
   - 可选：添加场景背景图到 CharacterRenderer

## 使用说明

### 启动前端开发服务器
```bash
cd frontend
npm run dev
```

### 测试流程
1. 站在摄像头前
2. 系统自动检测并进入场景选择
3. 选择场景和角色
4. 进入段落引导页面
5. 站在检测框内倒计时
6. **新：直接进入录制页面**
   - 自动校准（30帧）
   - 显示动作引导
   - 实时显示皮影动捕
   - 左下角显示摄像头画面
7. 录制完成后进入审核页面

## 技术细节

### CharacterRenderer 集成
- 使用 PixiJS 8.0 渲染引擎
- 支持自动校准和相对角度计算
- 支持左右朝向的角色
- 支持飞行状态（跳跃）和走路动作

### 性能优化
- 校准进度每5帧更新一次（减少重渲染）
- 使用 useRef 避免不必要的状态更新
- Canvas 渲染独立于 React 渲染周期

### 样式特点
- 深色渐变背景
- 摄像头小窗口带圆角和阴影
- 动作引导文本大而醒目（48px，金色）
- 倒计时超大显示（72px）
- 录制指示器带闪烁动画
- 底部进度条带渐变和发光效果
- 响应式设计（移动端适配）

## 已知问题

1. **角色配置路径**：
   - 当前使用 `/api/characters/{id}/config.json`
   - 需要确认后端是否提供此接口

2. **动作引导文本**：
   - 当前使用 i18n 翻译键
   - 应该从故事线配置中获取

3. **脚部层级问题**：
   - 飞行状态下脚可能翻到裙子前面
   - 已在 CharacterRenderer 中添加 z-index 保护

## 总结

前端动捕系统已成功集成！用户现在可以在录制时看到：
- 实时的皮影人物动捕效果（主区域）
- 自己的摄像头画面（左下角小窗口）
- 清晰的动作引导和倒计时

这大大提升了用户体验，让互动更加直观和有趣！
