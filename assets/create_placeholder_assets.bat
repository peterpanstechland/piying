@echo off
REM Placeholder Asset Generator for Shadow Puppet Interactive System
REM This script creates simple placeholder files for testing
REM Requires FFmpeg to be installed and in PATH

echo ============================================================
echo Shadow Puppet Interactive System
echo Placeholder Asset Generator (Windows)
echo ============================================================
echo.

REM Check if FFmpeg is available
where ffmpeg >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: FFmpeg not found in PATH
    echo.
    echo Please install FFmpeg:
    echo 1. Download from https://ffmpeg.org/download.html
    echo 2. Extract and add to PATH
    echo 3. Run this script again
    echo.
    echo Alternatively, run: python create_placeholder_assets.py
    pause
    exit /b 1
)

echo Creating directories...
if not exist "scenes" mkdir scenes
if not exist "images" mkdir images

echo.
echo Creating base videos...
echo ------------------------------------------------------------

echo Creating sceneA_base.mp4 (Martial Arts - Red)...
ffmpeg -f lavfi -i color=c=red:s=1920x1080:d=30 -vf "drawtext=text='Scene A - Martial Arts':fontsize=80:fontcolor=white:x=(w-text_w)/2:y=(h-text_h)/2:box=1:boxcolor=black@0.5:boxborderw=10" -r 30 -c:v libx264 -pix_fmt yuv420p -y scenes\sceneA_base.mp4 2>nul
if %ERRORLEVEL% EQU 0 (echo   [OK] sceneA_base.mp4) else (echo   [FAIL] sceneA_base.mp4)

echo Creating sceneB_base.mp4 (Dance - Purple)...
ffmpeg -f lavfi -i color=c=purple:s=1920x1080:d=30 -vf "drawtext=text='Scene B - Dance':fontsize=80:fontcolor=white:x=(w-text_w)/2:y=(h-text_h)/2:box=1:boxcolor=black@0.5:boxborderw=10" -r 30 -c:v libx264 -pix_fmt yuv420p -y scenes\sceneB_base.mp4 2>nul
if %ERRORLEVEL% EQU 0 (echo   [OK] sceneB_base.mp4) else (echo   [FAIL] sceneB_base.mp4)

echo Creating sceneC_base.mp4 (Story - Blue)...
ffmpeg -f lavfi -i color=c=blue:s=1920x1080:d=30 -vf "drawtext=text='Scene C - Story':fontsize=80:fontcolor=white:x=(w-text_w)/2:y=(h-text_h)/2:box=1:boxcolor=black@0.5:boxborderw=10" -r 30 -c:v libx264 -pix_fmt yuv420p -y scenes\sceneC_base.mp4 2>nul
if %ERRORLEVEL% EQU 0 (echo   [OK] sceneC_base.mp4) else (echo   [FAIL] sceneC_base.mp4)

echo.
echo Creating placeholder icon images...
echo ------------------------------------------------------------

REM Create simple colored squares as icon placeholders
ffmpeg -f lavfi -i color=c=red:s=256x256:d=1 -vf "drawtext=text='Scene A':fontsize=40:fontcolor=white:x=(w-text_w)/2:y=(h-text_h)/2" -frames:v 1 -y images\sceneA_icon.png 2>nul
if %ERRORLEVEL% EQU 0 (echo   [OK] sceneA_icon.png) else (echo   [FAIL] sceneA_icon.png)

ffmpeg -f lavfi -i color=c=purple:s=256x256:d=1 -vf "drawtext=text='Scene B':fontsize=40:fontcolor=white:x=(w-text_w)/2:y=(h-text_h)/2" -frames:v 1 -y images\sceneB_icon.png 2>nul
if %ERRORLEVEL% EQU 0 (echo   [OK] sceneB_icon.png) else (echo   [FAIL] sceneB_icon.png)

ffmpeg -f lavfi -i color=c=blue:s=256x256:d=1 -vf "drawtext=text='Scene C':fontsize=40:fontcolor=white:x=(w-text_w)/2:y=(h-text_h)/2" -frames:v 1 -y images\sceneC_icon.png 2>nul
if %ERRORLEVEL% EQU 0 (echo   [OK] sceneC_icon.png) else (echo   [FAIL] sceneC_icon.png)

echo.
echo Creating placeholder guidance images...
echo ------------------------------------------------------------

REM Scene A guidance images
ffmpeg -f lavfi -i color=c=white:s=800x600:d=1 -vf "drawtext=text='Scene A - Segment 1\nOpening Stance':fontsize=40:fontcolor=black:x=(w-text_w)/2:y=(h-text_h)/2" -frames:v 1 -y images\sceneA_segment1_guide.png 2>nul
if %ERRORLEVEL% EQU 0 (echo   [OK] sceneA_segment1_guide.png) else (echo   [FAIL] sceneA_segment1_guide.png)

ffmpeg -f lavfi -i color=c=white:s=800x600:d=1 -vf "drawtext=text='Scene A - Segment 2\nDynamic Moves':fontsize=40:fontcolor=black:x=(w-text_w)/2:y=(h-text_h)/2" -frames:v 1 -y images\sceneA_segment2_guide.png 2>nul
if %ERRORLEVEL% EQU 0 (echo   [OK] sceneA_segment2_guide.png) else (echo   [FAIL] sceneA_segment2_guide.png)

ffmpeg -f lavfi -i color=c=white:s=800x600:d=1 -vf "drawtext=text='Scene A - Segment 3\nClosing Stance':fontsize=40:fontcolor=black:x=(w-text_w)/2:y=(h-text_h)/2" -frames:v 1 -y images\sceneA_segment3_guide.png 2>nul
if %ERRORLEVEL% EQU 0 (echo   [OK] sceneA_segment3_guide.png) else (echo   [FAIL] sceneA_segment3_guide.png)

REM Scene B guidance images
ffmpeg -f lavfi -i color=c=white:s=800x600:d=1 -vf "drawtext=text='Scene B - Segment 1\nEntrance':fontsize=40:fontcolor=black:x=(w-text_w)/2:y=(h-text_h)/2" -frames:v 1 -y images\sceneB_segment1_guide.png 2>nul
if %ERRORLEVEL% EQU 0 (echo   [OK] sceneB_segment1_guide.png) else (echo   [FAIL] sceneB_segment1_guide.png)

ffmpeg -f lavfi -i color=c=white:s=800x600:d=1 -vf "drawtext=text='Scene B - Segment 2\nPerformance':fontsize=40:fontcolor=black:x=(w-text_w)/2:y=(h-text_h)/2" -frames:v 1 -y images\sceneB_segment2_guide.png 2>nul
if %ERRORLEVEL% EQU 0 (echo   [OK] sceneB_segment2_guide.png) else (echo   [FAIL] sceneB_segment2_guide.png)

ffmpeg -f lavfi -i color=c=white:s=800x600:d=1 -vf "drawtext=text='Scene B - Segment 3\nFinale':fontsize=40:fontcolor=black:x=(w-text_w)/2:y=(h-text_h)/2" -frames:v 1 -y images\sceneB_segment3_guide.png 2>nul
if %ERRORLEVEL% EQU 0 (echo   [OK] sceneB_segment3_guide.png) else (echo   [FAIL] sceneB_segment3_guide.png)

REM Scene C guidance images
ffmpeg -f lavfi -i color=c=white:s=800x600:d=1 -vf "drawtext=text='Scene C - Segment 1\nEntrance':fontsize=40:fontcolor=black:x=(w-text_w)/2:y=(h-text_h)/2" -frames:v 1 -y images\sceneC_segment1_guide.png 2>nul
if %ERRORLEVEL% EQU 0 (echo   [OK] sceneC_segment1_guide.png) else (echo   [FAIL] sceneC_segment1_guide.png)

ffmpeg -f lavfi -i color=c=white:s=800x600:d=1 -vf "drawtext=text='Scene C - Segment 2\nWalking':fontsize=40:fontcolor=black:x=(w-text_w)/2:y=(h-text_h)/2" -frames:v 1 -y images\sceneC_segment2_guide.png 2>nul
if %ERRORLEVEL% EQU 0 (echo   [OK] sceneC_segment2_guide.png) else (echo   [FAIL] sceneC_segment2_guide.png)

ffmpeg -f lavfi -i color=c=white:s=800x600:d=1 -vf "drawtext=text='Scene C - Segment 3\nClimax':fontsize=40:fontcolor=black:x=(w-text_w)/2:y=(h-text_h)/2" -frames:v 1 -y images\sceneC_segment3_guide.png 2>nul
if %ERRORLEVEL% EQU 0 (echo   [OK] sceneC_segment3_guide.png) else (echo   [FAIL] sceneC_segment3_guide.png)

ffmpeg -f lavfi -i color=c=white:s=800x600:d=1 -vf "drawtext=text='Scene C - Segment 4\nExit':fontsize=40:fontcolor=black:x=(w-text_w)/2:y=(h-text_h)/2" -frames:v 1 -y images\sceneC_segment4_guide.png 2>nul
if %ERRORLEVEL% EQU 0 (echo   [OK] sceneC_segment4_guide.png) else (echo   [FAIL] sceneC_segment4_guide.png)

echo.
echo ============================================================
echo Placeholder assets created successfully!
echo ============================================================
echo.
echo Assets created:
echo   Videos: assets\scenes\
echo   Images: assets\images\
echo.
echo Note: These are simple placeholders for testing.
echo See ASSET_CREATION_GUIDE.md for creating production assets.
echo.
pause
