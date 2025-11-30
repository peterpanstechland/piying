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
  
  // 获取应用版本
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  
  // 监听事件
  onBackendStatus: (callback) => ipcRenderer.on('backend-status', callback),
  onMessage: (callback) => ipcRenderer.on('message', callback)
});

// 页面加载完成后的初始化
window.addEventListener('DOMContentLoaded', () => {
  console.log('Preload script loaded');
});
