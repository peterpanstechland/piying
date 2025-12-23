const { contextBridge, ipcRenderer } = require('electron');

// 暴露安全的 API 给渲染进程
contextBridge.exposeInMainWorld('electronAPI', {
  // 打开前端体验
  openFrontend: () => ipcRenderer.invoke('open-frontend'),
  
  // 打开管理后台
  openAdmin: () => ipcRenderer.invoke('open-admin'),
  
  // 重启后端服务
  restartBackend: () => ipcRenderer.invoke('restart-backend'),
  
  // 返回启动器
  backToLauncher: () => ipcRenderer.invoke('back-to-launcher'),
  
  // 打开帮助文档
  openHelp: () => ipcRenderer.invoke('open-help'),
  
  // 退出应用
  exitApp: () => ipcRenderer.invoke('exit-app'),
  
  // 切换开发者工具
  toggleDevTools: () => ipcRenderer.invoke('toggle-devtools'),
  
  // 打开日志文件夹
  openLogsFolder: () => ipcRenderer.invoke('open-logs-folder'),
  
  // 获取应用版本
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  
  // ============== 更新相关 API ==============
  
  // 检查更新
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  
  // 获取最新版本信息 (从 GitHub Release)
  getReleaseInfo: () => ipcRenderer.invoke('get-release-info'),
  
  // 安装已下载的更新
  installUpdate: () => ipcRenderer.invoke('install-update'),
  
  // 获取当前更新状态
  getUpdateStatus: () => ipcRenderer.invoke('get-update-status'),
  
  // 获取网络状态
  getNetworkStatus: () => ipcRenderer.invoke('get-network-status'),
  
  // 获取 OTA 设置
  getOTASettings: () => ipcRenderer.invoke('get-ota-settings'),
  
  // 刷新 OTA 设置
  refreshOTASettings: () => ipcRenderer.invoke('refresh-ota-settings'),
  
  // 手动触发备份（用于测试）
  manualBackup: () => ipcRenderer.invoke('manual-backup'),
  
  // ============== 开机自启动 API ==============
  
  // 获取开机自启动状态
  getAutoLaunchStatus: () => ipcRenderer.invoke('get-auto-launch-status'),
  
  // 设置开机自启动
  setAutoLaunch: (enabled) => ipcRenderer.invoke('set-auto-launch', enabled),
  
  // ============== 监听事件 ==============
  
  // 基础事件
  onBackendStatus: (callback) => ipcRenderer.on('backend-status', callback),
  onMessage: (callback) => ipcRenderer.on('message', callback),
  onResetState: (callback) => ipcRenderer.on('reset-state', callback),
  
  // 更新相关事件
  onUpdateChecking: (callback) => ipcRenderer.on('update-checking', (event, data) => callback(data)),
  onUpdateAvailable: (callback) => ipcRenderer.on('update-available', (event, data) => callback(data)),
  onUpdateNotAvailable: (callback) => ipcRenderer.on('update-not-available', (event, data) => callback(data)),
  onUpdateDownloadProgress: (callback) => ipcRenderer.on('update-download-progress', (event, data) => callback(data)),
  onUpdateDownloaded: (callback) => ipcRenderer.on('update-downloaded', (event, data) => callback(data)),
  onUpdateError: (callback) => ipcRenderer.on('update-error', (event, data) => callback(data)),
  onUpdateCheckResult: (callback) => ipcRenderer.on('update-check-result', (event, data) => callback(data))
});

// 页面加载完成后的初始化
window.addEventListener('DOMContentLoaded', () => {
  console.log('Preload script loaded');
});
