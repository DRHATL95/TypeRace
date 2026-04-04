import React from 'react';
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
}

const Lobby: React.FC<LobbyProps> = ({ roomCode, players, isCreator, onStart, onLeave }) => {
  return (
    <div className="lobby-screen">
      <div className="lobby-content">
        <div className="lobby-label">ROOM CODE</div>
        <div className="lobby-code">{roomCode}</div>
        <div className="lobby-hint">Share this code with friends</div>

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
          {isCreator && players.length >= 2 && (
            <button className="lobby-btn lobby-start" onClick={onStart}>
              START RACE
            </button>
          )}
          {isCreator && players.length < 2 && (
            <div className="lobby-waiting">Waiting for players...</div>
          )}
          <button className="lobby-btn lobby-leave" onClick={onLeave}>
            LEAVE
          </button>
        </div>
      </div>
    </div>
  );
};

export default Lobby;
