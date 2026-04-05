import React from 'react';
import { Difficulty, PassageCategory, PersonalBests, DailyStreak } from '../types/GameTypes';
import './WelcomeScreen.css';

interface WelcomeScreenProps {
    onStartSolo: () => void;
    onStartMultiplayer: () => void;
    difficulty: Difficulty;
    onDifficultyChange: (d: Difficulty) => void;
    bests: PersonalBests;
    dailyStreak: DailyStreak;
    totalRaces: number;
    ghostEnabled: boolean;
    onGhostToggle: () => void;
    category: PassageCategory;
    onCategoryChange: (c: PassageCategory) => void;
}

const WelcomeScreen: React.FC<WelcomeScreenProps> = ({
    onStartSolo,
    onStartMultiplayer,
    difficulty,
    onDifficultyChange,
    bests,
    dailyStreak,
    totalRaces,
    ghostEnabled,
    onGhostToggle,
    category,
    onCategoryChange,
}) => {
    const currentBest = bests[difficulty];
    const difficulties: Difficulty[] = ['easy', 'medium', 'hard'];
    const categories: { value: PassageCategory; label: string }[] = [
        { value: 'sentences', label: 'SENTENCES' },
        { value: 'pop-culture', label: 'POP CULTURE' },
        { value: 'random-words', label: 'RANDOM WORDS' },
    ];

    return (
        <div className="welcome-screen">
            <div className="welcome-grid-bg" />

            <div className="welcome-content">
                <header className="welcome-hero">
                    <div className="hero-label">TYPING VELOCITY ENGINE</div>
                    <h1 className="hero-title">
                        <span className="hero-title-line">TYPE</span>
                        <span className="hero-title-line accent">RACE</span>
                    </h1>
                </header>

                {dailyStreak.count > 0 && (
                    <div className="daily-streak">
                        <span className="streak-star">&#9733;</span>
                        <span>{dailyStreak.count} DAY STREAK</span>
                    </div>
                )}

                <div className="category-picker">
                    {categories.map(c => (
                        <button
                            key={c.value}
                            className={`cat-btn${c.value === category ? ' active' : ''}`}
                            onClick={() => onCategoryChange(c.value)}
                        >
                            {c.label}
                        </button>
                    ))}
                </div>

                <div className="difficulty-picker">
                    {difficulties.map(d => (
                        <button
                            key={d}
                            className={`diff-btn${d === difficulty ? ' active' : ''}`}
                            onClick={() => onDifficultyChange(d)}
                        >
                            {d.toUpperCase()}
                        </button>
                    ))}
                </div>

                <div className="mode-buttons">
                    <button onClick={onStartSolo} className="mode-btn mode-solo">
                        SOLO
                    </button>
                    <button onClick={onStartMultiplayer} className="mode-btn mode-multi">
                        MULTIPLAYER
                    </button>
                </div>

                <div className="welcome-stats-strip">
                    <div className="strip-item">
                        <span className="strip-value">{currentBest ? currentBest.wpm : '--'}</span>
                        <span className="strip-label">Best WPM</span>
                    </div>
                    <div className="strip-divider" />
                    <div className="strip-item">
                        <span className="strip-value">{currentBest ? `${currentBest.accuracy}%` : '--'}</span>
                        <span className="strip-label">Best Acc</span>
                    </div>
                    <div className="strip-divider" />
                    <div className="strip-item">
                        <span className="strip-value">{totalRaces}</span>
                        <span className="strip-label">Races</span>
                    </div>
                </div>

                <div className="welcome-options">
                    <label className="ghost-toggle">
                        <input
                            type="checkbox"
                            checked={ghostEnabled}
                            onChange={onGhostToggle}
                        />
                        <span>Ghost Racing</span>
                    </label>
                </div>

                <footer className="welcome-keys">
                    <div className="key-group">
                        <kbd>Cmd+N</kbd>
                        <span>New Race</span>
                    </div>
                    <div className="key-group">
                        <kbd>Cmd+R</kbd>
                        <span>Restart</span>
                    </div>
                    <div className="key-group">
                        <kbd>F11</kbd>
                        <span>Fullscreen</span>
                    </div>
                </footer>
            </div>

            <div className="welcome-decoration">
                <div className="deco-line deco-line-1" />
                <div className="deco-line deco-line-2" />
                <div className="deco-corner deco-corner-tl" />
                <div className="deco-corner deco-corner-br" />
            </div>
        </div>
    );
};

export default WelcomeScreen;
