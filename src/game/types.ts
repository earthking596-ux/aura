export type Faction = 'blue' | 'purple';

export type GameState = 'title' | 'playing' | 'paused' | 'gameover';

export type GameMode = 'ai' | 'online' | 'private' | 'custom';

export type BoundaryRule = 'eliminate' | 'bounce' | 'drain';

export type AIDifficulty = 'novice' | 'tactical' | 'apex';

export type AIArchetype = 'collector' | 'interceptor' | 'enforcer';

export type AbilityId =
  | 'shield'
  | 'surge'
  | 'attract'
  | 'pulse'
  | 'vortex'
  | 'disrupt';

export interface AbilitySpec {
  id: AbilityId;
  key: 'Q' | 'E' | 'F';
  name: string;
  roleClue: string;
  faction: Faction;
  cooldown: number; // seconds
  duration: number; // seconds
  massCost: number;
  radius: number;
}

export interface MagnetLevelSpec {
  level: number;
  pullRadius: number;
  pullSpeed: number;
  duration: number;
  cooldown: number;
  coinCost: number;
}

export const MAGNET_UPGRADE_TIERS: MagnetLevelSpec[] = [
  {
    level: 1,
    pullRadius: 420,
    pullSpeed: 560,
    duration: 3.5,
    cooldown: 12.0,
    coinCost: 0,
  },
  {
    level: 2,
    pullRadius: 490,
    pullSpeed: 640,
    duration: 4.2,
    cooldown: 10.5,
    coinCost: 100,
  },
  {
    level: 3,
    pullRadius: 560,
    pullSpeed: 720,
    duration: 5.0,
    cooldown: 9.2,
    coinCost: 200,
  },
  {
    level: 4,
    pullRadius: 630,
    pullSpeed: 800,
    duration: 5.8,
    cooldown: 8.0,
    coinCost: 350,
  },
  {
    level: 5,
    pullRadius: 700,
    pullSpeed: 900,
    duration: 6.5,
    cooldown: 7.0,
    coinCost: 500,
  },
];

export function getMagnetUpgradeSpec(level: number): MagnetLevelSpec {
  const clamped = Math.max(1, Math.min(5, Math.round(level || 1)));
  return MAGNET_UPGRADE_TIERS[clamped - 1];
}

export const FACTION_ABILITIES: Record<Faction, AbilitySpec[]> = {
  blue: [
    {
      id: 'shield',
      key: 'Q',
      name: 'Energy Shield',
      roleClue: 'Blocks Enemy Hits',
      faction: 'blue',
      cooldown: 13,
      duration: 3.0,
      massCost: 12,
      radius: 65,
    },
    {
      id: 'surge',
      key: 'E',
      name: 'Speed Burst',
      roleClue: 'Free Fast Move',
      faction: 'blue',
      cooldown: 10,
      duration: 2.6,
      massCost: 10,
      radius: 0,
    },
    {
      id: 'attract',
      key: 'F',
      name: 'Energy Magnet',
      roleClue: 'Pulls Nearby Energy',
      faction: 'blue',
      cooldown: 12,
      duration: 3.5,
      massCost: 0,
      radius: 420,
    },
  ],
  purple: [
    {
      id: 'pulse',
      key: 'Q',
      name: 'Shockwave',
      roleClue: 'Pushes Enemies Away',
      faction: 'purple',
      cooldown: 11,
      duration: 0.8,
      massCost: 12,
      radius: 340,
    },
    {
      id: 'vortex',
      key: 'E',
      name: 'Slow Trap',
      roleClue: 'Slows Nearby Enemies',
      faction: 'purple',
      cooldown: 14,
      duration: 4.0,
      massCost: 14,
      radius: 260,
    },
    {
      id: 'attract',
      key: 'F',
      name: 'Energy Magnet',
      roleClue: 'Pulls Nearby Energy',
      faction: 'purple',
      cooldown: 12,
      duration: 3.5,
      massCost: 0,
      radius: 420,
    },
  ],
};

export interface SkinSpec {
  id: string;
  name: string;
  tagline: string;
  coreRingStyle: 'orbital' | 'binary' | 'prism' | 'corona';
  pulseSpeed: number;
}

export const COSMIC_SKINS: SkinSpec[] = [
  {
    id: 'celestial',
    name: 'Celestial Core',
    tagline: 'Harmonic twin-ring plasma resonance',
    coreRingStyle: 'orbital',
    pulseSpeed: 1.0,
  },
  {
    id: 'pulsar',
    name: 'Pulsar Beacon',
    tagline: 'High-frequency binary star oscillation',
    coreRingStyle: 'binary',
    pulseSpeed: 1.45,
  },
  {
    id: 'prism',
    name: 'Quantum Prism',
    tagline: 'Crystalline geometric energy lattice',
    coreRingStyle: 'prism',
    pulseSpeed: 1.2,
  },
  {
    id: 'supernova',
    name: 'Supernova Crown',
    tagline: 'Radiant solar flare corona filaments',
    coreRingStyle: 'corona',
    pulseSpeed: 1.6,
  },
];

export interface BodyColorOption {
  id: string;
  label: string;
  hex: string;
}

export const INNER_BODY_COLORS: BodyColorOption[] = [
  { id: 'sky', label: 'Starlight Blue', hex: '#38BDF8' },
  { id: 'emerald', label: 'Emerald Plasma', hex: '#34D399' },
  { id: 'gold', label: 'Solar Gold', hex: '#FBBF24' },
  { id: 'coral', label: 'Nova Rose', hex: '#FB7185' },
  { id: 'violet', label: 'Astral Violet', hex: '#A78BFA' },
  { id: 'white', label: 'Pure White', hex: '#F8FAFC' },
];

export const MAX_TOTAL_PLAYERS = 6;

export type ParticleKind = 'small' | 'medium' | 'large' | 'rare' | 'dropped';

export interface EnergyParticle {
  id: string;
  x: number;
  y: number;
  kind: ParticleKind;
  value: number;
  radius: number;
  hueShift: number;
  pulsePhase: number;
  factionTint?: Faction;
}

export interface VortexAnomaly {
  id: string;
  ownerId: string;
  faction: Faction;
  x: number;
  y: number;
  radius: number;
  remaining: number;
  maxDuration: number;
}

export interface BodySegment {
  x: number;
  y: number;
}

export interface AbilityState {
  cooldownRemaining: number;
  activeRemaining: number;
}

export interface CosmicEntity {
  id: string;
  name: string;
  faction: Faction;
  isAI: boolean;
  aiArchetype?: AIArchetype;
  skinId: string;
  bodyColor: string;
  alive: boolean;
  respawnEffectTimer: number;
  koTimer: number; // > 0 during KO dissolve animation
  hitFlashTimer: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  targetAngle: number;
  speed: number;
  baseSpeed: number;
  turnRate: number;
  mass: number;
  peakMass: number;
  radius: number;
  targetSegments: number;
  segmentSpacing: number;
  segments: BodySegment[];
  pathHistory: BodySegment[];
  boostTrailCarry: number;
  isBoosting: boolean;
  boostEnergy: number; // 0..100 stamina gauge in addition to mass burn
  magnetLevel?: number; // 1..5 upgraded Magnet [F] skill level
  abilities: Record<AbilityId, AbilityState>;
  disruptedTimer: number;
  slowedTimer: number;
  eliminations: number;
  deaths: number;
  energyCollected: number;
  roundEliminations: number;
}

export interface MatchConfig {
  mode: GameMode;
  presetLabel: string;
  blueTeamSize: number;
  purpleTeamSize: number;
  roundsToWin: number;
  roundDuration: number; // seconds per round
  arenaRadius: number;
  boundaryRule: BoundaryRule;
  allowAI: boolean;
  aiDifficulty: AIDifficulty;
  abilitiesEnabled: boolean;
  playerFaction: Faction;
  playerName: string;
  playerSkin: string;
  playerBodyColor: string;
  playerMagnetLevel?: number;
  bonusStartMass?: number;
  roomCode?: string;
}

export interface RoomLobbyPlayer {
  id: string;
  name: string;
  faction: Faction;
  bodyColor?: string;
  isHost: boolean;
}

export interface RoomLobbyState {
  roomCode: string;
  hostId: string;
  localPlayerId: string;
  blueCount: number;
  purpleCount: number;
  players: RoomLobbyPlayer[];
  config: MatchConfig;
}

export interface KillFeedEvent {
  id: string;
  timestamp: number;
  killerName: string;
  killerFaction: Faction;
  victimName: string;
  victimFaction: Faction;
  reason: 'surround' | 'boundary' | 'pulse';
}

export interface RoundBannerState {
  active: boolean;
  roundNumber: number;
  winnerFaction: Faction | 'draw';
  reason: string;
  countdown: number;
}

export interface MatchSummarySnapshot {
  winnerFaction: Faction | 'draw';
  blueRoundsWon: number;
  purpleRoundsWon: number;
  totalRoundsPlayed: number;
  matchDurationSec: number;
  playerEliminations: number;
  playerPeakMass: number;
  playerEnergyCollected: number;
  playerFaction: Faction;
  playerRank: number;
  standings: Array<{
    id: string;
    name: string;
    faction: Faction;
    isAI: boolean;
    eliminations: number;
    peakMass: number;
    energyCollected: number;
  }>;
}

export interface EnergyZone {
  id: string;
  name: string;
  x: number;
  y: number;
  radius: number;
  type: 'nexus' | 'positive_well' | 'negative_well';
}

export interface DailyMission {
  id: string;
  title: string;
  description: string;
  metric?: 'energy' | 'eliminations' | 'wins';
  target: number;
  progress: number;
  rewardCoins: number;
  rewardBonusMass: number;
  completed?: boolean;
  claimed: boolean;
}

export interface PlayerProfile {
  name: string;
  preferredFaction: Faction;
  selectedSkin: string;
  selectedBodyColor: string;
  matchesPlayed: number;
  matchesWon: number;
  totalEliminations: number;
  highestMassRecord: number;
  totalEnergyCollected: number;
  coins: number;
  magnetLevel: number;
  bonusStartMass: number;
}

export interface GameSettings {
  // GAME SETTINGS
  soundEnabled: boolean;
  masterVolume: number; // 0..1
  visualQuality: 'high' | 'balanced';
  cameraZoom: number; // 0.8 .. 1.2 (default 1.0)
  screenShake: boolean;
  // CONTROL SETTINGS (1..100%)
  mouseSensitivity: number; // 1..100, default 50
  keyboardSensitivity: number; // 1..100, default 50
  joystickSensitivity: number; // 1..100, default 50
  touchControlsMode: 'auto' | 'always' | 'off';
  // GAMEPLAY SETTINGS
  showPlayerNames: boolean;
  showMinimap: boolean;
  showMassInfo: boolean;
  showFpsPing: boolean;
}

export const DEFAULT_CONTROL_SENSITIVITY = {
  mouseSensitivity: 50,
  keyboardSensitivity: 50,
  joystickSensitivity: 50,
};

export const DEFAULT_MATCH_CONFIG: MatchConfig = {
  mode: 'ai',
  presetLabel: '3 vs 3',
  blueTeamSize: 3,
  purpleTeamSize: 3,
  roundsToWin: 3,
  roundDuration: 90,
  arenaRadius: 2200,
  boundaryRule: 'eliminate',
  allowAI: true,
  aiDifficulty: 'tactical',
  abilitiesEnabled: false,
  playerFaction: 'blue',
  playerName: 'NOVA-01',
  playerSkin: 'celestial',
  playerBodyColor: '#38BDF8',
  playerMagnetLevel: 1,
  bonusStartMass: 0,
};

