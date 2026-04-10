import React, { useState } from 'react';
import './Lobby.css';

interface PlayerInfo {
  name: string;
  color: string;
  isCreator: boolean;
}

interface LobbyProps {
  roomCode: string;
  players: PlayerInfo[];
  isCreator: boolean;
  onStart: () => void;
  onLeave: () => void;
  countdownSeconds?: number | null;
}

const Lobby: React.FC<LobbyProps> = ({ roomCode, players, isCreator, onStart, onLeave, countdownSeconds }) => {
  const [copied, setCopied] = useState(false);

  const handleCopyLink = () => {
    const url = `${window.location.origin}/join/${roomCode}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="lobby-screen">
      {countdownSeconds != null && countdownSeconds > 0 && (
        <div className="lobby-countdown-overlay">
          <div className="lobby-countdown-number">{countdownSeconds}</div>
          <div className="lobby-countdown-text">Race starting...</div>
        </div>
      )}

      <div className="lobby-content">
        <div className="lobby-label">ROOM CODE</div>
        <div className="lobby-code">{roomCode}</div>
        <button className="lobby-copy-link" onClick={handleCopyLink}>
          {copied ? 'COPIED!' : 'COPY INVITE LINK'}
        </button>

        <div className="lobby-players">
          <div className="lobby-players-label">PLAYERS ({players.length}/4)</div>
          {players.map(p => (
            <div key={p.name} className="lobby-player" style={{ borderLeftColor: p.color }}>
              <span style={{ color: p.color }}>{p.name}</span>
              {p.isCreator && <span className="lobby-creator-tag">HOST</span>}
            </div>
          ))}
        </div>

        <div className="lobby-actions">
          {countdownSeconds == null && isCreator && players.length >= 2 && (
            <button className="lobby-btn lobby-start" onClick={onStart}>
              START RACE
            </button>
          )}
          {countdownSeconds == null && isCreator && players.length < 2 && (
            <div className="lobby-waiting">Waiting for players...</div>
          )}
          {countdownSeconds == null && (
            <button className="lobby-btn lobby-leave" onClick={onLeave}>
              LEAVE
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default Lobby;
