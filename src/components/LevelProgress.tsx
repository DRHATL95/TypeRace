import React, { useEffect, useState } from 'react';
import { levelFromXp } from '../utils/progression';
import './LevelProgress.css';

interface LevelProgressProps {
    /** Lifetime XP, including any `gained` this race. */
    xp: number;
    /** When set, the bar animates from xp - gained up to xp and shows the gain. */
    gained?: number;
}

const COUNT_DELAY_MS = 900;
const COUNT_MS = 1200;

const LevelProgress: React.FC<LevelProgressProps> = ({ xp, gained = 0 }) => {
    const startXp = xp - gained;
    const [shownXp, setShownXp] = useState(startXp);

    useEffect(() => {
        setShownXp(startXp);
        if (!gained) return;
        if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
            setShownXp(xp);
            return;
        }
        let frame = 0;
        let start = 0;
        const tick = (now: number) => {
            if (!start) start = now;
            const p = Math.min((now - start) / COUNT_MS, 1);
            const eased = 1 - Math.pow(1 - p, 3);
            setShownXp(startXp + gained * eased);
            if (p < 1) frame = requestAnimationFrame(tick);
        };
        const timer = setTimeout(() => { frame = requestAnimationFrame(tick); }, COUNT_DELAY_MS);
        return () => { clearTimeout(timer); cancelAnimationFrame(frame); };
    }, [xp, gained, startXp]);

    const { level, into, needed } = levelFromXp(shownXp);
    const leveledUp = gained > 0 && level > levelFromXp(startXp).level;

    return (
        <div className={`level-progress${gained ? ' with-gain' : ''}${leveledUp ? ' leveled-up' : ''}`}>
            <div className="level-badge" key={level}>
                <span className="level-badge-label">LVL</span>
                <span className="level-badge-num">{level}</span>
            </div>
            <div className="level-track-wrap">
                <div className="level-track-meta">
                    <span className="level-track-title">
                        {leveledUp ? 'LEVEL UP' : 'RACER LEVEL'}
                    </span>
                    <span className="level-track-xp">
                        {gained > 0 && <span className="level-gain">+{gained} XP</span>}
                        {Math.floor(into)} / {needed}
                    </span>
                </div>
                <div className="level-track" role="progressbar" aria-label={`Level ${level}`}
                    aria-valuemin={0} aria-valuemax={needed} aria-valuenow={Math.floor(into)}>
                    <div className="level-track-fill" style={{ width: `${(into / needed) * 100}%` }} />
                </div>
            </div>
        </div>
    );
};

export default LevelProgress;
