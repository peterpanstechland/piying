#!/bin/bash
# Placeholder Asset Generator for Shadow Puppet Interactive System
# This script creates simple placeholder files for testing
# Requires FFmpeg to be installed

echo "============================================================"
echo "Shadow Puppet Interactive System"
echo "Placeholder Asset Generator (Linux/Mac)"
echo "============================================================"
echo ""

# Check if FFmpeg is available
if ! command -v ffmpeg &> /dev/null; then
    echo "ERROR: FFmpeg not found in PATH"
    echo ""
    echo "Please install FFmpeg:"
    echo "  Ubuntu/Debian: sudo apt-get install ffmpeg"
    echo "  macOS: brew install ffmpeg"
    echo "  Or download from: https://ffmpeg.org/download.html"
    echo ""
    echo "Alternatively, run: python3 create_placeholder_assets.py"
    exit 1
fi

echo "Creating directories..."
mkdir -p scenes
mkdir -p images

echo ""
echo "Creating base videos..."
echo "------------------------------------------------------------"

echo "Creating sceneA_base.mp4 (Martial Arts - Red)..."
ffmpeg -f lavfi -i color=c=red:s=1920x1080:d=30 -vf "drawtext=text='Scene A - Martial Arts':fontsize=80:fontcolor=white:x=(w-text_w)/2:y=(h-text_h)/2:box=1:boxcolor=black@0.5:boxborderw=10" -r 30 -c:v libx264 -pix_fmt yuv420p -y scenes/sceneA_base.mp4 2>/dev/null
if [ $? -eq 0 ]; then echo "  ✓ sceneA_base.mp4"; else echo "  ✗ sceneA_base.mp4"; fi

echo "Creating sceneB_base.mp4 (Dance - Purple)..."
ffmpeg -f lavfi -i color=c=purple:s=1920x1080:d=30 -vf "drawtext=text='Scene B - Dance':fontsize=80:fontcolor=white:x=(w-text_w)/2:y=(h-text_h)/2:box=1:boxcolor=black@0.5:boxborderw=10" -r 30 -c:v libx264 -pix_fmt yuv420p -y scenes/sceneB_base.mp4 2>/dev/null
if [ $? -eq 0 ]; then echo "  ✓ sceneB_base.mp4"; else echo "  ✗ sceneB_base.mp4"; fi

echo "Creating sceneC_base.mp4 (Story - Blue)..."
ffmpeg -f lavfi -i color=c=blue:s=1920x1080:d=30 -vf "drawtext=text='Scene C - Story':fontsize=80:fontcolor=white:x=(w-text_w)/2:y=(h-text_h)/2:box=1:boxcolor=black@0.5:boxborderw=10" -r 30 -c:v libx264 -pix_fmt yuv420p -y scenes/sceneC_base.mp4 2>/dev/null
if [ $? -eq 0 ]; then echo "  ✓ sceneC_base.mp4"; else echo "  ✗ sceneC_base.mp4"; fi

echo ""
echo "Creating placeholder icon images..."
echo "------------------------------------------------------------"

# Create simple colored squares as icon placeholders
ffmpeg -f lavfi -i color=c=red:s=256x256:d=1 -vf "drawtext=text='Scene A':fontsize=40:fontcolor=white:x=(w-text_w)/2:y=(h-text_h)/2" -frames:v 1 -y images/sceneA_icon.png 2>/dev/null
if [ $? -eq 0 ]; then echo "  ✓ sceneA_icon.png"; else echo "  ✗ sceneA_icon.png"; fi

ffmpeg -f lavfi -i color=c=purple:s=256x256:d=1 -vf "drawtext=text='Scene B':fontsize=40:fontcolor=white:x=(w-text_w)/2:y=(h-text_h)/2" -frames:v 1 -y images/sceneB_icon.png 2>/dev/null
if [ $? -eq 0 ]; then echo "  ✓ sceneB_icon.png"; else echo "  ✗ sceneB_icon.png"; fi

ffmpeg -f lavfi -i color=c=blue:s=256x256:d=1 -vf "drawtext=text='Scene C':fontsize=40:fontcolor=white:x=(w-text_w)/2:y=(h-text_h)/2" -frames:v 1 -y images/sceneC_icon.png 2>/dev/null
if [ $? -eq 0 ]; then echo "  ✓ sceneC_icon.png"; else echo "  ✗ sceneC_icon.png"; fi

echo ""
echo "Creating placeholder guidance images..."
echo "------------------------------------------------------------"

# Scene A guidance images
ffmpeg -f lavfi -i color=c=white:s=800x600:d=1 -vf "drawtext=text='Scene A - Segment 1\nOpening Stance':fontsize=40:fontcolor=black:x=(w-text_w)/2:y=(h-text_h)/2" -frames:v 1 -y images/sceneA_segment1_guide.png 2>/dev/null
if [ $? -eq 0 ]; then echo "  ✓ sceneA_segment1_guide.png"; else echo "  ✗ sceneA_segment1_guide.png"; fi

ffmpeg -f lavfi -i color=c=white:s=800x600:d=1 -vf "drawtext=text='Scene A - Segment 2\nDynamic Moves':fontsize=40:fontcolor=black:x=(w-text_w)/2:y=(h-text_h)/2" -frames:v 1 -y images/sceneA_segment2_guide.png 2>/dev/null
if [ $? -eq 0 ]; then echo "  ✓ sceneA_segment2_guide.png"; else echo "  ✗ sceneA_segment2_guide.png"; fi

ffmpeg -f lavfi -i color=c=white:s=800x600:d=1 -vf "drawtext=text='Scene A - Segment 3\nClosing Stance':fontsize=40:fontcolor=black:x=(w-text_w)/2:y=(h-text_h)/2" -frames:v 1 -y images/sceneA_segment3_guide.png 2>/dev/null
if [ $? -eq 0 ]; then echo "  ✓ sceneA_segment3_guide.png"; else echo "  ✗ sceneA_segment3_guide.png"; fi

# Scene B guidance images
ffmpeg -f lavfi -i color=c=white:s=800x600:d=1 -vf "drawtext=text='Scene B - Segment 1\nEntrance':fontsize=40:fontcolor=black:x=(w-text_w)/2:y=(h-text_h)/2" -frames:v 1 -y images/sceneB_segment1_guide.png 2>/dev/null
if [ $? -eq 0 ]; then echo "  ✓ sceneB_segment1_guide.png"; else echo "  ✗ sceneB_segment1_guide.png"; fi

ffmpeg -f lavfi -i color=c=white:s=800x600:d=1 -vf "drawtext=text='Scene B - Segment 2\nPerformance':fontsize=40:fontcolor=black:x=(w-text_w)/2:y=(h-text_h)/2" -frames:v 1 -y images/sceneB_segment2_guide.png 2>/dev/null
if [ $? -eq 0 ]; then echo "  ✓ sceneB_segment2_guide.png"; else echo "  ✗ sceneB_segment2_guide.png"; fi

ffmpeg -f lavfi -i color=c=white:s=800x600:d=1 -vf "drawtext=text='Scene B - Segment 3\nFinale':fontsize=40:fontcolor=black:x=(w-text_w)/2:y=(h-text_h)/2" -frames:v 1 -y images/sceneB_segment3_guide.png 2>/dev/null
if [ $? -eq 0 ]; then echo "  ✓ sceneB_segment3_guide.png"; else echo "  ✗ sceneB_segment3_guide.png"; fi

# Scene C guidance images
ffmpeg -f lavfi -i color=c=white:s=800x600:d=1 -vf "drawtext=text='Scene C - Segment 1\nEntrance':fontsize=40:fontcolor=black:x=(w-text_w)/2:y=(h-text_h)/2" -frames:v 1 -y images/sceneC_segment1_guide.png 2>/dev/null
if [ $? -eq 0 ]; then echo "  ✓ sceneC_segment1_guide.png"; else echo "  ✗ sceneC_segment1_guide.png"; fi

ffmpeg -f lavfi -i color=c=white:s=800x600:d=1 -vf "drawtext=text='Scene C - Segment 2\nWalking':fontsize=40:fontcolor=black:x=(w-text_w)/2:y=(h-text_h)/2" -frames:v 1 -y images/sceneC_segment2_guide.png 2>/dev/null
if [ $? -eq 0 ]; then echo "  ✓ sceneC_segment2_guide.png"; else echo "  ✗ sceneC_segment2_guide.png"; fi

ffmpeg -f lavfi -i color=c=white:s=800x600:d=1 -vf "drawtext=text='Scene C - Segment 3\nClimax':fontsize=40:fontcolor=black:x=(w-text_w)/2:y=(h-text_h)/2" -frames:v 1 -y images/sceneC_segment3_guide.png 2>/dev/null
if [ $? -eq 0 ]; then echo "  ✓ sceneC_segment3_guide.png"; else echo "  ✗ sceneC_segment3_guide.png"; fi

ffmpeg -f lavfi -i color=c=white:s=800x600:d=1 -vf "drawtext=text='Scene C - Segment 4\nExit':fontsize=40:fontcolor=black:x=(w-text_w)/2:y=(h-text_h)/2" -frames:v 1 -y images/sceneC_segment4_guide.png 2>/dev/null
if [ $? -eq 0 ]; then echo "  ✓ sceneC_segment4_guide.png"; else echo "  ✗ sceneC_segment4_guide.png"; fi

echo ""
echo "============================================================"
echo "✓ Placeholder assets created successfully!"
echo "============================================================"
echo ""
echo "Assets created:"
echo "  Videos: assets/scenes/"
echo "  Images: assets/images/"
echo ""
echo "Note: These are simple placeholders for testing."
echo "See ASSET_CREATION_GUIDE.md for creating production assets."
echo ""
