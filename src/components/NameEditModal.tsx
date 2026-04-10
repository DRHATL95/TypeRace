import React, { useState } from 'react';
import { getPlayerName, setPlayerName, getGuestId, setGuestId, isValidGuestId } from '../utils/storage';
// Reuses the .mp-* styles from MultiplayerModal.css — both modals share the
// same visual language (overlay + centered card + mono field labels), so
// duplicating the CSS would just drift over time. Additional .sync-* styles
// live in NameEditModal.css for the device-sync section (scoped enough that
// it isn't worth folding them into MultiplayerModal.css).
import './MultiplayerModal.css';
import './NameEditModal.css';

interface NameEditModalProps {
  onClose: () => void;
  /** Called after a successful save so the parent can refresh its display. */
  onSaved: () => void;
}

type SyncStatus =
  | { kind: 'idle' }
  | { kind: 'copied' }
  | { kind: 'imported' }
  | { kind: 'error'; message: string };

const NameEditModal: React.FC<NameEditModalProps> = ({ onClose, onSaved }) => {
  const [guestId, setGuestIdState] = useState<string>(getGuestId());
  const [name, setName] = useState<string>(getPlayerName());
  const [importInput, setImportInput] = useState<string>('');
  const [syncStatus, setSyncStatus] = useState<SyncStatus>({ kind: 'idle' });

  const handleSave = () => {
    // Empty input = "clear the custom name and fall back to the guest slug".
    // We store the trimmed value (or empty string) so the fallback chain
    // `getPlayerName() || getGuestId()` resolves correctly on the next read.
    setPlayerName(name.trim());
    onSaved();
    onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') handleSave();
    if (e.key === 'Escape') onClose();
  };

  const handleCopyGuestId = async () => {
    try {
      await navigator.clipboard.writeText(guestId);
      setSyncStatus({ kind: 'copied' });
      setTimeout(() => setSyncStatus({ kind: 'idle' }), 2000);
    } catch {
      setSyncStatus({ kind: 'error', message: 'Clipboard not available' });
      setTimeout(() => setSyncStatus({ kind: 'idle' }), 2500);
    }
  };

  const handleImport = () => {
    // Normalize to lowercase so users can paste "Amber-Otter-4271" from an
    // email or SMS and it still matches the server-side regex. Trim surrounding
    // whitespace too — clipboard copies sometimes carry a trailing newline.
    const candidate = importInput.trim().toLowerCase();
    if (!candidate) {
      setSyncStatus({ kind: 'error', message: 'Paste a racing ID first' });
      return;
    }
    if (!isValidGuestId(candidate)) {
      setSyncStatus({ kind: 'error', message: 'Invalid racing ID format' });
      return;
    }
    if (candidate === guestId) {
      setSyncStatus({ kind: 'error', message: 'Already using this ID' });
      return;
    }
    if (!setGuestId(candidate)) {
      setSyncStatus({ kind: 'error', message: 'Could not save — try again' });
      return;
    }
    setGuestIdState(candidate);
    setImportInput('');
    setSyncStatus({ kind: 'imported' });
    onSaved(); // Parent re-reads identity so the pill updates immediately.
    setTimeout(() => setSyncStatus({ kind: 'idle' }), 2500);
  };

  return (
    <div className="mp-overlay" onClick={onClose}>
      <div className="mp-modal" onClick={e => e.stopPropagation()}>
        <div className="mp-header">
          <span className="mp-title">IDENTITY</span>
          <button className="mp-close" onClick={onClose}>&times;</button>
        </div>

        <div className="mp-field">
          <label className="mp-label">DISPLAY NAME</label>
          <input
            className="mp-input"
            value={name}
            onChange={e => setName(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={guestId}
            maxLength={16}
            autoFocus
          />
          <span className="mp-guest-hint">
            Leave empty to race as <strong>{guestId}</strong>
          </span>
        </div>

        <div className="mp-actions">
          <button className="mp-btn mp-btn-create" onClick={handleSave}>
            SAVE NAME
          </button>
        </div>

        {/* ── Device sync section ───────────────────────────
            Lets a guest move their identity between devices without an
            account. The guest_id column on the server is the dedup key, so
            two devices that share the same ID will have their races merged
            on leaderboards — the local PB/history caches remain per-device. */}
        <div className="sync-divider" />

        <div className="mp-field">
          <label className="mp-label">THIS DEVICE&apos;S RACING ID</label>
          <div className="sync-id-row">
            <code className="sync-id">{guestId}</code>
            <button
              type="button"
              className="sync-copy-btn"
              onClick={handleCopyGuestId}
              title="Copy to clipboard"
            >
              {syncStatus.kind === 'copied' ? 'COPIED' : 'COPY'}
            </button>
          </div>
          <span className="mp-guest-hint">
            Paste this on another device to sync your races there.
          </span>
        </div>

        <div className="mp-field">
          <label className="mp-label">IMPORT FROM ANOTHER DEVICE</label>
          <input
            className="mp-input"
            value={importInput}
            onChange={e => setImportInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleImport(); }}
            placeholder="paste racing ID here"
            maxLength={64}
          />
        </div>

        <div className="mp-actions">
          <button className="mp-btn mp-btn-join" onClick={handleImport}>
            IMPORT
          </button>
        </div>

        {syncStatus.kind === 'imported' && (
          <div className="sync-toast sync-toast-ok">
            Imported — future races will sync to this ID
          </div>
        )}
        {syncStatus.kind === 'error' && (
          <div className="sync-toast sync-toast-err">{syncStatus.message}</div>
        )}
      </div>
    </div>
  );
};

export default NameEditModal;
