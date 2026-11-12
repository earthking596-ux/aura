import React, { useState } from 'react';
import {
  AIDifficulty,
  BoundaryRule,
  DailyMission,
  Faction,
  GameSettings,
  getMagnetUpgradeSpec,
  INNER_BODY_COLORS,
  MAGNET_UPGRADE_TIERS,
  MatchConfig,
  MAX_TOTAL_PLAYERS,
  PlayerProfile,
  RoomLobbyState,
} from '../game/types';

interface TitleScreenProps {
  config: MatchConfig;
  profile: PlayerProfile;
  settings: GameSettings;
  dailyMissions: DailyMission[];
  onlineCount: number;
  roomState: RoomLobbyState | null;
  roomError: string;
  onClearRoomError: () => void;
  onOpenSettings: () => void;
  onUpdateConfig: (
    next: MatchConfig | ((prev: MatchConfig) => MatchConfig)
  ) => void;
  onUpdateProfile: (next: PlayerProfile) => void;
  onUpdateSettings: (next: GameSettings) => void;
  onUpgradeMagnetWithCoins: () => void;
  onOpenWatchAd: (rewardType: 'coins' | 'magnet_upgrade') => void;
  onClaimMission: (missionId: string) => void;
  onStartMatch: (cfg: MatchConfig) => void;
  onCreatePrivateRoom: (cfg: MatchConfig) => void;
  onJoinPrivateRoom: (code: string, name: string, faction: Faction) => void;
  onSwitchRoomFaction: (faction: Faction, targetPlayerId?: string) => void;
  onUpdateRoomConfig: (cfg: MatchConfig) => void;
  onLeavePrivateRoom: () => void;
  onStartRoomMatch: (cfg: MatchConfig) => void;
}

type MenuMode = 'quick' | 'custom' | 'private';
type ProgressionTab = 'magnet' | 'missions';

const PLAYER_COUNTS = [1, 2, 3, 4, 5];

function computeArenaRadiusForTeams(blue: number, purple: number): number {
  const total = blue + purple;
  return Math.max(2000, Math.min(3000, 1750 + total * 120));
}

export const TitleScreen: React.FC<TitleScreenProps> = ({
  config,
  profile,
  settings,
  dailyMissions,
  onlineCount,
  roomState,
  roomError,
  onClearRoomError,
  onOpenSettings,
  onUpdateConfig,
  onUpdateProfile,
  onUpdateSettings,
  onUpgradeMagnetWithCoins,
  onOpenWatchAd,
  onClaimMission,
  onStartMatch,
  onCreatePrivateRoom,
  onJoinPrivateRoom,
  onSwitchRoomFaction,
  onUpdateRoomConfig,
  onLeavePrivateRoom,
  onStartRoomMatch,
}) => {
  const [menuMode, setMenuMode] = useState<MenuMode>('quick');
  const [progressionTab, setProgressionTab] =
    useState<ProgressionTab>('magnet');
  const [joinCodeInput, setJoinCodeInput] = useState('');
  const [localJoinError, setLocalJoinError] = useState('');
  const [copiedCode, setCopiedCode] = useState(false);

  const currentMagnetLevel = profile.magnetLevel || 1;
  const currentMagnetSpec = getMagnetUpgradeSpec(currentMagnetLevel);
  const nextMagnetSpec =
    currentMagnetLevel < MAGNET_UPGRADE_TIERS.length
      ? getMagnetUpgradeSpec(currentMagnetLevel + 1)
      : null;
  const unclaimedMissionsCount = dailyMissions.filter(
    (m) => (m.completed || m.progress >= m.target) && !m.claimed
  ).length;

  const isBlue = config.playerFaction === 'blue';
  const isRoomHost = Boolean(
    roomState && roomState.hostId === roomState.localPlayerId
  );

  const applyConfigChange = (updater: (prev: MatchConfig) => MatchConfig) => {
    onUpdateConfig((prev) => {
      const next = updater(prev);
      if (roomState && roomState.hostId === roomState.localPlayerId) {
        onUpdateRoomConfig(next);
      }
      return next;
    });
  };

  const handleNameChange = (name: string) => {
    const clean = name.slice(0, 16);
    onUpdateConfig((prev) => ({ ...prev, playerName: clean }));
    onUpdateProfile({ ...profile, name: clean });
  };

  const handleFactionChange = (faction: Faction) => {
    onUpdateConfig((prev) => ({ ...prev, playerFaction: faction }));
    onUpdateProfile({ ...profile, preferredFaction: faction });
    if (roomState) {
      onSwitchRoomFaction(faction);
    }
  };

  const handleBodyColorChange = (hex: string) => {
    onUpdateConfig((prev) => ({ ...prev, playerBodyColor: hex }));
    onUpdateProfile({ ...profile, selectedBodyColor: hex });
  };

  const updateBlueCount = (nextBlueRaw: number) => {
    applyConfigChange((prev) => {
      const clampedBlue = Math.max(
        1,
        Math.min(MAX_TOTAL_PLAYERS - 1, nextBlueRaw)
      );
      const clampedPurple = Math.max(
        1,
        Math.min(MAX_TOTAL_PLAYERS - clampedBlue, prev.purpleTeamSize)
      );
      return {
        ...prev,
        blueTeamSize: clampedBlue,
        purpleTeamSize: clampedPurple,
        presetLabel: `${clampedBlue} vs ${clampedPurple}`,
        arenaRadius: computeArenaRadiusForTeams(clampedBlue, clampedPurple),
      };
    });
  };

  const updatePurpleCount = (nextPurpleRaw: number) => {
    applyConfigChange((prev) => {
      const clampedPurple = Math.max(
        1,
        Math.min(MAX_TOTAL_PLAYERS - 1, nextPurpleRaw)
      );
      const clampedBlue = Math.max(
        1,
        Math.min(MAX_TOTAL_PLAYERS - clampedPurple, prev.blueTeamSize)
      );
      return {
        ...prev,
        blueTeamSize: clampedBlue,
        purpleTeamSize: clampedPurple,
        presetLabel: `${clampedBlue} vs ${clampedPurple}`,
        arenaRadius: computeArenaRadiusForTeams(clampedBlue, clampedPurple),
      };
    });
  };

  const handleJoinSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = joinCodeInput.trim().toUpperCase();
    if (cleaned.length < 4) {
      setLocalJoinError('Please enter a valid 6-letter room code.');
      return;
    }
    setLocalJoinError('');
    onClearRoomError();
    onJoinPrivateRoom(
      cleaned,
      config.playerName || 'NOVA-01',
      config.playerFaction
    );
  };

  const handleCopyRoomCode = () => {
    if (!roomState) return;
    try {
      navigator.clipboard.writeText(roomState.roomCode);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 1800);
    } catch {
      // ignore clipboard errors
    }
  };

  const getRoundsLabel = (roundsToWin: number): string => {
    if (roundsToWin === 1) return '1 Round Match';
    return `First to Win ${roundsToWin} Rounds`;
  };

  const renderTeamSizeSelectors = (disabled = false) => {
    const totalSelected = config.blueTeamSize + config.purpleTeamSize;
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs">
          <span className="font-semibold text-slate-200">
            Custom Team Players (1 to 5 per Team)
          </span>
          <span
            data-testid="room-total-players-badge"
            className="px-2 py-0.5 rounded-md bg-slate-950 border border-cyan-500/40 text-[11px] font-mono-tabular text-cyan-300"
          >
            Room Total: <strong>{totalSelected} / {MAX_TOTAL_PLAYERS} Max</strong>
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {/* Blue Team Custom Count */}
          <div className="p-2.5 rounded-xl bg-slate-950 border border-cyan-500/35 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-cyan-300">
                Blue Team Players
              </span>
              <span className="text-xs font-mono-tabular font-bold text-white">
                {config.blueTeamSize} {config.blueTeamSize === 1 ? 'Player' : 'Players'}
              </span>
            </div>

            <div className="flex items-center gap-1">
              <button
                type="button"
                aria-label="Decrease Blue Team Players"
                onClick={() => updateBlueCount(config.blueTeamSize - 1)}
                disabled={disabled || config.blueTeamSize <= 1}
                className="w-7 h-7 rounded-md bg-slate-900 border border-slate-700 text-white font-bold text-sm hover:bg-slate-800 disabled:opacity-40 cursor-pointer shrink-0"
              >
                -
              </button>

              <div className="flex-1 grid grid-cols-5 gap-1">
                {PLAYER_COUNTS.map((n) => {
                  const isSelected = config.blueTeamSize === n;
                  return (
                    <button
                      key={n}
                      type="button"
                      disabled={disabled}
                      data-testid={`custom-blue-count-${n}`}
                      onClick={() => updateBlueCount(n)}
                      className={`h-7 rounded-md border text-xs font-mono-tabular font-bold transition-colors cursor-pointer disabled:opacity-50 ${
                        isSelected
                          ? 'bg-cyan-400 text-slate-950 border-cyan-300'
                          : 'bg-slate-900 text-slate-300 border-slate-800 hover:border-cyan-500/50 hover:text-white'
                      }`}
                    >
                      {n}
                    </button>
                  );
                })}
              </div>

              <button
                type="button"
                aria-label="Increase Blue Team Players"
                onClick={() => updateBlueCount(config.blueTeamSize + 1)}
                disabled={disabled || config.blueTeamSize >= MAX_TOTAL_PLAYERS - 1}
                className="w-7 h-7 rounded-md bg-slate-900 border border-slate-700 text-white font-bold text-sm hover:bg-slate-800 disabled:opacity-40 cursor-pointer shrink-0"
              >
                +
              </button>
            </div>
          </div>

          {/* Purple Team Custom Count */}
          <div className="p-2.5 rounded-xl bg-slate-950 border border-purple-500/35 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-purple-300">
                Purple Team Players
              </span>
              <span className="text-xs font-mono-tabular font-bold text-white">
                {config.purpleTeamSize} {config.purpleTeamSize === 1 ? 'Player' : 'Players'}
              </span>
            </div>

            <div className="flex items-center gap-1">
              <button
                type="button"
                aria-label="Decrease Purple Team Players"
                onClick={() => updatePurpleCount(config.purpleTeamSize - 1)}
                disabled={disabled || config.purpleTeamSize <= 1}
                className="w-7 h-7 rounded-md bg-slate-900 border border-slate-700 text-white font-bold text-sm hover:bg-slate-800 disabled:opacity-40 cursor-pointer shrink-0"
              >
                -
              </button>

              <div className="flex-1 grid grid-cols-5 gap-1">
                {PLAYER_COUNTS.map((n) => {
                  const isSelected = config.purpleTeamSize === n;
                  return (
                    <button
                      key={n}
                      type="button"
                      disabled={disabled}
                      data-testid={`custom-purple-count-${n}`}
                      onClick={() => updatePurpleCount(n)}
                      className={`h-7 rounded-md border text-xs font-mono-tabular font-bold transition-colors cursor-pointer disabled:opacity-50 ${
                        isSelected
                          ? 'bg-purple-400 text-slate-950 border-purple-300'
                          : 'bg-slate-900 text-slate-300 border-slate-800 hover:border-purple-500/50 hover:text-white'
                      }`}
                    >
                      {n}
                    </button>
                  );
                })}
              </div>

              <button
                type="button"
                aria-label="Increase Purple Team Players"
                onClick={() => updatePurpleCount(config.purpleTeamSize + 1)}
                disabled={
                  disabled || config.purpleTeamSize >= MAX_TOTAL_PLAYERS - 1
                }
                className="w-7 h-7 rounded-md bg-slate-900 border border-slate-700 text-white font-bold text-sm hover:bg-slate-800 disabled:opacity-40 cursor-pointer shrink-0"
              >
                +
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderMatchRulesFields = (disabled = false) => (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2.5">
        <div>
          <label
            htmlFor="total-rounds-select"
            className="block text-[11px] font-medium text-slate-300 mb-1"
          >
            Total Rounds
          </label>
          <select
            id="total-rounds-select"
            disabled={disabled}
            value={config.roundsToWin}
            onChange={(e) => {
              const val = Number(e.target.value);
              applyConfigChange((prev) => ({
                ...prev,
                roundsToWin: val,
              }));
            }}
            className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs font-semibold text-white cursor-pointer disabled:opacity-60"
          >
            <option value={1}>1 Round Match</option>
            <option value={2}>First to Win 2 Rounds</option>
            <option value={3}>First to Win 3 Rounds</option>
            <option value={4}>First to Win 4 Rounds</option>
          </select>
        </div>

        <div>
          <label
            htmlFor="border-rule-select"
            className="block text-[11px] font-medium text-slate-300 mb-1"
          >
            Border Rule
          </label>
          <select
            id="border-rule-select"
            disabled={disabled}
            value={config.boundaryRule}
            onChange={(e) => {
              const rule = e.target.value as BoundaryRule;
              applyConfigChange((prev) => ({
                ...prev,
                boundaryRule: rule,
              }));
            }}
            className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs font-semibold text-white cursor-pointer disabled:opacity-60"
          >
            <option value="eliminate">Eliminate on Border</option>
            <option value="bounce">Bounce on Border</option>
            <option value="drain">Lose Size on Border</option>
          </select>
        </div>
      </div>

      <div className="px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between">
        <span className="text-xs font-medium text-slate-200">
          Special Powers (Q / E / F)
        </span>
        <button
          type="button"
          disabled={disabled}
          onClick={() =>
            applyConfigChange((prev) => ({
              ...prev,
              abilitiesEnabled: !prev.abilitiesEnabled,
            }))
          }
          className={`px-3.5 py-1 rounded-lg border text-xs font-bold transition-colors cursor-pointer disabled:opacity-60 ${
            config.abilitiesEnabled
              ? 'bg-cyan-400 text-slate-950 border-cyan-300'
              : 'bg-slate-800 text-slate-400 border-slate-700'
          }`}
        >
          {config.abilitiesEnabled ? 'ON' : 'OFF'}
        </button>
      </div>
    </div>
  );

  const bluePlayers =
    roomState?.players.filter((p) => p.faction === 'blue') || [];
  const purplePlayers =
    roomState?.players.filter((p) => p.faction === 'purple') || [];

  return (
    <main
      aria-label="AURA.IO Main Menu"
      className="fixed inset-0 z-20 flex flex-col items-center justify-between px-4 py-3 pointer-events-none select-none overflow-y-auto"
      style={{
        background:
          'radial-gradient(circle at 50% 45%, rgba(4,7,17,0.68) 0%, rgba(4,7,17,0.92) 100%)',
      }}
    >
      {/* Top Bar: Players Online, Coin Balance, Watch Ad, Controls & Settings, FPS/Ping & Sound Toggle */}
      <div className="w-full max-w-3xl flex flex-wrap items-center justify-between gap-2 text-xs text-slate-300 pointer-events-auto">
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="font-medium">
            Players Online:{' '}
            <strong className="text-cyan-400 tabular-nums">{onlineCount}</strong>
          </span>
          <span aria-hidden="true">·</span>
          <span>
            Best Score:{' '}
            <strong className="text-white tabular-nums">
              {profile.highestMassRecord}
            </strong>
          </span>
          <span aria-hidden="true">·</span>
          <span
            data-testid="title-coins-badge"
            className="px-2.5 py-1 rounded-lg bg-amber-500/15 border border-amber-400/50 text-amber-300 font-mono-tabular font-bold"
          >
            Coins: {profile.coins ?? 0}
          </span>
          <button
            type="button"
            data-testid="watch-ad-coins-btn"
            onClick={() => onOpenWatchAd('coins')}
            className="px-2.5 py-1 rounded-lg bg-emerald-500/20 border border-emerald-400/60 hover:bg-emerald-500/30 text-emerald-200 font-bold transition-colors cursor-pointer"
          >
            + Watch Ad (+100 Coins)
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            data-testid="open-settings-btn"
            onClick={onOpenSettings}
            className="px-3 py-1.5 rounded-lg bg-cyan-500/15 border border-cyan-400/50 text-cyan-200 hover:bg-cyan-500/25 font-semibold transition-colors cursor-pointer"
          >
            Controls & Sensitivity
          </button>

          <button
            type="button"
            data-testid="title-toggle-fps-ping"
            onClick={() =>
              onUpdateSettings({
                ...settings,
                showFpsPing: !settings.showFpsPing,
              })
            }
            className="px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-200 hover:text-white transition-colors cursor-pointer"
          >
            FPS / Ping: {settings.showFpsPing ? 'ON' : 'OFF'}
          </button>

          <button
            type="button"
            onClick={() =>
              onUpdateSettings({
                ...settings,
                soundEnabled: !settings.soundEnabled,
              })
            }
            className="px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-200 hover:text-white transition-colors cursor-pointer"
          >
            Sound: {settings.soundEnabled ? 'ON' : 'OFF'}
          </button>
        </div>
      </div>

      {/* Centered Clean Main Menu Container */}
      <div className="w-full max-w-[540px] my-auto py-1.5 flex flex-col items-center pointer-events-auto">
        {/* Custom Inline SVG Logo & Simple Subtitle */}
        <div className="flex flex-col items-center text-center mb-2.5">
          <svg
            width="42"
            height="42"
            viewBox="0 0 64 64"
            fill="none"
            aria-hidden="true"
            className="mb-1"
          >
            <circle
              cx="32"
              cy="32"
              r="26"
              stroke={isBlue ? '#00F0FF' : '#C084FC'}
              strokeWidth="2"
              strokeDasharray="10 6"
              opacity="0.75"
            />
            <path
              d="M16 32C16 23.163 23.163 16 32 16C40.837 16 48 23.163 48 32"
              stroke="#00F0FF"
              strokeWidth="3.5"
              strokeLinecap="round"
            />
            <path
              d="M48 32C48 40.837 40.837 48 32 48C23.163 48 16 40.837 16 32"
              stroke="#D946EF"
              strokeWidth="3.5"
              strokeLinecap="round"
            />
            <circle
              cx="32"
              cy="32"
              r="7"
              fill={config.playerBodyColor || '#FFFFFF'}
            />
          </svg>

          <svg
            viewBox="0 0 240 44"
            className="h-8 w-auto overflow-visible"
            role="img"
            aria-label="AURA.IO"
          >
            <text
              x="120"
              y="35"
              textAnchor="middle"
              fill="#F8FAFC"
              fontFamily="Outfit, sans-serif"
              fontWeight="800"
              fontSize="38"
              letterSpacing="5"
            >
              AURA
              <tspan fill={isBlue ? '#00F0FF' : '#C084FC'}>.IO</tspan>
            </text>
          </svg>
          <p className="text-xs text-slate-400 mt-0.5">
            Start as a tiny glowing dot, collect energy, grow longer, and eliminate the opposing team.
          </p>
        </div>

        {/* Main Card */}
        <div
          className="w-full rounded-2xl border border-slate-800 p-4 sm:p-5 space-y-3 shadow-2xl"
          style={{ backgroundColor: 'rgba(8, 13, 26, 0.96)' }}
        >
          {/* Separate Mode Tabs: Quick Play | Custom Match (Play with AI) | Private Room (Play with Friends) */}
          <div
            role="tablist"
            aria-label="Game Mode Selection"
            className="grid grid-cols-3 gap-1.5 p-1 rounded-xl bg-slate-950 border border-slate-800"
          >
            <button
              role="tab"
              aria-selected={menuMode === 'quick'}
              type="button"
              onClick={() => setMenuMode('quick')}
              className={`py-2 px-2.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                menuMode === 'quick'
                  ? 'bg-slate-800 text-white'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Quick Play
            </button>
            <button
              role="tab"
              aria-selected={menuMode === 'custom'}
              type="button"
              onClick={() => setMenuMode('custom')}
              className={`py-2 px-2.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                menuMode === 'custom'
                  ? 'bg-slate-800 text-cyan-300'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Custom Match
            </button>
            <button
              role="tab"
              aria-selected={menuMode === 'private'}
              type="button"
              onClick={() => setMenuMode('private')}
              className={`py-2 px-2.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                menuMode === 'private'
                  ? 'bg-slate-800 text-purple-300'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Private Room
            </button>
          </div>

          {/* Player Name, Team Aura & Inner Body Colour Customization */}
          {!(menuMode === 'private' && roomState) && (
            <div className="space-y-2.5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <label
                    htmlFor="player-name-input"
                    className="block text-xs font-medium text-slate-300 mb-1"
                  >
                    Your Name
                  </label>
                  <input
                    id="player-name-input"
                    type="text"
                    value={config.playerName}
                    onChange={(e) => handleNameChange(e.target.value)}
                    placeholder="Enter your name..."
                    maxLength={16}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs font-semibold focus:outline-none focus:border-cyan-400"
                  />
                </div>

                <div>
                  <span className="block text-xs font-medium text-slate-300 mb-1">
                    Your Team Aura (Permanent Outline)
                  </span>
                  <div className="grid grid-cols-2 gap-1.5">
                    <button
                      type="button"
                      onClick={() => handleFactionChange('blue')}
                      className={`py-2 px-2.5 rounded-xl border text-left transition-colors cursor-pointer flex items-center gap-1.5 ${
                        isBlue
                          ? 'border-cyan-400 bg-cyan-950/35 text-white'
                          : 'border-slate-800 bg-slate-950 text-slate-400 hover:border-slate-700'
                      }`}
                    >
                      <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 shrink-0" />
                      <span className="text-[11px] font-bold whitespace-nowrap">
                        Positive Aura
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleFactionChange('purple')}
                      className={`py-2 px-2.5 rounded-xl border text-left transition-colors cursor-pointer flex items-center gap-1.5 ${
                        !isBlue
                          ? 'border-purple-400 bg-purple-950/35 text-white'
                          : 'border-slate-800 bg-slate-950 text-slate-400 hover:border-slate-700'
                      }`}
                    >
                      <span className="w-2.5 h-2.5 rounded-full bg-purple-400 shrink-0" />
                      <span className="text-[11px] font-bold whitespace-nowrap">
                        Negative Aura
                      </span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Inner Body Colour Selector (Section 11) */}
              <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800/90 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="text-xs font-medium text-slate-200">
                    Inner Body Colour
                  </div>
                  <div className="text-[10px] text-slate-400">
                    {isBlue
                      ? 'Positive Aura keeps Cyan outer glow & outline'
                      : 'Negative Aura keeps Purple outer glow & outline'}
                  </div>
                </div>

                <div
                  role="radiogroup"
                  aria-label="Entity Inner Body Colour"
                  className="flex items-center gap-1.5"
                >
                  {INNER_BODY_COLORS.map((c) => {
                    const selected =
                      (config.playerBodyColor || '#38BDF8').toUpperCase() ===
                      c.hex.toUpperCase();
                    return (
                      <button
                        key={c.id}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        aria-label={c.label}
                        data-testid={`body-color-${c.id}`}
                        onClick={() => handleBodyColorChange(c.hex)}
                        title={c.label}
                        className={`w-6 h-6 rounded-full cursor-pointer transition-transform ${
                          selected
                            ? 'scale-110 ring-2 ring-white'
                            : 'opacity-80 hover:opacity-100'
                        }`}
                        style={{
                          backgroundColor: c.hex,
                          border: `2px solid ${isBlue ? '#00F0FF' : '#C084FC'}`,
                          boxShadow: selected
                            ? `0 0 10px ${isBlue ? '#00F0FF' : '#C084FC'}`
                            : 'none',
                        }}
                      />
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* =========================================================
              MODE 1: QUICK PLAY (Custom Player Selection up to 6 Total in Room)
             ========================================================= */}
          {menuMode === 'quick' && (
            <div className="space-y-2.5 pt-1 border-t border-slate-800/80">
              {renderTeamSizeSelectors(false)}
            </div>
          )}

          {/* =========================================================
              MODE 2: CUSTOM MATCH – PLAY WITH AI
             ========================================================= */}
          {menuMode === 'custom' && (
            <div className="space-y-3 pt-2 border-t border-slate-800/80">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-cyan-300">
                  Custom Match — Play with AI
                </span>
                <span className="text-slate-400">
                  Independent Teams (Up to 6 Total Players)
                </span>
              </div>

              {/* Independent Blue & Purple Team Player Count Selectors */}
              {renderTeamSizeSelectors(false)}

              {/* Total Rounds, Border Rule, Special Powers ON/OFF */}
              {renderMatchRulesFields(false)}

              {/* AI Difficulty: Easy, Normal, Hard */}
              <div>
                <label
                  htmlFor="ai-difficulty-select"
                  className="block text-[11px] font-medium text-slate-300 mb-1"
                >
                  AI Difficulty
                </label>
                <div
                  id="ai-difficulty-select"
                  className="grid grid-cols-3 gap-2"
                >
                  {(
                    [
                      { id: 'novice', label: 'Easy' },
                      { id: 'tactical', label: 'Normal' },
                      { id: 'apex', label: 'Hard' },
                    ] as Array<{ id: AIDifficulty; label: string }>
                  ).map((diff) => (
                    <button
                      key={diff.id}
                      type="button"
                      onClick={() =>
                        applyConfigChange((prev) => ({
                          ...prev,
                          aiDifficulty: diff.id,
                        }))
                      }
                      className={`py-1.5 px-3 rounded-xl border text-xs font-semibold cursor-pointer ${
                        config.aiDifficulty === diff.id
                          ? 'border-cyan-400 bg-cyan-950/40 text-white'
                          : 'border-slate-800 bg-slate-950 text-slate-400 hover:text-white'
                      }`}
                    >
                      {diff.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* =========================================================
              MODE 3: PRIVATE ROOM – PLAY WITH FRIENDS (REAL PLAYERS ONLY)
             ========================================================= */}
          {menuMode === 'private' && !roomState && (
            <div className="space-y-3 pt-2 border-t border-slate-800/80">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-purple-300">
                  Private Room — Play with Friends
                </span>
                <span className="text-slate-400">
                  Real Online Players (Max 6 Total)
                </span>
              </div>

              {/* Join Existing Room by Code */}
              <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800">
                <form
                  onSubmit={handleJoinSubmit}
                  className="flex items-center gap-2"
                >
                  <input
                    aria-label="Room Code"
                    type="text"
                    value={joinCodeInput}
                    onChange={(e) => {
                      setJoinCodeInput(e.target.value.toUpperCase());
                      if (localJoinError) setLocalJoinError('');
                      if (roomError) onClearRoomError();
                    }}
                    placeholder="Have a friend's Room Code? Enter here"
                    maxLength={8}
                    className="flex-1 px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-xs font-mono-tabular uppercase text-white focus:outline-none focus:border-purple-400"
                  />
                  <button
                    type="submit"
                    className="px-3.5 py-1.5 rounded-lg bg-purple-500/25 border border-purple-400/60 hover:bg-purple-500/35 text-purple-200 text-xs font-semibold cursor-pointer shrink-0"
                  >
                    Join Room
                  </button>
                </form>
                {(localJoinError || roomError) && (
                  <p className="text-xs text-rose-400 mt-1.5">
                    {localJoinError || roomError}
                  </p>
                )}
              </div>

              {/* Configure All Match Settings Before Creating the Room */}
              <div className="space-y-2.5">
                <div className="text-xs font-medium text-slate-300">
                  Or Configure Settings to Create a New Room:
                </div>
                {renderTeamSizeSelectors(false)}
                {renderMatchRulesFields(false)}
              </div>
            </div>
          )}

          {/* =========================================================
              MODE 3 (ACTIVE LOBBY): AFTER CREATING OR JOINING A PRIVATE ROOM
             ========================================================= */}
          {menuMode === 'private' && roomState && (
            <div className="space-y-3 pt-2 border-t border-slate-800/80">
              {/* Room Code Banner */}
              <div className="p-3 rounded-xl bg-slate-950 border border-cyan-500/40 flex items-center justify-between gap-2">
                <div>
                  <div className="text-[11px] text-slate-400">
                    Share this Room Code with friends:
                  </div>
                  <div
                    data-testid="private-room-code"
                    className="text-xl font-display font-extrabold font-mono-tabular tracking-widest text-cyan-300"
                  >
                    {roomState.roomCode}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleCopyRoomCode}
                    className="px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 hover:border-cyan-400 text-xs font-semibold text-slate-200 cursor-pointer"
                  >
                    {copiedCode ? 'Copied!' : 'Copy Code'}
                  </button>
                  <button
                    type="button"
                    onClick={onLeavePrivateRoom}
                    className="px-3 py-1.5 rounded-lg bg-rose-950/50 border border-rose-500/40 hover:bg-rose-900/50 text-xs font-semibold text-rose-200 cursor-pointer"
                  >
                    Leave Room
                  </button>
                </div>
              </div>

              {/* Joined Players & Teams Roster */}
              <div className="grid grid-cols-2 gap-2.5">
                {/* Blue Team Roster */}
                <div className="p-2.5 rounded-xl bg-slate-950 border border-cyan-500/30 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between text-xs font-semibold text-cyan-300 mb-2">
                      <span>Positive Aura</span>
                      <span className="font-mono-tabular">
                        {bluePlayers.length}/{config.blueTeamSize}
                      </span>
                    </div>

                    <div className="space-y-1.5 max-h-28 overflow-y-auto">
                      {bluePlayers.length === 0 ? (
                        <div className="text-[11px] text-slate-500 py-1">
                          No players on Blue Team yet
                        </div>
                      ) : (
                        bluePlayers.map((p) => (
                          <div
                            key={p.id}
                            className="px-2 py-1 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-between gap-1 text-xs"
                          >
                            <span className="font-medium text-white truncate">
                              {p.name}
                              {p.id === roomState.localPlayerId ? ' (You)' : ''}
                              {p.isHost ? ' ★' : ''}
                            </span>
                            {isRoomHost && (
                              <button
                                type="button"
                                title="Move player to Purple Team"
                                onClick={() =>
                                  onSwitchRoomFaction('purple', p.id)
                                }
                                className="px-1.5 py-0.5 rounded bg-purple-500/20 border border-purple-400/40 text-[10px] text-purple-300 hover:bg-purple-500/30 cursor-pointer shrink-0"
                              >
                                To Purple →
                              </button>
                            )}
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  {!isBlue && (
                    <button
                      type="button"
                      onClick={() => handleFactionChange('blue')}
                      className="mt-2 w-full py-1.5 rounded-lg bg-cyan-500/15 border border-cyan-400/40 text-cyan-300 text-xs font-semibold hover:bg-cyan-500/25 cursor-pointer"
                    >
                      Join Blue Team
                    </button>
                  )}
                </div>

                {/* Purple Team Roster */}
                <div className="p-2.5 rounded-xl bg-slate-950 border border-purple-500/30 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between text-xs font-semibold text-purple-300 mb-2">
                      <span>Negative Aura</span>
                      <span className="font-mono-tabular">
                        {purplePlayers.length}/{config.purpleTeamSize}
                      </span>
                    </div>

                    <div className="space-y-1.5 max-h-28 overflow-y-auto">
                      {purplePlayers.length === 0 ? (
                        <div className="text-[11px] text-slate-500 py-1">
                          No players on Purple Team yet
                        </div>
                      ) : (
                        purplePlayers.map((p) => (
                          <div
                            key={p.id}
                            className="px-2 py-1 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-between gap-1 text-xs"
                          >
                            <span className="font-medium text-white truncate">
                              {p.name}
                              {p.id === roomState.localPlayerId ? ' (You)' : ''}
                              {p.isHost ? ' ★' : ''}
                            </span>
                            {isRoomHost && (
                              <button
                                type="button"
                                title="Move player to Blue Team"
                                onClick={() =>
                                  onSwitchRoomFaction('blue', p.id)
                                }
                                className="px-1.5 py-0.5 rounded bg-cyan-500/20 border border-cyan-400/40 text-[10px] text-cyan-300 hover:bg-cyan-500/30 cursor-pointer shrink-0"
                              >
                                ← To Blue
                              </button>
                            )}
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  {isBlue && (
                    <button
                      type="button"
                      onClick={() => handleFactionChange('purple')}
                      className="mt-2 w-full py-1.5 rounded-lg bg-purple-500/15 border border-purple-400/40 text-purple-300 text-xs font-semibold hover:bg-purple-500/25 cursor-pointer"
                    >
                      Join Purple Team
                    </button>
                  )}
                </div>
              </div>

              {/* Room Owner Can Change Settings Before Starting */}
              <div className="space-y-2 pt-1">
                <div className="flex items-center justify-between text-[11px] text-slate-400">
                  <span>
                    {isRoomHost
                      ? 'Room Settings (You can change teams & settings before starting):'
                      : 'Room Settings (Chosen by Room Owner):'}
                  </span>
                </div>
                {renderTeamSizeSelectors(!isRoomHost)}
                {renderMatchRulesFields(!isRoomHost)}
              </div>
            </div>
          )}

          {/* =========================================================
              MAGNET [F] SKILL UPGRADE & DAILY MISSIONS PANEL
             ========================================================= */}
          <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-2.5">
            {/* Switch between Magnet [F] Skill Upgrade & Daily Missions */}
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  data-testid="tab-magnet-skill"
                  onClick={() => setProgressionTab('magnet')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                    progressionTab === 'magnet'
                      ? 'bg-cyan-500/20 border border-cyan-400/60 text-cyan-300'
                      : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Magnet [F] Skill (Lv.{currentMagnetLevel}/5)
                </button>
                <button
                  type="button"
                  data-testid="tab-daily-missions"
                  onClick={() => setProgressionTab('missions')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5 ${
                    progressionTab === 'missions'
                      ? 'bg-amber-500/20 border border-amber-400/60 text-amber-300'
                      : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <span>Daily Missions</span>
                  {unclaimedMissionsCount > 0 && (
                    <span className="px-1.5 py-0.2 rounded-full bg-amber-400 text-slate-950 text-[10px] font-extrabold">
                      {unclaimedMissionsCount}
                    </span>
                  )}
                </button>
              </div>

              {(profile.bonusStartMass || 0) > 0 && (
                <span className="text-[11px] font-mono-tabular font-semibold text-emerald-400">
                  Start Bonus: +{profile.bonusStartMass} Mass
                </span>
              )}
            </div>

            {progressionTab === 'magnet' ? (
              <div
                data-testid="magnet-upgrade-panel"
                className="space-y-2 text-xs"
              >
                <div className="flex flex-wrap items-center justify-between gap-1 text-[11px] text-slate-300">
                  <span>
                    Press <strong className="text-cyan-300">[F]</strong> in match
                    (0 Mass cost) to pull nearby energy orbs into your core.
                  </span>
                  <span className="font-mono-tabular font-bold text-amber-300">
                    Your Coins: {profile.coins ?? 0}
                  </span>
                </div>

                {/* Stats Grid: Range, Duration, Cooldown */}
                <div className="grid grid-cols-3 gap-2">
                  <div className="p-2 rounded-lg bg-slate-900/90 border border-slate-800">
                    <div className="text-[10px] text-slate-400">Pull Range</div>
                    <div className="font-mono-tabular font-bold text-white">
                      {currentMagnetSpec.pullRadius}px
                      {nextMagnetSpec && (
                        <span className="text-emerald-400 text-[11px] ml-1">
                          → {nextMagnetSpec.pullRadius}px
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="p-2 rounded-lg bg-slate-900/90 border border-slate-800">
                    <div className="text-[10px] text-slate-400">Duration</div>
                    <div className="font-mono-tabular font-bold text-white">
                      {currentMagnetSpec.duration.toFixed(1)}s
                      {nextMagnetSpec && (
                        <span className="text-emerald-400 text-[11px] ml-1">
                          → {nextMagnetSpec.duration.toFixed(1)}s
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="p-2 rounded-lg bg-slate-900/90 border border-slate-800">
                    <div className="text-[10px] text-slate-400">Cooldown</div>
                    <div className="font-mono-tabular font-bold text-white">
                      {currentMagnetSpec.cooldown.toFixed(1)}s
                      {nextMagnetSpec && (
                        <span className="text-emerald-400 text-[11px] ml-1">
                          → {nextMagnetSpec.cooldown.toFixed(1)}s
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Upgrade Actions: Coins or Watch Ad */}
                {nextMagnetSpec ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-0.5">
                    <button
                      type="button"
                      data-testid="upgrade-magnet-coins-btn"
                      disabled={(profile.coins ?? 0) < nextMagnetSpec.coinCost}
                      onClick={onUpgradeMagnetWithCoins}
                      className="py-2 px-3 rounded-lg bg-amber-400 hover:bg-amber-300 disabled:bg-slate-800 disabled:text-slate-500 text-slate-950 font-bold text-xs transition-colors cursor-pointer disabled:cursor-not-allowed"
                    >
                      Upgrade to Lv.{nextMagnetSpec.level} (
                      {nextMagnetSpec.coinCost} Coins)
                    </button>

                    <button
                      type="button"
                      data-testid="upgrade-magnet-ad-btn"
                      onClick={() => onOpenWatchAd('magnet_upgrade')}
                      className="py-2 px-3 rounded-lg bg-cyan-500/20 border border-cyan-400/60 hover:bg-cyan-500/30 text-cyan-200 font-bold text-xs transition-colors cursor-pointer"
                    >
                      Watch 15s Ad → Free Lv.{nextMagnetSpec.level} Upgrade
                    </button>
                  </div>
                ) : (
                  <div className="py-1.5 px-3 rounded-lg bg-emerald-950/40 border border-emerald-500/40 text-emerald-300 text-center font-bold text-xs">
                    MAX LEVEL REACHED (Lv.5 Master Energy Magnet)
                  </div>
                )}
              </div>
            ) : (
              <div
                data-testid="daily-missions-panel"
                className="space-y-1.5 max-h-40 overflow-y-auto pr-0.5"
              >
                {dailyMissions.length === 0 ? (
                  <div className="text-xs text-slate-400 py-2 text-center">
                    Loading Daily Missions...
                  </div>
                ) : (
                  dailyMissions.map((m) => {
                    const pct = Math.min(
                      100,
                      Math.round((m.progress / Math.max(1, m.target)) * 100)
                    );
                    return (
                      <div
                        key={m.id}
                        className="p-2 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-between gap-2 text-xs"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-bold text-white truncate">
                              {m.title}
                            </span>
                            <span className="font-mono-tabular text-[11px] text-amber-300 shrink-0">
                              +{m.rewardCoins} Coins · +{m.rewardBonusMass} Mass
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-400 truncate">
                            {m.description} ({m.progress}/{m.target})
                          </div>
                          <div className="w-full h-1.5 rounded-full bg-slate-950 overflow-hidden mt-1">
                            <div
                              className="h-full bg-cyan-400 transition-all"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>

                        <div className="shrink-0">
                          {m.claimed ? (
                            <span className="px-2.5 py-1 rounded-md bg-slate-800 text-slate-400 text-[11px] font-semibold">
                              Claimed
                            </span>
                          ) : m.completed || m.progress >= m.target ? (
                            <button
                              type="button"
                              data-testid={`claim-mission-${m.id}`}
                              onClick={() => onClaimMission(m.id)}
                              className="px-2.5 py-1.5 rounded-md bg-amber-400 hover:bg-amber-300 text-slate-950 font-extrabold text-[11px] cursor-pointer"
                            >
                              Claim
                            </button>
                          ) : (
                            <span className="px-2 py-1 rounded-md bg-slate-950 border border-slate-800 text-slate-400 font-mono-tabular text-[11px]">
                              {pct}%
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </div>

          {/* Clear Summary of Selected Team Sizes Before Starting */}
          <div className="px-3.5 py-2 rounded-xl bg-slate-950/90 border border-slate-800 flex items-center justify-between text-xs">
            <div className="flex items-center gap-2 font-semibold">
              <span className="text-cyan-400 tabular-nums">
                Blue Team: {config.blueTeamSize}
              </span>
              <span className="text-slate-500">vs</span>
              <span className="text-purple-400 tabular-nums">
                Purple Team: {config.purpleTeamSize}
              </span>
              <span className="text-slate-500">·</span>
              <span className="text-slate-300 font-mono-tabular">
                {config.blueTeamSize + config.purpleTeamSize}/{MAX_TOTAL_PLAYERS} Max
              </span>
            </div>
            <span className="text-slate-400">
              {getRoundsLabel(config.roundsToWin)}
            </span>
          </div>

          {/* Primary Action Button per Mode */}
          {menuMode === 'private' ? (
            !roomState ? (
              <button
                type="button"
                data-testid="create-private-room-btn"
                onClick={() => onCreatePrivateRoom(config)}
                className="w-full py-3.5 px-6 rounded-xl font-display font-bold text-base tracking-wide active:scale-[0.99] cursor-pointer transition-colors bg-purple-400 hover:bg-purple-300 text-slate-950 shadow-[0_0_24px_rgba(192,132,252,0.28)]"
              >
                Create Room ({config.blueTeamSize} vs {config.purpleTeamSize})
              </button>
            ) : isRoomHost ? (
              <button
                type="button"
                data-start="true"
                data-testid="start-private-room-btn"
                onClick={() => onStartRoomMatch(config)}
                className="w-full py-3.5 px-6 rounded-xl font-display font-bold text-base tracking-wide active:scale-[0.99] cursor-pointer transition-colors bg-cyan-400 hover:bg-cyan-300 text-slate-950 shadow-[0_0_24px_rgba(0,240,255,0.28)]"
              >
                Start Room Match ({bluePlayers.length} Blue vs{' '}
                {purplePlayers.length} Purple Joined)
              </button>
            ) : (
              <div className="w-full py-3 px-4 rounded-xl bg-slate-900 border border-slate-800 text-center text-xs font-semibold text-slate-300">
                Waiting for Room Owner to start the match...
              </div>
            )
          ) : (
            <button
              type="button"
              data-start="true"
              onClick={() => onStartMatch(config)}
              className={`w-full py-3.5 px-6 rounded-xl font-display font-bold text-base tracking-wide active:scale-[0.99] cursor-pointer transition-colors ${
                isBlue
                  ? 'bg-cyan-400 hover:bg-cyan-300 text-slate-950 shadow-[0_0_24px_rgba(0,240,255,0.28)]'
                  : 'bg-purple-400 hover:bg-purple-300 text-slate-950 shadow-[0_0_24px_rgba(192,132,252,0.28)]'
              }`}
            >
              {menuMode === 'custom'
                ? `Play vs AI (${config.blueTeamSize} vs ${config.purpleTeamSize})`
                : `Play Match (${config.blueTeamSize} vs ${config.purpleTeamSize})`}
            </button>
          )}
        </div>
      </div>

      {/* Simple Control Hint Line at Bottom */}
      <div className="w-full text-center text-xs text-slate-400 tracking-wide">
        Mouse / Arrow Keys / WASD Move · Space / Left-Click Boost · [F] Energy Magnet · Esc Settings
      </div>
    </main>
  );
};
