import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';

/**
 * Timeout settings from backend
 */
export interface TimeoutSettings {
  idle_to_scene_select_seconds: number;
  scene_select_inactivity_seconds: number;
  motion_capture_inactivity_seconds: number;
  final_result_auto_reset_seconds: number;
  exit_gesture_duration_seconds: number;
  exit_confirmation_duration_seconds: number;
  segment_review_inactivity_seconds: number;
  calibration_timeout_seconds: number;  // 校准动作超时时间
  // 注意：inactivity_show_countdown_seconds 已移除
  // 倒计时显示时间现在自动计算为超时时间的一半
}

/**
 * Full system settings
 */
export interface SystemSettings {
  theme: string;
  language: string;
  timeouts: TimeoutSettings;
}

/**
 * Default timeout values (fallback if API fails)
 */
const DEFAULT_TIMEOUTS: TimeoutSettings = {
  idle_to_scene_select_seconds: 1,
  scene_select_inactivity_seconds: 10,
  motion_capture_inactivity_seconds: 15,
  final_result_auto_reset_seconds: 30,
  exit_gesture_duration_seconds: 3,
  exit_confirmation_duration_seconds: 2,
  segment_review_inactivity_seconds: 30,
  calibration_timeout_seconds: 60,
};

const DEFAULT_SETTINGS: SystemSettings = {
  theme: 'dark',
  language: 'zh',
  timeouts: DEFAULT_TIMEOUTS,
};

interface SystemSettingsContextType {
  settings: SystemSettings;
  timeouts: TimeoutSettings;
  isLoaded: boolean;
  refreshSettings: () => Promise<void>;
}

const SystemSettingsContext = createContext<SystemSettingsContextType | undefined>(undefined);

export const SystemSettingsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [settings, setSettings] = useState<SystemSettings>(DEFAULT_SETTINGS);
  const [isLoaded, setIsLoaded] = useState(false);

  const loadSettings = useCallback(async () => {
    try {
      const response = await fetch('/api/system/settings');
      if (response.ok) {
        const data = await response.json();
        console.log('[SystemSettings] Loaded from API:', data);
        setSettings({
          theme: data.theme || DEFAULT_SETTINGS.theme,
          language: data.language || DEFAULT_SETTINGS.language,
          timeouts: {
            idle_to_scene_select_seconds: data.timeouts?.idle_to_scene_select_seconds ?? DEFAULT_TIMEOUTS.idle_to_scene_select_seconds,
            scene_select_inactivity_seconds: data.timeouts?.scene_select_inactivity_seconds ?? DEFAULT_TIMEOUTS.scene_select_inactivity_seconds,
            motion_capture_inactivity_seconds: data.timeouts?.motion_capture_inactivity_seconds ?? DEFAULT_TIMEOUTS.motion_capture_inactivity_seconds,
            final_result_auto_reset_seconds: data.timeouts?.final_result_auto_reset_seconds ?? DEFAULT_TIMEOUTS.final_result_auto_reset_seconds,
            exit_gesture_duration_seconds: data.timeouts?.exit_gesture_duration_seconds ?? DEFAULT_TIMEOUTS.exit_gesture_duration_seconds,
            exit_confirmation_duration_seconds: data.timeouts?.exit_confirmation_duration_seconds ?? DEFAULT_TIMEOUTS.exit_confirmation_duration_seconds,
            segment_review_inactivity_seconds: data.timeouts?.segment_review_inactivity_seconds ?? DEFAULT_TIMEOUTS.segment_review_inactivity_seconds,
          },
        });
      } else {
        console.warn('[SystemSettings] API returned non-ok status:', response.status);
      }
    } catch (error) {
      console.error('[SystemSettings] Failed to load settings from API:', error);
    } finally {
      setIsLoaded(true);
    }
  }, []);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const contextValue: SystemSettingsContextType = {
    settings,
    timeouts: settings.timeouts,
    isLoaded,
    refreshSettings: loadSettings,
  };

  return (
    <SystemSettingsContext.Provider value={contextValue}>
      {children}
    </SystemSettingsContext.Provider>
  );
};

/**
 * Hook to access system settings
 */
export const useSystemSettings = (): SystemSettingsContextType => {
  const context = useContext(SystemSettingsContext);
  if (context === undefined) {
    throw new Error('useSystemSettings must be used within a SystemSettingsProvider');
  }
  return context;
};

/**
 * Hook to access only timeout settings (convenience)
 */
export const useTimeouts = (): TimeoutSettings => {
  const { timeouts } = useSystemSettings();
  return timeouts;
};

