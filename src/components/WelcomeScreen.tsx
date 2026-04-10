import React, { useEffect, useState } from 'react';
import { SignInButton, UserButton } from '@clerk/clerk-react';
import { useAppAuth } from '../hooks/useAuthToken';
import { Difficulty, PassageCategory, PersonalBests, DailyStreak } from '../types/GameTypes';
import {
    TodayLeaderboard,
    MonthlyLeaderboardEntry,
    TodayRank,
    fetchTodayLeaderboard,
    fetchMonthlyLeaderboard,
    fetchTodayRank,
} from '../utils/api';
import { startMenuMusic, stopMenuMusic } from '../utils/menuMusic';
import { getMuted, toggleMute, getVolumeLevel, setVolumeLevel } from '../utils/audioEngine';
import { getPlayerName, getGuestId } from '../utils/storage';
import NameEditModal from './NameEditModal';
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
}) => {
    const { isSignedIn, userName, getToken } = useAppAuth();
    const clerkAvailable = !!process.env.REACT_APP_CLERK_PUBLISHABLE_KEY;
    const [muted, setMutedState] = useState(getMuted());
    const [volume, setVolumeState] = useState(getVolumeLevel());
    // Identity state. `identityTick` is a render-nudger: NameEditModal writes
    // to localStorage imperatively (via setPlayerName), so we bump this counter
    // after a save to pull the fresh value out of storage on the next render
    // without needing a global store or a prop drill from App.
    const [showNameModal, setShowNameModal] = useState(false);
    const [identityTick, setIdentityTick] = useState(0);
    const guestDisplayName = getPlayerName() || getGuestId();
    // Reference identityTick so ESLint doesn't flag it as unused — it's read
    // implicitly because getPlayerName()/getGuestId() run on every render and
    // identityTick only exists to cause that re-render after a save.
    void identityTick;

    // Tap-to-expand state for each leaderboard. Namespaced by board id
    // (`today-wpm` / `today-streak` / `monthly`) so expanding a row on one
    // board doesn't collapse a row on another. Value is the row index, or
    // null for "nothing expanded". Collapsing on re-tap is the expected
    // toggle behavior.
    const [expanded, setExpanded] = useState<Record<string, number | null>>({});
    const toggleExpanded = (boardId: string, i: number) => {
        setExpanded(prev => ({ ...prev, [boardId]: prev[boardId] === i ? null : i }));
    };

    // Leaderboard state lives here (not App) because the category tab below
    // drives refetches and it would be awkward prop-drill gymnastics to keep
    // it in App. `lbCategory === undefined` means "ALL" — matches the server
    // contract where an omitted `?category=` param returns every row.
    const [lbCategory, setLbCategory] = useState<PassageCategory | undefined>(undefined);
    const [leaderboard, setLeaderboard] = useState<TodayLeaderboard | null>(null);
    const [monthlyLeaderboard, setMonthlyLeaderboard] = useState<MonthlyLeaderboardEntry[]>([]);
    const [todayRank, setTodayRank] = useState<TodayRank | null>(null);

    useEffect(() => {
        startMenuMusic();
        return () => { stopMenuMusic(); };
    }, []);

    // Refetch whenever the selected category tab changes. Both fetchers are
    // fire-and-forget — failures just leave the previous board visible, which
    // is less jarring than a momentary "unavailable" flash on network blip.
    useEffect(() => {
        let cancelled = false;
        fetchTodayLeaderboard(lbCategory).then(lb => {
            if (!cancelled) setLeaderboard(lb);
        });
        fetchMonthlyLeaderboard(lbCategory).then(ml => {
            if (!cancelled) setMonthlyLeaderboard(ml);
        });
        // Personal rank fetch — identity resolution happens server-side: a
        // fresh Clerk token wins, else the guest_id slug identifies the user.
        // We pass both: the server prefers the token when present, so there's
        // no harm in sending the guest_id as a fallback for unauthed sessions
        // or token-fetch failures.
        (async () => {
            const token = isSignedIn ? await getToken() : null;
            const rank = await fetchTodayRank(getGuestId(), lbCategory, token);
            if (!cancelled) setTodayRank(rank);
        })();
        return () => { cancelled = true; };
    }, [lbCategory, isSignedIn, getToken]);

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

    // Render a single tap-to-expand leaderboard row. Extracted so the three
    // boards (today-wpm, today-streak, monthly) stay in lockstep visually and
    // behaviorally. `extraStat` lets each board surface its secondary metric:
    // the daily boards show WPM, the monthly board shows race count.
    type LbRow = {
        player_name: string;
        wpm: number;
        accuracy: number;
        fire_streak: number;
        difficulty: Difficulty;
        category: PassageCategory;
        is_authed: boolean;
    };
    const CATEGORY_LABELS: Record<PassageCategory, string> = {
        'sentences':    'SENTENCES',
        'pop-culture':  'POP CULTURE',
        'random-words': 'RANDOM WORDS',
    };
    const renderLbEntry = (
        boardId: string,
        entry: LbRow,
        i: number,
        extraStat: React.ReactNode,
    ) => {
        const isExpanded = expanded[boardId] === i;
        return (
            <div
                key={i}
                className={`lb-entry${i === 0 ? ' lb-champion' : ''}${isExpanded ? ' lb-expanded' : ''}`}
                role="button"
                tabIndex={0}
                aria-expanded={isExpanded}
                onClick={() => toggleExpanded(boardId, i)}
                onKeyDown={e => {
                    if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        toggleExpanded(boardId, i);
                    }
                }}
            >
                <div className="lb-row">
                    <span className="lb-rank">#{i + 1}</span>
                    <span
                        className={`lb-id-dot${entry.is_authed ? ' authed' : ''}`}
                        title={entry.is_authed ? 'Verified racer' : 'Guest racer'}
                        aria-hidden
                    />
                    <span className="lb-name">{entry.player_name}</span>
                    {extraStat}
                </div>
                {isExpanded && (
                    <div className="lb-details">
                        <span className={`lb-badge diff-${entry.difficulty}`}>
                            {entry.difficulty.toUpperCase()}
                        </span>
                        <span className="lb-badge cat">
                            {CATEGORY_LABELS[entry.category] || entry.category}
                        </span>
                        <span className="lb-stat">{entry.accuracy}% acc</span>
                        {entry.fire_streak > 0 && (
                            <span className="lb-stat">{entry.fire_streak} streak</span>
                        )}
                    </div>
                )}
            </div>
        );
    };

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

                {/* Guest identity pill: only shown when NOT signed in. Authed
                    users already see their Clerk name above, and their rows
                    are identified by user_id server-side — a guest-name
                    editor for them would imply a capability that doesn't
                    exist. */}
                {!isSignedIn && (
                    <button
                        type="button"
                        className="identity-pill"
                        onClick={() => setShowNameModal(true)}
                        title="Click to change your racing name"
                    >
                        <span className="id-label">RACING AS</span>
                        <span className="id-name">{guestDisplayName}</span>
                        <span className="id-edit" aria-hidden>&#9998;</span>
                    </button>
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

                <div className="lb-tabs" role="tablist" aria-label="Leaderboard category filter">
                    {([
                        { value: undefined, label: 'ALL' },
                        { value: 'sentences' as const, label: 'SENTENCES' },
                        { value: 'pop-culture' as const, label: 'POP CULTURE' },
                        { value: 'random-words' as const, label: 'RANDOM WORDS' },
                    ]).map(tab => {
                        const active = lbCategory === tab.value;
                        return (
                            <button
                                key={tab.label}
                                type="button"
                                role="tab"
                                aria-selected={active}
                                className={`lb-tab${active ? ' active' : ''}`}
                                onClick={() => setLbCategory(tab.value)}
                            >
                                {tab.label}
                            </button>
                        );
                    })}
                </div>

                {todayRank && (
                    <div
                        className={`rank-callout${todayRank.rank === 1 ? ' rank-top' : ''}`}
                        aria-live="polite"
                    >
                        <span className="rank-label">YOU ARE</span>
                        <span className="rank-value">#{todayRank.rank}</span>
                        <span className="rank-of">OF {todayRank.total}</span>
                        <span className="rank-divider" aria-hidden />
                        <span className="rank-wpm">{todayRank.wpm} WPM</span>
                    </div>
                )}

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
                                    {leaderboard.topWpm.map((entry, i) =>
                                        renderLbEntry(
                                            'today-wpm',
                                            entry,
                                            i,
                                            <span className="lb-wpm">{entry.wpm}</span>,
                                        ),
                                    )}
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
                            {monthlyLeaderboard.slice(0, 10).map((entry, i) =>
                                renderLbEntry(
                                    'monthly',
                                    entry,
                                    i,
                                    <>
                                        <span className="lb-wpm">{entry.wpm}</span>
                                        <span className="lb-races">
                                            {entry.race_count} race{entry.race_count !== 1 ? 's' : ''}
                                        </span>
                                    </>,
                                ),
                            )}
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

            {showNameModal && (
                <NameEditModal
                    onClose={() => setShowNameModal(false)}
                    onSaved={() => setIdentityTick(t => t + 1)}
                />
            )}
        </div>
    );
};

export default WelcomeScreen;
