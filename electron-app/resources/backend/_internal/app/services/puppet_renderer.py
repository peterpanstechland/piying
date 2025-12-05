"""
Shadow Puppet Character Renderer using spritesheet
Renders shadow puppet character by compositing individual parts with pose-driven rotation.

This module replaces the simple skeleton line drawing with actual spritesheet-based rendering.
"""
import cv2
import numpy as np
import json
import logging
import math
from pathlib import Path
from typing import Optional, List, Dict, Tuple, Any
from PIL import Image

logger = logging.getLogger(__name__)


# MediaPipe Pose landmark indices
# Used for calculating rotation angles for each body part
class MediaPipeLandmarks:
    NOSE = 0
    LEFT_SHOULDER = 11
    RIGHT_SHOULDER = 12
    LEFT_ELBOW = 13
    RIGHT_ELBOW = 14
    LEFT_WRIST = 15
    RIGHT_WRIST = 16
    LEFT_HIP = 23
    RIGHT_HIP = 24
    LEFT_KNEE = 25
    RIGHT_KNEE = 26
    LEFT_ANKLE = 27
    RIGHT_ANKLE = 28


# Default rotation bindings: part_name -> [start_landmark, end_landmark]
DEFAULT_ROTATION_BINDINGS: Dict[str, Tuple[int, int] | None] = {
    'head': None,              # Head doesn't rotate in shadow puppet style
    'body': None,              # Body doesn't rotate
    'left-arm': (11, 13),      # Left shoulder to left elbow
    'right-arm': (12, 14),     # Right shoulder to right elbow
    'left-hand': (13, 15),     # Left elbow to left wrist
    'right-hand': (14, 16),    # Right elbow to right wrist
    'skirt': None,             # Skirt doesn't rotate
    'left-thigh': (23, 25),    # Left hip to left knee
    'right-thigh': (24, 26),   # Right hip to right knee
    'left-foot': None,         # Feet don't rotate
    'right-foot': None,
}


# Default joint pivot points (0-1 normalized) when not specified in spritesheet.json
DEFAULT_JOINT_PIVOTS: Dict[str, Dict[str, float]] = {
    'head': {'x': 0.5, 'y': 0.9},
    'body': {'x': 0.5, 'y': 0.5},
    'left-arm': {'x': 0.5, 'y': 0.1},
    'right-arm': {'x': 0.5, 'y': 0.1},
    'left-hand': {'x': 0.9, 'y': 0.5},
    'right-hand': {'x': 0.1, 'y': 0.5},
    'skirt': {'x': 0.5, 'y': 0.1},
    'left-thigh': {'x': 0.5, 'y': 0.1},
    'right-thigh': {'x': 0.5, 'y': 0.1},
    'left-foot': {'x': 0.5, 'y': 0.1},
    'right-foot': {'x': 0.5, 'y': 0.1},
}


# Bone hierarchy: child -> parent
BONE_HIERARCHY: Dict[str, str | None] = {
    'body': None,
    'head': 'body',
    'left-arm': 'body',
    'right-arm': 'body',
    'left-hand': 'left-arm',
    'right-hand': 'right-arm',
    'skirt': 'body',
    'left-thigh': 'body',
    'right-thigh': 'body',
    'left-foot': None,  # Dynamic - skirt or thigh
    'right-foot': None,
}


class PuppetPart:
    """Represents a single part of the shadow puppet character."""
    
    def __init__(
        self,
        name: str,
        image: np.ndarray,
        frame: Dict[str, int],
        assembly: Dict[str, float],
        joint_pivot: Dict[str, float],
        z_index: int = 0,
        rotation_offset: float = 0.0,
        rest_pose_offset: float = 0.0,
    ):
        self.name = name
        self.image = image  # RGBA numpy array
        self.frame = frame
        self.assembly = assembly
        self.joint_pivot = joint_pivot
        self.z_index = z_index
        self.rotation_offset = rotation_offset
        self.rest_pose_offset = rest_pose_offset
        
        # Current transform state
        self.rotation = 0.0
        # Position will be calculated relative to character center
        self.position_x = 0.0
        self.position_y = 0.0


class PuppetRenderer:
    """
    Renders a shadow puppet character using spritesheet.
    
    This class loads character spritesheet and configuration,
    then renders the character with pose-driven animation.
    """
    
    def __init__(self, character_id: str, data_dir: Path):
        """
        Initialize PuppetRenderer.
        
        Args:
            character_id: Character UUID
            data_dir: Path to data directory (backend/data)
        """
        self.character_id = character_id
        self.data_dir = data_dir
        self.char_dir = data_dir / "characters" / character_id
        
        self.parts: Dict[str, PuppetPart] = {}
        self.spritesheet_data: Optional[Dict] = None
        self.config: Optional[Dict] = None
        self.spritesheet_image: Optional[np.ndarray] = None
        
        # Scale factor for rendering (set when rendering)
        self.scale = 1.0
        self.offset_x = 0
        self.offset_y = 0
        
        # Default facing direction ('left' or 'right')
        self.default_facing = 'left'
    
    def load(self) -> bool:
        """
        Load character spritesheet and configuration.
        
        Returns:
            True if loading succeeded, False otherwise
        """
        try:
            spritesheet_json_path = self.char_dir / "spritesheet.json"
            spritesheet_png_path = self.char_dir / "spritesheet.png"
            
            if not spritesheet_json_path.exists() or not spritesheet_png_path.exists():
                logger.error(f"Spritesheet files not found for character {self.character_id}")
                return False
            
            # Load spritesheet JSON
            with open(spritesheet_json_path, 'r', encoding='utf-8') as f:
                self.spritesheet_data = json.load(f)
            
            # Load spritesheet image as RGBA
            pil_image = Image.open(spritesheet_png_path).convert('RGBA')
            self.spritesheet_image = np.array(pil_image)
            
            # Extract parts from spritesheet
            frames = self.spritesheet_data.get('frames', {})
            
            for part_name, frame_data in frames.items():
                frame = frame_data.get('frame', {})
                assembly = frame_data.get('assembly', {})
                joint_pivot = frame_data.get('jointPivot', DEFAULT_JOINT_PIVOTS.get(part_name, {'x': 0.5, 'y': 0.5}))
                z_index = frame_data.get('zIndex', 0)
                rotation_offset = frame_data.get('rotationOffset', 0.0)
                rest_pose_offset = frame_data.get('restPoseOffset', 0.0)
                
                # Extract part image from spritesheet
                x, y = frame.get('x', 0), frame.get('y', 0)
                w, h = frame.get('w', 0), frame.get('h', 0)
                
                if w > 0 and h > 0:
                    part_image = self.spritesheet_image[y:y+h, x:x+w].copy()
                    
                    self.parts[part_name] = PuppetPart(
                        name=part_name,
                        image=part_image,
                        frame=frame,
                        assembly=assembly,
                        joint_pivot=joint_pivot,
                        z_index=z_index,
                        rotation_offset=rotation_offset,
                        rest_pose_offset=rest_pose_offset,
                    )
            
            logger.info(f"Loaded puppet with {len(self.parts)} parts: {list(self.parts.keys())}")
            return True
            
        except Exception as e:
            logger.error(f"Failed to load puppet for character {self.character_id}: {e}")
            return False
    
    def calculate_bounding_box(self) -> Tuple[float, float, float, float]:
        """
        Calculate bounding box of assembled character.
        
        Returns:
            Tuple of (min_x, min_y, max_x, max_y)
        """
        min_x, min_y = float('inf'), float('inf')
        max_x, max_y = float('-inf'), float('-inf')
        
        for part in self.parts.values():
            asm = part.assembly
            part_w = asm.get('width', part.frame['w'])
            part_h = asm.get('height', part.frame['h'])
            min_x = min(min_x, asm['x'])
            min_y = min(min_y, asm['y'])
            max_x = max(max_x, asm['x'] + part_w)
            max_y = max(max_y, asm['y'] + part_h)
        
        return min_x, min_y, max_x, max_y
    
    def calculate_character_center(self) -> Tuple[float, float]:
        """
        Calculate the center point of the assembled character.
        
        Returns:
            Tuple of (center_x, center_y) in assembly coordinates
        """
        min_x, min_y, max_x, max_y = self.calculate_bounding_box()
        return (min_x + max_x) / 2, (min_y + max_y) / 2
    
    def calculate_part_position(
        self,
        part: PuppetPart,
        center_x: float,
        center_y: float,
        scale: float,
    ) -> Tuple[float, float]:
        """
        Calculate part position relative to character center.
        
        Uses the formula from frontend:
        posX = (ax + aw * pivotX - centerX) * scale
        posY = (ay + ah * pivotY - centerY) * scale
        
        Args:
            part: The puppet part
            center_x: Character center X in assembly coordinates
            center_y: Character center Y in assembly coordinates
            scale: Global scale factor
            
        Returns:
            Tuple of (x, y) position relative to render center
        """
        asm = part.assembly
        ax = asm.get('x', 0)
        ay = asm.get('y', 0)
        aw = asm.get('width', part.frame['w'])
        ah = asm.get('height', part.frame['h'])
        
        pivot_x = part.joint_pivot.get('x', 0.5)
        pivot_y = part.joint_pivot.get('y', 0.5)
        
        # Position = (Assembly左上角 + 宽*Pivot - 中心点) * 缩放
        pos_x = (ax + aw * pivot_x - center_x) * scale
        pos_y = (ay + ah * pivot_y - center_y) * scale
        
        return pos_x, pos_y
    
    def _calculate_rotation_from_landmarks(
        self,
        landmarks: List[List[float]],
        part_name: str,
    ) -> Optional[float]:
        """
        Calculate rotation angle for a part based on MediaPipe landmarks.
        
        Args:
            landmarks: List of [x, y, z, visibility] for each landmark
            part_name: Name of the part
            
        Returns:
            Rotation angle in radians, or None if cannot be calculated
        """
        binding = DEFAULT_ROTATION_BINDINGS.get(part_name)
        if binding is None:
            return None
        
        start_idx, end_idx = binding
        
        if start_idx >= len(landmarks) or end_idx >= len(landmarks):
            return None
        
        start_lm = landmarks[start_idx]
        end_lm = landmarks[end_idx]
        
        # Check visibility
        if len(start_lm) < 4 or len(end_lm) < 4:
            return None
        
        if start_lm[3] < 0.3 or end_lm[3] < 0.3:
            return None
        
        # Calculate angle
        dx = end_lm[0] - start_lm[0]
        dy = end_lm[1] - start_lm[1]
        
        return math.atan2(dy, dx)
    
    def update_pose(self, landmarks: Optional[List[List[float]]]) -> None:
        """
        Update part rotations based on MediaPipe pose landmarks.
        
        Args:
            landmarks: List of [x, y, z, visibility] for each of 33 landmarks
        """
        if landmarks is None or len(landmarks) < 33:
            # Reset to rest pose
            for part in self.parts.values():
                part.rotation = part.rest_pose_offset
            return
        
        # Calculate rotations for each part
        for part_name, part in self.parts.items():
            angle = self._calculate_rotation_from_landmarks(landmarks, part_name)
            
            if angle is not None:
                # Apply rotation formula: finalRotation = angle - restPoseOffset + rotationOffset
                final_rotation = angle - part.rest_pose_offset + part.rotation_offset
                part.rotation = final_rotation
            else:
                # Use rest pose
                part.rotation = part.rest_pose_offset
        
        # Update child positions based on parent rotations
        self._update_child_positions()
    
    def _update_child_positions(self) -> None:
        """Update positions of child parts based on parent rotations."""
        # For now, just reset positions to assembly positions
        # Full hierarchical transform would require skeleton bone data
        for part in self.parts.values():
            part.position_x = part.assembly['x']
            part.position_y = part.assembly['y']
    
    def _rotate_image(
        self,
        image: np.ndarray,
        angle: float,
        pivot: Tuple[float, float],
    ) -> Tuple[np.ndarray, int, int, int, int]:
        """
        Rotate an image around a pivot point.
        
        The pivot point in the rotated image will be at the same relative position
        to where we want to place it.
        
        Args:
            image: RGBA image to rotate
            angle: Rotation angle in radians
            pivot: Pivot point as (x, y) in normalized coordinates (0-1)
            
        Returns:
            Tuple of (rotated_image, new_pivot_x, new_pivot_y, new_w, new_h)
            where new_pivot_x/y are the pivot coordinates in the rotated image
        """
        h, w = image.shape[:2]
        
        # Calculate pivot in pixel coordinates
        pivot_px = w * pivot[0]
        pivot_py = h * pivot[1]
        
        # Convert angle to degrees (OpenCV uses degrees, negative for clockwise)
        angle_deg = -math.degrees(angle)
        
        # Get rotation matrix centered at pivot
        rotation_matrix = cv2.getRotationMatrix2D((pivot_px, pivot_py), angle_deg, 1.0)
        
        # Calculate new bounding box size after rotation
        cos = abs(math.cos(angle))
        sin = abs(math.sin(angle))
        new_w = int(h * sin + w * cos)
        new_h = int(h * cos + w * sin)
        
        # Adjust translation in rotation matrix to keep the image centered in new bounds
        # The pivot should move to account for the new image size
        rotation_matrix[0, 2] += (new_w - w) / 2
        rotation_matrix[1, 2] += (new_h - h) / 2
        
        # Calculate where the pivot point ends up in the new image
        new_pivot_x = int(pivot_px + (new_w - w) / 2)
        new_pivot_y = int(pivot_py + (new_h - h) / 2)
        
        # Rotate image
        rotated = cv2.warpAffine(
            image,
            rotation_matrix,
            (new_w, new_h),
            flags=cv2.INTER_LINEAR,
            borderMode=cv2.BORDER_CONSTANT,
            borderValue=(0, 0, 0, 0)
        )
        
        return rotated, new_pivot_x, new_pivot_y, new_w, new_h
    
    def _overlay_image(
        self,
        background: np.ndarray,
        overlay: np.ndarray,
        x: int,
        y: int,
        alpha_multiplier: float = 1.0,
    ) -> np.ndarray:
        """
        Overlay an RGBA image onto a BGR background.
        
        Args:
            background: BGR background image
            overlay: RGBA overlay image
            x: X position (top-left corner)
            y: Y position (top-left corner)
            alpha_multiplier: Overall alpha multiplier (0-1)
            
        Returns:
            Modified background image
        """
        if overlay.shape[2] != 4:
            return background
        
        h_overlay, w_overlay = overlay.shape[:2]
        h_bg, w_bg = background.shape[:2]
        
        # Calculate visible region
        x1, y1 = max(0, x), max(0, y)
        x2 = min(w_bg, x + w_overlay)
        y2 = min(h_bg, y + h_overlay)
        
        if x1 >= x2 or y1 >= y2:
            return background
        
        # Calculate corresponding region in overlay
        ox1 = x1 - x
        oy1 = y1 - y
        ox2 = ox1 + (x2 - x1)
        oy2 = oy1 + (y2 - y1)
        
        # Get regions
        bg_region = background[y1:y2, x1:x2]
        overlay_region = overlay[oy1:oy2, ox1:ox2]
        
        # Extract alpha channel
        alpha = overlay_region[:, :, 3:4].astype(float) / 255.0 * alpha_multiplier
        
        # Convert overlay RGB to BGR
        overlay_bgr = overlay_region[:, :, :3][:, :, ::-1]
        
        # Blend
        blended = (overlay_bgr * alpha + bg_region * (1 - alpha)).astype(np.uint8)
        background[y1:y2, x1:x2] = blended
        
        return background
    
    def render(
        self,
        frame: np.ndarray,
        landmarks: Optional[List[List[float]]],
        offset: Tuple[int, int] = (0, 0),
        alpha: float = 1.0,
        target_height: Optional[int] = None,
    ) -> np.ndarray:
        """
        Render the puppet onto a video frame.
        
        The rendering uses the same logic as frontend CharacterRenderer:
        1. Calculate character center from all assembly positions
        2. Calculate each part's position relative to character center using jointPivot
        3. Render parts in z-index order
        
        Args:
            frame: BGR video frame to render onto
            landmarks: MediaPipe pose landmarks (33 landmarks x [x, y, z, visibility])
            offset: Position offset (x, y) in pixels
            alpha: Overall alpha/opacity (0-1)
            target_height: Target character height in pixels (for scaling)
            
        Returns:
            Modified frame with puppet rendered
        """
        if not self.parts:
            return frame
        
        # Update pose from landmarks
        self.update_pose(landmarks)
        
        # Calculate character bounding box and center
        min_x, min_y, max_x, max_y = self.calculate_bounding_box()
        char_height = max_y - min_y
        char_center_x, char_center_y = self.calculate_character_center()
        
        # Calculate scale to fit target height
        if target_height is None:
            target_height = int(frame.shape[0] * 0.7)  # Default: 70% of frame height
        
        self.scale = target_height / char_height if char_height > 0 else 1.0
        
        # Frame center position (where character center will be placed)
        frame_h, frame_w = frame.shape[:2]
        render_center_x = frame_w // 2 + offset[0]
        render_center_y = frame_h // 2 + offset[1]
        
        # Sort parts by z-index for correct rendering order
        sorted_parts = sorted(self.parts.values(), key=lambda p: p.z_index)
        
        # Debug: log first render
        if not hasattr(self, '_logged_render'):
            self._logged_render = True
            logger.info(f"Rendering puppet: char_center=({char_center_x:.1f}, {char_center_y:.1f}), "
                       f"scale={self.scale:.3f}, render_center=({render_center_x}, {render_center_y})")
        
        # Render each part
        for part in sorted_parts:
            # Get part dimensions from assembly
            asm = part.assembly
            part_w = asm.get('width', part.frame['w'])
            part_h = asm.get('height', part.frame['h'])
            
            # Scale part image
            scaled_w = int(part_w * self.scale)
            scaled_h = int(part_h * self.scale)
            
            if scaled_w <= 0 or scaled_h <= 0:
                continue
            
            scaled_image = cv2.resize(part.image, (scaled_w, scaled_h), interpolation=cv2.INTER_LINEAR)
            
            # Get pivot point (normalized 0-1)
            pivot_x = part.joint_pivot.get('x', 0.5)
            pivot_y = part.joint_pivot.get('y', 0.5)
            
            # Calculate pivot point position in screen coordinates
            # Formula from frontend: pivotPos = (assembly + size*pivot - charCenter) * scale
            pivot_screen_x = (asm['x'] + part_w * pivot_x - char_center_x) * self.scale
            pivot_screen_y = (asm['y'] + part_h * pivot_y - char_center_y) * self.scale
            
            # Absolute pivot position on frame
            abs_pivot_x = render_center_x + pivot_screen_x
            abs_pivot_y = render_center_y + pivot_screen_y
            
            # Rotate if needed
            if abs(part.rotation) > 0.01:  # Skip tiny rotations
                pivot = (pivot_x, pivot_y)
                rotated_image, new_pivot_x, new_pivot_y, _, _ = self._rotate_image(
                    scaled_image, part.rotation, pivot
                )
                # Image top-left = pivot_position - pivot_in_rotated_image
                final_x = int(abs_pivot_x - new_pivot_x)
                final_y = int(abs_pivot_y - new_pivot_y)
            else:
                rotated_image = scaled_image
                # Image top-left = pivot_position - pivot_in_image
                final_x = int(abs_pivot_x - pivot_x * scaled_w)
                final_y = int(abs_pivot_y - pivot_y * scaled_h)
            
            # Overlay part onto frame
            frame = self._overlay_image(frame, rotated_image, final_x, final_y, alpha)
        
        return frame


class PuppetRendererCache:
    """Cache for PuppetRenderer instances to avoid reloading."""
    
    _instances: Dict[str, PuppetRenderer] = {}
    
    @classmethod
    def get_renderer(cls, character_id: str, data_dir: Path) -> Optional[PuppetRenderer]:
        """
        Get or create a PuppetRenderer for a character.
        
        Args:
            character_id: Character UUID
            data_dir: Path to data directory
            
        Returns:
            PuppetRenderer instance or None if loading failed
        """
        if character_id not in cls._instances:
            renderer = PuppetRenderer(character_id, data_dir)
            if renderer.load():
                cls._instances[character_id] = renderer
            else:
                return None
        
        return cls._instances[character_id]
    
    @classmethod
    def clear_cache(cls) -> None:
        """Clear all cached renderers."""
        cls._instances.clear()

