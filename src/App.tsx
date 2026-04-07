import React, { useState, useEffect, useCallback } from 'react';
import TypeRacer from './components/TypeRacer';
import WelcomeScreen from './components/WelcomeScreen';
import ResultsScreen from './components/ResultsScreen';
import MultiplayerModal from './components/MultiplayerModal';
import Lobby from './components/Lobby';
import RaceTrack from './components/RaceTrack';
import { GameState, RaceResult, Difficulty, PassageCategory, TextPassage } from './types/GameTypes';
import { getRandomPassage } from './data/textPassages';
import { fetchRandomPassage, submitRaceResult, fetchTodayLeaderboard, TodayLeaderboard } from './utils/api';
import { useMultiplayer } from './hooks/useMultiplayer';
import { stopMenuMusic } from './utils/menuMusic';
import {
    getBests, updateBest, getHistory, addHistoryEntry,
    getDailyStreak, incrementDailyStreak,
    getDifficulty, setDifficulty,
    getCategory, setCategory,
    isGhostEnabled, setGhostEnabled,
    getPlayerName, getTodaysBest,
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
    const [category, setCategoryState] = useState<PassageCategory>(getCategory());
    const [passage, setPassage] = useState<TextPassage>(getRandomPassage(getDifficulty(), getCategory()));
    const [ghostEnabled, setGhostEnabledState] = useState(isGhostEnabled());
    const [sessionStreak, setSessionStreak] = useState(0);
    const [isNewBest, setIsNewBest] = useState(false);
    const [lastFireStreak, setLastFireStreak] = useState(0);
    const [bests, setBests] = useState(getBests());
    const [dailyStreak, setDailyStreak] = useState(getDailyStreak());
    const [totalRaces, setTotalRaces] = useState(getHistory().length);
    const [showMPModal, setShowMPModal] = useState(false);
    const [todaysBest, setTodaysBest] = useState(getTodaysBest());
    const [leaderboard, setLeaderboard] = useState<TodayLeaderboard | null>(null);

    const mp = useMultiplayer();

    useEffect(() => {
        if (window.electronAPI) {
            window.electronAPI.onNewRace(() => returnToWelcome());
            window.electronAPI.onRestartRace(() => startRace());
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
            if (event.key === 'Enter' && gameState === 'welcome' && mp.state === 'disconnected') {
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
    }, [gameState, difficulty, mp.state]);

    // When multiplayer race starts, switch to racing state with the server's passage
    useEffect(() => {
        if (mp.state === 'racing' && mp.passage) {
            stopMenuMusic();
            setPassage(mp.passage);
            setRaceResult(null);
            setIsNewBest(false);
            setGameState('racing');
        }
    }, [mp.state, mp.passage]);

    // When multiplayer race ends, show results
    useEffect(() => {
        if (mp.state === 'finished' && raceResult) {
            setGameState('results');
        }
    }, [mp.state, raceResult]);

    // Refresh today's best and leaderboard when returning to welcome screen
    useEffect(() => {
        if (gameState === 'welcome') {
            setTodaysBest(getTodaysBest());
            fetchTodayLeaderboard().then(lb => setLeaderboard(lb));
        }
    }, [gameState]);

    const handleDifficultyChange = useCallback((d: Difficulty) => {
        setDifficultyState(d);
        setDifficulty(d);
    }, []);

    const handleCategoryChange = useCallback((c: PassageCategory) => {
        setCategoryState(c);
        setCategory(c);
    }, []);

    const handleGhostToggle = useCallback(() => {
        setGhostEnabledState(prev => {
            const next = !prev;
            setGhostEnabled(next);
            return next;
        });
    }, []);

    // Try API first, fall back to local data
    const getPassage = useCallback(async (diff: Difficulty, cat: PassageCategory): Promise<TextPassage> => {
        const fromApi = await fetchRandomPassage(diff, cat);
        return fromApi || getRandomPassage(diff, cat);
    }, []);

    const startRace = useCallback(async () => {
        stopMenuMusic();
        const newPassage = await getPassage(difficulty, category);
        setPassage(newPassage);
        setRaceResult(null);
        setIsNewBest(false);
        setGameState('racing');
    }, [difficulty, category, getPassage]);

    const handleRaceComplete = useCallback((result: RaceResult, fireStreak: number) => {
        setRaceResult(result);
        setLastFireStreak(fireStreak);

        if (mp.state === 'racing') {
            mp.sendFinished(result);
        }

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

        // Submit to server leaderboard (fire-and-forget)
        const playerName = getPlayerName();
        if (playerName) {
            submitRaceResult({
                playerName,
                wpm: result.wpm,
                accuracy: result.accuracy,
                fireStreak: fireStreak,
                difficulty,
                category,
            });
        }

        setSessionStreak(prev => prev + 1);
        const updatedStreak = incrementDailyStreak();
        setDailyStreak(updatedStreak);

        if (mp.state !== 'racing') {
            setGameState('results');
        }
    }, [difficulty, passage, mp]);

    const restartRace = useCallback(async () => {
        if (mp.state !== 'disconnected') {
            mp.requestRematch();
            return;
        }
        setRaceResult(null);
        setIsNewBest(false);
        const newPassage = await getPassage(difficulty, category);
        setPassage(newPassage);
        setGameState('racing');
    }, [difficulty, category, mp, getPassage]);

    const returnToWelcome = useCallback(() => {
        if (mp.state !== 'disconnected') {
            mp.leave();
        }
        setGameState('welcome');
        setRaceResult(null);
        setIsNewBest(false);
        setShowMPModal(false);
    }, [mp]);

    const handleNewText = useCallback(async () => {
        const newPassage = await getPassage(difficulty, category);
        setPassage(newPassage);
    }, [difficulty, category, getPassage]);

    const handleStartMultiplayer = useCallback(() => {
        setShowMPModal(true);
    }, []);

    const handleCreateRoom = useCallback((playerName: string, diff: Difficulty) => {
        mp.createRoom(playerName, diff);
        setShowMPModal(false);
    }, [mp]);

    const handleJoinRoom = useCallback((playerName: string, roomCode: string) => {
        mp.joinRoom(playerName, roomCode);
        setShowMPModal(false);
    }, [mp]);

    const handleProgress = useCallback((currentIndex: number, errors: number, wpm: number) => {
        if (mp.state === 'racing') {
            mp.sendProgress(currentIndex, errors, wpm);
        }
    }, [mp]);

    // Determine what to render
    const isInMultiplayerLobby = mp.state === 'lobby';
    const isShowingMPCountdown = mp.state === 'countdown';
    const isMultiplayerRacing = mp.state === 'racing' && gameState === 'racing';

    return (
        <div className="app">
            {gameState === 'welcome' && !isInMultiplayerLobby && (
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
                    category={category}
                    onCategoryChange={handleCategoryChange}
                    todaysBest={todaysBest ? { wpm: todaysBest.wpm, accuracy: todaysBest.accuracy, fireStreak: todaysBest.fireStreak } : null}
                    leaderboard={leaderboard}
                />
            )}

            {(isInMultiplayerLobby || isShowingMPCountdown) && mp.roomCode && (
                <Lobby
                    roomCode={mp.roomCode}
                    players={mp.players}
                    isCreator={mp.isCreator}
                    onStart={mp.startRace}
                    onLeave={() => { mp.leave(); setGameState('welcome'); }}
                    countdownSeconds={isShowingMPCountdown ? mp.countdownSeconds : null}
                />
            )}

            {gameState === 'racing' && (
                <TypeRacer
                    passage={passage}
                    ghostEnabled={ghostEnabled && mp.state === 'disconnected'}
                    sessionStreak={sessionStreak}
                    onRaceComplete={handleRaceComplete}
                    onNewText={handleNewText}
                    onHome={returnToWelcome}
                    multiplayerPlayers={isMultiplayerRacing ? mp.playerProgress : undefined}
                    onProgress={isMultiplayerRacing ? handleProgress : undefined}
                    autoStart={isMultiplayerRacing}
                />
            )}

            {gameState === 'results' && raceResult && (
                <ResultsScreen
                    result={raceResult}
                    isNewBest={isNewBest}
                    fireStreak={lastFireStreak}
                    onRestart={restartRace}
                    onNewRace={returnToWelcome}
                    podium={mp.state === 'finished' ? mp.raceResults : undefined}
                    onLeaveRoom={mp.state === 'finished' ? () => { mp.leave(); returnToWelcome(); } : undefined}
                    rematchVoters={mp.state === 'finished' ? mp.rematchVoters : undefined}
                    rematchSecondsLeft={mp.state === 'finished' ? mp.rematchSecondsLeft : undefined}
                />
            )}

            {showMPModal && (
                <MultiplayerModal
                    difficulty={difficulty}
                    onClose={() => setShowMPModal(false)}
                    onCreateRoom={handleCreateRoom}
                    onJoinRoom={handleJoinRoom}
                />
            )}
        </div>
    );
}

export default App;
