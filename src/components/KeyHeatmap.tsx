import React from 'react';
import './KeyHeatmap.css';

interface KeyHeatmapProps {
    missedKeys: Record<string, number>;
}

const ROWS = [
    ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
    ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', ';', "'"],
    ['z', 'x', 'c', 'v', 'b', 'n', 'm', ',', '.', '/'],
];

const keyLabel = (k: string) => (k === ' ' ? 'SPACE' : k.toUpperCase());

const KeyHeatmap: React.FC<KeyHeatmapProps> = ({ missedKeys }) => {
    const entries = Object.entries(missedKeys).sort((a, b) => b[1] - a[1]);
    const max = entries.length ? entries[0][1] : 0;

    // Intensity 0..1 drives both the fill alpha and the glow via a CSS variable.
    const heat = (k: string) => (missedKeys[k] ? 0.25 + 0.75 * (missedKeys[k] / max) : 0);
    const renderKey = (k: string, extraClass = '') => {
        const h = heat(k);
        return (
            <div
                key={k}
                className={`heat-key${h ? ' missed' : ''}${extraClass}`}
                style={{ '--heat': h } as React.CSSProperties}
                title={missedKeys[k] ? `${keyLabel(k)}: missed ${missedKeys[k]}x` : undefined}
            >
                {k === ' ' ? '' : k.toUpperCase()}
            </div>
        );
    };

    return (
        <div className="key-heatmap">
            <div className="key-heatmap-header">
                <span className="key-heatmap-label">MISSED KEYS</span>
                {entries.length > 0 ? (
                    <span className="key-heatmap-top">
                        {entries.slice(0, 3).map(([k, n]) => (
                            <span key={k} className="top-key">{keyLabel(k)} <em>×{n}</em></span>
                        ))}
                    </span>
                ) : (
                    <span className="key-heatmap-clean">CLEAN RUN</span>
                )}
            </div>
            <div className="heat-board" aria-hidden="true">
                {ROWS.map((row, i) => (
                    <div key={i} className={`heat-row heat-row-${i}`}>
                        {row.map(k => renderKey(k))}
                    </div>
                ))}
                <div className="heat-row">{renderKey(' ', ' heat-space')}</div>
            </div>
        </div>
    );
};

export default KeyHeatmap;
