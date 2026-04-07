import React from 'react';
import { RaceResult } from '../types/GameTypes';
import { getPerformanceMessage, formatTime } from '../utils/typingUtils';
import { getHistory } from '../utils/storage';
import Sparkline from './Sparkline';
import './ResultsScreen.css';

interface PlayerResult {
    name: string;
    color: string;
    rank: number;
    result: RaceResult;
}

interface ResultsScreenProps {
    result: RaceResult;
    isNewBest: boolean;
    fireStreak: number;
    onRestart: () => void;
    onNewRace: () => void;
    podium?: PlayerResult[];
    onLeaveRoom?: () => void;
    rematchVoters?: string[];
    rematchSecondsLeft?: number | null;
}

const getRank = (wpm: number, accuracy: number) => {
    if (wpm >= 80 && accuracy >= 95) return { label: 'S', title: 'TYPING MASTER', color: 'var(--amber)' };
    if (wpm >= 60 && accuracy >= 90) return { label: 'A', title: 'SPEED DEMON', color: 'var(--cyan)' };
    if (wpm >= 40 && accuracy >= 85) return { label: 'B', title: 'RISING STAR', color: 'var(--green)' };
    if (wpm >= 30 && accuracy >= 80) return { label: 'C', title: 'APPRENTICE', color: 'var(--magenta)' };
    return { label: 'D', title: 'ROOKIE', color: 'var(--text-secondary)' };
};

function getFireTierLabel(streak: number): string {
    if (streak >= 50) return 'UNSTOPPABLE';
    if (streak >= 25) return 'BLAZING';
    if (streak >= 10) return 'FIRE';
    return '';
}

const ResultsScreen: React.FC<ResultsScreenProps> = ({ result, isNewBest, fireStreak, onRestart, onNewRace, podium, onLeaveRoom, rematchVoters, rematchSecondsLeft }) => {
    const performanceMessage = getPerformanceMessage(result.wpm, result.accuracy);
    const rank = getRank(result.wpm, result.accuracy);
    const history = getHistory();
    const recentWPMs = history.slice(-10).map(h => h.wpm);
    const fireTierLabel = getFireTierLabel(fireStreak);

    return (
        <div className="results-screen">
            <div className="results-grid-bg" />

            <div className="results-content">
                {isNewBest && (
                    <div className="new-best-flash">NEW BEST</div>
                )}

                <div className="results-header">
                    <div className="results-label">RACE COMPLETE</div>
                    <div className="results-rank" style={{ color: rank.color, borderColor: rank.color }}>
                        <span className="rank-letter">{rank.label}</span>
                    </div>
                    <div className="rank-title" style={{ color: rank.color }}>{rank.title}</div>
                </div>

                {podium && podium.length > 0 && (
                    <div className="results-podium">
                        <div className="podium-label">RACE STANDINGS</div>
                        {podium.map(p => (
                            <div key={p.name} className="podium-entry" style={{ borderLeftColor: p.color }}>
                                <span className="podium-rank">#{p.rank}</span>
                                <span className="podium-name" style={{ color: p.color }}>{p.name}</span>
                                <span className="podium-wpm">{p.result.wpm} wpm</span>
                                <span className="podium-acc">{p.result.accuracy}%</span>
                            </div>
                        ))}
                    </div>
                )}

                {podium && rematchVoters !== undefined && (
                    <div className="rematch-status">
                        {rematchSecondsLeft != null && (
                            <div className="rematch-timer">
                                Next race in <span className="rematch-seconds">{rematchSecondsLeft}s</span>
                            </div>
                        )}
                        <div className="rematch-voters">
                            {podium.map(p => (
                                <div key={p.name} className="rematch-voter" style={{ borderColor: p.color }}>
                                    <span className="voter-icon">
                                        {rematchVoters.includes(p.name) ? '\u2713' : '\u2026'}
                                    </span>
                                    <span className="voter-name" style={{ color: p.color }}>{p.name}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                <div className="results-primary">
                    <div className="metric-block">
                        <div className="metric-value metric-wpm">{result.wpm}</div>
                        <div className="metric-unit">WPM</div>
                        <div className="metric-bar">
                            <div
                                className="metric-bar-fill"
                                style={{
                                    width: `${Math.min((result.wpm / 120) * 100, 100)}%`,
                                    background: `linear-gradient(90deg, var(--cyan), var(--magenta))`
                                }}
                            />
                        </div>
                    </div>
                    <div className="metric-divider" />
                    <div className="metric-block">
                        <div className="metric-value metric-acc">{result.accuracy}%</div>
                        <div className="metric-unit">ACCURACY</div>
                        <div className="metric-bar">
                            <div
                                className="metric-bar-fill"
                                style={{
                                    width: `${result.accuracy}%`,
                                    background: `linear-gradient(90deg, var(--green), var(--cyan))`
                                }}
                            />
                        </div>
                    </div>
                </div>

                <div className="results-details">
                    <div className="detail-cell">
                        <span className="detail-val">{formatTime(result.timeElapsed)}</span>
                        <span className="detail-key">TIME</span>
                    </div>
                    <div className="detail-cell">
                        <span className="detail-val">{result.charactersTyped}</span>
                        <span className="detail-key">CHARS</span>
                    </div>
                    <div className="detail-cell">
                        <span className="detail-val">{result.errors}</span>
                        <span className="detail-key">ERRORS</span>
                    </div>
                    <div className="detail-cell">
                        <span className="detail-val">{fireStreak > 0 ? `${fireStreak}` : '--'}</span>
                        <span className="detail-key">{fireTierLabel || 'STREAK'}</span>
                    </div>
                </div>

                {recentWPMs.length >= 2 && (
                    <div className="results-sparkline">
                        <span className="sparkline-label">RECENT TREND</span>
                        <Sparkline data={recentWPMs} width={160} height={36} />
                    </div>
                )}

                <div className="results-message">{performanceMessage}</div>

                <div className="results-actions">
                    <button onClick={onRestart} className="action-btn action-primary">
                        RACE AGAIN
                    </button>
                    <button onClick={onLeaveRoom || onNewRace} className="action-btn action-ghost">
                        {onLeaveRoom ? 'LEAVE ROOM' : 'NEW TEXT'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ResultsScreen;
