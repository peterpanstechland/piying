# Quick Start - Asset Generation

Get your Shadow Puppet Interactive System up and running with placeholder assets in minutes!

## Prerequisites

Choose ONE of the following methods:

### Method 1: FFmpeg (Recommended - Fastest)
- Install FFmpeg: https://ffmpeg.org/download.html
- Add to PATH (Windows) or install via package manager (Linux/Mac)

### Method 2: Python
- Python 3.10 or higher
- Install dependencies: `pip install opencv-python numpy pillow`

## Generate Placeholder Assets

### Windows (FFmpeg)
```bash
cd assets
create_placeholder_assets.bat
```

### Linux/Mac (FFmpeg)
```bash
cd assets
chmod +x create_placeholder_assets.sh
./create_placeholder_assets.sh
```

### Python (All Platforms)
```bash
cd assets
pip install opencv-python numpy pillow
python create_placeholder_assets.py
```

## What Gets Created

The script will generate 16 files:

**Videos (3 files):**
- `scenes/sceneA_base.mp4` - Red background with "Scene A - Martial Arts"
- `scenes/sceneB_base.mp4` - Purple background with "Scene B - Dance"
- `scenes/sceneC_base.mp4` - Blue background with "Scene C - Story"

**Icons (3 files):**
- `images/sceneA_icon.png` - Red square with "Scene A"
- `images/sceneB_icon.png` - Purple square with "Scene B"
- `images/sceneC_icon.png` - Blue square with "Scene C"

**Guidance Images (10 files):**
- `images/sceneA_segment1_guide.png` through `sceneA_segment3_guide.png`
- `images/sceneB_segment1_guide.png` through `sceneB_segment3_guide.png`
- `images/sceneC_segment1_guide.png` through `sceneC_segment4_guide.png`

## Verify Assets

Check that all files were created:

```bash
# Windows
dir scenes
dir images

# Linux/Mac
ls -lh scenes/
ls -lh images/
```

You should see:
- 3 MP4 files in `scenes/` (each ~1-5 MB)
- 13 PNG files in `images/` (each ~10-100 KB)

## Test the System

1. **Start Backend:**
   ```bash
   cd backend
   uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
   ```

2. **Start Frontend (in new terminal):**
   ```bash
   cd frontend
   npm run dev
   ```

3. **Open Browser:**
   - Navigate to `http://localhost:5173`
   - You should see the idle screen
   - Wave at the camera to trigger scene selection
   - Hover over a scene to select it

## Troubleshooting

### FFmpeg Not Found
**Error:** `'ffmpeg' is not recognized as an internal or external command`

**Solution:**
- Download FFmpeg from https://ffmpeg.org/download.html
- Extract and add to system PATH
- Restart terminal/command prompt
- Try again

### Python Dependencies Missing
**Error:** `ModuleNotFoundError: No module named 'cv2'`

**Solution:**
```bash
pip install opencv-python numpy pillow
```

### Videos Don't Play
**Issue:** Videos created but won't play in system

**Solution:**
- Test video in VLC player first
- Check video is exactly 30 seconds
- Verify file path in `config/scenes.json`
- Ensure backend can access `assets/` directory

### Icons Don't Display
**Issue:** Scene icons missing in UI

**Solution:**
- Verify files exist in `assets/images/`
- Check file names match exactly (case-sensitive)
- Verify paths in `config/scenes.json`
- Check browser console for errors

## Next Steps

### For Development
You're ready to develop! The placeholder assets are sufficient for:
- Testing all system features
- Developing new functionality
- Running automated tests
- Demonstrating the system

### For Production
When ready for production deployment:
1. Read `ASSET_CREATION_GUIDE.md` for detailed specifications
2. Create professional base videos (30 seconds each)
3. Design custom scene icons (256x256 PNG)
4. Create clear guidance images (800x600+ PNG)
5. Replace placeholder files with production assets
6. Test thoroughly with real users

## Asset Specifications

### Videos
- Duration: 30 seconds (exact)
- Resolution: 1920x1080 or 1280x720
- Frame Rate: 30 FPS
- Format: MP4 (H.264)

### Icons
- Size: 256x256 pixels
- Format: PNG with transparency
- Style: Simple, recognizable

### Guidance Images
- Size: 800x600 pixels (minimum)
- Format: PNG or JPG
- Style: Clear pose demonstrations

## Need Help?

- **Detailed Guide:** See `ASSET_CREATION_GUIDE.md`
- **Configuration:** Check `config/scenes.json`
- **Video Specs:** See `scenes/README.md`
- **Image Specs:** See `images/README.md`
- **Full Documentation:** See `README.md`

## Time Estimate

- **FFmpeg Method:** 1-2 minutes
- **Python Method:** 2-3 minutes (first time with install)
- **Manual Creation:** Several hours (production quality)

## Success Criteria

✅ All 16 files created
✅ Videos play in VLC
✅ Images display correctly
✅ System starts without errors
✅ Scene selection works
✅ Guidance images appear

You're ready to go! 🎉
