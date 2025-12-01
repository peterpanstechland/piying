"""
Sprite Sheet generation service for PixiJS integration.
Packs character parts into a single texture atlas with JSON metadata.
"""
import json
import math
import os
from typing import Dict, List, Optional, Tuple
from PIL import Image

from .character_service import character_service, CHARACTERS_DIR


class SpritesheetService:
    """Service for generating PixiJS-compatible sprite sheets."""

    def __init__(self):
        self.padding = 2  # Padding between sprites

    def pack_sprites(
        self, 
        images: Dict[str, Image.Image]
    ) -> Tuple[Image.Image, Dict[str, dict]]:
        """
        Pack multiple images into a single sprite sheet using simple bin packing.
        
        Returns:
            Tuple of (combined_image, frames_data)
        """
        if not images:
            return None, {}

        # Sort images by height (descending) for better packing
        sorted_items = sorted(
            images.items(), 
            key=lambda x: x[1].height, 
            reverse=True
        )

        # Calculate total area and estimate atlas size
        total_area = sum(img.width * img.height for img in images.values())
        side = int(math.ceil(math.sqrt(total_area)))
        
        # Round up to power of 2 for GPU efficiency
        atlas_size = 1
        while atlas_size < side:
            atlas_size *= 2
        atlas_size = max(atlas_size, 512)  # Minimum 512x512

        # Try packing, increase size if needed
        while atlas_size <= 4096:
            result = self._try_pack(sorted_items, atlas_size)
            if result is not None:
                return result
            atlas_size *= 2

        # Fallback: just stack vertically
        return self._stack_vertical(sorted_items)

    def _try_pack(
        self, 
        sorted_items: List[Tuple[str, Image.Image]], 
        atlas_size: int
    ) -> Optional[Tuple[Image.Image, Dict[str, dict]]]:
        """Try to pack sprites into given atlas size using shelf algorithm."""
        atlas = Image.new('RGBA', (atlas_size, atlas_size), (0, 0, 0, 0))
        frames = {}
        
        shelf_y = 0
        shelf_height = 0
        x = 0

        for name, img in sorted_items:
            w, h = img.width + self.padding, img.height + self.padding

            # Check if fits in current shelf
            if x + w > atlas_size:
                # Move to next shelf
                shelf_y += shelf_height
                shelf_height = 0
                x = 0

            # Check if fits vertically
            if shelf_y + h > atlas_size:
                return None  # Doesn't fit

            # Place sprite
            atlas.paste(img, (x, shelf_y))
            frames[name] = {
                "frame": {"x": x, "y": shelf_y, "w": img.width, "h": img.height},
                "rotated": False,
                "trimmed": False,
                "spriteSourceSize": {"x": 0, "y": 0, "w": img.width, "h": img.height},
                "sourceSize": {"w": img.width, "h": img.height}
            }

            x += w
            shelf_height = max(shelf_height, h)

        return atlas, frames

    def _stack_vertical(
        self, 
        sorted_items: List[Tuple[str, Image.Image]]
    ) -> Tuple[Image.Image, Dict[str, dict]]:
        """Fallback: stack sprites vertically."""
        max_width = max(img.width for _, img in sorted_items)
        total_height = sum(img.height + self.padding for _, img in sorted_items)

        atlas = Image.new('RGBA', (max_width, total_height), (0, 0, 0, 0))
        frames = {}
        y = 0

        for name, img in sorted_items:
            atlas.paste(img, (0, y))
            frames[name] = {
                "frame": {"x": 0, "y": y, "w": img.width, "h": img.height},
                "rotated": False,
                "trimmed": False,
                "spriteSourceSize": {"x": 0, "y": 0, "w": img.width, "h": img.height},
                "sourceSize": {"w": img.width, "h": img.height}
            }
            y += img.height + self.padding

        return atlas, frames


    async def generate_spritesheet(
        self,
        character_id: str,
        parts_data: List[dict],
    ) -> Tuple[Optional[str], Optional[str], str]:
        """
        Generate sprite sheet PNG and JSON for a character.
        
        Args:
            character_id: Character UUID
            parts_data: List of part data with name, file_path, pivot, z_index
            
        Returns:
            Tuple of (png_path, json_path, error_message)
        """
        if not parts_data:
            return None, None, "No parts to pack"

        # Load all part images
        images: Dict[str, Image.Image] = {}
        part_info: Dict[str, dict] = {}
        
        for part in parts_data:
            part_path = os.path.join(
                os.path.dirname(CHARACTERS_DIR),
                part['file_path']
            )
            if not os.path.exists(part_path):
                continue
                
            try:
                img = Image.open(part_path).convert('RGBA')
                images[part['name']] = img
                part_info[part['name']] = {
                    'pivot_x': part.get('pivot_x', 0.5),
                    'pivot_y': part.get('pivot_y', 0.5),
                    'z_index': part.get('z_index', 0),
                    'joints': part.get('joints', []),
                    # Assembly position (完整人偶组装坐标)
                    'assembly_x': part.get('editor_x'),
                    'assembly_y': part.get('editor_y'),
                    'assembly_width': part.get('editor_width'),
                    'assembly_height': part.get('editor_height'),
                    # Joint pivot (关节锚点，用于旋转动画)
                    'joint_pivot_x': part.get('joint_pivot_x'),
                    'joint_pivot_y': part.get('joint_pivot_y'),
                    # Rotation offset (旋转偏移量，根据素材朝向)
                    'rotation_offset': part.get('rotation_offset'),
                }
            except Exception as e:
                print(f"Failed to load part {part['name']}: {e}")
                continue

        if not images:
            return None, None, "No valid images found"

        # Pack sprites
        atlas, frames = self.pack_sprites(images)
        if atlas is None:
            return None, None, "Failed to pack sprites"

        # Add pivot, z_index and assembly position to frames
        for name, frame_data in frames.items():
            info = part_info.get(name, {})
            frame_data['pivot'] = {
                'x': info.get('pivot_x', 0.5),
                'y': info.get('pivot_y', 0.5)
            }
            frame_data['zIndex'] = info.get('z_index', 0)
            # Assembly position for complete puppet rendering
            if info.get('assembly_x') is not None:
                frame_data['assembly'] = {
                    'x': info.get('assembly_x'),
                    'y': info.get('assembly_y'),
                    'width': info.get('assembly_width'),
                    'height': info.get('assembly_height'),
                }
            # Joint pivot for rotation animation (关节锚点)
            if info.get('joint_pivot_x') is not None:
                frame_data['jointPivot'] = {
                    'x': info.get('joint_pivot_x'),
                    'y': info.get('joint_pivot_y'),
                }
            # Rotation offset based on sprite orientation (旋转偏移量)
            if info.get('rotation_offset') is not None:
                frame_data['rotationOffset'] = info.get('rotation_offset')

        # Generate JSON metadata
        json_data = {
            "frames": frames,
            "meta": {
                "app": "piying-admin",
                "version": "1.0",
                "image": "spritesheet.png",
                "format": "RGBA8888",
                "size": {"w": atlas.width, "h": atlas.height},
                "scale": "1"
            }
        }

        # Save files
        char_dir = os.path.join(CHARACTERS_DIR, character_id)
        os.makedirs(char_dir, exist_ok=True)

        png_path = os.path.join(char_dir, "spritesheet.png")
        json_path = os.path.join(char_dir, "spritesheet.json")

        atlas.save(png_path, "PNG")
        with open(json_path, 'w', encoding='utf-8') as f:
            json.dump(json_data, f, indent=2, ensure_ascii=False)

        return (
            f"characters/{character_id}/spritesheet.png",
            f"characters/{character_id}/spritesheet.json",
            ""
        )

    def generate_character_config(
        self,
        character_id: str,
        name: str,
        parts_data: List[dict],
        bindings_data: List[dict],
    ) -> dict:
        """
        Generate complete character configuration for PixiJS renderer.
        
        Returns:
            Character config dict
        """
        # Build skeleton from joints
        all_joints = []
        for part in parts_data:
            for joint in part.get('joints', []):
                all_joints.append({
                    'id': joint['id'],
                    'name': joint.get('name', joint['id']),
                    'part': part['name'],
                    'position': {'x': joint['x'], 'y': joint['y']},
                    'connectedTo': joint.get('connectedTo')
                })

        # Build bones from connections
        bones = []
        for joint in all_joints:
            if joint.get('connectedTo'):
                bones.append({
                    'from': f"{joint['part']}:{joint['id']}",
                    'to': joint['connectedTo']
                })

        # Build bindings map
        bindings = {}
        for binding in bindings_data:
            bindings[binding['part_name']] = {
                'landmarks': binding.get('landmarks', []),
                'rotationLandmark': binding.get('rotation_landmark'),
                'scaleLandmarks': binding.get('scale_landmarks', [])
            }

        # Build render order (sorted by z_index)
        render_order = [
            p['name'] for p in sorted(parts_data, key=lambda x: x.get('z_index', 0))
        ]

        return {
            'id': character_id,
            'name': name,
            'spritesheet': f'/api/admin/characters/{character_id}/spritesheet.json',
            'spritesheetImage': f'/api/admin/characters/{character_id}/spritesheet.png',
            'skeleton': {
                'joints': all_joints,
                'bones': bones
            },
            'bindings': bindings,
            'renderOrder': render_order
        }


# Singleton instance
spritesheet_service = SpritesheetService()
