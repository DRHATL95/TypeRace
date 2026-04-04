import React, { useState, useEffect, useCallback } from 'react';
import TypeRacer from './components/TypeRacer';
import WelcomeScreen from './components/WelcomeScreen';
import ResultsScreen from './components/ResultsScreen';
import { GameState, RaceResult, Difficulty, TextPassage } from './types/GameTypes';
import { getRandomPassage } from './data/textPassages';
import {
    getBests, updateBest, getHistory, addHistoryEntry,
    getDailyStreak, incrementDailyStreak,
    getDifficulty, setDifficulty,
    isGhostEnabled, setGhostEnabled,
} from './utils/storage';

declare global {
    interface Window {
        electronAPI?: {
            onNewRace: (callback: () => void) => void;
            onRestartRace: (callback: () => void) => void;
            removeAllListeners: (channel: string) => void;
        };
    }
}

function App() {
    const [gameState, setGameState] = useState<GameState>('welcome');
    const [raceResult, setRaceResult] = useState<RaceResult | null>(null);
    const [difficulty, setDifficultyState] = useState<Difficulty>(getDifficulty());
    const [passage, setPassage] = useState<TextPassage>(getRandomPassage(getDifficulty()));
    const [ghostEnabled, setGhostEnabledState] = useState(isGhostEnabled());
    const [sessionStreak, setSessionStreak] = useState(0);
    const [isNewBest, setIsNewBest] = useState(false);
    const [lastFireStreak, setLastFireStreak] = useState(0);
    const [bests, setBests] = useState(getBests());
    const [dailyStreak, setDailyStreak] = useState(getDailyStreak());
    const [totalRaces, setTotalRaces] = useState(getHistory().length);

    useEffect(() => {
        if (window.electronAPI) {
            window.electronAPI.onNewRace(() => {
                returnToWelcome();
            });
            window.electronAPI.onRestartRace(() => {
                startRace();
            });
        }

        const handleKeyDown = (event: KeyboardEvent) => {
            if ((event.metaKey || event.ctrlKey) && event.key === 'n') {
                event.preventDefault();
                returnToWelcome();
            }
            if ((event.metaKey || event.ctrlKey) && event.key === 'r') {
                event.preventDefault();
                startRace();
            }
            if (event.key === 'Enter' && gameState === 'welcome') {
                event.preventDefault();
                startRace();
            }
        };

        document.addEventListener('keydown', handleKeyDown);

        return () => {
            if (window.electronAPI) {
                window.electronAPI.removeAllListeners('new-race');
                window.electronAPI.removeAllListeners('restart-race');
            }
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, [gameState, difficulty]);

    const handleDifficultyChange = useCallback((d: Difficulty) => {
        setDifficultyState(d);
        setDifficulty(d);
    }, []);

    const handleGhostToggle = useCallback(() => {
        setGhostEnabledState(prev => {
            const next = !prev;
            setGhostEnabled(next);
            return next;
        });
    }, []);

    const startRace = useCallback(() => {
        const newPassage = getRandomPassage(difficulty);
        setPassage(newPassage);
        setRaceResult(null);
        setIsNewBest(false);
        setGameState('racing');
    }, [difficulty]);

    const handleRaceComplete = useCallback((result: RaceResult, fireStreak: number) => {
        setRaceResult(result);
        setLastFireStreak(fireStreak);

        const newBest = updateBest(difficulty, result.wpm, result.accuracy);
        setIsNewBest(newBest);
        setBests(getBests());

        addHistoryEntry({
            wpm: result.wpm,
            accuracy: result.accuracy,
            difficulty,
            passageTitle: passage.title,
            timestamp: Date.now(),
            fireStreak,
        });
        setTotalRaces(prev => prev + 1);

        setSessionStreak(prev => prev + 1);
        const updatedStreak = incrementDailyStreak();
        setDailyStreak(updatedStreak);

        setGameState('results');
    }, [difficulty, passage]);

    const restartRace = useCallback(() => {
        setRaceResult(null);
        setIsNewBest(false);
        const newPassage = getRandomPassage(difficulty);
        setPassage(newPassage);
        setGameState('racing');
    }, [difficulty]);

    const returnToWelcome = useCallback(() => {
        setGameState('welcome');
        setRaceResult(null);
        setIsNewBest(false);
    }, []);

    const handleNewText = useCallback(() => {
        const newPassage = getRandomPassage(difficulty);
        setPassage(newPassage);
    }, [difficulty]);

    const handleStartMultiplayer = useCallback(() => {
        // Placeholder — multiplayer modal will be wired in Task 14
        alert('Multiplayer coming soon!');
    }, []);

    return (
        <div className="app">
            {gameState === 'welcome' && (
                <WelcomeScreen
                    onStartSolo={startRace}
                    onStartMultiplayer={handleStartMultiplayer}
                    difficulty={difficulty}
                    onDifficultyChange={handleDifficultyChange}
                    bests={bests}
                    dailyStreak={dailyStreak}
                    totalRaces={totalRaces}
                    ghostEnabled={ghostEnabled}
                    onGhostToggle={handleGhostToggle}
                />
            )}
            {gameState === 'racing' && (
                <TypeRacer
                    passage={passage}
                    ghostEnabled={ghostEnabled}
                    sessionStreak={sessionStreak}
                    onRaceComplete={handleRaceComplete}
                    onNewText={handleNewText}
                />
            )}
            {gameState === 'results' && raceResult && (
                <ResultsScreen
                    result={raceResult}
                    isNewBest={isNewBest}
                    fireStreak={lastFireStreak}
                    onRestart={restartRace}
                    onNewRace={returnToWelcome}
                />
            )}
        </div>
    );
}

export default App;
