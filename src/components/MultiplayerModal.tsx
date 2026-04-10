import React, { useState } from 'react';
import { Difficulty } from '../types/GameTypes';
import { getPlayerName, setPlayerName } from '../utils/storage';
import { useAppAuth } from '../hooks/useAuthToken';
import type { RoomMode } from '../hooks/useMultiplayer';
import './MultiplayerModal.css';

interface MultiplayerModalProps {
  difficulty: Difficulty;
  onClose: () => void;
  onCreateRoom: (playerName: string, difficulty: Difficulty, mode: RoomMode) => void;
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
  const { isSignedIn, userName } = useAppAuth();
  const defaultName = (isSignedIn && userName) ? userName : getPlayerName() || '';
  const [name, setName] = useState(defaultName);
  const [roomCode, setRoomCode] = useState(initialRoomCode || '');
  const [view, setView] = useState<'choose' | 'join'>(initialRoomCode ? 'join' : 'choose');
  const [roomMode, setRoomMode] = useState<RoomMode>('casual');

  const handleCreate = () => {
    if (!name.trim()) return;
    setPlayerName(name.trim());
    onCreateRoom(name.trim(), difficulty, roomMode);
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
          <div className="mp-name-row">
            <input
              className="mp-input"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Enter your name"
              maxLength={16}
              autoFocus
            />
            {isSignedIn && (
              <span className="mp-auth-badge" title="Signed in — eligible for ranked play">&#x2713;</span>
            )}
          </div>
          {isSignedIn && (
            <span className="mp-auth-hint">Signed in — ranked play available</span>
          )}
          {!isSignedIn && (
            <span className="mp-guest-hint">Guest — sign in for ranked play</span>
          )}
        </div>

        {view === 'choose' && (
          <>
            <div className="mp-mode-picker">
              <label className="mp-label">MODE</label>
              <div className="mp-mode-buttons">
                <button
                  className={`mp-mode-btn${roomMode === 'casual' ? ' active' : ''}`}
                  onClick={() => setRoomMode('casual')}
                >
                  CASUAL
                </button>
                <button
                  className={`mp-mode-btn${roomMode === 'ranked' ? ' active' : ''}`}
                  onClick={() => setRoomMode('ranked')}
                  disabled={!isSignedIn}
                  title={!isSignedIn ? 'Sign in required' : 'Affects your rating'}
                >
                  RANKED
                </button>
              </div>
            </div>

            <div className="mp-actions">
              <button className="mp-btn mp-btn-create" onClick={handleCreate} disabled={!name.trim()}>
                CREATE ROOM
              </button>
              <button className="mp-btn mp-btn-join" onClick={() => setView('join')} disabled={!name.trim()}>
                JOIN ROOM
              </button>
            </div>
          </>
        )}

        {view === 'join' && (
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
              <button className="mp-btn mp-btn-join" onClick={() => setView('choose')}>
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
