import React, { useState, useEffect } from 'react';
import TypeRacer from './components/TypeRacer';
import WelcomeScreen from './components/WelcomeScreen';
import ResultsScreen from './components/ResultsScreen';
import { GameState, RaceResult } from './types/GameTypes';

// Extend window interface for Electron API
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

    useEffect(() => {
        if (window.electronAPI) {
            window.electronAPI.onNewRace(() => {
                setGameState('welcome');
                setRaceResult(null);
            });

            window.electronAPI.onRestartRace(() => {
                setGameState('racing');
            });
        }

        const handleKeyDown = (event: KeyboardEvent) => {
            if ((event.metaKey || event.ctrlKey) && event.key === 'n') {
                event.preventDefault();
                setGameState('welcome');
                setRaceResult(null);
            }
            if ((event.metaKey || event.ctrlKey) && event.key === 'r') {
                event.preventDefault();
                setGameState('racing');
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
    }, []);

    const startRace = () => {
        setGameState('racing');
        setRaceResult(null);
    };

    const endRace = (result: RaceResult) => {
        setRaceResult(result);
        setGameState('results');
    };

    const restartRace = () => {
        setGameState('racing');
        setRaceResult(null);
    };

    const returnToWelcome = () => {
        setGameState('welcome');
        setRaceResult(null);
    };

    return (
        <div className="app">
            {gameState === 'welcome' && (
                <WelcomeScreen onStartRace={startRace} />
            )}
            {gameState === 'racing' && (
                <TypeRacer onRaceComplete={endRace} />
            )}
            {gameState === 'results' && raceResult && (
                <ResultsScreen
                    result={raceResult}
                    onRestart={restartRace}
                    onNewRace={returnToWelcome}
                />
            )}
        </div>
    );
}

export default App;
