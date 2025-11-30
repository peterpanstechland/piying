# 前端路由修复总结 / Frontend Routing Fix Summary

## 问题描述

用户前端（`http://localhost:8000/`）无法访问，但管理面板（`http://localhost:8000/admin`）可以正常访问。

## 原因分析

后端 `main.py` 中只配置了管理面板的静态文件服务和路由，没有配置用户前端的路由。

## 解决方案

### 1. 修改静态文件挂载

**问题**: 用户前端的 `/assets` 路径与系统资源的 `/assets` 路径冲突

**解决**: 
- 将系统资源路径改为 `/scene-assets`
- 用户前端使用 `/assets`

```python
# 系统资源
if assets_dir.exists():
    app.mount("/scene-assets", StaticFiles(directory=str(assets_dir.absolute())), name="scene_assets")

# 用户前端资源
frontend_dist = project_root / "frontend" / "dist"
if frontend_dist.exists():
    frontend_assets_dir = frontend_dist / "assets"
    if frontend_assets_dir.exists():
        app.mount("/assets", StaticFiles(directory=str(frontend_assets_dir.absolute())), name="frontend_assets")
```

### 2. 添加根路由

将根路径 `/` 改为返回用户前端的 `index.html`：

```python
@app.get("/")
async def root():
    """Serve user frontend"""
    frontend_index = project_root / "frontend" / "dist" / "index.html"
    if frontend_index.exists():
        return FileResponse(str(frontend_index.absolute()))
    return HTMLResponse(
        content="<h1>Frontend Not Built</h1><p>Please run 'npm run build' in frontend directory.</p>",
        status_code=404
    )
```

### 3. 添加通配符路由

在文件末尾添加通配符路由，处理用户前端的客户端路由：

```python
@app.get("/{full_path:path}")
async def frontend_spa(full_path: str, request: Request):
    """
    Serve user frontend SPA for all non-API routes.
    This enables client-side routing in the React app.
    """
    # Skip if this is an API request
    if full_path.startswith("api/") or full_path.startswith("admin"):
        return HTMLResponse(content="Not Found", status_code=404)
    
    frontend_dist = project_root / "frontend" / "dist"
    
    # First, try to serve the exact file if it exists (for static assets)
    requested_file = frontend_dist / full_path
    if requested_file.exists() and requested_file.is_file():
        return FileResponse(str(requested_file.absolute()))
    
    # Otherwise, serve index.html for client-side routing
    frontend_index = frontend_dist / "index.html"
    if frontend_index.exists():
        return FileResponse(str(frontend_index.absolute()))
    
    return HTMLResponse(
        content="<h1>Frontend Not Built</h1><p>Please run 'npm run build' in frontend directory.</p>",
        status_code=404
    )
```

## 路由优先级

FastAPI 按照定义顺序匹配路由，因此路由优先级为：

1. **API 路由** - `/api/*` (最高优先级)
2. **管理面板** - `/admin` 和 `/admin/*`
3. **根路径** - `/`
4. **通配符路由** - `/{full_path:path}` (最低优先级，必须放在最后)

## 验证

### 测试用户前端
```bash
curl http://localhost:8000/
# 应该返回 200 和 HTML 内容
```

### 测试管理面板
```bash
curl http://localhost:8000/admin
# 应该返回 200 和 HTML 内容
```

### 测试 API
```bash
curl http://localhost:8000/api/health
# 应该返回 JSON 数据
```

## 文件修改

- **修改文件**: `backend/app/main.py`
- **修改内容**:
  1. 调整静态文件挂载路径
  2. 修改根路由返回用户前端
  3. 添加通配符路由处理 SPA

## 启动验证

```bash
# 启动后端
.\start-backend.bat

# 访问测试
# 用户前端: http://localhost:8000/
# 管理面板: http://localhost:8000/admin
```

## 注意事项

1. **通配符路由必须放在最后** - 否则会拦截其他路由
2. **API 路由使用 `/api/` 前缀** - 避免与前端路由冲突
3. **管理面板使用 `/admin` 前缀** - 独立的路由空间
4. **静态资源路径不冲突** - 用户前端 `/assets`，系统资源 `/scene-assets`

## 完成状态

✅ 用户前端可以正常访问
✅ 管理面板可以正常访问
✅ API 路由正常工作
✅ 客户端路由正常工作
✅ 静态资源正确加载

---

**修复日期**: 2024-11-30
**修复人员**: Kiro AI Assistant
**状态**: ✅ 已完成并验证
