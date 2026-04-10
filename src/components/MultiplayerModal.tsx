import React, { useState } from 'react';
import { Difficulty } from '../types/GameTypes';
import { getPlayerName, setPlayerName } from '../utils/storage';
import './MultiplayerModal.css';

interface MultiplayerModalProps {
  difficulty: Difficulty;
  onClose: () => void;
  onCreateRoom: (playerName: string, difficulty: Difficulty) => void;
  onJoinRoom: (playerName: string, roomCode: string) => void;
  initialRoomCode?: string;
}

const MultiplayerModal: React.FC<MultiplayerModalProps> = ({
  difficulty,
  onClose,
  onCreateRoom,
  onJoinRoom,
  initialRoomCode,
}) => {
  const [name, setName] = useState(getPlayerName() || '');
  const [roomCode, setRoomCode] = useState(initialRoomCode || '');
  const [mode, setMode] = useState<'choose' | 'join'>(initialRoomCode ? 'join' : 'choose');

  const handleCreate = () => {
    if (!name.trim()) return;
    setPlayerName(name.trim());
    onCreateRoom(name.trim(), difficulty);
  };

  const handleJoin = () => {
    if (!name.trim() || !roomCode.trim()) return;
    setPlayerName(name.trim());
    onJoinRoom(name.trim(), roomCode.trim());
  };

  return (
    <div className="mp-overlay" onClick={onClose}>
      <div className="mp-modal" onClick={e => e.stopPropagation()}>
        <div className="mp-header">
          <span className="mp-title">MULTIPLAYER</span>
          <button className="mp-close" onClick={onClose}>&times;</button>
        </div>

        <div className="mp-field">
          <label className="mp-label">DISPLAY NAME</label>
          <input
            className="mp-input"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Enter your name"
            maxLength={16}
            autoFocus
          />
        </div>

        {mode === 'choose' && (
          <div className="mp-actions">
            <button className="mp-btn mp-btn-create" onClick={handleCreate} disabled={!name.trim()}>
              CREATE ROOM
            </button>
            <button className="mp-btn mp-btn-join" onClick={() => setMode('join')} disabled={!name.trim()}>
              JOIN ROOM
            </button>
          </div>
        )}

        {mode === 'join' && (
          <>
            <div className="mp-field">
              <label className="mp-label">ROOM CODE</label>
              <input
                className="mp-input mp-input-code"
                value={roomCode}
                onChange={e => setRoomCode(e.target.value.toLowerCase())}
                placeholder="e.g. swift-falcon-42"
                maxLength={30}
              />
            </div>
            <div className="mp-actions">
              <button className="mp-btn mp-btn-create" onClick={handleJoin} disabled={!roomCode.trim()}>
                JOIN
              </button>
              <button className="mp-btn mp-btn-join" onClick={() => setMode('choose')}>
                BACK
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default MultiplayerModal;
