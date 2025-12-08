# 运行生产环境版本脚本
# 用于快速测试打包后的应用，确保开发与生产环境一致性

$ErrorActionPreference = "Stop"
$scriptPath = $PSScriptRoot

# 设置控制台编码为 UTF-8
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  皮影互动系统 - 生产环境运行工具" -ForegroundColor Cyan
Write-Host "========================================"
Write-Host ""

# 定义生产环境可执行文件路径
# electron-builder 通常会将解压后的文件放在 dist_v4/win-unpacked 目录下 (根据 package.json 配置)
$exePath = "$scriptPath\electron-app\dist\win-unpacked\皮影互动系统.exe"

# 检查是否存在已构建的生产版本
if (Test-Path $exePath) {
    Write-Host "发现已构建的生产版本！" -ForegroundColor Green
    Write-Host "路径: $exePath"
    Write-Host ""
    
    $choice = Read-Host "直接运行？(Y/N) [默认 Y]"
    if ($choice -eq '' -or $choice -eq 'Y' -or $choice -eq 'y') {
        Write-Host "正在启动生产环境应用..." -ForegroundColor Yellow
        Start-Process $exePath
        Write-Host "应用已启动。" -ForegroundColor Green
        exit 0
    }
} else {
    Write-Host "未找到已构建的生产版本。" -ForegroundColor Yellow
}

# 如果没有找到或用户选择重新构建
Write-Host ""
Write-Host "是否现在构建生产版本？(这将花费几分钟)" -ForegroundColor Yellow
$buildChoice = Read-Host "开始构建？(Y/N) [默认 Y]"

if ($buildChoice -eq '' -or $buildChoice -eq 'Y' -or $buildChoice -eq 'y') {
    Write-Host ""
    Write-Host "正在调用构建脚本..." -ForegroundColor Cyan
    
    $buildScript = "$scriptPath\build-electron-app.ps1"
    
    if (-not (Test-Path $buildScript)) {
        Write-Host "[错误] 找不到构建脚本: $buildScript" -ForegroundColor Red
        exit 1
    }
    
    # 调用构建脚本
    & $buildScript
    
    # 构建完成后再次检查
    if (Test-Path $exePath) {
        Write-Host ""
        Write-Host "构建成功！正在启动生产环境应用..." -ForegroundColor Green
        Start-Process $exePath
    } else {
        Write-Host ""
        Write-Host "[错误] 构建似乎完成了，但未找到可执行文件。" -ForegroundColor Red
        Write-Host "请检查 electron-app\dist 目录。"
    }
} else {
    Write-Host "操作已取消。"
}

