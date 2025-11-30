#!/usr/bin/env python3
"""
Placeholder Asset Generator for Shadow Puppet Interactive System

This script creates simple placeholder assets for development and testing.
It generates:
- 3 base videos (30 seconds each) with colored backgrounds
- 3 scene icons (256x256 PNG)
- 10 guidance images (800x600 PNG)

Requirements:
- Python 3.10+
- OpenCV (cv2): pip install opencv-python
- NumPy: pip install numpy
- Pillow: pip install pillow

Usage:
    python create_placeholder_assets.py
"""

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont
import os
from pathlib import Path

# Configuration
SCRIPT_DIR = Path(__file__).parent
SCENES_DIR = SCRIPT_DIR / "scenes"
IMAGES_DIR = SCRIPT_DIR / "images"

# Video settings
VIDEO_WIDTH = 1920
VIDEO_HEIGHT = 1080
VIDEO_FPS = 30
VIDEO_DURATION = 30  # seconds

# Image settings
ICON_SIZE = 256
GUIDANCE_WIDTH = 800
GUIDANCE_HEIGHT = 600


def create_base_video(filename: str, color: tuple, text: str):
    """Create a simple colored base video with text."""
    print(f"Creating {filename}...")
    
    filepath = SCENES_DIR / filename
    fourcc = cv2.VideoWriter_fourcc(*'mp4v')
    out = cv2.VideoWriter(str(filepath), fourcc, VIDEO_FPS, (VIDEO_WIDTH, VIDEO_HEIGHT))
    
    total_frames = VIDEO_FPS * VIDEO_DURATION
    
    for frame_num in range(total_frames):
        # Create colored frame
        frame = np.zeros((VIDEO_HEIGHT, VIDEO_WIDTH, 3), dtype=np.uint8)
        frame[:] = color
        
        # Add gradient effect
        gradient = np.linspace(0, 50, VIDEO_HEIGHT, dtype=np.uint8)
        gradient = np.tile(gradient.reshape(-1, 1), (1, VIDEO_WIDTH))
        gradient_3ch = np.stack([gradient, gradient, gradient], axis=2)
        frame = cv2.add(frame, gradient_3ch)
        
        # Add text
        font = cv2.FONT_HERSHEY_SIMPLEX
        font_scale = 2.5
        thickness = 4
        text_size = cv2.getTextSize(text, font, font_scale, thickness)[0]
        text_x = (VIDEO_WIDTH - text_size[0]) // 2
        text_y = (VIDEO_HEIGHT + text_size[1]) // 2
        
        # Add shadow
        cv2.putText(frame, text, (text_x + 3, text_y + 3), font, font_scale, (0, 0, 0), thickness + 2)
        # Add main text
        cv2.putText(frame, text, (text_x, text_y), font, font_scale, (255, 255, 255), thickness)
        
        # Add time indicator
        time_text = f"{frame_num / VIDEO_FPS:.1f}s / {VIDEO_DURATION}s"
        cv2.putText(frame, time_text, (50, VIDEO_HEIGHT - 50), cv2.FONT_HERSHEY_SIMPLEX, 1, (255, 255, 255), 2)
        
        out.write(frame)
    
    out.release()
    print(f"✓ Created {filename}")


def create_icon(filename: str, emoji: str, bg_color: tuple, text: str):
    """Create a simple icon with emoji and text."""
    print(f"Creating {filename}...")
    
    filepath = IMAGES_DIR / filename
    
    # Create image with transparency
    img = Image.new('RGBA', (ICON_SIZE, ICON_SIZE), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    
    # Draw colored circle background
    margin = 20
    draw.ellipse([margin, margin, ICON_SIZE - margin, ICON_SIZE - margin], 
                 fill=bg_color + (255,), outline=(255, 255, 255, 255), width=4)
    
    # Try to add emoji (may not work on all systems)
    try:
        font_size = 100
        font = ImageFont.truetype("seguiemj.ttf", font_size)  # Windows emoji font
        emoji_bbox = draw.textbbox((0, 0), emoji, font=font)
        emoji_width = emoji_bbox[2] - emoji_bbox[0]
        emoji_height = emoji_bbox[3] - emoji_bbox[1]
        emoji_x = (ICON_SIZE - emoji_width) // 2
        emoji_y = (ICON_SIZE - emoji_height) // 2 - 20
        draw.text((emoji_x, emoji_y), emoji, font=font, fill=(255, 255, 255, 255))
    except:
        # Fallback: draw text
        try:
            font = ImageFont.truetype("arial.ttf", 40)
        except:
            font = ImageFont.load_default()
        
        text_bbox = draw.textbbox((0, 0), text, font=font)
        text_width = text_bbox[2] - text_bbox[0]
        text_height = text_bbox[3] - text_bbox[1]
        text_x = (ICON_SIZE - text_width) // 2
        text_y = (ICON_SIZE - text_height) // 2
        draw.text((text_x, text_y), text, font=font, fill=(255, 255, 255, 255))
    
    img.save(filepath)
    print(f"✓ Created {filename}")


def create_guidance_image(filename: str, pose_description: str, arrows: list = None):
    """Create a simple guidance image with stick figure and text."""
    print(f"Creating {filename}...")
    
    filepath = IMAGES_DIR / filename
    
    # Create white background
    img = Image.new('RGB', (GUIDANCE_WIDTH, GUIDANCE_HEIGHT), (255, 255, 255))
    draw = ImageDraw.Draw(img)
    
    # Draw simple stick figure in center
    center_x = GUIDANCE_WIDTH // 2
    center_y = GUIDANCE_HEIGHT // 2 - 50
    
    # Head
    head_radius = 40
    draw.ellipse([center_x - head_radius, center_y - head_radius, 
                  center_x + head_radius, center_y + head_radius], 
                 outline=(0, 0, 0), width=3)
    
    # Body
    body_length = 120
    draw.line([center_x, center_y + head_radius, center_x, center_y + head_radius + body_length], 
              fill=(0, 0, 0), width=3)
    
    # Arms (default position)
    arm_length = 80
    arm_y = center_y + head_radius + 30
    draw.line([center_x, arm_y, center_x - arm_length, arm_y - 30], fill=(0, 0, 0), width=3)
    draw.line([center_x, arm_y, center_x + arm_length, arm_y - 30], fill=(0, 0, 0), width=3)
    
    # Legs
    leg_length = 100
    leg_start_y = center_y + head_radius + body_length
    draw.line([center_x, leg_start_y, center_x - 40, leg_start_y + leg_length], fill=(0, 0, 0), width=3)
    draw.line([center_x, leg_start_y, center_x + 40, leg_start_y + leg_length], fill=(0, 0, 0), width=3)
    
    # Add arrows if specified
    if arrows:
        for arrow in arrows:
            start, end = arrow
            draw.line([start, end], fill=(255, 0, 0), width=4)
            # Simple arrowhead
            angle = np.arctan2(end[1] - start[1], end[0] - start[0])
            arrow_size = 15
            p1 = (int(end[0] - arrow_size * np.cos(angle - np.pi/6)),
                  int(end[1] - arrow_size * np.sin(angle - np.pi/6)))
            p2 = (int(end[0] - arrow_size * np.cos(angle + np.pi/6)),
                  int(end[1] - arrow_size * np.sin(angle + np.pi/6)))
            draw.line([end, p1], fill=(255, 0, 0), width=4)
            draw.line([end, p2], fill=(255, 0, 0), width=4)
    
    # Add text description at bottom
    try:
        font = ImageFont.truetype("arial.ttf", 30)
    except:
        font = ImageFont.load_default()
    
    text_bbox = draw.textbbox((0, 0), pose_description, font=font)
    text_width = text_bbox[2] - text_bbox[0]
    text_x = (GUIDANCE_WIDTH - text_width) // 2
    text_y = GUIDANCE_HEIGHT - 80
    
    # Draw text with background
    padding = 10
    draw.rectangle([text_x - padding, text_y - padding, 
                   text_x + text_width + padding, text_y + 40 + padding],
                  fill=(240, 240, 240))
    draw.text((text_x, text_y), pose_description, font=font, fill=(0, 0, 0))
    
    img.save(filepath)
    print(f"✓ Created {filename}")


def main():
    """Generate all placeholder assets."""
    print("=" * 60)
    print("Shadow Puppet Interactive System")
    print("Placeholder Asset Generator")
    print("=" * 60)
    print()
    
    # Create directories if they don't exist
    SCENES_DIR.mkdir(parents=True, exist_ok=True)
    IMAGES_DIR.mkdir(parents=True, exist_ok=True)
    
    print("Creating base videos...")
    print("-" * 60)
    
    # Create base videos
    create_base_video("sceneA_base.mp4", (220, 20, 60), "Scene A: Martial Arts")  # Red
    create_base_video("sceneB_base.mp4", (147, 112, 219), "Scene B: Dance")  # Purple
    create_base_video("sceneC_base.mp4", (65, 105, 225), "Scene C: Story")  # Blue
    
    print()
    print("Creating scene icons...")
    print("-" * 60)
    
    # Create icons
    create_icon("sceneA_icon.png", "🥋", (220, 20, 60), "Martial\nArts")
    create_icon("sceneB_icon.png", "💃", (147, 112, 219), "Dance")
    create_icon("sceneC_icon.png", "📖", (65, 105, 225), "Story")
    
    print()
    print("Creating guidance images...")
    print("-" * 60)
    
    # Create guidance images for Scene A
    create_guidance_image("sceneA_segment1_guide.png", "Opening Stance - Fists Together")
    create_guidance_image("sceneA_segment2_guide.png", "Dynamic Moves - Kicks & Punches")
    create_guidance_image("sceneA_segment3_guide.png", "Closing Stance - Bow")
    
    # Create guidance images for Scene B
    create_guidance_image("sceneB_segment1_guide.png", "Entrance - Arms Extended")
    create_guidance_image("sceneB_segment2_guide.png", "Performance - Spin & Jump")
    create_guidance_image("sceneB_segment3_guide.png", "Finale - Graceful Pose")
    
    # Create guidance images for Scene C
    create_guidance_image("sceneC_segment1_guide.png", "Entrance - Surprise Gesture")
    create_guidance_image("sceneC_segment2_guide.png", "Walking & Storytelling")
    create_guidance_image("sceneC_segment3_guide.png", "Climax - Dramatic Gesture")
    create_guidance_image("sceneC_segment4_guide.png", "Exit - Wave Goodbye")
    
    print()
    print("=" * 60)
    print("✓ All placeholder assets created successfully!")
    print("=" * 60)
    print()
    print("Assets created:")
    print(f"  Videos: {SCENES_DIR}")
    print(f"  Images: {IMAGES_DIR}")
    print()
    print("Note: These are simple placeholders for testing.")
    print("See ASSET_CREATION_GUIDE.md for creating production assets.")


if __name__ == "__main__":
    main()
