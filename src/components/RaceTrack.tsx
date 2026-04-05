import React from 'react';
import './RaceTrack.css';

interface PlayerProgress {
  name: string;
  color: string;
  currentIndex: number;
  totalLength: number;
  wpm: number;
  finished: boolean;
}

interface RaceTrackProps {
  players: PlayerProgress[];
}

const RaceTrack: React.FC<RaceTrackProps> = ({ players }) => {
  if (players.length === 0) return null;

  return (
    <div className="race-track">
      {players.map(player => {
        const percent = Math.round((player.currentIndex / player.totalLength) * 100);
        return (
          <div key={player.name} className="track-row">
            <span className="track-name" style={{ color: player.color }}>
              {player.name}
            </span>
            <div className="track-bar">
              <div
                className="track-fill"
                style={{
                  width: `${percent}%`,
                  background: `linear-gradient(90deg, ${player.color}, ${player.color}88)`,
                  boxShadow: `0 0 8px ${player.color}44`,
                }}
              />
            </div>
            <span className="track-wpm" style={{ color: player.color }}>
              {player.finished ? `${player.wpm} wpm` : `${player.wpm}`}
            </span>
          </div>
        );
      })}
    </div>
  );
};

export default RaceTrack;
