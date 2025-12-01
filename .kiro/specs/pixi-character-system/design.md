# PixiJS 角色渲染系统设计

## 概述

基于 PixiJS 的皮影角色渲染系统，支持 Sprite Sheet 资源管理和 MediaPipe 姿态驱动。

## 资源格式设计

### 1. Sprite Sheet JSON 格式 (兼容 PixiJS/TexturePacker)

```json
{
  "frames": {
    "head": {
      "frame": { "x": 0, "y": 0, "w": 200, "h": 180 },
      "rotated": false,
      "trimmed": false,
      "spriteSourceSize": { "x": 0, "y": 0, "w": 200, "h": 180 },
      "sourceSize": { "w": 200, "h": 180 },
      "pivot": { "x": 0.5, "y": 0.9 }
    },
    "body": {
      "frame": { "x": 200, "y": 0, "w": 150, "h": 300 },
      "pivot": { "x": 0.5, "y": 0.2 }
    }
  },
  "meta": {
    "app": "piying-admin",
    "version": "1.0",
    "image": "character.png",
    "format": "RGBA8888",
    "size": { "w": 1024, "h": 1024 },
    "scale": "1"
  }
}
```

### 2. 角色配置 JSON (扩展格式)

```json
{
  "id": "character-uuid",
  "name": "仙女",
  "spritesheet": "character.json",
  "skeleton": {
    "joints": [
      {
        "id": "neck",
        "part": "head",
        "position": { "x": 0.5, "y": 0.9 },
        "connectedTo": "shoulder_center"
      },
      {
        "id": "shoulder_center",
        "part": "body",
        "position": { "x": 0.5, "y": 0.1 }
      }
    ],
    "bones": [
      { "from": "neck", "to": "shoulder_center" }
    ]
  },
  "bindings": {
    "head": {
      "landmarks": [0, 1, 2, 3, 4, 5, 6, 7, 8],
      "rotationLandmark": 0,
      "scaleLandmarks": [7, 8]
    },
    "left-arm": {
      "landmarks": [11, 13, 15],
      "rotationLandmark": 13,
      "scaleLandmarks": [11, 15]
    }
  },
  "renderOrder": ["body", "upper-leg", "left-arm", "right-arm", "left-hand", "right-hand", "left-foot", "right-foot", "head"]
}
```

## 后端 API 设计

### 导出 API

```
GET /api/admin/characters/{id}/export
Response: {
  "spritesheet_url": "/api/admin/characters/{id}/spritesheet.png",
  "config_url": "/api/admin/characters/{id}/config.json"
}

GET /api/admin/characters/{id}/spritesheet.png
Response: 合并后的 PNG 图片

GET /api/admin/characters/{id}/spritesheet.json
Response: PixiJS 兼容的 Spritesheet JSON

GET /api/admin/characters/{id}/config.json
Response: 完整角色配置（骨骼+绑定）
```

### 导入 API

```
POST /api/admin/characters/import
Body: multipart/form-data
  - spritesheet: PNG 文件
  - config: JSON 配置文件
Response: 创建的角色信息
```

## 前端渲染架构

```
frontend/src/
├── pixi/
│   ├── CharacterRenderer.ts    # 角色渲染器
│   ├── SkeletonController.ts   # 骨骼控制器
│   ├── PoseDriver.ts           # MediaPipe 姿态驱动
│   └── types.ts                # 类型定义
```

### CharacterRenderer 核心类

```typescript
import { Application, Container, Sprite, Texture, Assets } from 'pixi.js';

interface CharacterConfig {
  spritesheet: string;
  skeleton: SkeletonConfig;
  bindings: BindingConfig;
  renderOrder: string[];
}

class CharacterRenderer {
  private app: Application;
  private container: Container;
  private parts: Map<string, Sprite> = new Map();
  private config: CharacterConfig;

  async load(configUrl: string) {
    // 加载配置
    this.config = await Assets.load(configUrl);
    
    // 加载 Spritesheet
    const sheet = await Assets.load(this.config.spritesheet);
    
    // 按渲染顺序创建 Sprites
    for (const partName of this.config.renderOrder) {
      const texture = sheet.textures[partName];
      const sprite = new Sprite(texture);
      
      // 设置枢轴点
      const frame = sheet.data.frames[partName];
      sprite.anchor.set(frame.pivot.x, frame.pivot.y);
      
      this.parts.set(partName, sprite);
      this.container.addChild(sprite);
    }
  }

  updatePose(landmarks: NormalizedLandmark[]) {
    // 根据 MediaPipe 姿态更新各部件位置/旋转
    for (const [partName, binding] of Object.entries(this.config.bindings)) {
      const sprite = this.parts.get(partName);
      if (!sprite || !binding.landmarks.length) continue;
      
      // 计算位置（取绑定关键点的中心）
      const positions = binding.landmarks.map(i => landmarks[i]);
      const center = this.calculateCenter(positions);
      sprite.position.set(center.x * this.app.screen.width, center.y * this.app.screen.height);
      
      // 计算旋转
      if (binding.rotationLandmark !== null && binding.landmarks.length >= 2) {
        const angle = this.calculateRotation(landmarks, binding);
        sprite.rotation = angle;
      }
      
      // 计算缩放
      if (binding.scaleLandmarks.length >= 2) {
        const scale = this.calculateScale(landmarks, binding);
        sprite.scale.set(scale);
      }
    }
  }
}
```

## 实现步骤

### Phase 1: 后端导出功能
1. 实现 Sprite Sheet 打包（PIL 合并图片）
2. 生成 PixiJS 兼容的 JSON 配置
3. 添加导出 API 端点

### Phase 2: 前端 PixiJS 集成
1. 安装 PixiJS 依赖
2. 实现 CharacterRenderer 类
3. 实现 PoseDriver 对接 MediaPipe

### Phase 3: 管理后台预览
1. 在角色编辑页添加实时预览
2. 支持测试姿态数据

## 依赖

```json
{
  "pixi.js": "^8.0.0"
}
```
