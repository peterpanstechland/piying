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

autoUpdater.on('checking-for-update', () => {
  log.info('Checking for update...');
});

autoUpdater.on('update-available', (info) => {
  log.info('Update available: ' + info.version);
  if (splashWindow) {
    splashWindow.webContents.send('update-message', '发现新版本，正在下载...');
  }
});

autoUpdater.on('update-not-available', (info) => {
  log.info('Update not available.');
});

autoUpdater.on('error', (err) => {
  log.error('Error in auto-updater: ' + err);
  if (splashWindow) {
    splashWindow.webContents.send('update-message', '更新检查失败，继续启动...');
  }
});

autoUpdater.on('download-progress', (progressObj) => {
  let log_message = "Download speed: " + progressObj.bytesPerSecond;
  log_message = log_message + ' - Downloaded ' + progressObj.percent + '%';
  log_message = log_message + ' (' + progressObj.transferred + "/" + progressObj.total + ')';
  log.info(log_message);
  if (splashWindow) {
    splashWindow.webContents.send('update-message', `正在下载更新... ${Math.round(progressObj.percent)}%`);
  }
});

autoUpdater.on('update-downloaded', (info) => {
  log.info('Update downloaded');
  if (splashWindow) {
    splashWindow.webContents.send('update-message', '更新下载完成，下次启动时安装');
  }
  // 这里可以选择立即安装并重启，或者下次启动时安装
  // autoUpdater.quitAndInstall(); 
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
