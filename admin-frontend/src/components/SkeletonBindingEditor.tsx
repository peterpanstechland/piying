import { useState, useEffect } from 'react'
import './SkeletonBindingEditor.css'

interface CharacterPart {
  name: string
  file_path: string
  pivot_x: number
  pivot_y: number
  z_index: number
  connections: string[]
}

interface SkeletonBinding {
  part_name: string
  landmarks: number[]
  rotation_landmark: number | null
  scale_landmarks: number[]
}

interface Props {
  parts: CharacterPart[]
  bindings: SkeletonBinding[]
  onSave: (bindings: SkeletonBinding[]) => void
  saving: boolean
}

// MediaPipe Pose landmarks (33 points)
const POSE_LANDMARKS = [
  { id: 0, name: 'nose', label: '鼻子' },
  { id: 1, name: 'left_eye_inner', label: '左眼内' },
  { id: 2, name: 'left_eye', label: '左眼' },
  { id: 3, name: 'left_eye_outer', label: '左眼外' },
  { id: 4, name: 'right_eye_inner', label: '右眼内' },
  { id: 5, name: 'right_eye', label: '右眼' },
  { id: 6, name: 'right_eye_outer', label: '右眼外' },
  { id: 7, name: 'left_ear', label: '左耳' },
  { id: 8, name: 'right_ear', label: '右耳' },
  { id: 9, name: 'mouth_left', label: '嘴左' },
  { id: 10, name: 'mouth_right', label: '嘴右' },
  { id: 11, name: 'left_shoulder', label: '左肩' },
  { id: 12, name: 'right_shoulder', label: '右肩' },
  { id: 13, name: 'left_elbow', label: '左肘' },
  { id: 14, name: 'right_elbow', label: '右肘' },
  { id: 15, name: 'left_wrist', label: '左腕' },
  { id: 16, name: 'right_wrist', label: '右腕' },
  { id: 17, name: 'left_pinky', label: '左小指' },
  { id: 18, name: 'right_pinky', label: '右小指' },
  { id: 19, name: 'left_index', label: '左食指' },
  { id: 20, name: 'right_index', label: '右食指' },
  { id: 21, name: 'left_thumb', label: '左拇指' },
  { id: 22, name: 'right_thumb', label: '右拇指' },
  { id: 23, name: 'left_hip', label: '左髋' },
  { id: 24, name: 'right_hip', label: '右髋' },
  { id: 25, name: 'left_knee', label: '左膝' },
  { id: 26, name: 'right_knee', label: '右膝' },
  { id: 27, name: 'left_ankle', label: '左踝' },
  { id: 28, name: 'right_ankle', label: '右踝' },
  { id: 29, name: 'left_heel', label: '左脚跟' },
  { id: 30, name: 'right_heel', label: '右脚跟' },
  { id: 31, name: 'left_foot_index', label: '左脚趾' },
  { id: 32, name: 'right_foot_index', label: '右脚趾' }
]

// Suggested landmark mappings for each part
const SUGGESTED_MAPPINGS: Record<string, number[]> = {
  'head': [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
  'body': [11, 12, 23, 24],
  'left-arm': [11, 13],
  'right-arm': [12, 14],
  'left-hand': [15, 17, 19, 21],
  'right-hand': [16, 18, 20, 22],
  'left-foot': [27, 29, 31],
  'right-foot': [28, 30, 32],
  'upper-leg': [23, 24, 25, 26]
}

const PART_LABELS: Record<string, string> = {
  'head': '头部',
  'body': '身体',
  'left-arm': '左臂',
  'right-arm': '右臂',
  'left-hand': '左手',
  'right-hand': '右手',
  'left-foot': '左脚',
  'right-foot': '右脚',
  'upper-leg': '大腿'
}

// Movable parts that require landmark bindings
const MOVABLE_PARTS = ['head', 'left-arm', 'right-arm', 'left-hand', 'right-hand', 'left-foot', 'right-foot', 'upper-leg']


export default function SkeletonBindingEditor({ parts, bindings, onSave, saving }: Props) {
  const [editedBindings, setEditedBindings] = useState<SkeletonBinding[]>([])
  const [selectedPart, setSelectedPart] = useState<string | null>(null)
  const [warnings, setWarnings] = useState<string[]>([])

  // Initialize bindings from props or create defaults
  useEffect(() => {
    const initialBindings: SkeletonBinding[] = parts.map(part => {
      const existing = bindings.find(b => b.part_name === part.name)
      if (existing) {
        return { ...existing }
      }
      return {
        part_name: part.name,
        landmarks: [],
        rotation_landmark: null,
        scale_landmarks: []
      }
    })
    setEditedBindings(initialBindings)
  }, [parts, bindings])

  // Validate bindings and generate warnings
  useEffect(() => {
    const newWarnings: string[] = []
    
    for (const partName of MOVABLE_PARTS) {
      const binding = editedBindings.find(b => b.part_name === partName)
      if (!binding || binding.landmarks.length === 0) {
        const partExists = parts.some(p => p.name === partName)
        if (partExists) {
          newWarnings.push(`${PART_LABELS[partName] || partName} 缺少关键点绑定`)
        }
      }
    }
    
    setWarnings(newWarnings)
  }, [editedBindings, parts])

  const toggleLandmark = (partName: string, landmarkId: number) => {
    setEditedBindings(prev => prev.map(binding => {
      if (binding.part_name !== partName) return binding
      
      const hasLandmark = binding.landmarks.includes(landmarkId)
      const newLandmarks = hasLandmark
        ? binding.landmarks.filter(l => l !== landmarkId)
        : [...binding.landmarks, landmarkId].sort((a, b) => a - b)
      
      // Also remove from rotation/scale if removed from landmarks
      let newRotation = binding.rotation_landmark
      let newScale = binding.scale_landmarks
      
      if (hasLandmark) {
        if (binding.rotation_landmark === landmarkId) {
          newRotation = null
        }
        newScale = binding.scale_landmarks.filter(l => l !== landmarkId)
      }
      
      return {
        ...binding,
        landmarks: newLandmarks,
        rotation_landmark: newRotation,
        scale_landmarks: newScale
      }
    }))
  }

  const setRotationLandmark = (partName: string, landmarkId: number | null) => {
    setEditedBindings(prev => prev.map(binding =>
      binding.part_name === partName
        ? { ...binding, rotation_landmark: landmarkId }
        : binding
    ))
  }

  const toggleScaleLandmark = (partName: string, landmarkId: number) => {
    setEditedBindings(prev => prev.map(binding => {
      if (binding.part_name !== partName) return binding
      
      const hasLandmark = binding.scale_landmarks.includes(landmarkId)
      const newScale = hasLandmark
        ? binding.scale_landmarks.filter(l => l !== landmarkId)
        : [...binding.scale_landmarks, landmarkId].sort((a, b) => a - b)
      
      return { ...binding, scale_landmarks: newScale }
    }))
  }

  const applySuggestedMapping = (partName: string) => {
    const suggested = SUGGESTED_MAPPINGS[partName]
    if (!suggested) return
    
    setEditedBindings(prev => prev.map(binding =>
      binding.part_name === partName
        ? {
            ...binding,
            landmarks: [...suggested],
            rotation_landmark: suggested[0] || null,
            scale_landmarks: suggested.length >= 2 ? [suggested[0], suggested[suggested.length - 1]] : []
          }
        : binding
    ))
  }

  const clearBinding = (partName: string) => {
    setEditedBindings(prev => prev.map(binding =>
      binding.part_name === partName
        ? { ...binding, landmarks: [], rotation_landmark: null, scale_landmarks: [] }
        : binding
    ))
  }

  const handleSave = () => {
    onSave(editedBindings)
  }

  const selectedBinding = editedBindings.find(b => b.part_name === selectedPart)

  return (
    <div className="skeleton-binding-editor">
      {warnings.length > 0 && (
        <div className="binding-warnings">
          <strong>⚠️ 绑定警告:</strong>
          <ul>
            {warnings.map((warning, index) => (
              <li key={index}>{warning}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="editor-layout">
        <div className="parts-panel">
          <h3>人物部件</h3>
          <div className="parts-list">
            {parts.map(part => {
              const binding = editedBindings.find(b => b.part_name === part.name)
              const isMovable = MOVABLE_PARTS.includes(part.name)
              const hasBinding = binding && binding.landmarks.length > 0
              
              return (
                <div
                  key={part.name}
                  className={`part-item ${selectedPart === part.name ? 'selected' : ''} ${!hasBinding && isMovable ? 'warning' : ''}`}
                  onClick={() => setSelectedPart(part.name)}
                >
                  <span className="part-name">{PART_LABELS[part.name] || part.name}</span>
                  <span className="binding-count">
                    {binding?.landmarks.length || 0} 个关键点
                  </span>
                </div>
              )
            })}
          </div>
        </div>

        <div className="landmarks-panel">
          <div className="landmarks-header">
            <h3>MediaPipe 姿态关键点 (33点)</h3>
            {selectedPart && (
              <div className="landmark-actions">
                <button
                  className="btn-small"
                  onClick={() => applySuggestedMapping(selectedPart)}
                >
                  应用推荐
                </button>
                <button
                  className="btn-small btn-danger"
                  onClick={() => clearBinding(selectedPart)}
                >
                  清空
                </button>
              </div>
            )}
          </div>

          {!selectedPart ? (
            <div className="no-selection">
              请从左侧选择一个部件来配置关键点绑定
            </div>
          ) : (
            <>
              <div className="pose-diagram">
                <svg viewBox="0 0 200 300" className="pose-svg">
                  {/* Simple stick figure representation */}
                  {/* Head */}
                  <circle cx="100" cy="30" r="20" fill="none" stroke="#d1d5db" strokeWidth="2" />
                  {/* Body */}
                  <line x1="100" y1="50" x2="100" y2="150" stroke="#d1d5db" strokeWidth="2" />
                  {/* Arms */}
                  <line x1="100" y1="70" x2="50" y2="120" stroke="#d1d5db" strokeWidth="2" />
                  <line x1="100" y1="70" x2="150" y2="120" stroke="#d1d5db" strokeWidth="2" />
                  {/* Legs */}
                  <line x1="100" y1="150" x2="70" y2="250" stroke="#d1d5db" strokeWidth="2" />
                  <line x1="100" y1="150" x2="130" y2="250" stroke="#d1d5db" strokeWidth="2" />
                  
                  {/* Landmark points */}
                  {POSE_LANDMARKS.map(landmark => {
                    const pos = getLandmarkPosition(landmark.id)
                    const isSelected = selectedBinding?.landmarks.includes(landmark.id)
                    const isRotation = selectedBinding?.rotation_landmark === landmark.id
                    
                    return (
                      <circle
                        key={landmark.id}
                        cx={pos.x}
                        cy={pos.y}
                        r={isSelected ? 6 : 4}
                        fill={isRotation ? '#dc2626' : isSelected ? '#4f46e5' : '#9ca3af'}
                        stroke="white"
                        strokeWidth="1"
                        className="landmark-point"
                        onClick={() => toggleLandmark(selectedPart, landmark.id)}
                      />
                    )
                  })}
                </svg>
              </div>

              <div className="landmarks-grid">
                {POSE_LANDMARKS.map(landmark => {
                  const isSelected = selectedBinding?.landmarks.includes(landmark.id)
                  const isRotation = selectedBinding?.rotation_landmark === landmark.id
                  const isScale = selectedBinding?.scale_landmarks.includes(landmark.id)
                  
                  return (
                    <div
                      key={landmark.id}
                      className={`landmark-item ${isSelected ? 'selected' : ''}`}
                      onClick={() => toggleLandmark(selectedPart, landmark.id)}
                    >
                      <span className="landmark-id">{landmark.id}</span>
                      <span className="landmark-label">{landmark.label}</span>
                      {isSelected && (
                        <div className="landmark-options" onClick={e => e.stopPropagation()}>
                          <label title="旋转参考点">
                            <input
                              type="radio"
                              checked={isRotation}
                              onChange={() => setRotationLandmark(selectedPart, landmark.id)}
                            />
                            R
                          </label>
                          <label title="缩放参考点">
                            <input
                              type="checkbox"
                              checked={isScale}
                              onChange={() => toggleScaleLandmark(selectedPart, landmark.id)}
                            />
                            S
                          </label>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </div>
      </div>

      <div className="editor-footer">
        <div className="legend">
          <span className="legend-item"><span className="dot rotation"></span> 旋转参考点 (R)</span>
          <span className="legend-item"><span className="dot scale"></span> 缩放参考点 (S)</span>
        </div>
        <button
          className="btn-primary"
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? '保存中...' : '保存绑定配置'}
        </button>
      </div>
    </div>
  )
}

// Helper function to get approximate position for landmark visualization
function getLandmarkPosition(id: number): { x: number; y: number } {
  const positions: Record<number, { x: number; y: number }> = {
    0: { x: 100, y: 25 },   // nose
    1: { x: 95, y: 20 },    // left_eye_inner
    2: { x: 90, y: 20 },    // left_eye
    3: { x: 85, y: 20 },    // left_eye_outer
    4: { x: 105, y: 20 },   // right_eye_inner
    5: { x: 110, y: 20 },   // right_eye
    6: { x: 115, y: 20 },   // right_eye_outer
    7: { x: 80, y: 25 },    // left_ear
    8: { x: 120, y: 25 },   // right_ear
    9: { x: 95, y: 35 },    // mouth_left
    10: { x: 105, y: 35 },  // mouth_right
    11: { x: 75, y: 70 },   // left_shoulder
    12: { x: 125, y: 70 },  // right_shoulder
    13: { x: 55, y: 100 },  // left_elbow
    14: { x: 145, y: 100 }, // right_elbow
    15: { x: 45, y: 130 },  // left_wrist
    16: { x: 155, y: 130 }, // right_wrist
    17: { x: 40, y: 140 },  // left_pinky
    18: { x: 160, y: 140 }, // right_pinky
    19: { x: 45, y: 145 },  // left_index
    20: { x: 155, y: 145 }, // right_index
    21: { x: 50, y: 135 },  // left_thumb
    22: { x: 150, y: 135 }, // right_thumb
    23: { x: 85, y: 150 },  // left_hip
    24: { x: 115, y: 150 }, // right_hip
    25: { x: 75, y: 200 },  // left_knee
    26: { x: 125, y: 200 }, // right_knee
    27: { x: 70, y: 250 },  // left_ankle
    28: { x: 130, y: 250 }, // right_ankle
    29: { x: 65, y: 260 },  // left_heel
    30: { x: 135, y: 260 }, // right_heel
    31: { x: 60, y: 265 },  // left_foot_index
    32: { x: 140, y: 265 }  // right_foot_index
  }
  return positions[id] || { x: 100, y: 150 }
}
