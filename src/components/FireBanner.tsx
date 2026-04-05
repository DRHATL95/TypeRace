import React from 'react';
import { FireStreakTier } from '../types/GameTypes';
import './FireBanner.css';

interface FireBannerProps {
  tier: FireStreakTier;
  streak: number;
  visible: boolean;
}

const TIER_LABELS: Record<FireStreakTier, string> = {
  none: '',
  fire: 'FIRE',
  blazing: 'BLAZING',
  unstoppable: 'UNSTOPPABLE',
};

const FireBanner: React.FC<FireBannerProps> = ({ tier, streak, visible }) => {
  if (!visible || tier === 'none') return null;

  return (
    <div className={`fire-banner fire-${tier}`}>
      <span className="fire-label">{TIER_LABELS[tier]}</span>
      <span className="fire-count">{streak}x</span>
    </div>
  );
};

export default FireBanner;
