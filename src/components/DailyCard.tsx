import React, { useEffect, useState } from 'react';
import { TextPassage } from '../types/GameTypes';
import { DailyChallenge, fetchDaily } from '../utils/api';
import { getGuestId } from '../utils/storage';
import { useAppAuth } from '../hooks/useAuthToken';
import './DailyCard.css';

interface DailyCardProps {
    onPlay: (passage: TextPassage) => void;
}

const formatDate = (iso: string) =>
    // Noon UTC so the label can't slip a day in timezones west of UTC.
    new Date(`${iso}T12:00:00Z`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }).toUpperCase();

/** Welcome-screen card for today's shared passage. Renders nothing until the
 *  server answers, and nothing at all when it can't be reached. */
const DailyCard: React.FC<DailyCardProps> = ({ onPlay }) => {
    const { isSignedIn, getToken } = useAppAuth();
    const [daily, setDaily] = useState<DailyChallenge | null>(null);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            const token = isSignedIn ? await getToken() : null;
            const d = await fetchDaily(getGuestId(), token);
            if (!cancelled) setDaily(d);
        })();
        return () => { cancelled = true; };
    }, [isSignedIn, getToken]);

    if (!daily) return null;
    const { passage, top, me, total } = daily;

    return (
        <section className="daily-card" aria-label="Daily challenge">
            <div className="daily-head">
                <span className="daily-label">DAILY CHALLENGE</span>
                <span className="daily-date">{formatDate(daily.date)}</span>
            </div>

            <div className="daily-passage">
                <span className="daily-title">{passage.title}</span>
                <span className="daily-tags">
                    <span className={`daily-tag diff-${passage.difficulty}`}>{passage.difficulty}</span>
                    <span className="daily-tag">{passage.category.replace('-', ' ')}</span>
                </span>
            </div>

            <div className="daily-body">
                <ol className="daily-top">
                    {top.slice(0, 3).map(e => (
                        <li key={`${e.rank}-${e.player_name}`} className={e.rank === 1 ? 'daily-first' : undefined}>
                            <span className="daily-rank">#{e.rank}</span>
                            <span className="daily-name">{e.player_name}</span>
                            <span className="daily-wpm">{e.wpm}</span>
                        </li>
                    ))}
                    {top.length === 0 && <li className="daily-empty">No runs yet. Set the pace.</li>}
                </ol>

                <div className="daily-side">
                    <div className="daily-me">
                        {me ? (
                            <>
                                <span className="daily-me-rank">#{me.rank}<small>/{total}</small></span>
                                <span className="daily-me-label">YOUR BEST {me.wpm} WPM</span>
                            </>
                        ) : (
                            <span className="daily-me-label">NOT RACED TODAY</span>
                        )}
                    </div>
                    <button type="button" className="daily-play" onClick={() => onPlay(passage)}>
                        {me ? 'RACE AGAIN' : 'RACE DAILY'}
                    </button>
                </div>
            </div>
        </section>
    );
};

export default DailyCard;
