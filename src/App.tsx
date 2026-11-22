import React, { useState, useEffect, useCallback } from 'react';
import TypeRacer from './components/TypeRacer';
import WelcomeScreen from './components/WelcomeScreen';
import ResultsScreen from './components/ResultsScreen';
import MultiplayerModal from './components/MultiplayerModal';
import Lobby from './components/Lobby';
import { GameState, RaceResult, Difficulty, PassageCategory, TextPassage } from './types/GameTypes';
import { getRandomPassage } from './data/textPassages';
import { fetchRandomPassage, submitRaceResult, fetchDaily } from './utils/api';
import { RaceInsights } from './utils/raceInsights';
import { useMultiplayer, RoomMode } from './hooks/useMultiplayer';
import { useAppAuth } from './hooks/useAuthToken';
import { stopMenuMusic } from './utils/menuMusic';
import {
    getBests, updateBest, getHistory, addHistoryEntry,
    getDailyStreak, incrementDailyStreak,
    getDifficulty, setDifficulty,
    getCategory, setCategory,
    isGhostEnabled, setGhostEnabled,
    getPlayerName, getTodaysBest,
    pruneImplausibleBests, getGuestId,
    getXp, addXp,
} from './utils/storage';
import { xpForRace } from './utils/progression';

// One-shot cleanup on app load: drop any locally-cached PB that fails the
// modern plausibility floor (e.g. legacy cheat-test rows like 427 WPM @ 6%).
// Runs at module-import time so the first getBests() call below already sees
// the cleaned value — no extra render, no flicker.
pruneImplausibleBests();

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
    const [raceInsights, setRaceInsights] = useState<RaceInsights | null>(null);
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
    const [joinCode, setJoinCode] = useState<string | null>(null);
    const [todaysBest, setTodaysBest] = useState(getTodaysBest());
    const [xp, setXp] = useState(getXp());
    const [xpGained, setXpGained] = useState(0);
    // Daily Challenge mode: set by the welcome card, kept by RETRY, cleared by
    // anything that swaps the passage. dailyRank is filled in after submit.
    const [isDaily, setIsDaily] = useState(false);
    const [dailyRank, setDailyRank] = useState<{ rank: number; total: number } | null>(null);

    // Detect /join/:code URL on mount
    useEffect(() => {
        const match = window.location.pathname.match(/^\/join\/(.+)$/);
        if (match) {
            setJoinCode(match[1]);
            setShowMPModal(true);
            // Clean URL without reload
            window.history.replaceState(null, '', '/');
        }
    }, []);

    const mp = useMultiplayer();
    const { getToken: getAuthToken, userName, isSignedIn } = useAppAuth();

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
            setIsDaily(false);
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

    // Refresh today's best when returning to welcome screen. Leaderboard
    // state now lives inside WelcomeScreen itself (it owns the category tab
    // that drives the fetches), so we only need to refresh local stats here.
    useEffect(() => {
        if (gameState === 'welcome') {
            setTodaysBest(getTodaysBest());
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
        setIsDaily(false);
        setRaceResult(null);
        setIsNewBest(false);
        setGameState('racing');
    }, [difficulty, category, getPassage]);

    const startDaily = useCallback((dailyPassage: TextPassage) => {
        stopMenuMusic();
        setPassage(dailyPassage);
        setIsDaily(true);
        setDailyRank(null);
        setRaceResult(null);
        setIsNewBest(false);
        setGameState('racing');
    }, []);

    const handleRaceComplete = useCallback((result: RaceResult, fireStreak: number, insights: RaceInsights) => {
        setRaceResult(result);
        setRaceInsights(insights);
        setLastFireStreak(fireStreak);

        const gained = xpForRace(result.charactersTyped - result.errors, result.accuracy, passage.difficulty);
        setXp(addXp(gained));
        setXpGained(gained);

        if (mp.state === 'racing') {
            mp.sendFinished(result);
        }

        // Use the raced passage's own difficulty/category, not the picker's:
        // multiplayer rooms pick a random category and the creator's
        // difficulty, and the daily passage has its own. For solo races the
        // passage was fetched for the picker values, so nothing changes there.
        const raceDifficulty = passage.difficulty;
        const raceCategory = passage.category;

        const newBest = updateBest(raceDifficulty, result.wpm, result.accuracy);
        setIsNewBest(newBest);
        setBests(getBests());

        addHistoryEntry({
            wpm: result.wpm,
            accuracy: result.accuracy,
            difficulty: raceDifficulty,
            passageTitle: passage.title,
            timestamp: Date.now(),
            fireStreak,
        });
        setTotalRaces(prev => prev + 1);

        // Submit to server leaderboard (fire-and-forget). Name resolution
        // priority: Clerk username (when signed in) → stored custom name →
        // guest-ID slug. This ensures signed-in users show up on leaderboards
        // as their Clerk identity rather than the anonymous device slug.
        const guestId = getGuestId();
        const playerName = (isSignedIn && userName) ? userName : (getPlayerName() || guestId);
        setDailyRank(null);
        getAuthToken().then(async token => {
            await submitRaceResult({
                playerName,
                wpm: result.wpm,
                accuracy: result.accuracy,
                fireStreak: fireStreak,
                difficulty: raceDifficulty,
                category: raceCategory,
                guestId,
                ...(isDaily ? { daily: true, passageId: passage.id } : {}),
            }, token);
            if (isDaily) {
                const d = await fetchDaily(guestId, token);
                if (d?.me) setDailyRank({ rank: d.me.rank, total: d.total });
            }
        });

        setSessionStreak(prev => prev + 1);
        const updatedStreak = incrementDailyStreak();
        setDailyStreak(updatedStreak);

        if (mp.state !== 'racing') {
            setGameState('results');
        }
    }, [passage, isDaily, mp, getAuthToken, userName, isSignedIn]);

    const restartRace = useCallback(async () => {
        if (mp.state !== 'disconnected') {
            mp.requestRematch();
            return;
        }
        setRaceResult(null);
        setIsNewBest(false);
        const newPassage = await getPassage(difficulty, category);
        setPassage(newPassage);
        setIsDaily(false);
        setGameState('racing');
    }, [difficulty, category, mp, getPassage]);

    const retryPassage = useCallback(() => {
        setRaceResult(null);
        setIsNewBest(false);
        // New object reference forces TypeRacer's reset effect to re-run
        setPassage(prev => ({ ...prev }));
        setGameState('racing');
    }, []);

    const returnToWelcome = useCallback(() => {
        if (mp.state !== 'disconnected') {
            mp.leave();
        }
        setGameState('welcome');
        setIsDaily(false);
        setRaceResult(null);
        setIsNewBest(false);
        setShowMPModal(false);
    }, [mp]);

    const handleNewText = useCallback(async () => {
        const newPassage = await getPassage(difficulty, category);
        setPassage(newPassage);
        setIsDaily(false);
    }, [difficulty, category, getPassage]);

    const handleStartMultiplayer = useCallback(() => {
        setShowMPModal(true);
    }, []);

    const handleCreateRoom = useCallback(async (playerName: string, diff: Difficulty, mode: RoomMode) => {
        const token = await getAuthToken();
        mp.createRoom(playerName, diff, token, mode);
        setShowMPModal(false);
    }, [mp, getAuthToken]);

    const handleJoinRoom = useCallback(async (playerName: string, roomCode: string) => {
        const token = await getAuthToken();
        mp.joinRoom(playerName, roomCode, token);
        setShowMPModal(false);
    }, [mp, getAuthToken]);

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
                    onStartDaily={startDaily}
                    onStartMultiplayer={handleStartMultiplayer}
                    difficulty={difficulty}
                    onDifficultyChange={handleDifficultyChange}
                    bests={bests}
                    dailyStreak={dailyStreak}
                    totalRaces={totalRaces}
                    xp={xp}
                    ghostEnabled={ghostEnabled}
                    onGhostToggle={handleGhostToggle}
                    category={category}
                    onCategoryChange={handleCategoryChange}
                    todaysBest={todaysBest ? { wpm: todaysBest.wpm, accuracy: todaysBest.accuracy, fireStreak: todaysBest.fireStreak } : null}
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
                    mode={mp.roomMode}
                />
            )}

            {gameState === 'racing' && (
                <TypeRacer
                    passage={passage}
                    ghostEnabled={ghostEnabled && mp.state === 'disconnected'}
                    ghostPaceWpm={bests[passage.difficulty]?.wpm ?? null}
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
                    insights={raceInsights}
                    xp={xp}
                    xpGained={xpGained}
                    daily={isDaily ? { rank: dailyRank } : undefined}
                    isNewBest={isNewBest}
                    fireStreak={lastFireStreak}
                    onRestart={restartRace}
                    onNewRace={returnToWelcome}
                    onRetryPassage={mp.state === 'disconnected' ? retryPassage : undefined}
                    podium={mp.state === 'finished' ? mp.raceResults : undefined}
                    onLeaveRoom={mp.state === 'finished' ? () => { mp.leave(); returnToWelcome(); } : undefined}
                    rematchVoters={mp.state === 'finished' ? mp.rematchVoters : undefined}
                    rematchSecondsLeft={mp.state === 'finished' ? mp.rematchSecondsLeft : undefined}
                    difficulty={difficulty}
                    category={mp.state === 'disconnected' ? category : undefined}
                    onCategoryChange={mp.state === 'disconnected' ? handleCategoryChange : undefined}
                />
            )}

            {showMPModal && (
                <MultiplayerModal
                    difficulty={difficulty}
                    onClose={() => { setShowMPModal(false); setJoinCode(null); }}
                    onCreateRoom={handleCreateRoom}
                    onJoinRoom={handleJoinRoom}
                    initialRoomCode={joinCode || undefined}
                />
            )}
        </div>
    );
}

export default App;
