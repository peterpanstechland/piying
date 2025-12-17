# 构建脚本 - PowerShell 版本
# 解决批处理文件中的编码和兼容性问题

$ErrorActionPreference = "Stop"
$scriptPath = $PSScriptRoot

# 设置控制台编码为 UTF-8
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  皮影互动系统 - Electron 打包工具" -ForegroundColor Cyan
Write-Host "========================================"
Write-Host ""

# 检查 Node.js
try {
    Get-Command node -ErrorAction Stop | Out-Null
} catch {
    Write-Host "[错误] 未找到 Node.js，请先安装 Node.js" -ForegroundColor Red
    Write-Host "下载地址: https://nodejs.org/"
    Read-Host "按回车键退出..."
    exit 1
}

# 步骤 1: 构建前端（始终重新构建以确保包含最新改动）
Write-Host "[1/6] 构建用户前端..." -ForegroundColor Yellow
Push-Location "$scriptPath\frontend"
try {
    # 清理旧的构建
    if (Test-Path "dist") {
        Write-Host "      清理旧的前端构建..." -ForegroundColor Gray
        Remove-Item -Path "dist" -Recurse -Force -ErrorAction SilentlyContinue
    }
    cmd /c "npm install"
    if ($LASTEXITCODE -ne 0) { throw "前端依赖安装失败" }
    cmd /c "npm run build"
    if ($LASTEXITCODE -ne 0) { throw "前端构建失败" }
} catch {
    Write-Host "[错误] $($_.Exception.Message)" -ForegroundColor Red
    Pop-Location
    Read-Host "按回车键退出..."
    exit 1
}
Pop-Location

if (-not (Test-Path "$scriptPath\frontend\dist")) {
    Write-Host "[错误] 前端构建失败，dist 目录未生成" -ForegroundColor Red
    Read-Host "按回车键退出..."
    exit 1
}
Write-Host "      用户前端构建完成 ✓" -ForegroundColor Green
Write-Host ""

# 步骤 2: 构建管理后台前端（始终重新构建以确保包含最新改动）
Write-Host "[2/6] 构建管理后台前端..." -ForegroundColor Yellow
Push-Location "$scriptPath\admin-frontend"
try {
    # 清理旧的构建
    if (Test-Path "dist") {
        Write-Host "      清理旧的管理后台构建..." -ForegroundColor Gray
        Remove-Item -Path "dist" -Recurse -Force -ErrorAction SilentlyContinue
    }
    cmd /c "npm install"
    if ($LASTEXITCODE -ne 0) { throw "管理后台依赖安装失败" }
    cmd /c "npm run build"
    if ($LASTEXITCODE -ne 0) { throw "管理后台构建失败" }
} catch {
    Write-Host "[错误] $($_.Exception.Message)" -ForegroundColor Red
    Pop-Location
    Read-Host "按回车键退出..."
    exit 1
}
Pop-Location

if (-not (Test-Path "$scriptPath\admin-frontend\dist")) {
    Write-Host "[错误] 管理后台构建失败，dist 目录未生成" -ForegroundColor Red
    Read-Host "按回车键退出..."
    exit 1
}
Write-Host "      管理后台前端构建完成 ✓" -ForegroundColor Green
Write-Host ""

# 步骤 3: 构建后端
Write-Host "[3/6] 构建 Python 后端..." -ForegroundColor Yellow
try {
    # 调用后端构建脚本
    cmd /c "build-backend-exe.bat"
    if ($LASTEXITCODE -ne 0) { throw "后端构建失败" }
} catch {
    Write-Host "[错误] $($_.Exception.Message)" -ForegroundColor Red
    Read-Host "按回车键退出..."
    exit 1
}
Write-Host "      Python 后端构建完成 ✓" -ForegroundColor Green
Write-Host ""

# 步骤 4: 安装 Electron 依赖
Write-Host "[4/6] 安装 Electron 依赖..." -ForegroundColor Yellow
Push-Location "$scriptPath\electron-app"
try {
    cmd /c "npm install"
    if ($LASTEXITCODE -ne 0) { throw "Electron 依赖安装失败" }
} catch {
    Write-Host "[错误] $($_.Exception.Message)" -ForegroundColor Red
    Pop-Location
    Read-Host "按回车键退出..."
    exit 1
}
Pop-Location
Write-Host "      Electron 依赖安装完成 ✓" -ForegroundColor Green
Write-Host ""

# 步骤 5: 准备 FFmpeg
Write-Host "[5/7] 准备 FFmpeg..." -ForegroundColor Yellow
$ffmpegDir = "$scriptPath\electron-app\resources\ffmpeg"
if (-not (Test-Path $ffmpegDir)) {
    New-Item -ItemType Directory -Path $ffmpegDir -Force | Out-Null
}

$ffmpegExe = "$ffmpegDir\ffmpeg.exe"
$ffprobeExe = "$ffmpegDir\ffprobe.exe"

# 检查是否已有打包的ffmpeg
if (-not (Test-Path $ffmpegExe) -or -not (Test-Path $ffprobeExe)) {
    Write-Host "      检查系统 FFmpeg..." -ForegroundColor Yellow
    
    # 尝试从系统PATH查找
    $systemFfmpeg = Get-Command ffmpeg -ErrorAction SilentlyContinue
    $systemFfprobe = Get-Command ffprobe -ErrorAction SilentlyContinue
    
    if ($systemFfmpeg -and $systemFfprobe) {
        Write-Host "      找到系统 FFmpeg，复制到打包目录..." -ForegroundColor Yellow
        try {
            Copy-Item $systemFfmpeg.Source $ffmpegExe -Force
            Copy-Item $systemFfprobe.Source $ffprobeExe -Force
            
            # 尝试复制依赖的DLL文件（Windows）
            $ffmpegDir_system = Split-Path $systemFfmpeg.Source -Parent
            $dllFiles = Get-ChildItem "$ffmpegDir_system\*.dll" -ErrorAction SilentlyContinue
            foreach ($dll in $dllFiles) {
                Copy-Item $dll.FullName "$ffmpegDir\$($dll.Name)" -Force -ErrorAction SilentlyContinue
            }
            
            Write-Host "      FFmpeg 准备完成 ✓" -ForegroundColor Green
        } catch {
            Write-Host "      [警告] 复制 FFmpeg 失败: $($_.Exception.Message)" -ForegroundColor Yellow
            Write-Host "      请手动将 ffmpeg.exe 和 ffprobe.exe 复制到: $ffmpegDir" -ForegroundColor Yellow
        }
    } else {
        Write-Host "      [警告] 未找到系统 FFmpeg" -ForegroundColor Yellow
        Write-Host "      请执行以下操作之一:" -ForegroundColor Yellow
        Write-Host "      1. 安装 FFmpeg 并添加到 PATH" -ForegroundColor Yellow
        Write-Host "      2. 手动下载 FFmpeg 并复制到: $ffmpegDir" -ForegroundColor Yellow
        Write-Host "        下载地址: https://www.gyan.dev/ffmpeg/builds/" -ForegroundColor Yellow
        Write-Host "        选择 'ffmpeg-release-essentials.zip'" -ForegroundColor Yellow
        
        $continue = Read-Host "是否继续构建？(Y/N) [默认 N]"
        if ($continue -ne 'Y' -and $continue -ne 'y') {
            Write-Host "[错误] 构建已取消" -ForegroundColor Red
            exit 1
        }
    }
} else {
    Write-Host "      FFmpeg 已存在 ✓" -ForegroundColor Green
}
Write-Host ""

# 步骤 6: 创建应用图标
Write-Host "[6/7] 准备打包资源..." -ForegroundColor Yellow
if (-not (Test-Path "$scriptPath\electron-app\build")) {
    New-Item -ItemType Directory -Path "$scriptPath\electron-app\build" | Out-Null
}

if (-not (Test-Path "$scriptPath\electron-app\build\icon.ico")) {
    Write-Host "      创建默认图标..."
    try {
        Add-Type -AssemblyName System.Drawing
        $bmp = New-Object System.Drawing.Bitmap(256,256)
        $g = [System.Drawing.Graphics]::FromImage($bmp)
        $g.Clear([System.Drawing.Color]::FromArgb(26,26,46))
        $font = New-Object System.Drawing.Font('Segoe UI Emoji',120)
        $g.DrawString([char]0x1F3AD, $font, [System.Drawing.Brushes]::White, 20, 40)
        $bmp.Save("$scriptPath\electron-app\build\icon.png")
        $bmp.Dispose()
        $g.Dispose()

        # 尝试转换为 ico
        if (Get-Command magick -ErrorAction SilentlyContinue) {
            cmd /c "magick electron-app\build\icon.png electron-app\build\icon.ico"
        } else {
            Write-Host "      [提示] 未找到 ImageMagick，使用 PNG 作为图标"
            Copy-Item "$scriptPath\electron-app\build\icon.png" "$scriptPath\electron-app\build\icon.ico"
        }
    } catch {
        Write-Host "      [警告] 图标创建失败: $($_.Exception.Message)"
    }
}
Write-Host "      打包资源准备完成 ✓" -ForegroundColor Green
Write-Host ""

# 步骤 7: 清理旧构建
Write-Host "[7/7] 清理旧的构建目录..." -ForegroundColor Yellow
Get-Process "electron" -ErrorAction SilentlyContinue | Stop-Process -Force
Get-Process "皮影互动系统" -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Seconds 2

$distPath = "$scriptPath\electron-app\dist_v4"

if (Test-Path $distPath) {
    Write-Host "      正在删除旧的构建目录..."
    try {
        # 尝试强制删除
        Remove-Item -Path $distPath -Recurse -Force -ErrorAction Stop
        Write-Host "      旧构建目录已清理 ✓" -ForegroundColor Green
    } catch {
        Write-Host "      [警告] 直接删除失败，尝试重命名备份..." -ForegroundColor Yellow
        try {
            $timestamp = Get-Date -Format "yyyyMMddHHmmss"
            $backupPath = "${distPath}_backup_${timestamp}"
            Rename-Item -Path $distPath -NewName $backupPath -ErrorAction Stop
            Write-Host "      已将旧目录重命名为: $backupPath" -ForegroundColor Green
        } catch {
             Write-Host "      [警告] 无法清理旧目录，可能被占用。" -ForegroundColor Red
             Write-Host "      electron-builder 可能会尝试覆盖它。"
             $choice = Read-Host "是否忽略错误并强制继续构建？(Y/N) [默认 Y]"
             if ($choice -ne '' -and $choice -ne 'Y' -and $choice -ne 'y') {
                 exit 1
             }
        }
    }
} else {
    Write-Host "      无需清理（目录不存在）✓" -ForegroundColor Green
}
Write-Host ""

# 开始打包
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  开始打包 Electron 应用..." -ForegroundColor Cyan
Write-Host "========================================"
Write-Host ""

Push-Location "$scriptPath\electron-app"
try {
    # 确保使用 dist_v4 配置
    cmd /c "npm run build:win"
    if ($LASTEXITCODE -ne 0) { throw "打包失败" }
} catch {
    Write-Host ""
    Write-Host "[错误] 打包失败，请检查错误信息" -ForegroundColor Red
    Pop-Location
    Read-Host "按回车键退出..."
    exit 1
}
Pop-Location

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "  打包完成！" -ForegroundColor Green
Write-Host "========================================"
Write-Host ""
Write-Host "输出文件位置:"
Write-Host "  electron-app\dist_v4\"
Write-Host ""
Write-Host "文件列表:"
Get-ChildItem "$scriptPath\electron-app\dist_v4\*.exe" -ErrorAction SilentlyContinue | ForEach-Object { Write-Host "  $($_.Name)" }
Write-Host ""
Write-Host "验证依赖..." -ForegroundColor Yellow
# 检查源文件（构建输入）
$sourceChecks = @(
    @{Name="FFmpeg"; Path="electron-app\resources\ffmpeg\ffmpeg.exe"},
    @{Name="FFprobe"; Path="electron-app\resources\ffmpeg\ffprobe.exe"},
    @{Name="后端"; Path="electron-app\resources\backend\backend.exe"},
    @{Name="前端源文件"; Path="frontend\dist\index.html"},
    @{Name="管理后台源文件"; Path="admin-frontend\dist\index.html"}
)
$allOk = $true
foreach ($check in $sourceChecks) {
    $fullPath = Join-Path $scriptPath $check.Path
    if (Test-Path $fullPath) {
        Write-Host "  ✓ $($check.Name)" -ForegroundColor Green
    } else {
        Write-Host "  ✗ $($check.Name) - 未找到: $($check.Path)" -ForegroundColor Red
        $allOk = $false
    }
}
if (-not $allOk) {
    Write-Host ""
    Write-Host "[警告] 部分依赖未找到，请检查构建过程" -ForegroundColor Yellow
    Write-Host "注意: 前端文件会在打包时自动复制到安装包中" -ForegroundColor Gray
} else {
    Write-Host ""
    Write-Host "所有依赖检查通过！" -ForegroundColor Green
}
Write-Host ""
Write-Host "安装包可以直接发送给甲方使用！"
Write-Host ""

