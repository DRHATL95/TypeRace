import React from 'react';
import './WelcomeScreen.css';

interface WelcomeScreenProps {
    onStartRace: () => void;
}

const WelcomeScreen: React.FC<WelcomeScreenProps> = ({ onStartRace }) => {
    return (
        <div className="welcome-screen">
            <div className="welcome-container">
                <div className="welcome-header">
                    <h1 className="welcome-title">
                        <span className="title-main">TypeRacer</span>
                        <span className="title-sub">Desktop</span>
                    </h1>
                    <p className="welcome-subtitle">
                        Test your typing speed and accuracy in this beautiful desktop racing experience
                    </p>
                </div>

                <div className="features-grid">
                    <div className="feature-card">
                        <div className="feature-icon">⚡</div>
                        <h3>Lightning Fast</h3>
                        <p>Real-time typing feedback with instant WPM and accuracy calculations</p>
                    </div>

                    <div className="feature-card">
                        <div className="feature-icon">🎯</div>
                        <h3>Multiple Levels</h3>
                        <p>Choose from easy, medium, and hard difficulty levels with diverse text passages</p>
                    </div>

                    <div className="feature-card">
                        <div className="feature-icon">📊</div>
                        <h3>Detailed Stats</h3>
                        <p>Track your progress with comprehensive statistics and performance metrics</p>
                    </div>

                    <div className="feature-card">
                        <div className="feature-icon">🎨</div>
                        <h3>Beautiful UI</h3>
                        <p>Enjoy a modern, glass-morphism design that's easy on the eyes</p>
                    </div>
                </div>

                <div className="welcome-controls">
                    <button onClick={onStartRace} className="start-race-btn">
                        <span className="btn-text">Start Racing</span>
                        <span className="btn-icon">🏁</span>
                    </button>

                    <div className="quick-stats">
                        <div className="quick-stat">
                            <span className="stat-number">10+</span>
                            <span className="stat-label">Text Passages</span>
                        </div>
                        <div className="quick-stat">
                            <span className="stat-number">3</span>
                            <span className="stat-label">Difficulty Levels</span>
                        </div>
                        <div className="quick-stat">
                            <span className="stat-number">∞</span>
                            <span className="stat-label">Fun Factor</span>
                        </div>
                    </div>
                </div>

                <div className="welcome-footer">
                    <p>Built with ❤️ using Electron, React & TypeScript</p>
                    <div className="keyboard-shortcuts">
                        <span className="shortcut">⌘+N</span>
                        <span>New Race</span>
                        <span className="shortcut">⌘+R</span>
                        <span>Restart</span>
                        <span className="shortcut">F11</span>
                        <span>Fullscreen</span>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default WelcomeScreen;
