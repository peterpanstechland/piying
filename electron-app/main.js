const { app, BrowserWindow, Tray, Menu, ipcMain, shell, dialog, nativeImage } = require('electron');
const path = require('path');
const { spawn, exec } = require('child_process');
const fs = require('fs');
const http = require('http');
const net = require('net');
const { autoUpdater } = require('electron-updater');
const logger = require('electron-log');
const treeKill = require('tree-kill');

// 使 log 既可以作为函数调用，又拥有 electron-log 的所有方法
const log = Object.assign((message) => logger.info(message), logger);

// 配置日志
log.transports.file.level = 'info';
autoUpdater.logger = log;

let launcherWindow = null;
let mainWindow = null;
let tray = null;
let backendProcess = null;
let splashWindow = null;

// 获取资源路径
const isDev = !app.isPackaged;
const appPath = isDev ? path.join(__dirname, '..') : path.dirname(app.getPath('exe'));
const resourcesPath = isDev ? __dirname : process.resourcesPath;

// 日志函数
// function log(message) {
//   const timestamp = new Date().toISOString();
//   console.log(`[${timestamp}] ${message}`);
// }

// 启动画面
function createSplashScreen() {
  splashWindow = new BrowserWindow({
    width: 400,
    height: 300,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  splashWindow.loadFile(path.join(__dirname, 'splash.html'));
  splashWindow.center();
}

// 检查更新
function checkForUpdates() {
  if (isDev) {
    log.info('Skipping update check in development mode');
    return;
  }

  log.info('Checking for updates...');
  autoUpdater.checkForUpdatesAndNotify();
}

// 备份用户数据（更新前自动调用）
async function backupUserData() {
  const appDataPath = app.getPath('appData');
  const dataPath = path.join(appDataPath, 'RobomonPiying');
  const backupBasePath = path.join(appDataPath, 'RobomonPiying_Backups');
  
  // 检查数据目录是否存在
  if (!fs.existsSync(dataPath)) {
    log.info('No user data directory found, skipping backup');
    return;
  }
  
  // 创建带时间戳的备份目录名
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').split('Z')[0];
  const backupPath = path.join(backupBasePath, `backup_${timestamp}`);
  
  log.info(`Backing up user data from ${dataPath} to ${backupPath}`);
  
  // 确保备份基础目录存在
  if (!fs.existsSync(backupBasePath)) {
    fs.mkdirSync(backupBasePath, { recursive: true });
  }
  
  // 递归复制目录
  await copyDirectoryRecursive(dataPath, backupPath);
  
  // 清理旧备份，只保留最近5个
  await cleanupOldBackups(backupBasePath, 5);
  
  log.info(`User data backed up successfully to ${backupPath}`);
}

// 递归复制目录
async function copyDirectoryRecursive(src, dest) {
  // 创建目标目录
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }
  
  const entries = fs.readdirSync(src, { withFileTypes: true });
  
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    
    if (entry.isDirectory()) {
      // 递归复制子目录
      await copyDirectoryRecursive(srcPath, destPath);
    } else {
      // 复制文件
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

// 清理旧备份，只保留最近的 N 个
async function cleanupOldBackups(backupBasePath, keepCount) {
  try {
    if (!fs.existsSync(backupBasePath)) {
      return;
    }
    
    const entries = fs.readdirSync(backupBasePath, { withFileTypes: true });
    const backupDirs = entries
      .filter(entry => entry.isDirectory() && entry.name.startsWith('backup_'))
      .map(entry => ({
        name: entry.name,
        path: path.join(backupBasePath, entry.name),
        // 从目录名解析时间戳进行排序
        timestamp: entry.name.replace('backup_', '')
      }))
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp)); // 按时间戳降序排列
    
    // 删除超出保留数量的旧备份
    if (backupDirs.length > keepCount) {
      const toDelete = backupDirs.slice(keepCount);
      for (const dir of toDelete) {
        log.info(`Removing old backup: ${dir.name}`);
        fs.rmSync(dir.path, { recursive: true, force: true });
      }
      log.info(`Cleaned up ${toDelete.length} old backup(s)`);
    }
  } catch (error) {
    log.warn(`Failed to cleanup old backups: ${error.message}`);
    // 清理失败不影响主流程
  }
}

autoUpdater.on('checking-for-update', () => {
  log.info('Checking for update...');
});

// 广播更新事件到所有活跃窗口
function broadcastUpdateEvent(channel, data) {
  if (splashWindow && !splashWindow.isDestroyed()) {
    splashWindow.webContents.send(channel, data);
  }
  if (launcherWindow && !launcherWindow.isDestroyed()) {
    launcherWindow.webContents.send(channel, data);
  }
}

autoUpdater.on('update-available', (info) => {
  log.info('Update available: ' + info.version);
  updateStatus.updateAvailable = true;
  updateStatus.latestUpdateInfo = info;
  if (splashWindow) {
    splashWindow.webContents.send('update-message', '发现新版本，正在下载...');
  }
  // 广播到 launcher
  broadcastUpdateEvent('update-available', { version: info.version, info });
});

autoUpdater.on('update-not-available', (info) => {
  log.info('Update not available.');
  updateStatus.updateAvailable = false;
  // 广播到 launcher
  broadcastUpdateEvent('update-not-available', { info });
});

autoUpdater.on('error', (err) => {
  log.error('Error in auto-updater: ' + err);
  updateStatus.error = err.message;
  if (splashWindow) {
    splashWindow.webContents.send('update-message', '更新检查失败，继续启动...');
  }
  // 广播到 launcher
  broadcastUpdateEvent('update-error', { error: err.message });
});

autoUpdater.on('download-progress', (progressObj) => {
  let log_message = "Download speed: " + progressObj.bytesPerSecond;
  log_message = log_message + ' - Downloaded ' + progressObj.percent + '%';
  log_message = log_message + ' (' + progressObj.transferred + "/" + progressObj.total + ')';
  log.info(log_message);
  if (splashWindow) {
    splashWindow.webContents.send('update-message', `正在下载更新... ${Math.round(progressObj.percent)}%`);
  }
  // 广播到 launcher
  broadcastUpdateEvent('update-download-progress', { 
    percent: progressObj.percent,
    bytesPerSecond: progressObj.bytesPerSecond,
    transferred: progressObj.transferred,
    total: progressObj.total
  });
});

autoUpdater.on('update-downloaded', async (info) => {
  log.info('Update downloaded, backing up user data before update...');
  updateStatus.updateDownloaded = true;
  updateStatus.latestUpdateInfo = info;
  
  // 在安装更新前备份用户数据
  try {
    await backupUserData();
    log.info('User data backup completed before update');
  } catch (backupError) {
    log.error('Failed to backup user data before update: ' + backupError.message);
    // 备份失败不阻止更新，但记录错误
  }
  
  if (splashWindow) {
    splashWindow.webContents.send('update-message', '更新下载完成，点击安装按钮开始安装');
  }
  // 广播到 launcher
  broadcastUpdateEvent('update-downloaded', { version: info.version, info });
});

// 检查端口是否被占用
function checkPortInUse(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.listen(port, () => {
      server.once('close', () => resolve(false));
      server.close();
    });
    server.on('error', () => resolve(true));
  });
}

// 尝试关闭占用端口的进程（Windows）
async function killProcessOnPort(port) {
  return new Promise((resolve) => {
    if (process.platform !== 'win32') {
      resolve(false);
      return;
    }
    
    // 使用 netstat 和 taskkill 来关闭占用端口的进程
    exec(`netstat -ano | findstr :${port}`, (error, stdout) => {
      if (error || !stdout) {
        resolve(false);
        return;
      }
      
      // 提取 PID
      const lines = stdout.split('\n').filter(line => line.trim());
      const pids = new Set();
      lines.forEach(line => {
        const parts = line.trim().split(/\s+/);
        if (parts.length > 0) {
          const pid = parts[parts.length - 1];
          if (pid && !isNaN(pid)) {
            pids.add(pid);
          }
        }
      });
      
      if (pids.size === 0) {
        resolve(false);
        return;
      }
      
      // 尝试关闭这些进程
      let killed = false;
      pids.forEach(pid => {
        exec(`taskkill /F /PID ${pid}`, (killError) => {
          if (!killError) {
            killed = true;
            log(`Killed process ${pid} using port ${port}`);
          }
        });
      });
      
      // 等待一下让进程关闭
      setTimeout(() => resolve(killed), 1000);
    });
  });
}

// 检查后端是否已运行
function checkBackendRunning() {
  return new Promise((resolve) => {
    const req = http.request({
      hostname: 'localhost',
      port: 8000,
      path: '/api/health',
      method: 'GET',
      timeout: 2000
    }, (res) => {
      resolve(res.statusCode === 200);
    });
    
    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
    
    req.end();
  });
}

// 启动 Python 后端
async function startBackend() {
  log('Checking if backend is already running...');
  
  // 先检查是否已经在运行
  const isRunning = await checkBackendRunning();
  if (isRunning) {
    log('Backend is already running');
    return true;
  }
  
  // 检查端口 8000 是否被占用
  const portInUse = await checkPortInUse(8000);
  if (portInUse) {
    log('Port 8000 is in use, attempting to free it...');
    const killed = await killProcessOnPort(8000);
    if (killed) {
      log('Freed port 8000, waiting a moment...');
      await new Promise(resolve => setTimeout(resolve, 2000));
    } else {
      log('Could not free port 8000, backend will try another port automatically');
    }
  }
  
  log('Starting Python backend...');
  
  return new Promise((resolve, reject) => {
    // 尝试多种路径
    const possiblePaths = [
      // 开发环境
      { python: path.join(appPath, 'venv', 'Scripts', 'python.exe'), cwd: appPath },
      // 打包后 - PyInstaller Backend Exe (优先)
      { exe: path.join(resourcesPath, 'backend', 'backend.exe'), cwd: path.join(resourcesPath, 'backend') },
      // 打包后 - 嵌入式 Python
      { python: path.join(resourcesPath, 'python', 'python.exe'), cwd: resourcesPath },
      // 打包后 - venv
      { python: path.join(resourcesPath, 'venv', 'Scripts', 'python.exe'), cwd: resourcesPath },
    ];
    
    let pythonPath = null;
    let exePath = null;
    let workingDir = null;
    
    for (const p of possiblePaths) {
      if (p.exe && fs.existsSync(p.exe)) {
        exePath = p.exe;
        workingDir = p.cwd;
        log(`Found Backend Executable at: ${exePath}`);
        break;
      }
      if (p.python && fs.existsSync(p.python)) {
        pythonPath = p.python;
        workingDir = p.cwd;
        log(`Found Python at: ${pythonPath}`);
        break;
      }
    }
    
    if (!pythonPath && !exePath) {
      // 尝试系统 Python
      pythonPath = 'python';
      workingDir = appPath;
      log('Using system Python');
    }

    // 设置环境变量
    const env = {
      ...process.env,
      PYTHONPATH: workingDir,
      PYTHONUNBUFFERED: '1'
    };

    // 启动后端
    if (exePath) {
        // 启动编译后的 EXE
        backendProcess = spawn(exePath, [], {
            cwd: workingDir,
            env: env,
            windowsHide: true
        });
    } else {
        // 启动 Python 脚本
    backendProcess = spawn(pythonPath, [
      '-m', 'uvicorn',
      'backend.app.main:app',
      '--host', '0.0.0.0',
      '--port', '8000'
    ], {
      cwd: workingDir,
      env: env,
      windowsHide: true
    });
    }

    let startupComplete = false;

    backendProcess.stdout.on('data', (data) => {
      const output = data.toString();
      log(`Backend: ${output}`);
      if (output.includes('Application startup complete') || output.includes('Uvicorn running')) {
        startupComplete = true;
        resolve(true);
      }
    });

    backendProcess.stderr.on('data', (data) => {
      const output = data.toString();
      log(`Backend: ${output}`);
      // uvicorn 的正常输出也会到 stderr
      if (output.includes('Application startup complete') || output.includes('Uvicorn running')) {
        startupComplete = true;
        resolve(true);
      }
      // Check for port binding errors
      if (output.includes('error while attempting to bind') || output.includes('Address already in use')) {
        log(`Port binding error detected: ${output}`);
        // Backend will automatically try another port, so we wait
      }
      // Check if backend is using a different port
      const portMatch = output.match(/using port (\d+)/i);
      if (portMatch) {
        const actualPort = portMatch[1];
        log(`Backend is using port ${actualPort} instead of 8000`);
      }
    });

    backendProcess.on('error', (error) => {
      log(`Failed to start backend: ${error.message}`);
      reject(error);
    });

    backendProcess.on('close', (code) => {
      log(`Backend process exited with code ${code}`);
      if (!startupComplete) {
        // If backend exited with code 1, it might be a port binding issue
        // The backend should now automatically try another port, so we give it more time
        if (code === 1) {
          log('Backend exited with code 1, might be port binding issue. Backend should retry automatically.');
        }
        reject(new Error(`Backend exited with code ${code}`));
      }
    });

    // 超时检查
    setTimeout(async () => {
      if (!startupComplete) {
        const running = await checkBackendRunning();
        if (running) {
          startupComplete = true;
          resolve(true);
        } else {
          reject(new Error('Backend startup timeout'));
        }
      }
    }, 15000);
  });
}

// 创建启动器窗口
function createLauncherWindow() {
  launcherWindow = new BrowserWindow({
    width: 900,
    height: 700,
    minWidth: 800,
    minHeight: 600,
    frame: true,
    resizable: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    },
    icon: path.join(__dirname, 'build', 'icon.ico'),
    title: '皮影互动系统',
    show: false
  });

  launcherWindow.loadFile(path.join(__dirname, 'launcher.html'));
  
  // 隐藏菜单栏
  launcherWindow.setMenuBarVisibility(false);

  launcherWindow.once('ready-to-show', () => {
    if (splashWindow) {
      splashWindow.close();
      splashWindow = null;
    }
    launcherWindow.show();
    launcherWindow.focus();
  });

  launcherWindow.on('closed', () => {
    launcherWindow = null;
  });
}

// 创建主窗口（全屏体验）
function createMainWindow(url) {
  mainWindow = new BrowserWindow({
    width: 1920,
    height: 1080,
    fullscreen: true,
    frame: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    },
    icon: path.join(__dirname, 'build', 'icon.ico'),
    show: false
  });

  mainWindow.loadURL(url);

  mainWindow.once('ready-to-show', () => {
    if (splashWindow) {
      splashWindow.close();
      splashWindow = null;
    }
    mainWindow.show();
    mainWindow.focus();
  });

  // ESC 键返回启动器
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.key === 'Escape' && input.type === 'keyDown') {
      backToLauncher();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// 返回启动器
function backToLauncher() {
  if (mainWindow) {
    mainWindow.close();
    mainWindow = null;
  }
  if (!launcherWindow) {
    createLauncherWindow();
  } else {
    launcherWindow.show();
    launcherWindow.focus();
    // 通知启动器重置界面状态（如隐藏 Loading）
    launcherWindow.webContents.send('reset-state');
  }
}

// 创建系统托盘
function createTray() {
  const iconPath = path.join(__dirname, 'build', 'icon.ico');
  
  // 使用 nativeImage 加载图标，这样更安全且支持 ASAR
  const icon = nativeImage.createFromPath(iconPath);

  // 如果图标加载失败（空的），尝试使用 PNG
  if (icon.isEmpty()) {
    log(`Tray icon failed to load from: ${iconPath}`);
    const pngPath = path.join(__dirname, 'build', 'icon.png');
    if (fs.existsSync(pngPath)) {
        log(`Trying PNG icon: ${pngPath}`);
        const pngIcon = nativeImage.createFromPath(pngPath);
        if (!pngIcon.isEmpty()) {
            tray = new Tray(pngIcon);
        } else {
            log('PNG icon also failed to load');
            return;
        }
    } else {
        log('Tray icon not found, skipping tray creation');
        return;
    }
  } else {
    tray = new Tray(icon);
  }

  const contextMenu = Menu.buildFromTemplate([
    {
      label: '打开启动器',
      click: () => {
        if (launcherWindow) {
          launcherWindow.show();
          launcherWindow.focus();
        } else {
          createLauncherWindow();
        }
      }
    },
    {
      label: '开始体验',
      click: () => {
        if (mainWindow) {
          mainWindow.close();
        }
        createMainWindow('http://localhost:8000');
      }
    },
    {
      label: '管理后台',
      click: () => {
        if (mainWindow) {
          mainWindow.close();
        }
        createMainWindow('http://localhost:8000/admin');
      }
    },
    { type: 'separator' },
    {
      label: '重启服务',
      click: async () => {
        await restartBackend();
      }
    },
    { type: 'separator' },
    {
      label: '退出',
      click: () => {
        app.quit();
      }
    }
  ]);

  tray.setToolTip('皮影互动系统');
  tray.setContextMenu(contextMenu);

  tray.on('double-click', () => {
    if (launcherWindow) {
      launcherWindow.show();
      launcherWindow.focus();
    } else {
      createLauncherWindow();
    }
  });
}

// 强制关闭后端
function killBackend() {
  return new Promise((resolve) => {
    if (!backendProcess) {
      resolve();
      return;
    }
    if (!backendProcess.pid) {
        backendProcess = null;
        resolve();
        return;
    }
    log.info(`Killing backend process tree (PID: ${backendProcess.pid})...`);
    treeKill(backendProcess.pid, 'SIGKILL', (err) => {
      if (err) {
        log.error(`Failed to kill backend: ${err.message}`);
        // Windows 备用方案
        if (process.platform === 'win32') {
             exec(`taskkill /pid ${backendProcess.pid} /T /F`, () => {
                 backendProcess = null;
                 resolve();
             });
        } else {
             backendProcess = null;
             resolve();
        }
      } else {
        log.info('Backend process killed successfully');
        backendProcess = null;
        resolve();
      }
    });
  });
}

// 重启后端
async function restartBackend() {
  log('Restarting backend...');
  
  if (backendProcess) {
    backendProcess.kill();
    backendProcess = null;
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  
  try {
    await startBackend();
    log('Backend restarted successfully');
    return { success: true };
  } catch (error) {
    log(`Failed to restart backend: ${error.message}`);
    return { success: false, error: error.message };
  }
}

// 应用启动
app.whenReady().then(async () => {
  try {
    log('Application starting...');
    
    // 显示启动画面
    createSplashScreen();

    // 检查更新
    checkForUpdates();

    // 启动后端
    try {
      await startBackend();
      log('Backend started successfully');
    } catch (error) {
      log(`Backend startup warning: ${error.message}`);
      // 继续启动，可能后端已经在运行
    }

    // 等待后端完全启动
    await new Promise(resolve => setTimeout(resolve, 2000));

    // 默认直接进入体验界面 (Kiosk模式)
    log('Auto-launching Main Window (Interactive Interface)...');
    createMainWindow('http://localhost:8000');

    // 创建启动器窗口 (作为后台/隐藏窗口，或者只在需要时创建)
    // createLauncherWindow(); 

    // 创建系统托盘
    createTray();

    log('Application started successfully');

  } catch (error) {
    log(`Failed to start application: ${error.message}`);
    
    dialog.showErrorBox(
      '启动错误',
      `应用启动失败:\n\n${error.message}\n\n请检查日志获取更多信息。`
    );
    
    app.quit();
  }
});

// 所有窗口关闭时
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// 应用激活时
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createLauncherWindow();
  }
});

let isQuitting = false;

// 应用退出前
app.on('before-quit', async (e) => {
  if (isQuitting) return;
  
  // 阻止默认退出，先执行清理
  e.preventDefault();
  log.info('Application quitting... Cleaning up backend.');
  
  try {
    if (backendProcess) {
        // 设置超时，防止无限等待
        const killPromise = killBackend();
        const timeoutPromise = new Promise(resolve => setTimeout(resolve, 3000));
        await Promise.race([killPromise, timeoutPromise]);
    }
  } catch (err) {
      log.error(`Error during cleanup: ${err.message}`);
  }
  
  isQuitting = true;
  app.quit();
});

// 处理未捕获的异常
process.on('uncaughtException', (error) => {
  log(`Uncaught Exception: ${error.message}`);
});

// IPC 通信
ipcMain.handle('open-frontend', async () => {
  log('Opening frontend...');
  if (launcherWindow) {
    launcherWindow.hide();
  }
  createMainWindow('http://localhost:8000');
});

ipcMain.handle('open-admin', async () => {
  log('Opening admin panel...');
  if (launcherWindow) {
    launcherWindow.hide();
  }
  createMainWindow('http://localhost:8000/admin');
});

ipcMain.handle('restart-backend', async () => {
  return await restartBackend();
});

ipcMain.handle('back-to-launcher', async () => {
  backToLauncher();
});

ipcMain.handle('open-help', async () => {
  const helpPath = path.join(appPath, 'README.txt');
  if (fs.existsSync(helpPath)) {
    shell.openPath(helpPath);
  } else {
    shell.openExternal('https://github.com/peterpanstechland/piying');
  }
});

ipcMain.handle('exit-app', async () => {
  app.quit();
});

ipcMain.handle('toggle-devtools', async () => {
  // 切换启动器窗口的 DevTools
  if (launcherWindow && !launcherWindow.isDestroyed()) {
    if (launcherWindow.webContents.isDevToolsOpened()) {
      launcherWindow.webContents.closeDevTools();
    } else {
      launcherWindow.webContents.openDevTools();
    }
  }
  
  // 如果主窗口存在，也切换主窗口的 DevTools
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.webContents.isDevToolsOpened()) {
      mainWindow.webContents.closeDevTools();
    } else {
      mainWindow.webContents.openDevTools();
    }
  }
});

ipcMain.handle('open-logs-folder', async () => {
  try {
    // Electron 日志文件夹 (electron-log)
    const electronLogPath = logger.transports.file.getFile().path;
    const electronLogDir = path.dirname(electronLogPath);
    
    // Python 后端日志文件夹
    // Windows: %APPDATA%\RobomonPiying\data\logs
    const appDataPath = app.getPath('appData');
    const backendLogDir = path.join(appDataPath, 'RobomonPiying', 'data', 'logs');
    
    // 打开两个文件夹（如果存在）
    if (fs.existsSync(electronLogDir)) {
      shell.openPath(electronLogDir);
    }
    
    // 等待一下再打开第二个文件夹，避免冲突
    setTimeout(() => {
      if (fs.existsSync(backendLogDir)) {
        shell.openPath(backendLogDir);
      } else {
        // 如果后端日志文件夹不存在，创建它并打开
        fs.mkdirSync(backendLogDir, { recursive: true });
        shell.openPath(backendLogDir);
      }
    }, 500);
    
    log(`Opened logs folders: ${electronLogDir} and ${backendLogDir}`);
  } catch (error) {
    log.error(`Failed to open logs folder: ${error.message}`);
    dialog.showErrorBox('错误', `无法打开日志文件夹:\n\n${error.message}`);
  }
});

ipcMain.handle('get-app-version', async () => {
  return app.getVersion();
});

ipcMain.handle('check-for-updates', async () => {
  log.info('Manual update check triggered from UI');
  if (isDev) {
    return { status: 'dev', message: 'Development mode' };
  }
  
  try {
    const result = await autoUpdater.checkForUpdates();
    return {
      status: 'checked',
      updateInfo: result ? result.updateInfo : null
    };
  } catch (error) {
    log.error('Manual update check failed: ' + error);
    throw new Error(error.message);
  }
});

// 获取网络状态（包含 OTA 设置）
ipcMain.handle('get-network-status', async () => {
  // 先从后端获取 OTA 设置
  let otaEnabled = true;
  let sourceType = 'github';
  
  try {
    const http = require('http');
    const otaSettings = await new Promise((resolve) => {
      const req = http.get('http://localhost:8000/api/settings/ota', { timeout: 3000 }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            resolve(null);
          }
        });
      });
      req.on('error', () => resolve(null));
      req.on('timeout', () => {
        req.destroy();
        resolve(null);
      });
    });
    
    if (otaSettings) {
      otaEnabled = otaSettings.enabled !== false;
      sourceType = otaSettings.source_type || 'github';
    }
  } catch (e) {
    log.warn('Failed to get OTA settings for network status:', e.message);
  }
  
  // 如果 OTA 禁用，直接返回
  if (!otaEnabled) {
    return { available: false, otaEnabled: false, sourceType };
  }
  
  // 检查网络连接（使用 GitHub API）
  try {
    const https = require('https');
    return new Promise((resolve) => {
      const options = {
        hostname: 'api.github.com',
        path: '/repos/peterpanstechland/piying/releases/latest',
        headers: {
          'User-Agent': 'Piying-Electron-App'
        },
        timeout: 5000
      };
      
      const req = https.get(options, (res) => {
        // 200-299 都算成功，403 是 rate limited 但网络是通的
        const isAvailable = res.statusCode >= 200 && res.statusCode < 400;
        resolve({ 
          available: isAvailable, 
          otaEnabled: true, 
          sourceType,
          statusCode: res.statusCode 
        });
      });
      req.on('error', (err) => {
        log.warn('Network check error:', err.message);
        resolve({ available: false, otaEnabled: true, sourceType, error: 'Network error' });
      });
      req.on('timeout', () => {
        req.destroy();
        resolve({ available: false, otaEnabled: true, sourceType, error: 'Timeout' });
      });
    });
  } catch (error) {
    return { available: false, otaEnabled: true, sourceType, error: error.message };
  }
});

// 获取更新状态
let updateStatus = { 
  status: 'idle', 
  info: null,
  updateAvailable: false,
  updateDownloaded: false,
  latestUpdateInfo: null,
  error: null
};

ipcMain.handle('get-update-status', async () => {
  return updateStatus;
});

// 获取 OTA 设置
ipcMain.handle('get-ota-settings', async () => {
  // 尝试从后端 API 获取 OTA 设置 (公开端点，不需要认证)
  let otaEnabled = true; // 默认启用
  let checkOnStartup = true;
  
  try {
    const http = require('http');
    const otaSettings = await new Promise((resolve, reject) => {
      const req = http.get('http://localhost:8000/api/settings/ota', { timeout: 3000 }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            resolve(null);
          }
        });
      });
      req.on('error', () => resolve(null));
      req.on('timeout', () => {
        req.destroy();
        resolve(null);
      });
    });
    
    if (otaSettings) {
      otaEnabled = otaSettings.enabled !== false;
      checkOnStartup = otaSettings.check_on_startup !== false;
    }
  } catch (e) {
    log.warn('Failed to get OTA settings from backend:', e.message);
  }
  
  return {
    enabled: otaEnabled,
    checkOnStartup: checkOnStartup,
    autoDownload: autoUpdater.autoDownload,
    autoInstallOnAppQuit: autoUpdater.autoInstallOnAppQuit,
    allowPrerelease: autoUpdater.allowPrerelease,
    currentVersion: app.getVersion()
  };
});

// 刷新 OTA 设置
ipcMain.handle('refresh-ota-settings', async () => {
  // 尝试从后端 API 获取 OTA 设置 (公开端点，不需要认证)
  let otaEnabled = true;
  let checkOnStartup = true;
  
  try {
    const http = require('http');
    const otaSettings = await new Promise((resolve, reject) => {
      const req = http.get('http://localhost:8000/api/settings/ota', { timeout: 3000 }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            resolve(null);
          }
        });
      });
      req.on('error', () => resolve(null));
      req.on('timeout', () => {
        req.destroy();
        resolve(null);
      });
    });
    
    if (otaSettings) {
      otaEnabled = otaSettings.enabled !== false;
      checkOnStartup = otaSettings.check_on_startup !== false;
    }
  } catch (e) {
    log.warn('Failed to refresh OTA settings from backend:', e.message);
  }
  
  return {
    enabled: otaEnabled,
    checkOnStartup: checkOnStartup,
    autoDownload: autoUpdater.autoDownload,
    autoInstallOnAppQuit: autoUpdater.autoInstallOnAppQuit,
    allowPrerelease: autoUpdater.allowPrerelease,
    currentVersion: app.getVersion()
  };
});

// 获取 GitHub Release 信息
ipcMain.handle('get-release-info', async () => {
  try {
    const https = require('https');
    return new Promise((resolve, reject) => {
      const options = {
        hostname: 'api.github.com',
        path: '/repos/peterpanstechland/piying/releases/latest',
        headers: {
          'User-Agent': 'Piying-Electron-App'
        },
        timeout: 10000
      };
      
      const req = https.get(options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          // 检查 HTTP 状态码
          if (res.statusCode === 403) {
            log.warn('GitHub API rate limited');
            resolve({ error: 'rate_limited', message: 'GitHub API 请求过于频繁，请稍后再试' });
            return;
          }
          if (res.statusCode === 404) {
            log.warn('No releases found');
            resolve({ error: 'no_releases', message: '暂无发布版本' });
            return;
          }
          if (res.statusCode !== 200) {
            log.warn('GitHub API error:', res.statusCode);
            resolve({ error: 'api_error', message: `GitHub API 错误 (${res.statusCode})` });
            return;
          }
          
          try {
            const release = JSON.parse(data);
            // 获取当前版本进行比较
            const currentVersion = app.getVersion();
            const latestVersion = release.tag_name ? release.tag_name.replace(/^v/, '') : '0.0.0';
            const hasUpdate = compareVersions(latestVersion, currentVersion) > 0;
            
            resolve({
              success: true,
              version: release.tag_name,
              latestVersion: latestVersion,
              currentVersion: currentVersion,
              hasUpdate: hasUpdate,
              name: release.name,
              body: release.body,
              publishedAt: release.published_at,
              htmlUrl: release.html_url,
              assets: release.assets ? release.assets.map(a => ({
                name: a.name,
                size: a.size,
                downloadUrl: a.browser_download_url
              })) : []
            });
          } catch (e) {
            log.error('Failed to parse release info:', e);
            resolve({ error: 'parse_error', message: '解析版本信息失败' });
          }
        });
      });
      
      req.on('error', (e) => {
        log.error('GitHub API request error:', e);
        resolve({ error: 'network_error', message: '网络错误: ' + e.message });
      });
      req.on('timeout', () => {
        req.destroy();
        resolve({ error: 'timeout', message: '请求超时' });
      });
    });
  } catch (error) {
    log.error('get-release-info error:', error);
    return { error: 'unknown', message: error.message };
  }
});

// 版本号比较函数
function compareVersions(v1, v2) {
  const parts1 = v1.split('.').map(Number);
  const parts2 = v2.split('.').map(Number);
  
  for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
    const p1 = parts1[i] || 0;
    const p2 = parts2[i] || 0;
    if (p1 > p2) return 1;
    if (p1 < p2) return -1;
  }
  return 0;
}

// 安装已下载的更新
ipcMain.handle('install-update', async () => {
  log.info('Installing update...');
  autoUpdater.quitAndInstall(false, true);
});

// 手动触发备份（用于测试）
ipcMain.handle('manual-backup', async () => {
  log.info('Manual backup triggered...');
  try {
    await backupUserData();
    const appDataPath = app.getPath('appData');
    const backupBasePath = path.join(appDataPath, 'RobomonPiying_Backups');
    return { success: true, path: backupBasePath };
  } catch (error) {
    log.error('Manual backup failed: ' + error.message);
    return { success: false, error: error.message };
  }
});

// ============== 开机自启动 API ==============

// 获取开机自启动状态
ipcMain.handle('get-auto-launch-status', async () => {
  try {
    const settings = app.getLoginItemSettings();
    log.info(`Auto-launch status: openAtLogin=${settings.openAtLogin}`);
    return { 
      success: true, 
      openAtLogin: settings.openAtLogin,
      // macOS 特有属性
      openAsHidden: settings.openAsHidden || false,
      wasOpenedAtLogin: settings.wasOpenedAtLogin || false
    };
  } catch (error) {
    log.error('Failed to get auto-launch status: ' + error.message);
    return { success: false, error: error.message, openAtLogin: false };
  }
});

// 设置开机自启动
ipcMain.handle('set-auto-launch', async (event, enabled) => {
  try {
    log.info(`Setting auto-launch to: ${enabled}`);
    app.setLoginItemSettings({ 
      openAtLogin: enabled,
      // macOS: 是否在登录时隐藏窗口启动
      openAsHidden: false
    });
    
    // 验证设置是否成功
    const settings = app.getLoginItemSettings();
    log.info(`Auto-launch set result: openAtLogin=${settings.openAtLogin}`);
    
    return { 
      success: true, 
      openAtLogin: settings.openAtLogin 
    };
  } catch (error) {
    log.error('Failed to set auto-launch: ' + error.message);
    return { success: false, error: error.message };
  }
});
