import React from 'react';
import { RaceResult } from '../types/GameTypes';
import { getPerformanceMessage, formatTime, getWPMColor, getAccuracyColor } from '../utils/typingUtils';
import './ResultsScreen.css';

interface ResultsScreenProps {
    result: RaceResult;
    onRestart: () => void;
    onNewRace: () => void;
}

const ResultsScreen: React.FC<ResultsScreenProps> = ({ result, onRestart, onNewRace }) => {
    const performanceMessage = getPerformanceMessage(result.wpm, result.accuracy);
    const wpmColor = getWPMColor(result.wpm);
    const accuracyColor = getAccuracyColor(result.accuracy);

    return (
        <div className="results-screen">
            <div className="results-container">
                <div className="results-header">
                    <h1 className="results-title">Race Complete!</h1>
                    <p className="performance-message">{performanceMessage}</p>
                </div>

                <div className="results-stats">
                    <div className="main-stats">
                        <div className="stat-card primary">
                            <div className="stat-icon">⚡</div>
                            <div className="stat-content">
                                <div className="stat-value" style={{ color: wpmColor }}>
                                    {result.wpm}
                                </div>
                                <div className="stat-label">Words Per Minute</div>
                            </div>
                        </div>

                        <div className="stat-card secondary">
                            <div className="stat-icon">🎯</div>
                            <div className="stat-content">
                                <div className="stat-value" style={{ color: accuracyColor }}>
                                    {result.accuracy}%
                                </div>
                                <div className="stat-label">Accuracy</div>
                            </div>
                        </div>
                    </div>

                    <div className="detailed-stats">
                        <div className="detail-card">
                            <div className="detail-icon">⏱️</div>
                            <div className="detail-content">
                                <div className="detail-value">{formatTime(result.timeElapsed)}</div>
                                <div className="detail-label">Time</div>
                            </div>
                        </div>

                        <div className="detail-card">
                            <div className="detail-icon">📝</div>
                            <div className="detail-content">
                                <div className="detail-value">{result.charactersTyped}</div>
                                <div className="detail-label">Characters</div>
                            </div>
                        </div>

                        <div className="detail-card">
                            <div className="detail-icon">❌</div>
                            <div className="detail-content">
                                <div className="detail-value">{result.errors}</div>
                                <div className="detail-label">Errors</div>
                            </div>
                        </div>

                        <div className="detail-card">
                            <div className="detail-icon">📊</div>
                            <div className="detail-content">
                                <div className="detail-value">{result.completionPercentage}%</div>
                                <div className="detail-label">Complete</div>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="performance-bar">
                    <div className="bar-container">
                        <div className="bar-label">Speed</div>
                        <div className="bar-track">
                            <div
                                className="bar-fill speed"
                                style={{
                                    width: `${Math.min((result.wpm / 100) * 100, 100)}%`,
                                    background: `linear-gradient(90deg, ${wpmColor}, ${wpmColor}88)`
                                }}
                            />
                        </div>
                        <div className="bar-value">{result.wpm} WPM</div>
                    </div>

                    <div className="bar-container">
                        <div className="bar-label">Accuracy</div>
                        <div className="bar-track">
                            <div
                                className="bar-fill accuracy"
                                style={{
                                    width: `${result.accuracy}%`,
                                    background: `linear-gradient(90deg, ${accuracyColor}, ${accuracyColor}88)`
                                }}
                            />
                        </div>
                        <div className="bar-value">{result.accuracy}%</div>
                    </div>
                </div>

                <div className="results-actions">
                    <button onClick={onRestart} className="action-btn primary">
                        <span className="btn-icon">🔄</span>
                        <span className="btn-text">Race Again</span>
                    </button>

                    <button onClick={onNewRace} className="action-btn secondary">
                        <span className="btn-icon">🎲</span>
                        <span className="btn-text">New Text</span>
                    </button>
                </div>

                <div className="results-footer">
                    <div className="achievement">
                        {result.wpm >= 80 && result.accuracy >= 95 && (
                            <div className="achievement-badge gold">
                                🏆 Typing Master
                            </div>
                        )}
                        {result.wpm >= 60 && result.accuracy >= 90 && result.wpm < 80 && (
                            <div className="achievement-badge silver">
                                ⭐ Speed Demon
                            </div>
                        )}
                        {result.wpm >= 40 && result.accuracy >= 85 && result.wpm < 60 && (
                            <div className="achievement-badge bronze">
                                🚀 Rising Star
                            </div>
                        )}
                    </div>

                    <div className="encouragement">
                        <p>
                            {result.wpm >= 60
                                ? "Outstanding performance! You're really improving!"
                                : result.wpm >= 40
                                    ? "Great job! Keep practicing to get even faster!"
                                    : "Keep at it! Every race makes you better!"
                            }
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ResultsScreen;
