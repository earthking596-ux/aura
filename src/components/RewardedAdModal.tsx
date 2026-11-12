import React, { useEffect, useState } from 'react';
import { cosmicAudio } from '../game/audio';

export type AdRewardType = 'coins' | 'magnet_upgrade';

interface RewardedAdModalProps {
  isOpen: boolean;
  rewardType: AdRewardType;
  targetMagnetLevel?: number;
  onSkipOrClose: () => void;
  onClaimReward: (rewardType: AdRewardType) => void;
}

const TOTAL_AD_SECONDS = 15;
const SKIP_UNLOCK_SECONDS = 5;

export const RewardedAdModal: React.FC<RewardedAdModalProps> = ({
  isOpen,
  rewardType,
  targetMagnetLevel = 2,
  onSkipOrClose,
  onClaimReward,
}) => {
  const [elapsedSec, setElapsedSec] = useState<number>(0);

  useEffect(() => {
    if (!isOpen) {
      setElapsedSec(0);
      return;
    }
    setElapsedSec(0);
    const interval = window.setInterval(() => {
      setElapsedSec((prev) => {
        if (prev >= TOTAL_AD_SECONDS) {
          return TOTAL_AD_SECONDS;
        }
        return prev + 1;
      });
    }, 1000);

    return () => {
      window.clearInterval(interval);
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const remainingSec = Math.max(0, TOTAL_AD_SECONDS - elapsedSec);
  const canSkip = elapsedSec >= SKIP_UNLOCK_SECONDS;
  const isCompleted = remainingSec === 0;
  const progressPct = Math.min(100, Math.round((elapsedSec / TOTAL_AD_SECONDS) * 100));

  const rewardLabel =
    rewardType === 'coins'
      ? '+100 Cosmic Coins'
      : `Free Magnet [F] Upgrade → Lv. ${targetMagnetLevel}`;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Rewarded Video Ad"
      data-testid="rewarded-ad-modal"
      className="fixed inset-0 z-40 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(4, 7, 17, 0.92)' }}
    >
      <div
        className="w-full max-w-lg rounded-2xl border border-amber-400/40 p-5 space-y-4 shadow-[0_0_40px_rgba(251,191,36,0.2)]"
        style={{ backgroundColor: 'rgba(8, 13, 28, 0.98)' }}
      >
        {/* Top Ad Header Bar */}
        <div className="flex items-center justify-between gap-2 border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded bg-amber-400 text-slate-950 text-[10px] font-extrabold uppercase tracking-wider">
              SPONSORED AD
            </span>
            <span className="text-xs font-semibold text-slate-200">
              Reward: <strong className="text-amber-300">{rewardLabel}</strong>
            </span>
          </div>

          <div
            data-testid="ad-countdown-badge"
            className="px-2.5 py-1 rounded-lg bg-slate-950 border border-slate-800 text-xs font-mono-tabular font-bold text-cyan-300"
          >
            {isCompleted ? 'Reward Ready!' : `${remainingSec}s remaining`}
          </div>
        </div>

        {/* Simulated Cosmic Video Showcase Frame */}
        <div className="relative h-48 rounded-xl bg-slate-950 border border-slate-800 overflow-hidden flex flex-col items-center justify-center p-4 text-center">
          {/* Animated Concentric Magnet Rings */}
          <div className="relative w-24 h-24 flex items-center justify-center mb-2">
            <div className="absolute inset-0 rounded-full border-2 border-dashed border-amber-400/50 animate-spin" />
            <div className="absolute inset-3 rounded-full border border-cyan-400/60 animate-ping" />
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-amber-300 via-cyan-400 to-purple-500 shadow-[0_0_24px_rgba(251,191,36,0.75)] flex items-center justify-center font-display font-extrabold text-slate-950 text-sm">
              [F]
            </div>
          </div>

          <div className="text-sm font-display font-bold text-white tracking-wide">
            HYPER-MAGNETIC CORE TECH · AURA LABS
          </div>
          <p className="text-xs text-slate-400 max-w-xs mt-0.5">
            Pull cosmic energy orbs from across the arena with zero mass cost using the [F] Energy Magnet skill!
          </p>

          {/* Bottom Progress Bar inside Video Frame */}
          <div className="absolute bottom-0 inset-x-0 h-2 bg-slate-900">
            <div
              data-testid="ad-progress-bar"
              className="h-full bg-gradient-to-r from-cyan-400 to-amber-400 transition-all duration-500"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>

        {/* Action Row: Skip Ad (after 5s) & Claim Reward (at 15s) */}
        <div className="flex items-center justify-between gap-3 pt-1">
          <button
            type="button"
            data-testid="ad-skip-btn"
            disabled={!canSkip}
            onClick={onSkipOrClose}
            className="px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-xs font-semibold text-slate-300 disabled:opacity-40 cursor-pointer transition-colors"
          >
            {canSkip
              ? isCompleted
                ? 'Close'
                : 'Skip Ad (No Reward)'
              : `Skip in ${ Math.max(0, SKIP_UNLOCK_SECONDS - elapsedSec) }s`}
          </button>

          <button
            type="button"
            data-testid="ad-claim-reward-btn"
            disabled={!isCompleted}
            onClick={() => {
              cosmicAudio.playCollect(15);
              onClaimReward(rewardType);
            }}
            className={`flex-1 py-2.5 px-5 rounded-xl font-display font-bold text-xs sm:text-sm tracking-wide transition-all cursor-pointer ${
              isCompleted
                ? 'bg-amber-400 hover:bg-amber-300 text-slate-950 shadow-[0_0_24px_rgba(251,191,36,0.45)]'
                : 'bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed'
            }`}
          >
            {isCompleted
              ? `Claim ${rewardLabel}`
              : `Watch ${remainingSec}s to Unlock Reward...`}
          </button>
        </div>
      </div>
    </div>
  );
};
