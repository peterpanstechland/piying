/**
 * MotionCaptureDebugPanel - 动捕系统调试面板
 * 
 * 用于实时调节和监控动捕管线参数
 */

import { useState, useCallback } from 'react'
import type { ProcessorConfig, ProcessedPose, LegIntent } from '../pose/types'
import { DEFAULT_CONFIG } from '../pose/types'
import './MotionCaptureDebugPanel.css'

interface DebugPanelProps {
  config: ProcessorConfig
  onConfigChange: (config: Partial<ProcessorConfig>) => void
  processedPose: ProcessedPose | null
  onCalibrate?: () => void
  onClearCalibration?: () => void
  onExportConfig?: () => void
  onImportConfig?: () => void
}

// 参数说明
const PARAM_DESCRIPTIONS: Record<string, Record<string, string>> = {
  filter: {
    smoothFactor: '低通滤波系数 (0.05-0.5)，越低越平滑但延迟越大',
    visibilityThreshold: '置信度阈值 (0-1)，低于此值的关节会被忽略',
    holdFrames: '丢失后保持帧数，防止闪烁',
    velocityThreshold: '速度阈值，超过时降低平滑（更灵敏）',
    minSmoothFactor: '快速移动时的最小平滑系数',
  },
  turn: {
    deadzone: '转身死区 (0-0.5)，防止边界处抖动',
    depthSource: '深度检测来源：shoulder=肩膀, head=头部',
    animationDuration: '转身动画时长（毫秒）',
  },
  scale: {
    smoothFactor: '缩放平滑系数，防止忽大忽小',
    minScale: '最小缩放',
    maxScale: '最大缩放',
  },
  leg: {
    kneeRiseThreshold: '膝盖上升阈值，触发高抬腿',
    thighRatioThreshold: '大腿缩短比率阈值',
    ankleRiseThreshold: '脚踝上升阈值，触发后踢腿',
    liftThreshold: '单脚抬起阈值，触发行走',
    jumpThreshold: '跳跃阈值，双脚同时抬起',
    squatThreshold: '下蹲阈值，退出飞行状态',
  },
  ik: {
    enabled: 'IK 解算开关',
    groundY: '地面高度 (0-1)，用于脚部吸附',
    epsilon: '安全边距，防止 NaN',
  },
  secondary: {
    enabled: '物理惯性开关',
    followFactor: '跟随系数 (0.01-0.2)，越低惯性越大',
    damping: '阻尼系数 (0.8-0.99)，控制摆动衰减',
  },
  calibration: {
    autoCalibrationFrames: '自动校准帧数',
    stabilityThreshold: '稳定性阈值',
  },
}

export default function MotionCaptureDebugPanel({
  config,
  onConfigChange,
  processedPose,
  onCalibrate,
  onClearCalibration,
  onExportConfig,
  onImportConfig,
}: DebugPanelProps) {
  const [activeSection, setActiveSection] = useState<string>('filter')
  const [showHelp, setShowHelp] = useState(false)

  // 渲染数值输入
  const renderNumberInput = useCallback((
    section: keyof ProcessorConfig,
    key: string,
    value: number,
    min: number,
    max: number,
    step: number
  ) => {
    const description = PARAM_DESCRIPTIONS[section]?.[key] || ''
    
    return (
      <div className="param-item" key={key} title={description}>
        <label>{key}</label>
        <div className="param-input">
          <input
            type="range"
            min={min}
            max={max}
            step={step}
            value={value}
            onChange={(e) => {
              const newValue = parseFloat(e.target.value)
              onConfigChange({
                [section]: { [key]: newValue }
              } as Partial<ProcessorConfig>)
            }}
          />
          <input
            type="number"
            min={min}
            max={max}
            step={step}
            value={value.toFixed(3)}
            onChange={(e) => {
              const newValue = parseFloat(e.target.value)
              if (!isNaN(newValue)) {
                onConfigChange({
                  [section]: { [key]: newValue }
                } as Partial<ProcessorConfig>)
              }
            }}
          />
        </div>
        {showHelp && <span className="param-help">{description}</span>}
      </div>
    )
  }, [onConfigChange, showHelp])

  // 渲染布尔开关
  const renderBoolInput = useCallback((
    section: keyof ProcessorConfig,
    key: string,
    value: boolean
  ) => {
    const description = PARAM_DESCRIPTIONS[section]?.[key] || ''
    
    return (
      <div className="param-item" key={key} title={description}>
        <label>{key}</label>
        <div className="param-input">
          <label className="toggle-switch">
            <input
              type="checkbox"
              checked={value}
              onChange={(e) => {
                onConfigChange({
                  [section]: { [key]: e.target.checked }
                } as Partial<ProcessorConfig>)
              }}
            />
            <span className="toggle-slider"></span>
          </label>
        </div>
        {showHelp && <span className="param-help">{description}</span>}
      </div>
    )
  }, [onConfigChange, showHelp])

  // 渲染选择器
  const renderSelectInput = useCallback((
    section: keyof ProcessorConfig,
    key: string,
    value: string,
    options: string[]
  ) => {
    const description = PARAM_DESCRIPTIONS[section]?.[key] || ''
    
    return (
      <div className="param-item" key={key} title={description}>
        <label>{key}</label>
        <div className="param-input">
          <select
            value={value}
            onChange={(e) => {
              onConfigChange({
                [section]: { [key]: e.target.value }
              } as Partial<ProcessorConfig>)
            }}
          >
            {options.map(opt => (
              <option key={opt} value={opt}>{opt}</option>
            ))}
          </select>
        </div>
        {showHelp && <span className="param-help">{description}</span>}
      </div>
    )
  }, [onConfigChange, showHelp])

  // 重置到默认值
  const handleResetSection = useCallback((section: keyof ProcessorConfig) => {
    onConfigChange({
      [section]: DEFAULT_CONFIG[section]
    } as Partial<ProcessorConfig>)
  }, [onConfigChange])

  // 渲染状态显示
  const renderStatus = () => {
    if (!processedPose) {
      return <div className="status-empty">等待姿态数据...</div>
    }

    const { turnState, scaleState, legState, ikState, calibration, processingTime, frameCount } = processedPose

    return (
      <div className="status-grid">
        {/* 基础状态 */}
        <div className="status-section">
          <h4>基础</h4>
          <div className="status-item">
            <span>帧数</span>
            <span>{frameCount}</span>
          </div>
          <div className="status-item">
            <span>处理耗时</span>
            <span>{processingTime.toFixed(2)} ms</span>
          </div>
          <div className="status-item">
            <span>校准状态</span>
            <span className={calibration ? 'status-ok' : 'status-warn'}>
              {calibration ? '已校准' : '未校准'}
            </span>
          </div>
        </div>

        {/* 转身状态 */}
        <div className="status-section">
          <h4>转身</h4>
          <div className="status-item">
            <span>朝向</span>
            <span className="status-facing">{turnState.currentFacing === 'left' ? '← 左' : '右 →'}</span>
          </div>
          <div className="status-item">
            <span>深度差</span>
            <span>{turnState.currentDepthDiff.toFixed(3)}</span>
          </div>
          <div className="status-item">
            <span>死区内</span>
            <span className={turnState.inDeadzone ? 'status-ok' : 'status-warn'}>
              {turnState.inDeadzone ? '是' : '否'}
            </span>
          </div>
          {/* 死区可视化 */}
          <div className="deadzone-viz">
            <div 
              className="deadzone-bar"
              style={{
                '--depth': `${Math.max(-1, Math.min(1, turnState.currentDepthDiff)) * 50 + 50}%`,
                '--deadzone-left': `${50 - config.turn.deadzone * 50}%`,
                '--deadzone-right': `${50 + config.turn.deadzone * 50}%`,
              } as React.CSSProperties}
            >
              <div className="deadzone-range"></div>
              <div className="deadzone-indicator"></div>
            </div>
          </div>
        </div>

        {/* 缩放状态 */}
        <div className="status-section">
          <h4>缩放</h4>
          <div className="status-item">
            <span>当前缩放</span>
            <span>{scaleState.currentScale.toFixed(3)}</span>
          </div>
          <div className="status-item">
            <span>躯干高度</span>
            <span>{scaleState.currentTorsoHeight.toFixed(3)}</span>
          </div>
        </div>

        {/* 腿部状态 */}
        <div className="status-section">
          <h4>腿部</h4>
          <div className="status-item">
            <span>整体意图</span>
            <span className={`leg-intent leg-intent-${legState.overallIntent.toLowerCase()}`}>
              {getLegIntentLabel(legState.overallIntent)}
            </span>
          </div>
          <div className="status-item">
            <span>飞行状态</span>
            <span className={legState.isFlying ? 'status-warn' : ''}>
              {legState.isFlying ? '🚀 飞行中' : '🧍 站立'}
            </span>
          </div>
          <div className="status-row">
            <div className="status-col">
              <span>左腿</span>
              <span className="small">{getLegIntentLabel(legState.left.intent)}</span>
              <span className="small">膝高: {legState.left.kneeHeightDelta.toFixed(3)}</span>
            </div>
            <div className="status-col">
              <span>右腿</span>
              <span className="small">{getLegIntentLabel(legState.right.intent)}</span>
              <span className="small">膝高: {legState.right.kneeHeightDelta.toFixed(3)}</span>
            </div>
          </div>
        </div>

        {/* IK 状态 */}
        <div className="status-section">
          <h4>IK</h4>
          <div className="status-row">
            <div className="status-col">
              <span>左腿</span>
              <span className="small">大腿: {(ikState.left.thighAngle * 180 / Math.PI).toFixed(1)}°</span>
              <span className="small">膝盖: {(ikState.left.kneeAngle * 180 / Math.PI).toFixed(1)}°</span>
            </div>
            <div className="status-col">
              <span>右腿</span>
              <span className="small">大腿: {(ikState.right.thighAngle * 180 / Math.PI).toFixed(1)}°</span>
              <span className="small">膝盖: {(ikState.right.kneeAngle * 180 / Math.PI).toFixed(1)}°</span>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="mocap-debug-panel">
      <div className="debug-header">
        <h3>🎛️ 动捕调试面板</h3>
        <div className="debug-actions">
          <button 
            className={`btn-help ${showHelp ? 'active' : ''}`}
            onClick={() => setShowHelp(!showHelp)}
            title="显示参数说明"
          >
            ?
          </button>
          {onExportConfig && (
            <button className="btn-export" onClick={onExportConfig} title="导出配置">
              📤
            </button>
          )}
          {onImportConfig && (
            <button className="btn-import" onClick={onImportConfig} title="导入配置">
              📥
            </button>
          )}
        </div>
      </div>

      {/* 校准控制 */}
      <div className="calibration-section">
        <div className="calibration-status">
          <span className={`status-dot ${processedPose?.isCalibrated ? 'active' : ''}`}></span>
          <span>{processedPose?.isCalibrated ? '已校准' : '未校准'}</span>
        </div>
        <div className="calibration-actions">
          {onCalibrate && (
            <button 
              className="btn-calibrate" 
              onClick={onCalibrate}
              disabled={processedPose?.isCalibrated}
            >
              📐 校准
            </button>
          )}
          {onClearCalibration && processedPose?.isCalibrated && (
            <button className="btn-clear" onClick={onClearCalibration}>
              🔄 重置
            </button>
          )}
        </div>
      </div>

      {/* 参数分类标签 */}
      <div className="section-tabs">
        {['filter', 'turn', 'scale', 'leg', 'ik', 'secondary', 'status'].map(section => (
          <button
            key={section}
            className={`tab-btn ${activeSection === section ? 'active' : ''}`}
            onClick={() => setActiveSection(section)}
          >
            {getSectionLabel(section)}
          </button>
        ))}
      </div>

      {/* 参数面板 */}
      <div className="params-content">
        {activeSection === 'filter' && (
          <div className="params-section">
            <div className="section-header">
              <h4>滤波参数</h4>
              <button className="btn-reset" onClick={() => handleResetSection('filter')}>
                重置
              </button>
            </div>
            {renderNumberInput('filter', 'smoothFactor', config.filter.smoothFactor, 0.05, 0.5, 0.01)}
            {renderNumberInput('filter', 'visibilityThreshold', config.filter.visibilityThreshold, 0, 1, 0.05)}
            {renderNumberInput('filter', 'holdFrames', config.filter.holdFrames, 0, 30, 1)}
            {renderNumberInput('filter', 'velocityThreshold', config.filter.velocityThreshold, 0.01, 0.2, 0.01)}
            {renderNumberInput('filter', 'minSmoothFactor', config.filter.minSmoothFactor, 0.1, 0.5, 0.01)}
          </div>
        )}

        {activeSection === 'turn' && (
          <div className="params-section">
            <div className="section-header">
              <h4>转身参数</h4>
              <button className="btn-reset" onClick={() => handleResetSection('turn')}>
                重置
              </button>
            </div>
            {renderNumberInput('turn', 'deadzone', config.turn.deadzone, 0.05, 0.5, 0.01)}
            {renderSelectInput('turn', 'depthSource', config.turn.depthSource, ['shoulder', 'head'])}
            {renderNumberInput('turn', 'animationDuration', config.turn.animationDuration, 100, 1000, 50)}
          </div>
        )}

        {activeSection === 'scale' && (
          <div className="params-section">
            <div className="section-header">
              <h4>缩放参数</h4>
              <button className="btn-reset" onClick={() => handleResetSection('scale')}>
                重置
              </button>
            </div>
            {renderNumberInput('scale', 'smoothFactor', config.scale.smoothFactor, 0.01, 0.3, 0.01)}
            {renderNumberInput('scale', 'minScale', config.scale.minScale, 0.1, 1, 0.1)}
            {renderNumberInput('scale', 'maxScale', config.scale.maxScale, 1, 3, 0.1)}
          </div>
        )}

        {activeSection === 'leg' && (
          <div className="params-section">
            <div className="section-header">
              <h4>腿部参数</h4>
              <button className="btn-reset" onClick={() => handleResetSection('leg')}>
                重置
              </button>
            </div>
            {renderNumberInput('leg', 'kneeRiseThreshold', config.leg.kneeRiseThreshold, 0.02, 0.2, 0.01)}
            {renderNumberInput('leg', 'thighRatioThreshold', config.leg.thighRatioThreshold, 0.4, 0.9, 0.05)}
            {renderNumberInput('leg', 'ankleRiseThreshold', config.leg.ankleRiseThreshold, 0.02, 0.2, 0.01)}
            {renderNumberInput('leg', 'liftThreshold', config.leg.liftThreshold, 0.01, 0.1, 0.01)}
            {renderNumberInput('leg', 'jumpThreshold', config.leg.jumpThreshold, 0.02, 0.2, 0.01)}
            {renderNumberInput('leg', 'squatThreshold', config.leg.squatThreshold, -0.15, 0, 0.01)}
          </div>
        )}

        {activeSection === 'ik' && (
          <div className="params-section">
            <div className="section-header">
              <h4>IK 参数</h4>
              <button className="btn-reset" onClick={() => handleResetSection('ik')}>
                重置
              </button>
            </div>
            {renderBoolInput('ik', 'enabled', config.ik.enabled)}
            {renderNumberInput('ik', 'groundY', config.ik.groundY, 0.5, 1, 0.01)}
            {renderNumberInput('ik', 'epsilon', config.ik.epsilon, 0.001, 0.1, 0.001)}
          </div>
        )}

        {activeSection === 'secondary' && (
          <div className="params-section">
            <div className="section-header">
              <h4>物理惯性</h4>
              <button className="btn-reset" onClick={() => handleResetSection('secondary')}>
                重置
              </button>
            </div>
            {renderBoolInput('secondary', 'enabled', config.secondary.enabled)}
            {renderNumberInput('secondary', 'followFactor', config.secondary.followFactor, 0.01, 0.2, 0.01)}
            {renderNumberInput('secondary', 'damping', config.secondary.damping, 0.8, 0.99, 0.01)}
          </div>
        )}

        {activeSection === 'status' && (
          <div className="params-section">
            <div className="section-header">
              <h4>实时状态</h4>
            </div>
            {renderStatus()}
          </div>
        )}
      </div>
    </div>
  )
}

// 辅助函数
function getSectionLabel(section: string): string {
  const labels: Record<string, string> = {
    filter: '滤波',
    turn: '转身',
    scale: '缩放',
    leg: '腿部',
    ik: 'IK',
    secondary: '惯性',
    status: '状态',
  }
  return labels[section] || section
}

function getLegIntentLabel(intent: LegIntent | string): string {
  const labels: Record<string, string> = {
    STANDING: '站立',
    WALKING: '行走',
    HIGH_KICK: '高抬腿',
    BACK_KICK: '后踢腿',
    JUMPING: '跳跃',
  }
  return labels[intent] || intent
}

