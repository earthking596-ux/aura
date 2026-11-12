import React from 'react';
import {
  DEFAULT_CONTROL_SENSITIVITY,
  GameSettings,
  GameState,
  MatchSummarySnapshot,
  RoundBannerState,
} from '../game/types';

interface StatusModalsProps {
  gameState: GameState;
  isSettingsOpen: boolean;
  roundBanner: RoundBannerState;
  matchSummary: MatchSummarySnapshot | null;
  settings: GameSettings;
  onCloseSettings: () => void;
  onResume: () => void;
  onRestart: () => void;
  onReturnToTitle: () => void;
  onUpdateSettings: (
    next: GameSettings | ((prev: GameSettings) => GameSettings)
  ) => void;
}

const SENSITIVITY_PRESETS = [
  { label: 'Low (25%)', value: 25 },
  { label: 'Medium (50%)', value: 50 },
  { label: 'High (75%)', value: 75 },
  { label: 'Very High (100%)', value: 100 },
];

export const StatusModals: React.FC<StatusModalsProps> = ({
  gameState,
  isSettingsOpen,
  roundBanner,
  matchSummary,
  settings,
  onCloseSettings,
  onResume,
  onRestart,
  onReturnToTitle,
  onUpdateSettings,
}) => {
  const showSettingsDialog = gameState === 'paused' || isSettingsOpen;

  const renderSensitivityControl = (params: {
    id: string;
    testId: string;
    label: string;
    value: number;
    onChange: (val: number) => void;
  }) => (
    <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <label htmlFor={params.id} className="font-semibold text-slate-200">
          {params.label}
        </label>
        <span
          data-testid={`${params.testId}-value`}
          className="font-mono-tabular font-bold text-cyan-300"
        >
          {params.value}%
        </span>
      </div>

      <input
        id={params.id}
        data-testid={params.testId}
        type="range"
        min={1}
        max={100}
        step={1}
        value={params.value}
        onChange={(e) => params.onChange(Number(e.target.value))}
        className="w-full accent-cyan-400 cursor-pointer h-1.5"
      />

      <div className="grid grid-cols-4 gap-1.5">
        {SENSITIVITY_PRESETS.map((preset) => (
          <button
            key={preset.value}
            type="button"
            data-testid={`${params.testId}-preset-${preset.value}`}
            onClick={() => params.onChange(preset.value)}
            className={`py-1 px-1.5 rounded-lg border text-[10px] font-semibold transition-colors cursor-pointer ${
              params.value === preset.value
                ? 'border-cyan-400 bg-cyan-950/50 text-white'
                : 'border-slate-800 bg-slate-900 text-slate-400 hover:text-white'
            }`}
          >
            {preset.label}
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <>
      {/* Inter-Round Clash Squad Banner Overlay */}
      {gameState === 'playing' && roundBanner.active && (
        <div
          aria-live="polite"
          className="fixed inset-0 z-20 pointer-events-none flex items-center justify-center"
        >
          <div
            className="px-8 py-6 rounded-2xl border border-slate-700 text-center max-w-md"
            style={{ backgroundColor: 'rgba(4, 7, 17, 0.94)' }}
          >
            <div className="text-xs font-mono-tabular uppercase tracking-widest text-slate-400 mb-1">
              ROUND {roundBanner.roundNumber} COMPLETE
            </div>
            <h2
              className={`text-2xl font-display font-extrabold tracking-wide mb-1 ${
                roundBanner.winnerFaction === 'blue'
                  ? 'text-cyan-400'
                  : roundBanner.winnerFaction === 'purple'
                  ? 'text-purple-400'
                  : 'text-slate-200'
              }`}
            >
              {roundBanner.winnerFaction === 'blue'
                ? 'POSITIVE AURA WINS ROUND'
                : roundBanner.winnerFaction === 'purple'
                ? 'NEGATIVE AURA WINS ROUND'
                : 'ROUND DRAW'}
            </h2>
            <p className="text-xs text-slate-300 mb-3">{roundBanner.reason}</p>
            <div className="text-xs font-mono-tabular text-slate-400">
              Next Round Launching in {Math.ceil(roundBanner.countdown)}s...
            </div>
          </div>
        </div>
      )}

      {/* SETTINGS & PAUSE MODAL (3 Clear Sections: Game Settings, Control Settings, Gameplay Settings) */}
      {showSettingsDialog && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Game Settings and Controls"
          data-testid="settings-modal"
          className="fixed inset-0 z-30 flex items-center justify-center p-3 sm:p-4 overflow-y-auto"
          style={{ backgroundColor: 'rgba(4, 7, 17, 0.88)' }}
        >
          <div
            className="w-full max-w-2xl max-h-[94vh] overflow-y-auto rounded-2xl border border-slate-800 p-4 sm:p-5 space-y-3 my-auto"
            style={{ backgroundColor: 'rgba(8, 13, 28, 0.98)' }}
          >
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h2 className="text-lg sm:text-xl font-display font-bold text-white">
                  {gameState === 'paused'
                    ? 'Game Paused — Settings & Controls'
                    : 'Settings & Sensitivity Controls'}
                </h2>
                <p className="text-xs text-slate-400">
                  All settings are saved automatically on your device.
                </p>
              </div>
              <button
                type="button"
                data-testid="close-settings-btn"
                onClick={
                  gameState === 'paused' ? onResume : onCloseSettings
                }
                className="px-3 py-1 rounded-lg bg-slate-900 border border-slate-700 text-xs font-mono-tabular text-cyan-300 hover:text-white cursor-pointer"
              >
                {gameState === 'paused' ? 'Resume [ESC]' : 'Close [ESC]'}
              </button>
            </div>

            {/* =========================================================
                SECTION 1: CONTROL SETTINGS (Mouse, Keyboard, Mobile Sensitivity)
               ========================================================= */}
            <section aria-label="Control Settings" className="space-y-2.5">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold uppercase tracking-wider text-cyan-400">
                  1. Control Settings
                </h3>
                <button
                  type="button"
                  data-testid="reset-controls-btn"
                  onClick={() =>
                    onUpdateSettings((prev) => ({
                      ...prev,
                      mouseSensitivity:
                        DEFAULT_CONTROL_SENSITIVITY.mouseSensitivity,
                      keyboardSensitivity:
                        DEFAULT_CONTROL_SENSITIVITY.keyboardSensitivity,
                      joystickSensitivity:
                        DEFAULT_CONTROL_SENSITIVITY.joystickSensitivity,
                    }))
                  }
                  className="px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-700 hover:border-cyan-400 text-[11px] font-semibold text-slate-200 cursor-pointer"
                >
                  Reset Controls to Default
                </button>
              </div>

              <p className="text-[11px] text-slate-400">
                Low sensitivity = Slow and smooth turning. High sensitivity = Fast turning. Sensitivity never changes movement speed.
              </p>

              {renderSensitivityControl({
                id: 'mouse-sensitivity-range',
                testId: 'mouse-sensitivity-slider',
                label: 'Mouse Sensitivity',
                value: settings.mouseSensitivity,
                onChange: (val) =>
                  onUpdateSettings((prev) => ({
                    ...prev,
                    mouseSensitivity: val,
                  })),
              })}

              {renderSensitivityControl({
                id: 'keyboard-sensitivity-range',
                testId: 'keyboard-sensitivity-slider',
                label: 'Keyboard Turning Sensitivity',
                value: settings.keyboardSensitivity,
                onChange: (val) =>
                  onUpdateSettings((prev) => ({
                    ...prev,
                    keyboardSensitivity: val,
                  })),
              })}

              {renderSensitivityControl({
                id: 'joystick-sensitivity-range',
                testId: 'joystick-sensitivity-slider',
                label: 'Mobile Joystick Sensitivity',
                value: settings.joystickSensitivity,
                onChange: (val) =>
                  onUpdateSettings((prev) => ({
                    ...prev,
                    joystickSensitivity: val,
                  })),
              })}

              <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-950 border border-slate-800">
                <span className="text-xs font-semibold text-slate-200">
                  Mobile Touch Controls (Joystick + Boost)
                </span>
                <div className="flex items-center gap-1">
                  {(
                    [
                      { id: 'auto', label: 'Auto' },
                      { id: 'always', label: 'Always On' },
                      { id: 'off', label: 'Off' },
                    ] as const
                  ).map((mode) => (
                    <button
                      key={mode.id}
                      type="button"
                      data-testid={`touch-controls-${mode.id}`}
                      onClick={() =>
                        onUpdateSettings({
                          ...settings,
                          touchControlsMode: mode.id,
                        })
                      }
                      className={`px-2.5 py-1 rounded-lg border text-[11px] font-semibold cursor-pointer ${
                        settings.touchControlsMode === mode.id
                          ? 'border-cyan-400 bg-cyan-950/50 text-white'
                          : 'border-slate-800 bg-slate-900 text-slate-400 hover:text-white'
                      }`}
                    >
                      {mode.label}
                    </button>
                  ))}
                </div>
              </div>
            </section>

            {/* =========================================================
                SECTION 2: GAME SETTINGS (Sound, Visual Effects Quality, Camera Zoom)
               ========================================================= */}
            <section
              aria-label="Game Settings"
              className="space-y-2.5 pt-2 border-t border-slate-800"
            >
              <h3 className="text-xs font-bold uppercase tracking-wider text-cyan-400">
                2. Game Settings
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <label className="flex items-center justify-between p-3 rounded-xl bg-slate-950 border border-slate-800 cursor-pointer">
                  <span className="text-xs font-semibold text-slate-200">
                    Sound ON / OFF
                  </span>
                  <input
                    type="checkbox"
                    data-testid="settings-toggle-sound"
                    checked={settings.soundEnabled}
                    onChange={(e) =>
                      onUpdateSettings({
                        ...settings,
                        soundEnabled: e.target.checked,
                      })
                    }
                    className="h-4 w-4 accent-cyan-400"
                  />
                </label>

                <div className="flex items-center justify-between p-3 rounded-xl bg-slate-950 border border-slate-800">
                  <span className="text-xs font-semibold text-slate-200">
                    Visual Effects Quality
                  </span>
                  <div className="flex items-center gap-1">
                    {(['high', 'balanced'] as const).map((q) => (
                      <button
                        key={q}
                        type="button"
                        data-testid={`visual-quality-${q}`}
                        onClick={() =>
                          onUpdateSettings({ ...settings, visualQuality: q })
                        }
                        className={`px-2.5 py-1 rounded-lg border text-[11px] font-semibold capitalize cursor-pointer ${
                          settings.visualQuality === q
                            ? 'border-cyan-400 bg-cyan-950/50 text-white'
                            : 'border-slate-800 bg-slate-900 text-slate-400'
                        }`}
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <label
                    htmlFor="camera-zoom-range"
                    className="font-semibold text-slate-200"
                  >
                    Camera Zoom
                  </label>
                  <span
                    data-testid="camera-zoom-value"
                    className="font-mono-tabular font-bold text-cyan-300"
                  >
                    {Math.round((settings.cameraZoom || 1) * 100)}%
                  </span>
                </div>
                <input
                  id="camera-zoom-range"
                  data-testid="camera-zoom-slider"
                  type="range"
                  min={80}
                  max={120}
                  step={5}
                  value={Math.round((settings.cameraZoom || 1) * 100)}
                  onChange={(e) =>
                    onUpdateSettings({
                      ...settings,
                      cameraZoom: Number(e.target.value) / 100,
                    })
                  }
                  className="w-full accent-cyan-400 cursor-pointer"
                />
              </div>
            </section>

            {/* =========================================================
                SECTION 3: GAMEPLAY SETTINGS (Show Names, Mini-Map, Mass Info, FPS/Ping)
               ========================================================= */}
            <section
              aria-label="Gameplay Settings"
              className="space-y-2.5 pt-2 border-t border-slate-800"
            >
              <h3 className="text-xs font-bold uppercase tracking-wider text-cyan-400">
                3. Gameplay Settings
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <label className="flex items-center justify-between p-3 rounded-xl bg-slate-950 border border-slate-800 cursor-pointer">
                  <span className="text-xs font-semibold text-slate-200">
                    Show Player Names
                  </span>
                  <input
                    type="checkbox"
                    data-testid="settings-toggle-player-names"
                    checked={settings.showPlayerNames}
                    onChange={(e) =>
                      onUpdateSettings({
                        ...settings,
                        showPlayerNames: e.target.checked,
                      })
                    }
                    className="h-4 w-4 accent-cyan-400"
                  />
                </label>

                <label className="flex items-center justify-between p-3 rounded-xl bg-slate-950 border border-slate-800 cursor-pointer">
                  <span className="text-xs font-semibold text-slate-200">
                    Show Mini-Map
                  </span>
                  <input
                    type="checkbox"
                    data-testid="settings-toggle-minimap"
                    checked={settings.showMinimap}
                    onChange={(e) =>
                      onUpdateSettings({
                        ...settings,
                        showMinimap: e.target.checked,
                      })
                    }
                    className="h-4 w-4 accent-cyan-400"
                  />
                </label>

                <label className="flex items-center justify-between p-3 rounded-xl bg-slate-950 border border-slate-800 cursor-pointer">
                  <span className="text-xs font-semibold text-slate-200">
                    Show Mass Information
                  </span>
                  <input
                    type="checkbox"
                    data-testid="settings-toggle-mass-info"
                    checked={settings.showMassInfo}
                    onChange={(e) =>
                      onUpdateSettings({
                        ...settings,
                        showMassInfo: e.target.checked,
                      })
                    }
                    className="h-4 w-4 accent-cyan-400"
                  />
                </label>

                <label className="flex items-center justify-between p-3 rounded-xl bg-slate-950 border border-slate-800 cursor-pointer">
                  <span className="text-xs font-semibold text-slate-200">
                    Show FPS & Ping Counter
                  </span>
                  <input
                    type="checkbox"
                    data-testid="settings-toggle-fps-ping"
                    checked={settings.showFpsPing}
                    onChange={(e) =>
                      onUpdateSettings({
                        ...settings,
                        showFpsPing: e.target.checked,
                      })
                    }
                    className="h-4 w-4 accent-cyan-400"
                  />
                </label>
              </div>
            </section>

            {/* Footer Action Buttons */}
            {gameState === 'paused' ? (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={onResume}
                  className="py-2.5 rounded-xl bg-cyan-400 hover:bg-cyan-300 text-slate-950 font-display font-bold text-xs cursor-pointer transition-colors"
                >
                  Resume Game
                </button>
                <button
                  type="button"
                  onClick={onRestart}
                  className="py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-white font-semibold text-xs cursor-pointer transition-colors"
                >
                  Restart Match
                </button>
                <button
                  type="button"
                  onClick={onReturnToTitle}
                  className="py-2.5 rounded-xl bg-slate-950 hover:bg-slate-900 border border-slate-800 text-slate-300 font-semibold text-xs cursor-pointer transition-colors"
                >
                  Main Menu
                </button>
              </div>
            ) : (
              <div className="pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={onCloseSettings}
                  className="w-full py-2.5 rounded-xl bg-cyan-400 hover:bg-cyan-300 text-slate-950 font-display font-bold text-xs cursor-pointer transition-colors"
                >
                  Save & Return to Menu
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* VICTORY / GAME OVER RESULT SCREEN MODAL */}
      {gameState === 'gameover' && matchSummary && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Match Results"
          className="fixed inset-0 z-30 flex items-center justify-center p-4 overflow-y-auto"
          style={{ backgroundColor: 'rgba(4, 7, 17, 0.88)' }}
        >
          <div
            className="w-full max-w-2xl rounded-2xl border border-slate-800 p-6 space-y-5"
            style={{ backgroundColor: 'rgba(8, 13, 28, 0.98)' }}
          >
            {/* Header Outcome Banner */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-4">
              <div>
                <div className="text-xs font-mono-tabular uppercase tracking-widest text-slate-400">
                  MATCH RESULTS · {matchSummary.totalRoundsPlayed} ROUNDS PLAYED
                </div>
                <h2
                  className={`text-2xl sm:text-3xl font-display font-extrabold tracking-wide mt-0.5 ${
                    matchSummary.winnerFaction === 'blue'
                      ? 'text-cyan-400'
                      : matchSummary.winnerFaction === 'purple'
                      ? 'text-purple-400'
                      : 'text-white'
                  }`}
                >
                  {matchSummary.winnerFaction === 'blue'
                    ? 'POSITIVE AURA WINS THE MATCH'
                    : matchSummary.winnerFaction === 'purple'
                    ? 'NEGATIVE AURA WINS THE MATCH'
                    : 'MATCH DRAW'}
                </h2>
              </div>

              <div className="flex items-center gap-3 px-4 py-2 rounded-xl bg-slate-950 border border-slate-800 shrink-0">
                <span className="text-2xl font-display font-extrabold font-mono-tabular text-cyan-400">
                  {matchSummary.blueRoundsWon}
                </span>
                <span className="text-xs text-slate-500 uppercase">VS</span>
                <span className="text-2xl font-display font-extrabold font-mono-tabular text-purple-400">
                  {matchSummary.purpleRoundsWon}
                </span>
              </div>
            </div>

            {/* 4 Tabular-Nums Mastery Metric Tiles */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                <div className="text-[11px] text-slate-400 uppercase">
                  Eliminations
                </div>
                <div className="text-xl font-display font-bold font-mono-tabular text-white mt-0.5">
                  {matchSummary.playerEliminations}
                </div>
              </div>
              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                <div className="text-[11px] text-slate-400 uppercase">
                  Peak Mass
                </div>
                <div className="text-xl font-display font-bold font-mono-tabular text-cyan-300 mt-0.5">
                  {matchSummary.playerPeakMass}
                </div>
              </div>
              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                <div className="text-[11px] text-slate-400 uppercase">
                  Energy Absorbed
                </div>
                <div className="text-xl font-display font-bold font-mono-tabular text-purple-300 mt-0.5">
                  {matchSummary.playerEnergyCollected}
                </div>
              </div>
              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                <div className="text-[11px] text-slate-400 uppercase">
                  Match Duration
                </div>
                <div className="text-xl font-display font-bold font-mono-tabular text-slate-200 mt-0.5">
                  {matchSummary.matchDurationSec}s
                </div>
              </div>
            </div>

            {/* Standings Table */}
            <div className="max-h-48 overflow-y-auto rounded-xl border border-slate-800 bg-slate-950">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400">
                    <th className="py-2 px-3 font-medium">#</th>
                    <th className="py-2 px-3 font-medium">Entity</th>
                    <th className="py-2 px-3 font-medium">Faction</th>
                    <th className="py-2 px-3 font-medium text-right">Elims</th>
                    <th className="py-2 px-3 font-medium text-right">Peak Mass</th>
                    <th className="py-2 px-3 font-medium text-right">Energy</th>
                  </tr>
                </thead>
                <tbody>
                  {matchSummary.standings.slice(0, 10).map((row, idx) => (
                    <tr
                      key={row.id}
                      className="border-b border-slate-900/80 text-slate-200"
                    >
                      <td className="py-1.5 px-3 font-mono-tabular text-slate-400">
                        {idx + 1}
                      </td>
                      <td className="py-1.5 px-3 font-semibold">{row.name}</td>
                      <td
                        className={`py-1.5 px-3 font-medium ${
                          row.faction === 'blue'
                            ? 'text-cyan-400'
                            : 'text-purple-400'
                        }`}
                      >
                        {row.faction === 'blue' ? 'Positive' : 'Negative'}
                      </td>
                      <td className="py-1.5 px-3 font-mono-tabular text-right">
                        {row.eliminations}
                      </td>
                      <td className="py-1.5 px-3 font-mono-tabular text-right">
                        {row.peakMass}
                      </td>
                      <td className="py-1.5 px-3 font-mono-tabular text-right">
                        {row.energyCollected}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row gap-3 pt-1">
              <button
                type="button"
                data-start="true"
                onClick={onRestart}
                className="flex-1 py-3 px-5 rounded-xl bg-cyan-400 hover:bg-cyan-300 text-slate-950 font-display font-bold text-sm cursor-pointer transition-colors"
              >
                Play Again
              </button>
              <button
                type="button"
                onClick={onReturnToTitle}
                className="py-3 px-5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 font-semibold text-xs cursor-pointer transition-colors"
              >
                Return to Title Screen
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
