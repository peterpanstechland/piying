# Shadow Puppet Interactive System - Assets

This directory contains all visual and video assets required for the Shadow Puppet Interactive System.

## Directory Structure

```
assets/
├── scenes/                          # Base videos for each scene
│   ├── sceneA_base.mp4             # Martial Arts scene (30s)
│   ├── sceneB_base.mp4             # Dance scene (30s)
│   └── sceneC_base.mp4             # Story scene (30s)
├── images/                          # Icons and guidance images
│   ├── sceneA_icon.png             # Scene A icon (256x256)
│   ├── sceneB_icon.png             # Scene B icon (256x256)
│   ├── sceneC_icon.png             # Scene C icon (256x256)
│   ├── sceneA_segment1_guide.png   # Scene A guidance images
│   ├── sceneA_segment2_guide.png
│   ├── sceneA_segment3_guide.png
│   ├── sceneB_segment1_guide.png   # Scene B guidance images
│   ├── sceneB_segment2_guide.png
│   ├── sceneB_segment3_guide.png
│   ├── sceneC_segment1_guide.png   # Scene C guidance images
│   ├── sceneC_segment2_guide.png
│   ├── sceneC_segment3_guide.png
│   └── sceneC_segment4_guide.png
├── ASSET_CREATION_GUIDE.md         # Detailed guide for creating assets
├── create_placeholder_assets.py    # Python script to generate placeholders
├── create_placeholder_assets.bat   # Windows batch script
├── create_placeholder_assets.sh    # Linux/Mac shell script
└── README.md                        # This file
```

## Quick Start

### Option 1: Generate Placeholder Assets (Recommended for Testing)

**Using FFmpeg (Windows):**
```bash
cd assets
create_placeholder_assets.bat
```

**Using FFmpeg (Linux/Mac):**
```bash
cd assets
chmod +x create_placeholder_assets.sh
./create_placeholder_assets.sh
```

**Using Python:**
```bash
cd assets
pip install opencv-python numpy pillow
python create_placeholder_assets.py
```

This will create simple placeholder assets suitable for development and testing.

### Option 2: Create Production Assets

See `ASSET_CREATION_GUIDE.md` for detailed instructions on creating high-quality production assets.

## Asset Requirements Summary

### Base Videos (3 files)
- **Format:** MP4 (H.264 codec)
- **Duration:** Exactly 30 seconds
- **Resolution:** 1920x1080 (Full HD) or 1280x720 (HD)
- **Frame Rate:** 30 FPS
- **File Size:** < 50 MB each

### Scene Icons (3 files)
- **Format:** PNG with transparency
- **Size:** 256x256 pixels
- **File Size:** < 100 KB each
- **Style:** Simple, recognizable symbols

### Guidance Images (10 files)
- **Format:** PNG or JPG
- **Size:** 800x600 pixels (minimum)
- **File Size:** < 500 KB each
- **Style:** Clear pose demonstrations with arrows

## Scene Descriptions

### Scene A: Martial Arts Performance (武术表演)
**Theme:** Traditional Chinese martial arts
- **Icon:** 🥋 Martial arts figure
- **Colors:** Red, Gold, Black
- **Segments:** 3 (Opening stance, Dynamic moves, Closing stance)
- **Total Duration:** 30 seconds (8s + 10s + 12s)

### Scene B: Dance Performance (舞蹈表演)
**Theme:** Elegant dance performance
- **Icon:** 💃 Dancing figure
- **Colors:** Purple, Pink, White
- **Segments:** 3 (Entrance, Performance, Finale)
- **Total Duration:** 30 seconds (10s + 15s + 5s)

### Scene C: Story Performance (故事表演)
**Theme:** Narrative storytelling
- **Icon:** 📖 Book or storytelling figure
- **Colors:** Blue, Orange, Brown
- **Segments:** 4 (Entrance, Walking, Climax, Exit)
- **Total Duration:** 30 seconds (6s + 12s + 8s + 4s)

## Configuration

Asset paths are configured in `config/scenes.json`. The configuration includes:
- Base video paths
- Icon image paths
- Guidance image paths for each segment
- Segment durations and character movement paths
- Scene names and descriptions (Chinese and English)

## Validation Checklist

Before deploying, verify all assets:

**Videos:**
- [ ] All 3 base videos exist
- [ ] Each video is exactly 30 seconds
- [ ] Resolution is 1920x1080 or 1280x720
- [ ] Frame rate is 30 FPS
- [ ] Videos play correctly in VLC or similar player
- [ ] File sizes are reasonable (< 50 MB each)

**Icons:**
- [ ] All 3 icon images exist
- [ ] Each icon is 256x256 pixels
- [ ] PNG format with transparency
- [ ] Icons are clear and recognizable
- [ ] File sizes < 100 KB

**Guidance Images:**
- [ ] All 10 guidance images exist (3 + 3 + 4)
- [ ] Each image is at least 800x600 pixels
- [ ] Poses are clear and easy to understand
- [ ] Good contrast and visibility
- [ ] File sizes < 500 KB

## Testing Assets

To test assets in the system:

1. Ensure all required files are in place
2. Start the backend server: `cd backend && python -m uvicorn app.main:app --reload`
3. Start the frontend: `cd frontend && npm run dev`
4. Navigate to the application in your browser
5. Verify:
   - Scene icons display correctly in scene selection
   - Base videos play in the background
   - Guidance images appear before each segment
   - All text displays in correct language

## Troubleshooting

**Videos don't play:**
- Check video codec is H.264
- Verify file paths in `config/scenes.json`
- Ensure videos are exactly 30 seconds
- Try playing in VLC to verify file integrity

**Icons don't display:**
- Check PNG transparency is working
- Verify file paths in `config/scenes.json`
- Ensure files are exactly 256x256 pixels
- Check file permissions

**Guidance images missing:**
- Verify all 10 files exist
- Check file paths in `config/scenes.json`
- Ensure files are readable
- Check file format (PNG or JPG)

## Creating Custom Assets

For detailed instructions on creating custom production assets, see:
- `ASSET_CREATION_GUIDE.md` - Comprehensive guide with specifications
- `scenes/README.md` - Video-specific requirements
- `images/README.md` - Image-specific requirements

## Copyright and Licensing

Ensure all assets are either:
- Created by you
- Licensed for commercial use
- Public domain
- Properly attributed if required

Do not use copyrighted material without permission.

## Resources

**Stock Assets:**
- [Pexels](https://www.pexels.com/) - Free videos and images
- [Unsplash](https://unsplash.com/) - Free images
- [Pixabay](https://pixabay.com/) - Free videos and images
- [Freepik](https://www.freepik.com/) - Free vectors and graphics

**Tools:**
- [FFmpeg](https://ffmpeg.org/) - Video processing
- [GIMP](https://www.gimp.org/) - Image editing (free)
- [Inkscape](https://inkscape.org/) - Vector graphics (free)
- [Blender](https://www.blender.org/) - 3D animation (free)
- [DaVinci Resolve](https://www.blackmagicdesign.com/products/davinciresolve) - Video editing (free)

## Support

For questions or issues with assets:
1. Check `ASSET_CREATION_GUIDE.md` for detailed specifications
2. Verify file paths in `config/scenes.json`
3. Test with placeholder assets first
4. Check system logs for error messages

## Version History

- **v1.0** - Initial asset structure and placeholder generation scripts
- Scene A: Martial Arts Performance
- Scene B: Dance Performance
- Scene C: Story Performance
