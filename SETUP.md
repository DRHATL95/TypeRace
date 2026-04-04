# TypeRacer Desktop Setup Guide

## Quick Start (Web Version)

The TypeRacer game is currently set up as a web application that can be easily converted to a desktop app later.

### 1. Install Dependencies
```bash
npm install
```

### 2. Start the Development Server
```bash
npm run dev:renderer
```

The app will open in your browser at `http://localhost:3000`

### 3. Keyboard Shortcuts (Web Version)
- `Ctrl+N` / `Cmd+N`: Start a new race
- `Ctrl+R` / `Cmd+R`: Restart current race

## Converting to Desktop App

To convert this to a desktop application with Electron:

### 1. Install Electron
```bash
npm install electron --save
npm install electron-builder --save-dev
```

### 2. Build the Electron Main Process
```bash
npm run build:main
```

### 3. Run as Desktop App
```bash
npm run dev
```

### 4. Package for Distribution
```bash
npm run package
```

## Current Status

✅ **Completed:**
- Full React TypeScript application
- Beautiful UI with glass-morphism design
- Real-time typing mechanics
- WPM and accuracy calculation
- Multiple text passages with difficulty levels
- Results screen with detailed statistics
- Keyboard shortcuts
- Responsive design

🔄 **Ready for Desktop:**
- Electron main process files created
- IPC communication setup
- Build configuration ready
- Just need to install Electron

## Features

- **Real-time Feedback**: See your typing progress with character highlighting
- **Multiple Difficulties**: Easy, medium, and hard text passages
- **Comprehensive Stats**: WPM, accuracy, errors, completion time
- **Beautiful Design**: Modern glass-morphism UI with animations
- **Keyboard Shortcuts**: Quick access to common functions
- **Responsive**: Works on different screen sizes

## Troubleshooting

If you encounter issues:

1. **Port 3000 in use**: Kill the process using that port:
   ```bash
   lsof -ti:3000 | xargs kill -9
   ```

2. **Electron installation fails**: This is usually a network issue. Try:
   ```bash
   npm config set electron_mirror https://npmmirror.com/mirrors/electron/
   npm install electron
   ```

3. **Build errors**: Make sure all dependencies are installed:
   ```bash
   npm install
   ```

## Next Steps

The application is fully functional as a web app. To make it a desktop app:

1. Install Electron when network allows
2. Run the build commands
3. Test the desktop version
4. Package for distribution

The code is already prepared for Electron integration!
