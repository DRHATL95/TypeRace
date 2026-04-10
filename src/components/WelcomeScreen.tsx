import React, { useEffect, useState } from 'react';
import { SignInButton, UserButton } from '@clerk/clerk-react';
import { useAppAuth } from '../hooks/useAuthToken';
import { Difficulty, PassageCategory, PersonalBests, DailyStreak } from '../types/GameTypes';
import { TodayLeaderboard, MonthlyLeaderboardEntry } from '../utils/api';
import { startMenuMusic, stopMenuMusic } from '../utils/menuMusic';
import { getMuted, toggleMute, getVolumeLevel, setVolumeLevel } from '../utils/audioEngine';
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
    todaysBest: { wpm: number; accuracy: number; fireStreak: number } | null;
    leaderboard: TodayLeaderboard | null;
    monthlyLeaderboard: MonthlyLeaderboardEntry[];
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
    todaysBest,
    leaderboard,
    monthlyLeaderboard,
}) => {
    const { isSignedIn, userName } = useAppAuth();
    const clerkAvailable = !!process.env.REACT_APP_CLERK_PUBLISHABLE_KEY;
    const [muted, setMutedState] = useState(getMuted());
    const [volume, setVolumeState] = useState(getVolumeLevel());

    useEffect(() => {
        startMenuMusic();
        return () => { stopMenuMusic(); };
    }, []);

    const handleToggleMute = () => {
        const nowMuted = toggleMute();
        setMutedState(nowMuted);
    };

    const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const v = Number(e.target.value);
        setVolumeState(v);
        setVolumeLevel(v);
    };

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

                {clerkAvailable && (
                    <div className="auth-bar">
                        {isSignedIn ? (
                            <div className="auth-user">
                                <span className="auth-name">{userName || 'Racer'}</span>
                                <UserButton
                                    appearance={{
                                        elements: {
                                            avatarBox: { width: 28, height: 28 },
                                        },
                                    }}
                                />
                            </div>
                        ) : (
                            <SignInButton mode="modal">
                                <button className="auth-signin-btn">SIGN IN</button>
                            </SignInButton>
                        )}
                    </div>
                )}

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

                <div className="today-champions">
                    <div className="champions-label">TODAY'S CHAMPIONS</div>
                    <div className="champions-columns">
                        <div className="champions-col">
                            <div className="col-header">YOUR BEST</div>
                            {todaysBest ? (
                                <div className="personal-today">
                                    <span className="pt-wpm">{todaysBest.wpm} WPM</span>
                                    <span className="pt-acc">{todaysBest.accuracy}%</span>
                                    {todaysBest.fireStreak > 0 && (
                                        <span className="pt-streak">{todaysBest.fireStreak} streak</span>
                                    )}
                                </div>
                            ) : (
                                <div className="no-races-today">No races today</div>
                            )}
                        </div>
                        <div className="champions-divider" />
                        <div className="champions-col">
                            <div className="col-header">GLOBAL TOP 5</div>
                            {leaderboard && leaderboard.topWpm.length > 0 ? (
                                <div className="global-top">
                                    {leaderboard.topWpm.map((entry, i) => (
                                        <div key={i} className={`lb-entry${i === 0 ? ' lb-champion' : ''}`}>
                                            <span className="lb-rank">#{i + 1}</span>
                                            <span className="lb-name">{entry.player_name}</span>
                                            <span className="lb-wpm">{entry.wpm}</span>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="no-races-today">
                                    {leaderboard === null ? 'Leaderboard unavailable' : 'No races today'}
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {monthlyLeaderboard.length > 0 && (
                    <div className="monthly-leaderboard">
                        <div className="monthly-label">MONTHLY TOP 100</div>
                        <div className="monthly-list">
                            {monthlyLeaderboard.slice(0, 10).map((entry, i) => (
                                <div key={i} className={`lb-entry${i === 0 ? ' lb-champion' : ''}`}>
                                    <span className="lb-rank">#{i + 1}</span>
                                    <span className="lb-name">{entry.player_name}</span>
                                    <span className="lb-wpm">{entry.wpm}</span>
                                    <span className="lb-races">{entry.race_count} race{entry.race_count !== 1 ? 's' : ''}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                <div className="welcome-options">
                    <label className="ghost-toggle">
                        <input
                            type="checkbox"
                            checked={ghostEnabled}
                            onChange={onGhostToggle}
                        />
                        <span>Ghost Racing</span>
                    </label>
                    <div className="welcome-volume">
                        <button className="welcome-mute-btn" onClick={handleToggleMute}>
                            {muted ? 'MUTED' : 'SFX'}
                        </button>
                        {!muted && (
                            <input
                                type="range"
                                min="0"
                                max="100"
                                value={volume}
                                onChange={handleVolumeChange}
                                className="welcome-volume-slider"
                                title={`Volume: ${volume}%`}
                            />
                        )}
                    </div>
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
