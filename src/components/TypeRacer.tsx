import React, { useState, useEffect, useRef, useCallback } from 'react';
import { TextPassage, TypingStats, CharacterStatus, RaceResult } from '../types/GameTypes';
import { getRandomPassage } from '../data/textPassages';
import { parseTextToCharacters, calculateRaceResult } from '../utils/typingUtils';
import './TypeRacer.css';

interface TypeRacerProps {
    onRaceComplete: (result: RaceResult) => void;
}

const TypeRacer: React.FC<TypeRacerProps> = ({ onRaceComplete }) => {
    const [passage, setPassage] = useState<TextPassage>(getRandomPassage());
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

    const inputRef = useRef<HTMLInputElement>(null);
    const countdownIntervalRef = useRef<NodeJS.Timeout | null>(null);

    // Initialize characters when passage changes
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
    }, [passage]);

    // Handle countdown
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

        // Update character status
        setCharacters(prev => {
            const newCharacters = [...prev];
            const typedChar = value[currentCharIndex];
            const expectedChar = passage.text[currentCharIndex];

            if (typedChar === expectedChar) {
                newCharacters[currentCharIndex] = {
                    ...newCharacters[currentCharIndex],
                    status: 'correct',
                    typed: typedChar
                };
            } else {
                newCharacters[currentCharIndex] = {
                    ...newCharacters[currentCharIndex],
                    status: 'incorrect',
                    typed: typedChar
                };
            }

            return newCharacters;
        });

        // Update stats
        setStats(prev => {
            const typedChar = value[currentCharIndex];
            const expectedChar = passage.text[currentCharIndex];
            const isCorrect = typedChar === expectedChar;

            return {
                ...prev,
                currentIndex: currentCharIndex + 1,
                charactersTyped: currentCharIndex + 1,
                errors: isCorrect ? prev.errors : prev.errors + 1
            };
        });

        // Check if race is complete
        if (value.length === passage.text.length) {
            const finalStats: TypingStats = {
                ...stats,
                endTime: Date.now(),
                isComplete: true
            };

            const result = calculateRaceResult(finalStats, passage.text.length);
            onRaceComplete(result);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Backspace' && inputValue.length === 0) {
            e.preventDefault();
        }
    };

    const restartRace = () => {
        const newPassage = getRandomPassage();
        setPassage(newPassage);
        setShowCountdown(false);
        setCountdown(3);
    };

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

            return (
                <span key={index} className={className}>
                    {char.char}
                </span>
            );
        });
    };

    const getCurrentWPM = () => {
        if (!isStarted || stats.startTime === 0) return 0;
        const timeElapsed = (Date.now() - stats.startTime) / 1000;
        const wpm = (stats.charactersTyped / 5) / (timeElapsed / 60);
        return Math.round(wpm * 100) / 100;
    };

    const getCurrentAccuracy = () => {
        if (stats.charactersTyped === 0) return 100;
        const correct = stats.charactersTyped - stats.errors;
        return Math.round((correct / stats.charactersTyped) * 100 * 100) / 100;
    };

    return (
        <div className="type-racer">
            <div className="race-header">
                <div className="passage-info">
                    <h2>{passage.title}</h2>
                    <span className="difficulty">{passage.difficulty}</span>
                    <span className="category">{passage.category}</span>
                </div>

                <div className="stats-display">
                    <div className="stat">
                        <span className="stat-label">WPM</span>
                        <span className="stat-value">{getCurrentWPM()}</span>
                    </div>
                    <div className="stat">
                        <span className="stat-label">Accuracy</span>
                        <span className="stat-value">{getCurrentAccuracy()}%</span>
                    </div>
                    <div className="stat">
                        <span className="stat-label">Progress</span>
                        <span className="stat-value">{Math.round((stats.charactersTyped / passage.text.length) * 100)}%</span>
                    </div>
                </div>
            </div>

            <div className="text-container">
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
                    placeholder={isStarted ? "" : "Start typing to begin..."}
                    className="typing-input"
                    maxLength={passage.text.length}
                />
            </div>

            <div className="race-controls">
                <button onClick={restartRace} className="restart-btn">
                    New Text
                </button>
            </div>

            {showCountdown && (
                <div className="countdown-overlay">
                    <div className="countdown-number">{countdown}</div>
                    <div className="countdown-text">Get ready...</div>
                </div>
            )}
        </div>
    );
};

export default TypeRacer;
