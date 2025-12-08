# FFmpeg 下载脚本
# 自动下载并解压 FFmpeg 到 electron-app/resources/ffmpeg/

$ErrorActionPreference = "Stop"
$scriptPath = $PSScriptRoot

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  FFmpeg 下载工具" -ForegroundColor Cyan
Write-Host "========================================"
Write-Host ""

$ffmpegDir = "$scriptPath\electron-app\resources\ffmpeg"
$tempZip = "$env:TEMP\ffmpeg-release-essentials.zip"
$tempExtract = "$env:TEMP\ffmpeg-release-essentials"

# 创建目录
if (-not (Test-Path $ffmpegDir)) {
    New-Item -ItemType Directory -Path $ffmpegDir -Force | Out-Null
}

# FFmpeg 下载 URL (Windows x64)
$ffmpegUrl = "https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip"

Write-Host "正在下载 FFmpeg..." -ForegroundColor Yellow
Write-Host "URL: $ffmpegUrl" -ForegroundColor Gray
Write-Host ""

try {
    # 下载文件
    Invoke-WebRequest -Uri $ffmpegUrl -OutFile $tempZip -UseBasicParsing
    
    Write-Host "下载完成，正在解压..." -ForegroundColor Yellow
    
    # 解压
    if (Test-Path $tempExtract) {
        Remove-Item -Path $tempExtract -Recurse -Force
    }
    Expand-Archive -Path $tempZip -DestinationPath $tempExtract -Force
    
    # 查找 ffmpeg.exe 和 ffprobe.exe
    $extractedFfmpeg = Get-ChildItem -Path $tempExtract -Recurse -Filter "ffmpeg.exe" | Select-Object -First 1
    $extractedFfprobe = Get-ChildItem -Path $tempExtract -Recurse -Filter "ffprobe.exe" | Select-Object -First 1
    
    if ($extractedFfmpeg -and $extractedFfprobe) {
        $binDir = $extractedFfmpeg.DirectoryName
        
        # 复制可执行文件
        Copy-Item $extractedFfmpeg.FullName "$ffmpegDir\ffmpeg.exe" -Force
        Copy-Item $extractedFfprobe.FullName "$ffmpegDir\ffprobe.exe" -Force
        
        # 复制 DLL 文件
        $dllFiles = Get-ChildItem -Path $binDir -Filter "*.dll"
        foreach ($dll in $dllFiles) {
            Copy-Item $dll.FullName "$ffmpegDir\$($dll.Name)" -Force
        }
        
        Write-Host ""
        Write-Host "FFmpeg 安装完成！" -ForegroundColor Green
        Write-Host "位置: $ffmpegDir" -ForegroundColor Gray
        Write-Host ""
    } else {
        Write-Host "[错误] 解压后未找到 ffmpeg.exe 或 ffprobe.exe" -ForegroundColor Red
        exit 1
    }
    
    # 清理临时文件
    Remove-Item -Path $tempZip -Force -ErrorAction SilentlyContinue
    Remove-Item -Path $tempExtract -Recurse -Force -ErrorAction SilentlyContinue
    
} catch {
    Write-Host ""
    Write-Host "[错误] 下载失败: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host ""
    Write-Host "请手动下载 FFmpeg:" -ForegroundColor Yellow
    Write-Host "1. 访问: https://www.gyan.dev/ffmpeg/builds/" -ForegroundColor Yellow
    Write-Host "2. 下载 'ffmpeg-release-essentials.zip'" -ForegroundColor Yellow
    Write-Host "3. 解压并将 bin 目录中的文件复制到: $ffmpegDir" -ForegroundColor Yellow
    Write-Host ""
    exit 1
}
