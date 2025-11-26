# Scene Base Videos

This directory contains the base videos for each scene.

## Required Files

- `sceneA_base.mp4` - Martial Arts Performance scene (30 seconds)
- `sceneB_base.mp4` - Dance Performance scene (30 seconds)
- `sceneC_base.mp4` - Story Performance scene (30 seconds)

## Video Specifications

### Technical Requirements
- **Duration:** Exactly 30 seconds
- **Resolution:** 1920x1080 (Full HD) or 1280x720 (HD)
- **Frame Rate:** 30 FPS
- **Format:** MP4 (H.264 codec)
- **Bitrate:** 5-10 Mbps
- **Audio:** Optional (silent or ambient music)

### Scene A: Martial Arts Performance
**Theme:** Traditional Chinese martial arts stage
- **Colors:** Red (#DC143C), Gold (#FFD700), Black (#000000)
- **Elements:** Traditional theater backdrop, lanterns, decorative patterns
- **Atmosphere:** Energetic, powerful, traditional
- **Timing:** 0-8s (left), 8-18s (center), 18-30s (right)

### Scene B: Dance Performance
**Theme:** Elegant performance stage
- **Colors:** Purple (#9370DB), Pink (#FFB6C1), White (#FFFFFF)
- **Elements:** Soft gradients, flowing curtains, spotlight effects
- **Atmosphere:** Graceful, flowing, artistic
- **Timing:** 0-10s (top), 10-25s (center), 25-30s (bottom)

### Scene C: Story Performance
**Theme:** Narrative storytelling environment
- **Colors:** Blue (#4169E1), Orange (#FFA500), Brown (#8B4513)
- **Elements:** Landscape silhouettes, environmental elements
- **Atmosphere:** Narrative, journey-like, expressive
- **Timing:** 0-6s (right), 6-18s (walking left), 18-26s (left), 26-30s (exit)

## Creating Base Videos

See `../ASSET_CREATION_GUIDE.md` for detailed instructions on creating these videos.

### Quick Start Options

1. **Professional:** Use Adobe After Effects or Blender
2. **Simple:** Create static backgrounds with subtle animations
3. **Placeholder:** Use solid colors with text labels for testing

### Recommended Tools
- Adobe After Effects (professional)
- Blender (free, 3D animation)
- DaVinci Resolve (free, video editing)
- Canva (simple, web-based)

## Placeholder Videos

For development and testing, you can create simple placeholder videos:

```bash
# Using FFmpeg to create a 30-second colored video
ffmpeg -f lavfi -i color=c=red:s=1920x1080:d=30 -vf "drawtext=text='Scene A - Martial Arts':fontsize=60:fontcolor=white:x=(w-text_w)/2:y=(h-text_h)/2" -r 30 sceneA_base.mp4

ffmpeg -f lavfi -i color=c=purple:s=1920x1080:d=30 -vf "drawtext=text='Scene B - Dance':fontsize=60:fontcolor=white:x=(w-text_w)/2:y=(h-text_h)/2" -r 30 sceneB_base.mp4

ffmpeg -f lavfi -i color=c=blue:s=1920x1080:d=30 -vf "drawtext=text='Scene C - Story':fontsize=60:fontcolor=white:x=(w-text_w)/2:y=(h-text_h)/2" -r 30 sceneC_base.mp4
```

## Validation

After creating videos, verify:
- ✓ Duration is exactly 30 seconds
- ✓ Resolution is 1920x1080 or 1280x720
- ✓ Frame rate is 30 FPS
- ✓ File plays correctly in VLC or similar player
- ✓ File size is reasonable (< 50 MB per video)

## Copyright

Ensure all video content is either:
- Created by you
- Licensed for commercial use
- Public domain
- Properly attributed if required
