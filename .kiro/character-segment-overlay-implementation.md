# 角色专属段落配置与Overlay效果实现

## 概述
实现了从后台获取角色专属段落配置，并在视频渲染时应用入场/出场动画和路径移动效果。

## 实现流程

### 1. 前端获取角色专属段落配置

**API端点**: `GET /api/storylines/{storyline_id}/characters/{character_id}/segments`

**位置**: `backend/app/api/storylines.py`

**功能**:
- 优先返回角色专属的视频段落配置
- 如果没有角色专属配置，返回基础storyline的段落配置
- 包含每个段落的完整配置：
  - 时长 (duration)
  - 路径类型 (path_type)
  - 起始/结束偏移 (offset_start/offset_end)
  - 入场动画 (entry_type, entry_duration, entry_delay)
  - 出场动画 (exit_type, exit_duration, exit_delay)

**前端调用**: `frontend/src/App.tsx` 中的 `handleCharacterSelect` 函数
```typescript
const segmentData = await apiClientRef.current.getCharacterVideoSegments(
  selectedScene.id,
  characterId
);
```

### 2. Session创建时存储角色信息

**API端点**: `POST /api/sessions`

**位置**: `backend/app/api/sessions.py`

**功能**:
- 创建session时存储 `character_id` 和 `video_path`
- 这些信息会在视频渲染时使用

**前端调用**: `frontend/src/App.tsx` 中的 `createSessionAndStartRecording` 函数
```typescript
const response = await apiClientRef.current.createSession(
  scene.id,
  characterId || undefined,
  videoPath
);
```

### 3. 视频渲染时加载角色专属配置

**位置**: `backend/app/api/sessions.py` 中的 `_get_scene_config_from_storyline` 函数

**功能**:
- 从数据库加载storyline配置
- 如果提供了 `character_id`，尝试加载角色专属的视频段落配置
- 如果没有角色专属配置，使用基础storyline的段落配置
- 返回完整的 `SceneConfig` 对象，包含所有段落配置

**调用位置**: `backend/app/api/sessions.py` 中的 `_render_video_background` 函数
```python
scene_config = await _get_scene_config_from_storyline(
    session.scene_id, 
    session.character_id
)
```

### 4. 视频渲染器应用Overlay效果

**位置**: `backend/app/services/video_renderer.py`

**新增功能**:

#### 4.1 入场/出场动画透明度计算
```python
def _calculate_animation_alpha(
    self, segment_time, segment_duration,
    entry_type, entry_duration, entry_delay,
    exit_type, exit_duration, exit_delay
) -> float
```

**支持的动画类型**:
- `instant`: 立即出现/消失
- `fade`: 淡入/淡出效果
- `slide`: 滑动效果（使用淡入/淡出实现）

**时间轴**:
```
|--entry_delay--|--entry_duration--|----visible----|--exit_delay--|--exit_duration--|
0               t1                 t2              t3             t4                 duration
alpha=0         alpha: 0->1        alpha=1         alpha=1        alpha: 1->0
```

#### 4.2 Alpha混合绘制
```python
def _draw_puppet(
    self, frame, landmarks, offset, alpha=1.0
) -> np.ndarray
```

**改进**:
- 使用 `cv2.addWeighted` 实现alpha混合
- 先在overlay上绘制皮影骨架
- 然后按照alpha值混合到原始帧上
- 支持0.0（完全透明）到1.0（完全不透明）的任意alpha值

#### 4.3 渲染循环集成
在 `render_video` 方法中：
```python
# 获取段落配置
segment_config = self.scene_config.segments[segment_index]

# 计算当前帧的alpha值
alpha = self._calculate_animation_alpha(
    segment_time,
    segment_config.duration,
    segment_config.entry_type,
    segment_config.entry_duration,
    segment_config.entry_delay,
    segment_config.exit_type,
    segment_config.exit_duration,
    segment_config.exit_delay
)

# 只在alpha > 0时绘制
if alpha > 0.0:
    offset = character_paths[segment_index].get_offset(segment_time)
    frame = self._draw_puppet(frame, pose_frame.landmarks, offset, alpha)
```

## 配置示例

### 角色专属段落配置（数据库）
```python
CharacterVideoSegmentDB(
    index=0,
    duration=10.0,
    path_type="linear",
    offset_start_x=100,
    offset_start_y=200,
    offset_end_x=500,
    offset_end_y=200,
    entry_type="fade",
    entry_duration=1.5,
    entry_delay=0.0,
    exit_type="fade",
    exit_duration=1.0,
    exit_delay=0.5
)
```

### 效果说明
- 0.0s - 0.0s: 不可见（entry_delay）
- 0.0s - 1.5s: 淡入（entry_duration），alpha从0渐变到1
- 1.5s - 8.5s: 完全可见，从(100,200)移动到(500,200)
- 8.5s - 9.0s: 保持可见（exit_delay）
- 9.0s - 10.0s: 淡出（exit_duration），alpha从1渐变到0

## 数据流

```
前端选择角色
    ↓
获取角色专属段落配置 (API)
    ↓
创建Session (存储character_id)
    ↓
录制动捕数据
    ↓
触发视频渲染
    ↓
加载角色专属段落配置 (数据库)
    ↓
应用入场/出场动画和路径移动
    ↓
生成最终视频
```

## 测试

运行测试脚本验证配置加载：
```bash
python test_character_segments.py
```

## 注意事项

1. **段落数量一致性**: 确保角色专属段落数量与录制的段落数量一致
2. **时间对齐**: 段落duration应该与录制的实际时长匹配
3. **Alpha混合性能**: Alpha混合会增加渲染时间，但效果更平滑
4. **动画时长**: entry_duration + exit_duration 不应超过 segment_duration
5. **路径偏移**: offset值应该在视频帧范围内，避免角色超出画面

## 后续优化

1. 支持更多动画类型（slide, zoom, rotate等）
2. 支持贝塞尔曲线路径
3. 支持关键帧动画
4. 优化渲染性能（GPU加速）
