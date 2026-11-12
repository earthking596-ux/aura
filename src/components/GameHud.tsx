import React, { useRef, useState } from 'react';
import { HudTelemetrySnapshot } from '../game/engine';
import { FACTION_ABILITIES, GameSettings } from '../game/types';

interface GameHudProps {
  telemetry: HudTelemetrySnapshot;
  settings: GameSettings;
  onToggleMute: () => void;
  onPause: () => void;
  onRestart: () => void;
  onTriggerAbility: (slot: 0 | 1 | 2) => void;
  onTouchJoystick: (active: boolean, angle: number) => void;
  onTouchBoost: (active: boolean) => void;
}

export const GameHud: React.FC<GameHudProps> = ({
  telemetry,
  settings,
  onToggleMute,
  onPause,
  onRestart,
  onTriggerAbility,
  onTouchJoystick,
  onTouchBoost,
}) => {
  const [joyKnob, setJoyKnob] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const joyBaseRef = useRef<HTMLDivElement | null>(null);

  const isTouchVisible =
    settings.touchControlsMode === 'always' ||
    (settings.touchControlsMode === 'auto' &&
      typeof window !== 'undefined' &&
      ('ontouchstart' in window || window.innerWidth < 820));

  const factionAbilities = FACTION_ABILITIES[telemetry.playerFaction];
  const isPositiveAura = telemetry.playerFaction === 'blue';

  const formatTimer = (sec: number) => {
    const s = Math.max(0, Math.ceil(sec));
    const mins = Math.floor(s / 60);
    const rem = s % 60;
    return `${mins}:${rem < 10 ? '0' : ''}${rem}`;
  };

  const handleJoystickPointerMove = (clientX: number, clientY: number) => {
    if (!joyBaseRef.current) return;
    const rect = joyBaseRef.current.getBoundingClientRect();
    const cx = rect.left + rect.width * 0.5;
    const cy = rect.top + rect.height * 0.5;
    const dx = clientX - cx;
    const dy = clientY - cy;
    const dist = Math.hypot(dx, dy);
    // Scale deadzone and response by Mobile Joystick Sensitivity (1% to 100%)
    const joySens = Math.max(1, Math.min(100, settings.joystickSensitivity || 60));
    const maxR = Math.max(22, 48 - (joySens / 100) * 18);
    const clampedR = Math.min(38, (dist / maxR) * 38);
    const angle = Math.atan2(dy, dx);
    setJoyKnob({
      x: Math.cos(angle) * clampedR,
      y: Math.sin(angle) * clampedR,
    });
    if (dist > 3) {
      onTouchJoystick(true, angle);
    }
  };

  return (
    <div
      aria-label="In-Game Heads-Up Display"
      className="fixed inset-0 z-10 pointer-events-none select-none flex flex-col justify-between p-3 sm:p-5"
    >
      {/* TOP BAR ROW: 3 Perimeter Clusters */}
      <div className="flex flex-wrap sm:flex-nowrap items-start justify-between gap-2 sm:gap-4">
        {/* CLUSTER 1 (Top-Left): Player Name, Team Identity, Current Mass, Current Length & Elimination Feed */}
        <div className="flex flex-col gap-1.5 order-1">
          <div
            className="px-2.5 py-1.5 sm:px-4 sm:py-2.5 rounded-xl border border-slate-800/90 flex items-center gap-2.5 sm:gap-4"
            style={{ backgroundColor: 'rgba(6, 11, 25, 0.88)' }}
          >
            {/* Player Name & Team Identity */}
            <div>
              <div
                data-testid="hud-player-name"
                className="text-xs font-bold text-white truncate max-w-[96px] sm:max-w-[120px]"
              >
                {telemetry.playerName}
              </div>
              <div
                data-testid="hud-team-identity"
                className={`text-[10px] sm:text-[11px] font-semibold flex items-center gap-1.5 ${
                  isPositiveAura ? 'text-cyan-400' : 'text-purple-400'
                }`}
              >
                <span
                  className={`w-2 h-2 rounded-full ${
                    isPositiveAura ? 'bg-cyan-400' : 'bg-purple-400'
                  }`}
                />
                <span>
                  {isPositiveAura ? 'Positive Aura' : 'Negative Aura'}
                </span>
              </div>
            </div>

            {settings.showMassInfo && (
              <>
                <div className="h-6 sm:h-7 w-px bg-slate-800" />

                <div>
                  <div className="text-[9px] sm:text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                    MASS
                  </div>
                  <div
                    data-testid="hud-player-mass"
                    className="text-base sm:text-xl font-display font-extrabold font-mono-tabular text-white hud-stroke leading-tight"
                  >
                    {Math.round(telemetry.playerMass)}
                  </div>
                </div>

                <div className="h-6 sm:h-7 w-px bg-slate-800" />

                <div>
                  <div className="text-[9px] sm:text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                    LENGTH
                  </div>
                  <div
                    data-testid="hud-player-length"
                    className="text-base sm:text-xl font-display font-bold font-mono-tabular text-cyan-300 hud-stroke leading-tight"
                  >
                    {Math.round(telemetry.playerLength)}
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Transient Elimination Feed */}
          {telemetry.killFeed.length > 0 && (
            <div className="flex flex-col gap-1 max-w-xs">
              {telemetry.killFeed.slice(0, 3).map((ev) => (
                <div
                  key={ev.id}
                  className="px-2.5 py-1 rounded-lg text-[11px] sm:text-xs border border-slate-800/80 flex items-center gap-1.5"
                  style={{ backgroundColor: 'rgba(6, 11, 25, 0.82)' }}
                >
                  <span
                    className={`font-semibold ${
                      ev.killerFaction === 'blue'
                        ? 'text-cyan-400'
                        : 'text-purple-400'
                    }`}
                  >
                    {ev.killerName}
                  </span>
                  <span className="text-slate-400">eliminated</span>
                  <span
                    className={`font-semibold ${
                      ev.victimFaction === 'blue'
                        ? 'text-cyan-300'
                        : 'text-purple-300'
                    }`}
                  >
                    {ev.victimName}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* CLUSTER 2 (Top-Center): Match Score, Remaining Players & Round Clock */}
        <div
          className="px-3 py-1.5 sm:px-5 sm:py-2.5 rounded-2xl border border-slate-800/90 flex items-center justify-center gap-2.5 sm:gap-5 order-3 sm:order-2 w-full sm:w-auto"
          style={{ backgroundColor: 'rgba(6, 11, 25, 0.90)' }}
        >
          {/* Positive Aura (Blue Team) */}
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="text-right">
              <div className="text-[9px] sm:text-[10px] font-semibold uppercase tracking-wider text-cyan-400">
                POSITIVE AURA
              </div>
              <div
                data-testid="hud-blue-alive"
                className="text-[11px] sm:text-xs text-slate-300 font-mono-tabular"
              >
                {telemetry.blueAlive}/{telemetry.blueTotal} Alive
              </div>
            </div>
            <div
              data-testid="hud-blue-score"
              className="text-2xl sm:text-3xl font-display font-extrabold font-mono-tabular text-cyan-400 hud-stroke"
            >
              {telemetry.blueRoundsWon}
            </div>
          </div>

          {/* Center Round, Remaining Players & Timer */}
          <div className="px-2.5 sm:px-3 border-x border-slate-800 text-center">
            <div className="text-[9px] sm:text-[10px] font-semibold uppercase tracking-widest text-slate-400">
              ROUND {telemetry.roundNumber}/{telemetry.maxRounds}
            </div>
            <div className="text-base sm:text-lg font-display font-bold font-mono-tabular text-white leading-tight">
              {formatTimer(telemetry.roundTimeRemaining)}
            </div>
            <div
              data-testid="hud-remaining-players"
              className="text-[9px] sm:text-[10px] font-mono-tabular text-slate-300"
            >
              {telemetry.blueAlive + telemetry.purpleAlive} Remaining
            </div>
          </div>

          {/* Negative Aura (Purple Team) */}
          <div className="flex items-center gap-2 sm:gap-3">
            <div
              data-testid="hud-purple-score"
              className="text-2xl sm:text-3xl font-display font-extrabold font-mono-tabular text-purple-400 hud-stroke"
            >
              {telemetry.purpleRoundsWon}
            </div>
            <div className="text-left">
              <div className="text-[9px] sm:text-[10px] font-semibold uppercase tracking-wider text-purple-400">
                NEGATIVE AURA
              </div>
              <div
                data-testid="hud-purple-alive"
                className="text-[11px] sm:text-xs text-slate-300 font-mono-tabular"
              >
                {telemetry.purpleAlive}/{telemetry.purpleTotal} Alive
              </div>
            </div>
          </div>
        </div>

        {/* CLUSTER 3 (Top-Right): Settings / Pause Button, Mute, Restart & Non-Intrusive FPS/Ping Counter */}
        <div className="flex flex-col items-end gap-1.5 order-2 sm:order-3">
          <div className="flex items-center gap-1.5 sm:gap-2 pointer-events-auto">
            <button
              type="button"
              tabIndex={-1}
              aria-label={settings.soundEnabled ? 'Mute Audio [M]' : 'Unmute Audio [M]'}
              onClick={(e) => {
                e.currentTarget.blur();
                onToggleMute();
              }}
              className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl border border-slate-800 hover:border-cyan-400/60 flex items-center justify-center text-slate-200 hover:text-white transition-colors cursor-pointer"
              style={{ backgroundColor: 'rgba(6, 11, 25, 0.88)' }}
            >
              <svg viewBox="0 0 24 24" className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" strokeWidth="2">
                {settings.soundEnabled ? (
                  <>
                    <path d="M11 5L6 9H2v6h4l5 4V5z" />
                    <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                    <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
                  </>
                ) : (
                  <>
                    <path d="M11 5L6 9H2v6h4l5 4V5z" />
                    <line x1="23" y1="9" x2="17" y2="15" />
                    <line x1="17" y1="9" x2="23" y2="15" />
                  </>
                )}
              </svg>
            </button>

            <button
              type="button"
              tabIndex={-1}
              aria-label="Restart Match [R]"
              onClick={(e) => {
                e.currentTarget.blur();
                onRestart();
              }}
              className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl border border-slate-800 hover:border-cyan-400/60 flex items-center justify-center text-slate-200 hover:text-white transition-colors cursor-pointer"
              style={{ backgroundColor: 'rgba(6, 11, 25, 0.88)' }}
            >
              <svg viewBox="0 0 24 24" className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                <path d="M3 3v5h5" />
              </svg>
            </button>

            <button
              type="button"
              tabIndex={-1}
              data-testid="hud-settings-btn"
              aria-label="Pause Game [P]"
              onClick={(e) => {
                e.currentTarget.blur();
                onPause();
              }}
              className="px-2.5 sm:px-3 h-9 sm:h-10 rounded-xl border border-slate-800 hover:border-cyan-400/60 flex items-center gap-1.5 text-slate-200 hover:text-white text-xs font-semibold transition-colors cursor-pointer"
              style={{ backgroundColor: 'rgba(6, 11, 25, 0.88)' }}
            >
              <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
              <span>Settings</span>
            </button>
          </div>

          {/* Non-intrusive FPS & Ping Counter (togglable via Settings) */}
          {settings.showFpsPing && (
            <div
              data-testid="hud-fps-ping"
              aria-label="FPS and Ping Counter"
              className="px-2.5 py-1 rounded-lg border border-slate-800/80 text-[11px] font-mono-tabular text-slate-300 flex items-center gap-2"
              style={{ backgroundColor: 'rgba(6, 11, 25, 0.78)' }}
            >
              <span className="flex items-center gap-1.5">
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    telemetry.fps >= 45
                      ? 'bg-emerald-400'
                      : telemetry.fps >= 25
                      ? 'bg-amber-400'
                      : 'bg-rose-400'
                  }`}
                />
                <span data-testid="hud-fps-value" className="font-semibold text-white">
                  {telemetry.fps}
                </span>
                <span className="text-[10px] text-slate-400">FPS</span>
              </span>
              <span className="text-slate-600" aria-hidden="true">
                ·
              </span>
              <span className="flex items-center gap-1">
                <span
                  data-testid="hud-ping-value"
                  className={`font-semibold ${
                    telemetry.pingMs <= 60
                      ? 'text-cyan-300'
                      : telemetry.pingMs <= 140
                      ? 'text-amber-300'
                      : 'text-rose-300'
                  }`}
                >
                  {telemetry.pingMs}
                </span>
                <span className="text-[10px] text-slate-400">ms</span>
              </span>
            </div>
          )}
        </div>
      </div>

      {/* BOTTOM ROW: Mobile Joystick (Left), Boost Indicator & Optional Special Powers (Center), Mini-Map + Separate Mobile Boost Button (Right) */}
      <div className="flex flex-wrap sm:flex-nowrap items-end justify-between gap-2 sm:gap-4">
        {/* Mobile Touch Virtual Joystick (Left) */}
        <div className="w-auto sm:w-32 flex items-center justify-start order-2 sm:order-1">
          {isTouchVisible && (
            <div
              ref={joyBaseRef}
              data-testid="mobile-virtual-joystick"
              aria-label="Virtual Steering Joystick"
              onPointerDown={(e) => {
                e.currentTarget.setPointerCapture(e.pointerId);
                handleJoystickPointerMove(e.clientX, e.clientY);
              }}
              onPointerMove={(e) => {
                if (e.buttons > 0) {
                  handleJoystickPointerMove(e.clientX, e.clientY);
                }
              }}
              onPointerUp={() => {
                setJoyKnob({ x: 0, y: 0 });
                onTouchJoystick(false, 0);
              }}
              className="w-24 h-24 sm:w-28 sm:h-28 rounded-full border-2 border-cyan-400/40 flex items-center justify-center relative pointer-events-auto touch-none"
              style={{ backgroundColor: 'rgba(6, 11, 25, 0.78)' }}
            >
              <div
                className="w-10 h-10 sm:w-11 sm:h-11 rounded-full bg-cyan-400/80 border border-white"
                style={{
                  transform: `translate(${joyKnob.x}px, ${joyKnob.y}px)`,
                }}
              />
            </div>
          )}
        </div>

        {/* Bottom-Center Dock: Pointer Lock / Controls Hint + Boost & Magnet [F] Indicator + Optional Special Powers */}
        <div className="flex flex-col items-center gap-1.5 order-1 sm:order-2 w-full sm:w-auto">
          <div
            data-testid="hud-pointer-lock-status"
            className="hidden sm:flex px-3 py-0.5 rounded-full border border-slate-800/80 text-[10px] font-medium text-slate-300 items-center gap-2"
            style={{ backgroundColor: 'rgba(6, 11, 25, 0.80)' }}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                telemetry.isPointerLocked ? 'bg-emerald-400' : 'bg-cyan-400'
              }`}
            />
            <span>
              {telemetry.isPointerLocked
                ? 'Mouse Locked · [F] Magnet · ESC Settings'
                : 'Mouse / Arrow Keys / WASD Move · Space Boost · [F] Energy Magnet'}
            </span>
          </div>

          <div
            data-testid="hud-boost-indicator"
            className="px-3 py-2 sm:px-4 sm:py-2.5 rounded-2xl border border-slate-800/90 flex flex-col gap-2 pointer-events-auto"
            style={{ backgroundColor: 'rgba(6, 11, 25, 0.90)' }}
          >
            {/* Boost Gauge + Always-Available MAGNET [F] Skill Row */}
            <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-3">
              <button
                type="button"
                tabIndex={-1}
                onPointerDown={() => onTouchBoost(true)}
                onPointerUp={() => onTouchBoost(false)}
                onPointerLeave={() => onTouchBoost(false)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold font-mono-tabular transition-colors cursor-pointer ${
                  telemetry.isBoosting
                    ? 'bg-cyan-400 text-slate-950'
                    : 'bg-slate-800 text-slate-300 hover:text-white'
                }`}
              >
                BOOST [SPACE / CLICK]
              </button>
              <div className="h-2.5 w-24 sm:w-40 rounded-full bg-slate-900 border border-slate-800 overflow-hidden">
                <div
                  className={`h-full origin-left ${
                    isPositiveAura ? 'bg-cyan-400' : 'bg-purple-400'
                  }`}
                  style={{
                    transform: `scaleX(${Math.max(0, Math.min(1, telemetry.boostEnergy / 100))})`,
                  }}
                />
              </div>
              <span className="text-xs font-mono-tabular text-slate-300 w-9 text-right">
                {telemetry.boostEnergy}%
              </span>

              <div className="h-5 w-px bg-slate-800 hidden sm:block" />

              {/* Dedicated Always-Available MAGNET [F] Skill Button */}
              {(() => {
                const magState = telemetry.abilities.attract;
                const magActive = magState.activeRemaining > 0;
                const magCooldown = magState.cooldownRemaining > 0;
                return (
                  <button
                    type="button"
                    tabIndex={-1}
                    data-testid="hud-magnet-btn"
                    disabled={magCooldown || !telemetry.playerAlive}
                    onClick={(e) => {
                      e.currentTarget.blur();
                      onTriggerAbility(2);
                    }}
                    className={`px-3 py-1 rounded-lg border text-[11px] font-mono-tabular font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                      magActive
                        ? 'bg-amber-400 text-slate-950 border-amber-200 shadow-[0_0_16px_rgba(251,191,36,0.65)]'
                        : magCooldown
                        ? 'bg-slate-900 text-slate-500 border-slate-800 cursor-not-allowed'
                        : 'bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border-amber-400/50'
                    }`}
                  >
                    <span>MAGNET [F]</span>
                    <span className="px-1 py-0.2 rounded bg-slate-950/60 text-[10px] text-cyan-300">
                      Lv.{telemetry.magnetLevel || 1}
                    </span>
                    <span>
                      {magActive
                        ? `${magState.activeRemaining.toFixed(1)}s`
                        : magCooldown
                        ? `${magState.cooldownRemaining.toFixed(1)}s`
                        : 'READY'}
                    </span>
                  </button>
                );
              })()}
            </div>

            {/* 3 Faction Ability Buttons (Only shown when Special Powers are ON) */}
            {telemetry.abilitiesEnabled && (
              <div className="grid grid-cols-3 gap-2">
                {factionAbilities.map((ab, idx) => {
                  const state = telemetry.abilities[ab.id];
                  const onCooldown = state.cooldownRemaining > 0;
                  const isActive = state.activeRemaining > 0;
                  const canAfford = telemetry.playerMass - ab.massCost >= 10;

                  return (
                    <button
                      key={ab.id}
                      type="button"
                      tabIndex={-1}
                      onClick={(e) => {
                        e.currentTarget.blur();
                        onTriggerAbility(idx as 0 | 1 | 2);
                      }}
                      disabled={onCooldown || !canAfford || !telemetry.playerAlive}
                      className={`px-2.5 sm:px-3 py-1.5 rounded-xl border text-left transition-colors cursor-pointer flex items-center gap-2 ${
                        isActive
                          ? 'border-cyan-300 bg-cyan-950/60 text-white'
                          : onCooldown || !canAfford
                          ? 'border-slate-800/80 bg-slate-950/60 text-slate-500'
                          : 'border-slate-700 bg-slate-900/90 text-slate-100 hover:border-cyan-400'
                      }`}
                    >
                      <svg
                        viewBox="0 0 24 24"
                        className={`w-4 h-4 sm:w-5 sm:h-5 shrink-0 ${
                          isPositiveAura ? 'text-cyan-400' : 'text-purple-400'
                        }`}
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        {idx === 0 && (
                          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                        )}
                        {idx === 1 && (
                          <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                        )}
                        {idx === 2 && (
                          <>
                            <circle cx="12" cy="12" r="9" strokeDasharray="4 3" />
                            <circle cx="12" cy="12" r="3" />
                          </>
                        )}
                      </svg>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-1">
                          <span className="text-[11px] sm:text-xs font-semibold truncate">
                            {ab.name}
                          </span>
                          <span className="text-[10px] font-mono-tabular text-cyan-400">
                            [{ab.key}]
                          </span>
                        </div>
                        <div className="text-[9px] sm:text-[10px] font-mono-tabular text-slate-400 truncate">
                          {isActive
                            ? `ACTIVE ${state.activeRemaining.toFixed(1)}s`
                            : onCooldown
                            ? `WAIT ${state.cooldownRemaining.toFixed(1)}s`
                            : `${ab.massCost} Mass · ${ab.roleClue}`}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Bottom-Right: Separate Mobile Boost Button (when touch active) + Cosmic Mini-Map (Cyan Positive Aura & Purple Negative Aura) */}
        <div className="flex items-end gap-2 sm:gap-3 shrink-0 order-3">
          {isTouchVisible && (
            <button
              type="button"
              data-testid="mobile-boost-btn"
              aria-label="Mobile Speed Boost"
              onPointerDown={() => onTouchBoost(true)}
              onPointerUp={() => onTouchBoost(false)}
              onPointerLeave={() => onTouchBoost(false)}
              className={`w-16 h-16 sm:w-20 sm:h-20 rounded-full border-2 font-display font-bold text-xs tracking-wider flex flex-col items-center justify-center pointer-events-auto touch-none cursor-pointer transition-transform active:scale-95 ${
                telemetry.isBoosting
                  ? 'bg-cyan-400 text-slate-950 border-white shadow-[0_0_20px_rgba(0,240,255,0.6)]'
                  : 'bg-slate-950/85 text-cyan-300 border-cyan-400/60'
              }`}
            >
              <span>BOOST</span>
              <span className="text-[10px] font-mono-tabular opacity-80">
                {telemetry.boostEnergy}%
              </span>
            </button>
          )}

          {settings.showMinimap && (
            <div
              aria-label="Cosmic Arena Radar"
              data-testid="hud-arena-minimap"
              className="flex flex-col items-center gap-1 shrink-0"
            >
              <div
                className="px-2 py-0.5 rounded-md border border-slate-800/90 text-[9px] sm:text-[10px] font-semibold uppercase tracking-wider text-slate-300 flex items-center gap-1.5 sm:gap-2"
                style={{ backgroundColor: 'rgba(6, 11, 25, 0.88)' }}
              >
                <span className="inline-block w-2 h-2 rounded-full bg-cyan-400" />
                <span>Positive</span>
                <span className="text-slate-600">·</span>
                <span className="inline-block w-2 h-2 rounded-full bg-purple-400" />
                <span>Negative</span>
              </div>
              <div
                className="w-24 h-24 sm:w-36 sm:h-36 rounded-full border border-slate-800 p-1.5 sm:p-2 relative flex items-center justify-center"
                style={{ backgroundColor: 'rgba(6, 11, 25, 0.90)' }}
              >
                <div className="w-full h-full rounded-full border border-cyan-500/35 relative overflow-hidden">
                  <div className="absolute inset-1/4 rounded-full border border-slate-700/40" />
                  <div className="absolute inset-1/3 rounded-full border border-cyan-500/20 bg-cyan-500/5" />
                  {telemetry.minimapEntities.map((ent) => {
                    const pctX =
                      50 + (ent.x / Math.max(1000, telemetry.arenaRadius)) * 45;
                    const pctY =
                      50 + (ent.y / Math.max(1000, telemetry.arenaRadius)) * 45;
                    const dotSize = ent.isLocal
                      ? 10
                      : Math.min(11, Math.max(6, 5 + Math.sqrt(ent.mass) * 0.25));
                    const isBlue = ent.faction === 'blue';
                    return (
                      <span
                        key={ent.id}
                        data-testid={
                          ent.isLocal
                            ? 'minimap-marker-local'
                            : isBlue
                            ? 'minimap-marker-blue'
                            : 'minimap-marker-purple'
                        }
                        className={`absolute rounded-full -translate-x-1/2 -translate-y-1/2 ${
                          ent.isLocal ? 'ring-2 ring-white' : ''
                        }`}
                        style={{
                          width: `${dotSize}px`,
                          height: `${dotSize}px`,
                          backgroundColor: isBlue ? '#00F0FF' : '#C084FC',
                          boxShadow: isBlue
                            ? '0 0 6px rgba(0, 240, 255, 0.85)'
                            : '0 0 6px rgba(192, 132, 252, 0.85)',
                          left: `${Math.max(7, Math.min(93, Math.round(pctX)))}%`,
                          top: `${Math.max(7, Math.min(93, Math.round(pctY)))}%`,
                        }}
                      />
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
