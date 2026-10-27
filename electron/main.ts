import { app, BrowserWindow, Menu, shell } from 'electron';
import * as path from 'path';

const isDev = !app.isPackaged;

// Windows draws its own caption buttons via titleBarOverlay; macOS uses traffic lights.
// Linux has neither with frame:false, so it keeps the native frame.
const useNativeFrame = process.platform !== 'win32';

// Nvidia + Wayland: GPU compositing makes the window flicker. Must be set before app is ready.
if (process.platform === 'linux') {
  app.commandLine.appendSwitch('disable-gpu-compositing');
}

let mainWindow: BrowserWindow;

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 650,
    backgroundColor: '#060a14',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
    titleBarStyle: process.platform === 'linux' ? 'default' : 'hiddenInset',
    trafficLightPosition: { x: 16, y: 16 },
    show: false,
    frame: useNativeFrame,
    titleBarOverlay: process.platform === 'win32' ? {
      color: '#060a14',
      symbolColor: '#7a8bb5',
      height: 36,
    } : undefined,
  });

  const startUrl = isDev
    ? 'http://localhost:3000'
    : `file://${path.join(__dirname, '../build/index.html')}`;

  mainWindow.loadURL(startUrl);

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    if (isDev) {
      mainWindow.webContents.openDevTools({ mode: 'detach' });
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null as any;
  });

  createMenu();
}

function createMenu(): void {
  const isMac = process.platform === 'darwin';

  const template: Electron.MenuItemConstructorOptions[] = [
    ...(isMac ? [{
      label: 'TypeRace',
      submenu: [
        { role: 'about' as const },
        { type: 'separator' as const },
        { role: 'hide' as const },
        { role: 'hideOthers' as const },
        { role: 'unhide' as const },
        { type: 'separator' as const },
        { role: 'quit' as const },
      ],
    }] : []),
    {
      label: 'Race',
      submenu: [
        {
          label: 'New Race',
          accelerator: 'CmdOrCtrl+N',
          click: () => mainWindow.webContents.send('new-race'),
        },
        {
          label: 'Restart',
          accelerator: 'CmdOrCtrl+R',
          click: () => mainWindow.webContents.send('restart-race'),
        },
        { type: 'separator' },
        ...(!isMac ? [{ role: 'quit' as const }] : []),
      ],
    },
    {
      label: 'View',
      submenu: [
        {
          label: 'Toggle Fullscreen',
          accelerator: 'F11',
          click: () => mainWindow.setFullScreen(!mainWindow.isFullScreen()),
        },
        { type: 'separator' },
        {
          label: 'Developer Tools',
          accelerator: 'F12',
          click: () => mainWindow.webContents.toggleDevTools(),
          visible: isDev,
        },
        { role: 'reload', visible: isDev },
      ],
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        ...(isMac ? [
          { type: 'separator' as const },
          { role: 'front' as const },
        ] : [
          { role: 'close' as const },
        ]),
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

app.on('web-contents-created', (_event, contents) => {
  contents.setWindowOpenHandler(({ url }) => {
    // Open external links in default browser
    if (url.startsWith('http')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });
});
