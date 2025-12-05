const { app, BrowserWindow, Tray, Menu, ipcMain, shell, dialog } = require('electron');
const path = require('path');
const { spawn, exec } = require('child_process');
const fs = require('fs');
const http = require('http');

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
function log(message) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${message}`);
}

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
      log(`Backend stderr: ${output}`);
      // uvicorn 的正常输出也会到 stderr
      if (output.includes('Application startup complete') || output.includes('Uvicorn running')) {
        startupComplete = true;
        resolve(true);
      }
    });

    backendProcess.on('error', (error) => {
      log(`Failed to start backend: ${error.message}`);
      reject(error);
    });

    backendProcess.on('close', (code) => {
      log(`Backend process exited with code ${code}`);
      if (!startupComplete) {
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

  if (isDev) {
    launcherWindow.webContents.openDevTools();
  }
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
  }
}

// 创建系统托盘
function createTray() {
  const iconPath = path.join(__dirname, 'build', 'icon.ico');
  
  // 如果图标不存在，跳过托盘创建
  if (!fs.existsSync(iconPath)) {
    log('Tray icon not found, skipping tray creation');
    return;
  }
  
  tray = new Tray(iconPath);

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

// 应用退出前
app.on('before-quit', () => {
  log('Application quitting...');
  
  if (backendProcess) {
    log('Stopping backend process...');
    backendProcess.kill();
    backendProcess = null;
  }
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
    shell.openExternal('https://github.com/your-repo/shadow-puppet-system');
  }
});

ipcMain.handle('exit-app', async () => {
  app.quit();
});

ipcMain.handle('get-app-version', async () => {
  return app.getVersion();
});
