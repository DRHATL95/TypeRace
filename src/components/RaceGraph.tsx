import React from 'react';
import { TimelinePoint } from '../utils/raceInsights';
import './RaceGraph.css';

interface RaceGraphProps {
    timeline: TimelinePoint[];
    errorTimes: number[];
}

const W = 520;
const H = 140;
const PAD = { top: 14, right: 12, bottom: 22, left: 34 };

const RaceGraph: React.FC<RaceGraphProps> = ({ timeline, errorTimes }) => {
    if (timeline.length < 2) return null;

    const duration = timeline[timeline.length - 1].t;
    const peak = Math.max(...timeline.map(p => p.wpm), 1);
    // Round the ceiling up to a multiple of 20 so the axis label reads cleanly.
    const yMax = Math.ceil(peak / 20) * 20;
    const x = (t: number) => PAD.left + (t / duration) * (W - PAD.left - PAD.right);
    const y = (wpm: number) => PAD.top + (1 - wpm / yMax) * (H - PAD.top - PAD.bottom);

    const line = timeline.map((p, i) => `${i ? 'L' : 'M'}${x(p.t).toFixed(1)},${y(p.wpm).toFixed(1)}`).join(' ');
    const baseline = H - PAD.bottom;
    const area = `${line} L${x(duration).toFixed(1)},${baseline} L${x(timeline[0].t).toFixed(1)},${baseline} Z`;
    const peakPoint = timeline.reduce((a, b) => (b.wpm > a.wpm ? b : a));

    return (
        <div className="race-graph">
            <div className="race-graph-header">
                <span className="race-graph-label">RACE REPLAY</span>
                <span className="race-graph-legend">
                    <span className="legend-line" /> WPM
                    <span className="legend-tick" /> ERROR
                </span>
            </div>
            <svg viewBox={`0 0 ${W} ${H}`} className="race-graph-svg" role="img"
                aria-label={`WPM over the race, peaking at ${peakPoint.wpm} WPM, with ${errorTimes.length} errors`}>
                <defs>
                    <linearGradient id="raceGraphFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--cyan)" stopOpacity="0.28" />
                        <stop offset="100%" stopColor="var(--cyan)" stopOpacity="0" />
                    </linearGradient>
                </defs>

                {[0, 0.5, 1].map(f => (
                    <g key={f}>
                        <line className="race-graph-grid" x1={PAD.left} x2={W - PAD.right} y1={y(yMax * f)} y2={y(yMax * f)} />
                        <text className="race-graph-axis" x={PAD.left - 8} y={y(yMax * f) + 3} textAnchor="end">
                            {Math.round(yMax * f)}
                        </text>
                    </g>
                ))}
                <text className="race-graph-axis" x={PAD.left} y={H - 6}>0s</text>
                <text className="race-graph-axis" x={W - PAD.right} y={H - 6} textAnchor="end">{duration.toFixed(1)}s</text>

                {errorTimes.map((t, i) => (
                    <line key={i} className="race-graph-error" x1={x(t)} x2={x(t)} y1={baseline - 10} y2={baseline} />
                ))}

                <path d={area} fill="url(#raceGraphFill)" className="race-graph-area" />
                <path d={line} className="race-graph-line" />
                <circle cx={x(peakPoint.t)} cy={y(peakPoint.wpm)} r="3.5" className="race-graph-peak" />
                <text x={x(peakPoint.t)} y={y(peakPoint.wpm) - 8} textAnchor="middle" className="race-graph-peak-label">
                    {peakPoint.wpm}
                </text>
            </svg>
        </div>
    );
};

export default RaceGraph;
