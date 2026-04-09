import React, { useState, useEffect, useRef, useCallback } from 'react';
import { TextPassage, TypingStats, CharacterStatus, RaceResult, FireStreakTier } from '../types/GameTypes';
import { parseTextToCharacters, calculateRaceResult } from '../utils/typingUtils';
import { playKeystroke, playError, playFanfare, playKeystrokeAtPitch, getMuted, toggleMute, getVolumeLevel, setVolumeLevel } from '../utils/audioEngine';
import { createBurstOverlay } from '../utils/particleBurst';
import { useSpeedTier } from '../hooks/useSpeedTier';
import { useFireStreak } from '../hooks/useFireStreak';
import { useGhost } from '../hooks/useGhost';
import FireBanner from './FireBanner';
import RaceTrack from './RaceTrack';
import './TypeRacer.css';

interface PlayerProgress {
    name: string;
    color: string;
    currentIndex: number;
    totalLength: number;
    wpm: number;
    finished: boolean;
}

interface TypeRacerProps {
    passage: TextPassage;
    ghostEnabled: boolean;
    sessionStreak: number;
    onRaceComplete: (result: RaceResult, fireStreak: number) => void;
    onNewText: () => void;
    onHome: () => void;
    multiplayerPlayers?: PlayerProgress[];
    onProgress?: (currentIndex: number, errors: number, wpm: number) => void;
    autoStart?: boolean;
}

const TypeRacer: React.FC<TypeRacerProps> = ({
    passage,
    ghostEnabled,
    sessionStreak,
    onRaceComplete,
    onNewText,
    onHome,
    multiplayerPlayers,
    onProgress,
    autoStart,
}) => {
    const [characters, setCharacters] = useState<CharacterStatus[]>([]);
    const [stats, setStats] = useState<TypingStats>({
        startTime: 0,
        charactersTyped: 0,
        errors: 0,
        currentIndex: 0,
        isComplete: false
    });
    const [inputValue, setInputValue] = useState('');
    const [isStarted, setIsStarted] = useState(false);
    const [showCountdown, setShowCountdown] = useState(false);
    const [countdown, setCountdown] = useState(3);
    const [muted, setMutedState] = useState(getMuted());
    const [volumeLevel, setVolumeLevelState] = useState(getVolumeLevel());
    const [shaking, setShaking] = useState(false);
    const [fireTier, setFireTier] = useState<FireStreakTier>('none');
    const [fireCount, setFireCount] = useState(0);
    const [fireActive, setFireActive] = useState(false);

    const inputRef = useRef<HTMLInputElement>(null);
    const countdownIntervalRef = useRef<NodeJS.Timeout | null>(null);

    const { recordKeystroke, reset: resetFire, getLongestStreak } = useFireStreak();

    const currentWPM = (() => {
        if (!isStarted || stats.startTime === 0) return 0;
        const now = stats.isComplete ? (stats.endTime || Date.now()) : Date.now();
        const timeElapsed = (now - stats.startTime) / 1000;
        if (timeElapsed === 0) return 0;
        return Math.round(((stats.charactersTyped / 5) / (timeElapsed / 60)) * 100) / 100;
    })();

    const speedTier = useSpeedTier(currentWPM);

    const { ghostIndex, recordTimestamp, saveGhost } = useGhost({
        passageId: passage.id,
        passageLength: passage.text.length,
        enabled: ghostEnabled,
        isStarted,
        startTime: stats.startTime,
    });

    useEffect(() => {
        const parsedCharacters = parseTextToCharacters(passage.text);
        setCharacters(parsedCharacters);
        setStats({
            startTime: 0,
            charactersTyped: 0,
            errors: 0,
            currentIndex: 0,
            isComplete: false
        });
        setInputValue('');
        setIsStarted(false);
        setFireTier('none');
        setFireCount(0);
        setFireActive(false);
        resetFire();
    }, [passage, resetFire]);

    // Auto-start for multiplayer (server already did the countdown)
    useEffect(() => {
        if (autoStart && !isStarted) {
            setIsStarted(true);
            setStats(prev => ({ ...prev, startTime: Date.now() }));
            setTimeout(() => {
                if (inputRef.current) inputRef.current.focus();
            }, 100);
        }
    }, [autoStart, isStarted]);

    useEffect(() => {
        if (showCountdown && countdown > 0) {
            countdownIntervalRef.current = setTimeout(() => {
                setCountdown(countdown - 1);
            }, 1000);
        } else if (showCountdown && countdown === 0) {
            setShowCountdown(false);
            startRace();
        }

        return () => {
            if (countdownIntervalRef.current) {
                clearTimeout(countdownIntervalRef.current);
            }
        };
    }, [showCountdown, countdown]);

    const startCountdown = () => {
        setShowCountdown(true);
        setCountdown(3);
    };

    const startRace = useCallback(() => {
        setIsStarted(true);
        setStats(prev => ({
            ...prev,
            startTime: Date.now()
        }));
        if (inputRef.current) {
            inputRef.current.focus();
        }
    }, []);

    const triggerShake = useCallback(() => {
        setShaking(true);
        setTimeout(() => setShaking(false), 150);
    }, []);

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!isStarted) {
            startCountdown();
            return;
        }

        const value = e.target.value;
        const currentCharIndex = value.length - 1;

        if (currentCharIndex < 0) {
            setInputValue('');
            setStats(prev => ({ ...prev, currentIndex: 0 }));
            return;
        }

        setInputValue(value);

        const typedChar = value[currentCharIndex];
        const expectedChar = passage.text[currentCharIndex];
        const isCorrect = typedChar === expectedChar;

        // Audio feedback
        if (isCorrect) {
            if (fireTier === 'unstoppable') {
                playKeystrokeAtPitch(1.2);
            } else {
                playKeystroke();
            }
        } else {
            playError();
            triggerShake();
        }

        // Fire streak
        const fireState = recordKeystroke(isCorrect);
        setFireTier(fireState.tier);
        setFireCount(fireState.consecutiveCorrect);
        setFireActive(fireState.active);

        // Ghost recording
        if (isCorrect) {
            recordTimestamp();
        }

        // Update character status
        setCharacters(prev => {
            const newCharacters = [...prev];
            newCharacters[currentCharIndex] = {
                ...newCharacters[currentCharIndex],
                status: isCorrect ? 'correct' : 'incorrect',
                typed: typedChar
            };
            return newCharacters;
        });

        // Update stats
        const newErrors = isCorrect ? stats.errors : stats.errors + 1;
        setStats(prev => ({
            ...prev,
            currentIndex: currentCharIndex + 1,
            charactersTyped: currentCharIndex + 1,
            errors: isCorrect ? prev.errors : prev.errors + 1
        }));

        // Multiplayer progress
        if (onProgress) {
            const timeElapsed = (Date.now() - stats.startTime) / 1000;
            const wpm = timeElapsed > 0 ? Math.round(((currentCharIndex + 1) / 5) / (timeElapsed / 60)) : 0;
            onProgress(currentCharIndex + 1, newErrors, wpm);
        }

        // Check if race is complete
        if (value.length === passage.text.length) {
            playFanfare();
            saveGhost();

            const endTime = Date.now();
            const finalErrors = isCorrect ? stats.errors : stats.errors + 1;

            const finalStats: TypingStats = {
                ...stats,
                endTime,
                charactersTyped: value.length,
                errors: finalErrors,
                isComplete: true
            };

            // Freeze stats so currentWPM stops declining while waiting for others
            setStats(finalStats);

            const result = calculateRaceResult(finalStats, passage.text.length);

            const burst = createBurstOverlay();
            burst.start();
            setTimeout(() => {
                burst.cleanup();
                onRaceComplete(result, getLongestStreak());
            }, 800);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Backspace' && inputValue.length === 0) {
            e.preventDefault();
        }
    };

    const handleToggleMute = () => {
        const nowMuted = toggleMute();
        setMutedState(nowMuted);
    };

    const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const v = Number(e.target.value);
        setVolumeLevelState(v);
        setVolumeLevel(v);
    };

    const getCurrentAccuracy = () => {
        if (stats.charactersTyped === 0) return 100;
        const correct = stats.charactersTyped - stats.errors;
        return Math.round((correct / stats.charactersTyped) * 100 * 100) / 100;
    };

    const progressPercent = Math.round((stats.charactersTyped / passage.text.length) * 100);

    const renderText = () => {
        return characters.map((char, index) => {
            let className = 'character';

            if (char.status === 'correct') {
                className += ' correct';
            } else if (char.status === 'incorrect') {
                className += ' incorrect';
            }

            if (index === stats.currentIndex && isStarted) {
                className += ' current';
            }

            if (index === ghostIndex && ghostEnabled) {
                className += ' ghost';
            }

            return (
                <span key={index} className={className}>
                    {char.char}
                </span>
            );
        });
    };

    return (
        <div className="type-racer" data-speed-tier={speedTier}>
            <div className="race-hud">
                <div className="hud-left">
                    <span className="hud-title">TypeRace</span>
                    <span className="hud-tag difficulty">{passage.difficulty}</span>
                    <span className="hud-tag category">{passage.category}</span>
                    {sessionStreak > 1 && (
                        <span className="hud-tag session-streak">{sessionStreak}x streak</span>
                    )}
                </div>
                <div className="hud-right">
                    <div className="volume-controls">
                        <button className="mute-btn" onClick={handleToggleMute} title={muted ? 'Unmute' : 'Mute'}>
                            {muted ? 'MUTED' : 'SFX'}
                        </button>
                        {!muted && (
                            <input
                                type="range"
                                min="0"
                                max="100"
                                value={volumeLevel}
                                onChange={handleVolumeChange}
                                className="volume-slider"
                                title={`Volume: ${volumeLevel}%`}
                            />
                        )}
                    </div>
                    <div className="hud-stat">
                        <span className="hud-stat-value wpm">{currentWPM}</span>
                        <span className="hud-stat-label">WPM</span>
                    </div>
                    <div className="hud-stat">
                        <span className="hud-stat-value accuracy">{getCurrentAccuracy()}%</span>
                        <span className="hud-stat-label">Accuracy</span>
                    </div>
                    <div className="hud-stat">
                        <span className="hud-stat-value">{progressPercent}%</span>
                        <span className="hud-stat-label">Progress</span>
                    </div>
                </div>
            </div>

            <div className="progress-rail">
                <div className="progress-fill" style={{ width: `${progressPercent}%` }} />
            </div>

            {multiplayerPlayers && multiplayerPlayers.length > 0 && (
                <RaceTrack players={multiplayerPlayers} />
            )}

            <FireBanner tier={fireTier} streak={fireCount} visible={fireActive} />

            <div className="race-stage">
                <div className={`text-container${shaking ? ' shake' : ''}`}>
                    <div className="passage-title">// {passage.title}</div>
                    <div className="text-display">
                        {renderText()}
                    </div>
                </div>

                <div className="input-container">
                    <input
                        ref={inputRef}
                        type="text"
                        value={inputValue}
                        onChange={handleInputChange}
                        onKeyDown={handleKeyDown}
                        placeholder={isStarted ? "..." : "> start typing to begin"}
                        className="typing-input"
                        maxLength={passage.text.length}
                        autoComplete="off"
                        autoCorrect="off"
                        autoCapitalize="off"
                        spellCheck={false}
                    />
                </div>

                <div className="race-controls">
                    <button onClick={onHome} className="restart-btn">
                        [ home ]
                    </button>
                    {!multiplayerPlayers && (
                        <button onClick={onNewText} className="restart-btn">
                            [ new text ]
                        </button>
                    )}
                </div>
            </div>

            {showCountdown && (
                <div className="countdown-overlay">
                    <div className="countdown-number">{countdown}</div>
                    <div className="countdown-text">Initializing...</div>
                </div>
            )}
        </div>
    );
};

export default TypeRacer;
