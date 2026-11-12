import { useEffect, useRef, useState } from 'react';
import { GameHud } from './components/GameHud';
import { RewardedAdModal, AdRewardType } from './components/RewardedAdModal';
import { StatusModals } from './components/StatusModals';
import { TitleScreen } from './components/TitleScreen';
import { AuraGameEngine, HudTelemetrySnapshot } from './game/engine';
import {
  DailyMission,
  DEFAULT_CONTROL_SENSITIVITY,
  DEFAULT_MATCH_CONFIG,
  GameSettings,
  GameState,
  getMagnetUpgradeSpec,
  MAGNET_UPGRADE_TIERS,
  MatchConfig,
  MatchSummarySnapshot,
  PlayerProfile,
  RoomLobbyState,
} from './game/types';

const PROFILE_STORAGE_KEY = 'aura_io_profile_v1';
const SETTINGS_STORAGE_KEY = 'aura_io_settings_v2';
const PLAYER_ID_STORAGE_KEY = 'aura_io_player_id_v1';

function getOrCreatePlayerId(): string {
  try {
    const existing = localStorage.getItem(PLAYER_ID_STORAGE_KEY);
    if (existing) return existing;
    const created = `player_${Math.random().toString(36).slice(2, 10)}`;
    localStorage.setItem(PLAYER_ID_STORAGE_KEY, created);
    return created;
  } catch {
    return 'local_player';
  }
}

const DEFAULT_PROFILE: PlayerProfile = {
  name: 'NOVA-01',
  preferredFaction: 'blue',
  selectedSkin: 'celestial',
  selectedBodyColor: '#38BDF8',
  matchesPlayed: 4,
  matchesWon: 3,
  totalEliminations: 14,
  highestMassRecord: 340,
  totalEnergyCollected: 1280,
  coins: 150,
  magnetLevel: 1,
  bonusStartMass: 0,
};

const FALLBACK_DAILY_MISSIONS: DailyMission[] = [
  {
    id: 'energy_collector',
    title: 'Cosmic Harvester',
    description: 'Collect 120 Energy Orbs across matches',
    target: 120,
    progress: 0,
    rewardCoins: 100,
    rewardBonusMass: 5,
    completed: false,
    claimed: false,
  },
  {
    id: 'arena_hunter',
    title: 'Aura Eliminator',
    description: 'Eliminate 3 opposing players in arena rounds',
    target: 3,
    progress: 0,
    rewardCoins: 150,
    rewardBonusMass: 8,
    completed: false,
    claimed: false,
  },
  {
    id: 'match_victor',
    title: 'Apex Survivor',
    description: 'Win 1 complete team match',
    target: 1,
    progress: 0,
    rewardCoins: 120,
    rewardBonusMass: 6,
    completed: false,
    claimed: false,
  },
];

const DEFAULT_SETTINGS: GameSettings = {
  soundEnabled: true,
  masterVolume: 0.65,
  visualQuality: 'high',
  cameraZoom: 1.0,
  screenShake: true,
  mouseSensitivity: DEFAULT_CONTROL_SENSITIVITY.mouseSensitivity,
  keyboardSensitivity: DEFAULT_CONTROL_SENSITIVITY.keyboardSensitivity,
  joystickSensitivity: DEFAULT_CONTROL_SENSITIVITY.joystickSensitivity,
  touchControlsMode: 'auto',
  showPlayerNames: true,
  showMinimap: true,
  showMassInfo: true,
  showFpsPing: true,
};

const INITIAL_HUD_TELEMETRY: HudTelemetrySnapshot = {
  playerName: 'NOVA-01',
  roundNumber: 1,
  maxRounds: 5,
  roundsToWin: 3,
  blueRoundsWon: 0,
  purpleRoundsWon: 0,
  blueAlive: 3,
  purpleAlive: 3,
  blueTotal: 3,
  purpleTotal: 3,
  roundTimeRemaining: 90,
  playerMass: 10,
  playerLength: 1,
  playerRank: 1,
  totalEntities: 6,
  playerAlive: true,
  playerFaction: 'blue',
  boostEnergy: 100,
  isBoosting: false,
  abilitiesEnabled: false,
  magnetLevel: 1,
  abilities: {
    shield: { cooldownRemaining: 0, activeRemaining: 0 },
    surge: { cooldownRemaining: 0, activeRemaining: 0 },
    attract: { cooldownRemaining: 0, activeRemaining: 0 },
    pulse: { cooldownRemaining: 0, activeRemaining: 0 },
    vortex: { cooldownRemaining: 0, activeRemaining: 0 },
    disrupt: { cooldownRemaining: 0, activeRemaining: 0 },
  },
  killFeed: [],
  roundBanner: {
    active: false,
    roundNumber: 1,
    winnerFaction: 'blue',
    reason: '',
    countdown: 0,
  },
  minimapEntities: [],
  arenaRadius: 2200,
  isOnlineConnected: false,
  onlinePlayersCount: 1,
  isPointerLocked: false,
  fps: 60,
  pingMs: 12,
};

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<AuraGameEngine | null>(null);
  const playerIdRef = useRef<string>(getOrCreatePlayerId());

  const [profile, setProfile] = useState<PlayerProfile>(() => {
    try {
      const saved = localStorage.getItem(PROFILE_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        return {
          ...DEFAULT_PROFILE,
          ...parsed,
          coins: typeof parsed.coins === 'number' ? parsed.coins : 150,
          magnetLevel:
            typeof parsed.magnetLevel === 'number' ? parsed.magnetLevel : 1,
          bonusStartMass:
            typeof parsed.bonusStartMass === 'number'
              ? parsed.bonusStartMass
              : 0,
        };
      }
    } catch {
      // ignore storage errors
    }
    return DEFAULT_PROFILE;
  });

  const [settings, setSettings] = useState<GameSettings>(() => {
    try {
      const saved = localStorage.getItem(SETTINGS_STORAGE_KEY);
      if (saved) return { ...DEFAULT_SETTINGS, ...JSON.parse(saved) };
    } catch {
      // ignore storage errors
    }
    return DEFAULT_SETTINGS;
  });

  const [config, setConfig] = useState<MatchConfig>(() => ({
    ...DEFAULT_MATCH_CONFIG,
    playerName: profile.name,
    playerFaction: profile.preferredFaction,
    playerSkin: profile.selectedSkin,
    playerBodyColor: profile.selectedBodyColor || '#38BDF8',
    playerMagnetLevel: profile.magnetLevel || 1,
    bonusStartMass: profile.bonusStartMass || 0,
  }));

  const [dailyMissions, setDailyMissions] = useState<DailyMission[]>(
    FALLBACK_DAILY_MISSIONS
  );
  const [adModalRewardType, setAdModalRewardType] =
    useState<AdRewardType | null>(null);

  const [gameState, setGameState] = useState<GameState>('title');
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [telemetry, setTelemetry] = useState<HudTelemetrySnapshot>(
    INITIAL_HUD_TELEMETRY
  );
  const [matchSummary, setMatchSummary] = useState<MatchSummarySnapshot | null>(
    null
  );
  const [roomState, setRoomState] = useState<RoomLobbyState | null>(null);
  const [roomError, setRoomError] = useState<string>('');

  // Fetch Daily Missions from Backend on Mount
  useEffect(() => {
    let cancelled = false;
    fetch(
      `/api/missions?playerId=${encodeURIComponent(playerIdRef.current)}`
    )
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data && Array.isArray(data.missions)) {
          setDailyMissions(data.missions);
        }
      })
      .catch(() => {
        // Keep fallback missions if offline
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Sync Magnet Level & Bonus Start Mass into MatchConfig
  useEffect(() => {
    setConfig((prev) => {
      const next: MatchConfig = {
        ...prev,
        playerMagnetLevel: profile.magnetLevel || 1,
        bonusStartMass: profile.bonusStartMass || 0,
      };
      if (engineRef.current) {
        engineRef.current.config = { ...next };
      }
      return next;
    });
  }, [profile.magnetLevel, profile.bonusStartMass]);

  useEffect(() => {
    document.body.dataset.state = 'title';

    const engine = new AuraGameEngine({
      initialConfig: config,
      initialSettings: settings,
      onHudUpdate: (snapshot) => {
        setTelemetry(snapshot);
      },
      onStateChange: (nextState, summary) => {
        setGameState(nextState);
        if (nextState === 'playing') {
          setIsSettingsOpen(false);
        }
        if (summary) {
          setMatchSummary(summary);
        }
      },
      onMatchCompleteStats: (stats) => {
        const earnedCoins =
          25 + stats.eliminations * 15 + (stats.won ? 40 : 0);

        setProfile((prev) => {
          const updated: PlayerProfile = {
            ...prev,
            matchesPlayed: prev.matchesPlayed + 1,
            matchesWon: prev.matchesWon + (stats.won ? 1 : 0),
            totalEliminations: prev.totalEliminations + stats.eliminations,
            highestMassRecord: Math.max(prev.highestMassRecord, stats.peakMass),
            totalEnergyCollected:
              prev.totalEnergyCollected + stats.energyCollected,
            coins: (prev.coins || 0) + earnedCoins,
          };
          try {
            localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(updated));
          } catch {
            // ignore
          }
          return updated;
        });

        // Report match progress to backend Daily Missions tracker
        fetch('/api/missions/progress', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            playerId: playerIdRef.current,
            energyCollected: stats.energyCollected,
            eliminations: stats.eliminations,
            won: stats.won,
          }),
        })
          .then((res) => (res.ok ? res.json() : null))
          .then((data) => {
            if (data && Array.isArray(data.missions)) {
              setDailyMissions(data.missions);
            }
          })
          .catch(() => {
            // Update local fallback missions if offline
            setDailyMissions((prev) =>
              prev.map((m) => {
                if (m.claimed) return m;
                let nextProgress = m.progress;
                if (m.id === 'energy_collector') {
                  nextProgress = Math.min(
                    m.target,
                    m.progress + stats.energyCollected
                  );
                } else if (m.id === 'arena_hunter') {
                  nextProgress = Math.min(
                    m.target,
                    m.progress + stats.eliminations
                  );
                } else if (m.id === 'match_victor' && stats.won) {
                  nextProgress = Math.min(m.target, m.progress + 1);
                }
                return {
                  ...m,
                  progress: nextProgress,
                  completed: nextProgress >= m.target,
                };
              })
            );
          });
      },
      onRoomUpdate: (info) => {
        setRoomState(info);
        setRoomError('');
        if (info) {
          const me = info.players.find((p) => p.id === info.localPlayerId);
          setConfig((prev) => ({
            ...prev,
            ...info.config,
            playerFaction: me ? me.faction : prev.playerFaction,
          }));
        }
      },
      onRoomError: (msg) => {
        setRoomError(msg);
      },
      onCloseSettingsModal: () => {
        setIsSettingsOpen(false);
      },
    });

    engineRef.current = engine;
    if (canvasRef.current) {
      engine.mountCanvas(canvasRef.current);
    }

    // Support ?autostart=1 to jump directly into active gameplay
    const params = new URLSearchParams(window.location.search);
    if (params.get('autostart') === '1') {
      engine.startMatch(config);
    }

    return () => {
      engine.unmountCanvas();
    };
  }, []);

  useEffect(() => {
    if (engineRef.current) {
      engineRef.current.isSettingsModalOpen = isSettingsOpen;
    }
  }, [isSettingsOpen]);

  const handleRestartMatch = () => {
    if (roomState?.roomCode && roomState.hostId === roomState.localPlayerId) {
      engineRef.current?.startRoomMatch(config);
    } else {
      engineRef.current?.startMatch(config);
    }
  };

  const handleUpdateConfig = (
    nextOrUpdater: MatchConfig | ((prev: MatchConfig) => MatchConfig)
  ) => {
    setConfig((prev) => {
      const next =
        typeof nextOrUpdater === 'function'
          ? nextOrUpdater(prev)
          : nextOrUpdater;
      if (engineRef.current) {
        engineRef.current.config = { ...next };
      }
      return next;
    });
  };

  const handleUpdateProfile = (next: PlayerProfile) => {
    setProfile(next);
    try {
      localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // ignore
    }
  };

  const handleUpgradeMagnetWithCoins = () => {
    setProfile((prev) => {
      const currentLevel = prev.magnetLevel || 1;
      if (currentLevel >= MAGNET_UPGRADE_TIERS.length) return prev;
      const nextSpec = getMagnetUpgradeSpec(currentLevel + 1);
      if ((prev.coins || 0) < nextSpec.coinCost) return prev;

      const updated: PlayerProfile = {
        ...prev,
        coins: (prev.coins || 0) - nextSpec.coinCost,
        magnetLevel: nextSpec.level,
      };
      try {
        localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(updated));
      } catch {
        // ignore
      }
      return updated;
    });
  };

  const handleClaimAdReward = () => {
    const rewardType = adModalRewardType;
    setAdModalRewardType(null);
    if (!rewardType) return;

    setProfile((prev) => {
      let updated: PlayerProfile = { ...prev };
      if (rewardType === 'coins') {
        updated.coins = (prev.coins || 0) + 100;
      } else if (rewardType === 'magnet_upgrade') {
        const currentLevel = prev.magnetLevel || 1;
        if (currentLevel < MAGNET_UPGRADE_TIERS.length) {
          updated.magnetLevel = currentLevel + 1;
        } else {
          updated.coins = (prev.coins || 0) + 100;
        }
      }
      try {
        localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(updated));
      } catch {
        // ignore
      }
      return updated;
    });
  };

  const handleClaimMission = (missionId: string) => {
    fetch('/api/missions/claim', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        playerId: playerIdRef.current,
        missionId,
      }),
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data && data.reward) {
          if (Array.isArray(data.missions)) {
            setDailyMissions(data.missions);
          }
          setProfile((prev) => {
            const updated: PlayerProfile = {
              ...prev,
              coins: (prev.coins || 0) + (data.reward.rewardCoins || 0),
              bonusStartMass:
                (prev.bonusStartMass || 0) + (data.reward.rewardBonusMass || 0),
            };
            try {
              localStorage.setItem(
                PROFILE_STORAGE_KEY,
                JSON.stringify(updated)
              );
            } catch {
              // ignore
            }
            return updated;
          });
        }
      })
      .catch(() => {
        // Fallback local claim
        setDailyMissions((prev) =>
          prev.map((m) => {
            if (m.id === missionId && m.completed && !m.claimed) {
              setProfile((p) => {
                const updated: PlayerProfile = {
                  ...p,
                  coins: (p.coins || 0) + m.rewardCoins,
                  bonusStartMass: (p.bonusStartMass || 0) + m.rewardBonusMass,
                };
                try {
                  localStorage.setItem(
                    PROFILE_STORAGE_KEY,
                    JSON.stringify(updated)
                  );
                } catch {
                  // ignore
                }
                return updated;
              });
              return { ...m, claimed: true };
            }
            return m;
          })
        );
      });
  };

  const handleUpdateSettings = (
    nextOrUpdater: GameSettings | ((prev: GameSettings) => GameSettings)
  ) => {
    setSettings((prev) => {
      const next =
        typeof nextOrUpdater === 'function'
          ? nextOrUpdater(prev)
          : nextOrUpdater;
      engineRef.current?.updateSettings(next);
      try {
        localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(next));
      } catch {
        // ignore
      }
      return next;
    });
  };

  return (
    <div className="relative w-full h-full overflow-hidden bg-[#040711]">
      {/* Isolated 60fps HTML5 Canvas2D Container (never re-created on HUD updates) */}
      <canvas
        ref={canvasRef}
        data-testid="aura-game-canvas"
        aria-label="AURA.IO Cosmic Arena Battlefield"
        className="block w-full h-full cursor-crosshair"
      />

      {/* Title Screen Shell */}
      {gameState === 'title' && (
        <TitleScreen
          config={config}
          profile={profile}
          settings={settings}
          dailyMissions={dailyMissions}
          onlineCount={telemetry.onlinePlayersCount}
          roomState={roomState}
          roomError={roomError}
          onClearRoomError={() => setRoomError('')}
          onOpenSettings={() => setIsSettingsOpen(true)}
          onUpdateConfig={handleUpdateConfig}
          onUpdateProfile={handleUpdateProfile}
          onUpdateSettings={handleUpdateSettings}
          onUpgradeMagnetWithCoins={handleUpgradeMagnetWithCoins}
          onOpenWatchAd={(rewardType) => setAdModalRewardType(rewardType)}
          onClaimMission={handleClaimMission}
          onStartMatch={(cfg) =>
            engineRef.current?.startMatch({
              ...cfg,
              mode: 'ai',
              allowAI: true,
              playerMagnetLevel: profile.magnetLevel || 1,
              bonusStartMass: profile.bonusStartMass || 0,
            })
          }
          onCreatePrivateRoom={(cfg) =>
            engineRef.current?.createPrivateRoom(cfg)
          }
          onJoinPrivateRoom={(code, name, faction) =>
            engineRef.current?.joinPrivateRoom(code, name, faction)
          }
          onSwitchRoomFaction={(faction, targetPlayerId) =>
            engineRef.current?.switchRoomFaction(faction, targetPlayerId)
          }
          onUpdateRoomConfig={(cfg) =>
            engineRef.current?.updateRoomConfig(cfg)
          }
          onLeavePrivateRoom={() => engineRef.current?.leavePrivateRoom()}
          onStartRoomMatch={(cfg) => engineRef.current?.startRoomMatch(cfg)}
        />
      )}

      {/* Active Playing HUD */}
      {(gameState === 'playing' || gameState === 'paused') && (
        <GameHud
          telemetry={telemetry}
          settings={settings}
          onToggleMute={() =>
            handleUpdateSettings({
              ...settings,
              soundEnabled: !settings.soundEnabled,
            })
          }
          onPause={() => engineRef.current?.pauseGame()}
          onRestart={handleRestartMatch}
          onTriggerAbility={(slot) =>
            engineRef.current?.triggerLocalAbilitySlot(slot)
          }
          onTouchJoystick={(active, angle) =>
            engineRef.current?.setTouchJoystick(active, angle)
          }
          onTouchBoost={(active) => engineRef.current?.setTouchBoost(active)}
        />
      )}

      {/* 15-Second Countdown Rewarded Ad Modal with Skip Option */}
      {adModalRewardType && (
        <RewardedAdModal
          isOpen={true}
          rewardType={adModalRewardType}
          targetMagnetLevel={Math.min(
            MAGNET_UPGRADE_TIERS.length,
            (profile.magnetLevel || 1) + 1
          )}
          onClaimReward={handleClaimAdReward}
          onSkipOrClose={() => setAdModalRewardType(null)}
        />
      )}

      {/* Settings, Pause, Round Victory & Match Result Modals */}
      <StatusModals
        gameState={gameState}
        isSettingsOpen={isSettingsOpen}
        roundBanner={telemetry.roundBanner}
        matchSummary={matchSummary}
        settings={settings}
        onCloseSettings={() => setIsSettingsOpen(false)}
        onResume={() => engineRef.current?.resumeGame()}
        onRestart={handleRestartMatch}
        onReturnToTitle={() => {
          setIsSettingsOpen(false);
          engineRef.current?.returnToTitle();
        }}
        onUpdateSettings={handleUpdateSettings}
      />
    </div>
  );
}
