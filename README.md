# TypeRacer Desktop 🏁

A beautiful, modern desktop typing speed test application built with Electron, React, and TypeScript.

## Features ✨

- **Real-time Typing Feedback**: See your progress as you type with instant visual feedback
- **Multiple Difficulty Levels**: Choose from easy, medium, and hard text passages
- **Comprehensive Statistics**: Track WPM, accuracy, errors, and completion time
- **Beautiful UI**: Modern glass-morphism design with smooth animations
- **Cross-platform**: Works on Windows, macOS, and Linux
- **Keyboard Shortcuts**: Quick access to common functions

## Screenshots 📸

- Welcome screen with feature overview
- Real-time typing interface with character highlighting
- Detailed results screen with performance metrics

## Installation 🚀

### Prerequisites

- Node.js (v16 or higher)
- npm or yarn

### Quick Start (Web Version)

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Start the development server**
   ```bash
   npm start
   # or
   npm run dev:renderer
   ```

3. **Open your browser**
   Navigate to `http://localhost:3000`

### Desktop Version (Electron)

1. **Install Electron**
   ```bash
   npm install electron --save
   ```

2. **Run as desktop app**
   ```bash
   npm run dev
   ```

3. **Build and package**
   ```bash
   npm run build
   npm run package
   ```

### Build for Web Deployment

```bash
npm run build:web
```

The built files will be in the `build/` directory, ready for deployment to any web server.

## Usage 🎮

### Starting a Race

1. Click "Start Racing" on the welcome screen
2. Wait for the 3-second countdown
3. Start typing the displayed text
4. Watch your real-time stats update
5. Complete the race to see your results

### Keyboard Shortcuts

- `⌘+N` / `Ctrl+N`: Start a new race
- `⌘+R` / `Ctrl+R`: Restart current race
- `F11`: Toggle fullscreen mode
- `F12`: Toggle developer tools (development only)

### Performance Levels

- **🏆 Excellent**: 80+ WPM with 95%+ accuracy
- **⭐ Great**: 60+ WPM with 90%+ accuracy  
- **👍 Good**: 40+ WPM with 85%+ accuracy
- **📚 Practice**: 30+ WPM with 80%+ accuracy

## Technical Details 🔧

### Architecture

- **Frontend**: React 18 with TypeScript
- **Desktop**: Electron 27
- **Styling**: CSS3 with modern features (backdrop-filter, gradients, animations)
- **Build**: Create React App with custom Electron configuration

### Project Structure

```
TypeRace/
├── electron/           # Electron main process
│   ├── main.ts        # Main process entry point
│   └── preload.ts     # Preload script for secure IPC
├── src/               # React application
│   ├── components/    # React components
│   ├── types/         # TypeScript type definitions
│   ├── data/          # Text passages and game data
│   ├── utils/         # Utility functions
│   └── App.tsx        # Main React component
├── public/            # Static assets
└── dist/              # Built Electron main process
```

### Key Components

- **TypeRacer**: Main typing interface with real-time feedback
- **WelcomeScreen**: Landing page with features and controls
- **ResultsScreen**: Detailed performance analysis and achievements

## Customization 🎨

### Adding New Text Passages

Edit `src/data/textPassages.ts` to add new typing content:

```typescript
{
  id: 'unique-id',
  title: 'Passage Title',
  text: 'Your text here...',
  difficulty: 'easy' | 'medium' | 'hard',
  category: 'Category Name'
}
```

### Styling

- Main styles: `src/index.css`
- Component styles: `src/components/*.css`
- Colors and themes can be customized in the CSS files

### Difficulty Levels

- **Easy**: Simple vocabulary, short sentences
- **Medium**: Moderate complexity, varied sentence structures  
- **Hard**: Complex vocabulary, technical terms, longer passages

## Performance Tips 💡

1. **Focus on Accuracy**: Better accuracy often leads to higher WPM
2. **Practice Regularly**: Consistent practice improves muscle memory
3. **Use Proper Posture**: Maintain good typing position
4. **Don't Look at Keys**: Develop touch typing skills
5. **Take Breaks**: Avoid fatigue for better performance

## Development 🛠️

### Available Scripts

- `npm run dev`: Start development server with hot reload
- `npm run build`: Build for production
- `npm run package`: Create distributable packages

### Adding Features

1. Create new components in `src/components/`
2. Add types in `src/types/`
3. Update the main App.tsx to include new features
4. Style with CSS modules or regular CSS files

## Troubleshooting 🔍

### Common Issues

1. **Build Errors**: Ensure all dependencies are installed with `npm install`
2. **Electron Won't Start**: Check Node.js version compatibility
3. **Styling Issues**: Verify CSS browser support for modern features
4. **Performance**: Close other applications for better typing test accuracy

### Getting Help

- Check the browser console for error messages
- Ensure all dependencies are up to date
- Verify Node.js and npm versions meet requirements

## License 📄

This project is open source and available under the MIT License.

## Contributing 🤝

Contributions are welcome! Feel free to:

- Add new text passages
- Improve the UI/UX
- Add new features
- Fix bugs
- Optimize performance

---

**Happy Typing!** 🎯✨
