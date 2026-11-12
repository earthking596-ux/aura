import { io, Socket } from 'socket.io-client';
import { cosmicAudio } from './audio';
import { CosmicCanvasRenderer } from './renderer';
import {
  applyAbilityWorldEffects,
  checkEntityCollisionPair,
  clampCustomTeamCounts,
  computeAIDecision,
  convertEntityToParticles,
  createArenaEnergyZones,
  createCosmicEntity,
  createRandomEnergyParticle,
  evaluateRoundOutcome,
  INITIAL_ENTITY_MASS,
  stepEntityKinematics,
  tryActivateAbility,
} from './rules';
import {
  AbilityId,
  AIArchetype,
  CosmicEntity,
  EnergyParticle,
  EnergyZone,
  Faction,
  GameSettings,
  GameState,
  getMagnetUpgradeSpec,
  INNER_BODY_COLORS,
  KillFeedEvent,
  MatchConfig,
  MatchSummarySnapshot,
  RoomLobbyState,
  RoundBannerState,
  VortexAnomaly,
} from './types';

export interface HudTelemetrySnapshot {
  playerName: string;
  roundNumber: number;
  maxRounds: number;
  roundsToWin: number;
  blueRoundsWon: number;
  purpleRoundsWon: number;
  blueAlive: number;
  purpleAlive: number;
  blueTotal: number;
  purpleTotal: number;
  roundTimeRemaining: number;
  playerMass: number;
  playerLength: number;
  playerRank: number;
  totalEntities: number;
  playerAlive: boolean;
  playerFaction: Faction;
  boostEnergy: number;
  isBoosting: boolean;
  magnetLevel: number;
  abilitiesEnabled: boolean;
  abilities: CosmicEntity['abilities'];
  killFeed: KillFeedEvent[];
  roundBanner: RoundBannerState;
  minimapEntities: Array<{
    id: string;
    x: number;
    y: number;
    faction: Faction;
    isLocal: boolean;
    mass: number;
  }>;
  arenaRadius: number;
  isOnlineConnected: boolean;
  roomCode?: string;
  onlinePlayersCount: number;
  isPointerLocked: boolean;
  fps: number;
  pingMs: number;
}

const AI_BLUE_NAMES = [
  'AETHER-7',
  'SOLARIS',
  'CYGNUS-X',
  'LUMEN-9',
  'ZENITH',
  'PULSAR-B',
  'HYPERION',
  'VEGA-II',
  'SIRIUS',
  'ORION-4',
  'ALTAIR',
  'POLARIS',
];

const AI_PURPLE_NAMES = [
  'UMBRA-X',
  'NYX-09',
  'VORTEXA',
  'ECLIPSE',
  'NEMESIS',
  'OBLIVION',
  'QUASAR-V',
  'ABYSS-3',
  'PHANTOM',
  'SPECTRE',
  'KRONOS',
  'MALAKOR',
];

const AI_ARCHETYPES: AIArchetype[] = ['collector', 'interceptor', 'enforcer'];

export class AuraGameEngine {
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private renderer = new CosmicCanvasRenderer();
  private rafId: number | null = null;
  private timerId: ReturnType<typeof setTimeout> | null = null;
  private destroyed = false;
  private lastTimestamp = 0;
  private hudSyncAccumulator = 0;
  private hitstopTimer = 0;
  private fpsFrameCount = 0;
  private fpsElapsedSec = 0;
  private currentFps = 60;
  private currentPingMs = 12;
  private pingProbeAccumulator = 0;

  public gameState: GameState = 'title';
  public isSettingsModalOpen = false;
  public config: MatchConfig;
  public settings: GameSettings;

  private entities: CosmicEntity[] = [];
  private particles: EnergyParticle[] = [];
  private vortices: VortexAnomaly[] = [];
  private zones: EnergyZone[] = [];
  private localPlayerId = 'local_player';

  private roundNumber = 1;
  private blueRoundsWon = 0;
  private purpleRoundsWon = 0;
  private roundTimeRemaining = 90;
  private matchStartTime = 0;
  private matchElapsedSec = 0;
  private particleSeq = 0;

  private killFeed: KillFeedEvent[] = [];
  private roundBanner: RoundBannerState = {
    active: false,
    roundNumber: 1,
    winnerFaction: 'blue',
    reason: '',
    countdown: 0,
  };

  // Input state (Mouse cursor / Pointer Lock + Arrow Keys / WASD + Mobile Touch Joystick)
  private pointerActive = false;
  private pointerClientX = 0;
  private pointerClientY = 0;
  private virtualAimX = 85;
  private virtualAimY = 0;
  private isPointerLocked = false;
  private lastInputSource: 'mouse' | 'keyboard' | 'touch' = 'keyboard';
  private keysHeld = new Set<string>();
  private mouseBoostHeld = false;
  private touchJoystickActive = false;
  private touchAngle = 0;
  private touchBoostHeld = false;

  // Multiplayer Socket.IO state
  private socket: Socket | null = null;
  private isAuthoritativeOnline = false;
  private onlinePlayersCount = 1;
  private currentRoomCode?: string;
  private inputSendAccumulator = 0;

  // Callbacks to React UI
  private onHudUpdate: (snapshot: HudTelemetrySnapshot) => void;
  private onStateChange: (
    newState: GameState,
    summary?: MatchSummarySnapshot
  ) => void;
  private onMatchCompleteStats: (stats: {
    won: boolean;
    eliminations: number;
    peakMass: number;
    energyCollected: number;
  }) => void;
  private onRoomUpdate?: (info: RoomLobbyState | null) => void;
  private onRoomError?: (message: string) => void;
  private onCloseSettingsModal?: () => void;

  constructor(params: {
    initialConfig: MatchConfig;
    initialSettings: GameSettings;
    onHudUpdate: (snapshot: HudTelemetrySnapshot) => void;
    onStateChange: (newState: GameState, summary?: MatchSummarySnapshot) => void;
    onMatchCompleteStats: (stats: {
      won: boolean;
      eliminations: number;
      peakMass: number;
      energyCollected: number;
    }) => void;
    onRoomUpdate?: (info: RoomLobbyState | null) => void;
    onRoomError?: (message: string) => void;
    onCloseSettingsModal?: () => void;
  }) {
    this.config = { ...params.initialConfig };
    this.settings = { ...params.initialSettings };
    this.onHudUpdate = params.onHudUpdate;
    this.onStateChange = params.onStateChange;
    this.onMatchCompleteStats = params.onMatchCompleteStats;
    this.onRoomUpdate = params.onRoomUpdate;
    this.onRoomError = params.onRoomError;
    this.onCloseSettingsModal = params.onCloseSettingsModal;

    cosmicAudio.setConfig(this.settings.soundEnabled, this.settings.masterVolume);
    this.setupTitleTourWorld();
    this.connectSocket();
  }

  private connectSocket(): void {
    if (typeof window === 'undefined') return;
    try {
      this.socket = io(window.location.origin, {
        transports: ['websocket'],
        reconnectionAttempts: 5,
        reconnectionDelay: 2000,
        reconnectionDelayMax: 6000,
      });

      this.socket.on('connect', () => {
        if (this.socket?.id) {
          this.localPlayerId = this.socket.id;
        }
        this.measureSocketPing();
      });

      this.socket.on('net:pong', (sentAt: number) => {
        if (typeof sentAt === 'number') {
          const rtt = Math.max(1, Math.round(performance.now() - sentAt));
          this.currentPingMs = Math.round(this.currentPingMs * 0.6 + rtt * 0.4);
        }
      });

      this.socket.on(
        'lobby:status',
        (data: { onlineCount: number }) => {
          this.onlinePlayersCount = Math.max(1, data.onlineCount);
        }
      );

      this.socket.on(
        'room:updated',
        (data: {
          roomCode: string;
          hostId: string;
          blueCount: number;
          purpleCount: number;
          players: Array<{
            id: string;
            name: string;
            faction: Faction;
            isHost: boolean;
          }>;
          config: MatchConfig;
        }) => {
          this.currentRoomCode = data.roomCode;
          this.config = { ...data.config, roomCode: data.roomCode };
          const me = data.players.find((p) => p.id === this.localPlayerId);
          if (me) {
            this.config.playerFaction = me.faction;
          }
          this.onRoomUpdate?.({
            ...data,
            localPlayerId: this.localPlayerId,
          });
        }
      );

      this.socket.on('room:error', (data: { message: string }) => {
        this.onRoomError?.(data.message);
      });

      this.socket.on('room:left', () => {
        this.currentRoomCode = undefined;
        this.onRoomUpdate?.(null);
      });

      this.socket.on(
        'match:started',
        (data: {
          roomCode: string;
          config: MatchConfig;
          entities: CosmicEntity[];
          particles: EnergyParticle[];
          zones: EnergyZone[];
        }) => {
          this.isAuthoritativeOnline = true;
          this.currentRoomCode = data.roomCode;
          this.config = { ...data.config, roomCode: data.roomCode };
          this.entities = data.entities.map((e) => ({
            ...e,
            pathHistory: e.pathHistory || e.segments.map((s) => ({ x: s.x, y: s.y })),
          }));
          this.particles = data.particles;
          this.zones = data.zones;
          this.vortices = [];
          this.killFeed = [];
          this.roundNumber = 1;
          this.blueRoundsWon = 0;
          this.purpleRoundsWon = 0;
          this.roundTimeRemaining = this.config.roundDuration;
          this.matchStartTime = performance.now();
          const local = this.getLocalPlayer();
          if (local) {
            this.renderer.cameraX = local.x;
            this.renderer.cameraY = local.y;
            this.virtualAimX = Math.cos(local.angle) * 85;
            this.virtualAimY = Math.sin(local.angle) * 85;
          }
          this.setGameState('playing');
          this.emitHudSnapshot();
        }
      );

      this.socket.on(
        'match:state',
        (data: {
          entities: CosmicEntity[];
          particles: EnergyParticle[];
          vortices: VortexAnomaly[];
          roundNumber: number;
          blueRoundsWon: number;
          purpleRoundsWon: number;
          roundTimeRemaining: number;
          roundBanner: RoundBannerState;
          killFeed?: KillFeedEvent[];
        }) => {
          if (!this.isAuthoritativeOnline || this.gameState !== 'playing') return;
          this.reconcileServerState(data);
        }
      );

      this.socket.on(
        'match:ended',
        (rawSummary: MatchSummarySnapshot) => {
          if (!this.isAuthoritativeOnline) return;
          this.isAuthoritativeOnline = false;
          const myIndex = rawSummary.standings.findIndex(
            (s) => s.id === this.localPlayerId
          );
          const myRow =
            myIndex >= 0 ? rawSummary.standings[myIndex] : undefined;
          const personalizedSummary: MatchSummarySnapshot = {
            ...rawSummary,
            playerEliminations:
              myRow?.eliminations ?? rawSummary.playerEliminations,
            playerPeakMass: myRow?.peakMass ?? rawSummary.playerPeakMass,
            playerEnergyCollected:
              myRow?.energyCollected ?? rawSummary.playerEnergyCollected,
            playerFaction: myRow?.faction ?? this.config.playerFaction,
            playerRank: myIndex >= 0 ? myIndex + 1 : 1,
          };

          this.onMatchCompleteStats({
            won:
              personalizedSummary.winnerFaction ===
              personalizedSummary.playerFaction,
            eliminations: personalizedSummary.playerEliminations,
            peakMass: personalizedSummary.playerPeakMass,
            energyCollected: personalizedSummary.playerEnergyCollected,
          });

          cosmicAudio.playRoundEnd(
            personalizedSummary.winnerFaction ===
              personalizedSummary.playerFaction,
            personalizedSummary.winnerFaction
          );
          this.setGameState('gameover', personalizedSummary);
        }
      );
    } catch {
      // Fallback to local engine if socket unavailable
    }
  }

  private measureSocketPing(): void {
    if (!this.socket || !this.socket.connected) return;
    const sentAt = performance.now();
    this.socket.emit('net:ping', sentAt, () => {
      const rtt = Math.max(1, Math.round(performance.now() - sentAt));
      this.currentPingMs = Math.round(this.currentPingMs * 0.6 + rtt * 0.4);
    });
  }

  private reconcileServerState(data: {
    entities: CosmicEntity[];
    particles: EnergyParticle[];
    vortices: VortexAnomaly[];
    roundNumber: number;
    blueRoundsWon: number;
    purpleRoundsWon: number;
    roundTimeRemaining: number;
    roundBanner: RoundBannerState;
    killFeed?: KillFeedEvent[];
  }): void {
    const existingMap = new Map(this.entities.map((e) => [e.id, e]));
    this.entities = data.entities.map((srv) => {
      const prev = existingMap.get(srv.id);
      if (!prev) {
        return {
          ...srv,
          pathHistory: srv.segments.map((s) => ({ x: s.x, y: s.y })),
        };
      }
      const blend = srv.id === this.localPlayerId ? 0.55 : 0.5;
      const blendedX = prev.x + (srv.x - prev.x) * blend;
      const blendedY = prev.y + (srv.y - prev.y) * blend;
      return {
        ...srv,
        x: blendedX,
        y: blendedY,
        pathHistory:
          prev.pathHistory && prev.pathHistory.length > 0
            ? prev.pathHistory
            : srv.segments.map((s) => ({ x: s.x, y: s.y })),
      };
    });
    this.particles = data.particles;
    this.vortices = data.vortices;
    this.roundNumber = data.roundNumber;
    this.blueRoundsWon = data.blueRoundsWon;
    this.purpleRoundsWon = data.purpleRoundsWon;
    this.roundTimeRemaining = data.roundTimeRemaining;
    this.roundBanner = data.roundBanner;
    if (data.killFeed) {
      this.killFeed = data.killFeed;
    }
  }

  public createPrivateRoom(config: MatchConfig): void {
    this.config = { ...config, mode: 'private', allowAI: false };
    this.socket?.emit('room:create', {
      config: this.config,
      playerName: this.config.playerName,
      faction: this.config.playerFaction,
      skinId: this.config.playerSkin,
      bodyColor: this.config.playerBodyColor,
    });
  }

  public joinPrivateRoom(roomCode: string, playerName: string, faction: Faction): void {
    const cleanCode = roomCode.trim().toUpperCase();
    if (!cleanCode) return;
    this.socket?.emit('room:join', {
      roomCode: cleanCode,
      playerName,
      faction,
      skinId: this.config.playerSkin,
      bodyColor: this.config.playerBodyColor,
    });
  }

  public switchRoomFaction(faction: Faction, targetPlayerId?: string): void {
    if (!this.currentRoomCode) return;
    if (!targetPlayerId || targetPlayerId === this.localPlayerId) {
      this.config.playerFaction = faction;
    }
    this.socket?.emit('room:switchFaction', {
      roomCode: this.currentRoomCode,
      faction,
      targetPlayerId,
    });
  }

  public updateRoomConfig(config: MatchConfig): void {
    if (!this.currentRoomCode) return;
    this.config = { ...config, mode: 'private', allowAI: false };
    this.socket?.emit('room:updateConfig', {
      roomCode: this.currentRoomCode,
      config: this.config,
    });
  }

  public leavePrivateRoom(): void {
    if (this.currentRoomCode) {
      this.socket?.emit('room:leave', { roomCode: this.currentRoomCode });
    }
    this.currentRoomCode = undefined;
    this.onRoomUpdate?.(null);
  }

  public startRoomMatch(config: MatchConfig): void {
    if (this.currentRoomCode && this.socket?.connected) {
      this.socket.emit('room:start', {
        roomCode: this.currentRoomCode,
        config: { ...config, mode: 'private', allowAI: false },
      });
    } else {
      this.startMatch(config);
    }
  }

  public mountCanvas(canvas: HTMLCanvasElement): void {
    this.destroyed = false;
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.handleResize();

    if (typeof window !== 'undefined') {
      (window as unknown as { __auraEngine?: AuraGameEngine }).__auraEngine = this;
    }

    window.addEventListener('resize', this.handleResize);
    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);
    window.addEventListener('blur', this.handleWindowBlur);
    window.addEventListener('mousemove', this.handleMouseMove, { passive: true });
    window.addEventListener('pointermove', this.handleMouseMove, { passive: true });
    document.addEventListener('pointerlockchange', this.handlePointerLockChange);
    canvas.addEventListener('mousedown', this.handleMouseDown);
    window.addEventListener('mouseup', this.handleMouseUp);

    this.lastTimestamp = performance.now();
    this.scheduleNextFrame();
  }

  private scheduleNextFrame(): void {
    if (this.destroyed) return;
    if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
      this.rafId = window.requestAnimationFrame(this.loop);
    } else {
      this.timerId = setTimeout(() => this.loop(performance.now()), 16);
    }
  }

  public unmountCanvas(): void {
    this.destroyed = true;
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    if (this.timerId !== null) {
      clearTimeout(this.timerId);
      this.timerId = null;
    }
    window.removeEventListener('resize', this.handleResize);
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);
    window.removeEventListener('blur', this.handleWindowBlur);
    window.removeEventListener('mousemove', this.handleMouseMove);
    window.removeEventListener('pointermove', this.handleMouseMove);
    document.removeEventListener('pointerlockchange', this.handlePointerLockChange);
    if (this.canvas) {
      this.canvas.removeEventListener('mousedown', this.handleMouseDown);
    }
    window.removeEventListener('mouseup', this.handleMouseUp);
  }

  private handlePointerLockChange = (): void => {
    this.isPointerLocked =
      typeof document !== 'undefined' &&
      this.canvas !== null &&
      document.pointerLockElement === this.canvas;
    this.emitHudSnapshot();
  };

  private releasePointerLock(): void {
    if (
      typeof document !== 'undefined' &&
      document.pointerLockElement &&
      typeof document.exitPointerLock === 'function'
    ) {
      try {
        document.exitPointerLock();
      } catch {
        // Ignore browser exitPointerLock errors
      }
    }
    this.isPointerLocked = false;
  }

  private handleResize = (): void => {
    if (!this.canvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = this.canvas.getBoundingClientRect();
    this.canvas.width = Math.max(1, Math.floor(rect.width * dpr));
    this.canvas.height = Math.max(1, Math.floor(rect.height * dpr));
    if (this.ctx) {
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
  };

  private handleWindowBlur = (): void => {
    this.keysHeld.clear();
    this.mouseBoostHeld = false;
    this.touchBoostHeld = false;
  };

  public getSensitivityMultiplier(pct: number): number {
    const clamped = Math.max(1, Math.min(100, Number(pct) || 50));
    // 1% -> 0.36x (very slow & smooth), 25% -> 0.71x, 50% -> 1.075x, 75% -> 1.44x, 100% -> 1.80x (very fast)
    return 0.35 + (clamped / 100) * 1.45;
  }

  public getActiveTurnSensitivityMultiplier(): number {
    if (this.lastInputSource === 'mouse') {
      return this.getSensitivityMultiplier(this.settings.mouseSensitivity);
    }
    if (this.lastInputSource === 'touch') {
      return this.getSensitivityMultiplier(this.settings.joystickSensitivity);
    }
    return this.getSensitivityMultiplier(this.settings.keyboardSensitivity);
  }

  private handleMouseMove = (e: MouseEvent): void => {
    const mx = typeof e.movementX === 'number' ? e.movementX : 0;
    const my = typeof e.movementY === 'number' ? e.movementY : 0;

    if (
      mx === 0 &&
      my === 0 &&
      e.clientX === this.pointerClientX &&
      e.clientY === this.pointerClientY
    ) {
      return;
    }

    this.pointerActive = true;
    this.lastInputSource = 'mouse';
    this.pointerClientX = e.clientX;
    this.pointerClientY = e.clientY;
    const mouseSens = this.getSensitivityMultiplier(
      this.settings.mouseSensitivity
    );

    const pointerLockedToCanvas =
      typeof document !== 'undefined' &&
      this.canvas !== null &&
      document.pointerLockElement === this.canvas;

    if (pointerLockedToCanvas) {
      // Continuous relative steering when Pointer Lock is active
      this.virtualAimX += mx * 1.15 * mouseSens;
      this.virtualAimY += my * 1.15 * mouseSens;
      const dist = Math.hypot(this.virtualAimX, this.virtualAimY);
      const maxRing = 95;
      if (dist > maxRing) {
        this.virtualAimX = (this.virtualAimX / dist) * maxRing;
        this.virtualAimY = (this.virtualAimY / dist) * maxRing;
      } else if (dist < 18 && (mx !== 0 || my !== 0)) {
        const mAngle = Math.atan2(my, mx);
        this.virtualAimX = Math.cos(mAngle) * 45;
        this.virtualAimY = Math.sin(mAngle) * 45;
      }
    } else if (this.canvas) {
      // Unlocked mouse mode: steer smoothly toward the cursor's screen position relative to the player's entity
      const local = this.getLocalPlayer();
      const rect = this.canvas.getBoundingClientRect();
      const entityScreenX =
        rect.left +
        rect.width * 0.5 +
        ((local?.x ?? this.renderer.cameraX) - this.renderer.cameraX) *
          this.renderer.cameraZoom;
      const entityScreenY =
        rect.top +
        rect.height * 0.5 +
        ((local?.y ?? this.renderer.cameraY) - this.renderer.cameraY) *
          this.renderer.cameraZoom;
      const dx = e.clientX - entityScreenX;
      const dy = e.clientY - entityScreenY;
      const dist = Math.hypot(dx, dy);
      if (dist > 4) {
        const clamped = Math.min(95, Math.max(40, dist));
        this.virtualAimX = (dx / dist) * clamped;
        this.virtualAimY = (dy / dist) * clamped;
      }
    }
  };

  private handleMouseDown = (e: MouseEvent): void => {
    if (this.gameState === 'playing' && this.canvas) {
      if (e.button === 0) {
        if (!this.mouseBoostHeld) {
          cosmicAudio.playBoostStart();
        }
        this.mouseBoostHeld = true;
      }
    }
  };

  private handleMouseUp = (): void => {
    this.mouseBoostHeld = false;
  };

  private handleKeyDown = (e: KeyboardEvent): void => {
    const tag = (e.target as HTMLElement)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

    const code = e.code;

    if (
      code === 'ArrowUp' ||
      code === 'ArrowDown' ||
      code === 'ArrowLeft' ||
      code === 'ArrowRight'
    ) {
      e.preventDefault();
    }

    if (this.gameState === 'title') {
      if (code === 'Escape' && this.isSettingsModalOpen) {
        e.preventDefault();
        this.onCloseSettingsModal?.();
        return;
      }
      if (
        (code === 'Enter' || code === 'Space') &&
        !this.isSettingsModalOpen &&
        !this.currentRoomCode
      ) {
        const activeTag = document.activeElement?.tagName;
        if (activeTag !== 'BUTTON') {
          e.preventDefault();
          this.startMatch(this.config);
        }
      }
      return;
    }

    if (code === 'Escape' || code === 'KeyP') {
      e.preventDefault();
      if (code === 'Escape' && this.isPointerLocked) {
        this.releasePointerLock();
      }
      if (this.gameState === 'playing') {
        this.pauseGame();
      } else if (this.gameState === 'paused') {
        this.resumeGame();
      }
      return;
    }

    if (code === 'KeyM') {
      this.updateSettings({
        ...this.settings,
        soundEnabled: !this.settings.soundEnabled,
      });
      return;
    }

    if (code === 'KeyR' && (this.gameState === 'playing' || this.gameState === 'paused')) {
      this.startMatch(this.config);
      return;
    }

    if (this.gameState !== 'playing') return;

    const isDirectionalKey =
      code === 'ArrowUp' ||
      code === 'ArrowDown' ||
      code === 'ArrowLeft' ||
      code === 'ArrowRight' ||
      code === 'KeyW' ||
      code === 'KeyS' ||
      code === 'KeyA' ||
      code === 'KeyD';

    if (isDirectionalKey) {
      this.lastInputSource = 'keyboard';
    }

    if (!this.keysHeld.has(code)) {
      this.keysHeld.add(code);

      if (code === 'Space' || code === 'ShiftLeft' || code === 'ShiftRight') {
        e.preventDefault();
        cosmicAudio.playBoostStart();
      } else if (code === 'KeyQ') {
        this.triggerLocalAbilitySlot(0);
      } else if (code === 'KeyE') {
        this.triggerLocalAbilitySlot(1);
      } else if (code === 'KeyF') {
        this.triggerLocalAbilitySlot(2);
      }
    }

    if (isDirectionalKey) {
      const local = this.getLocalPlayer();
      if (local && local.alive) {
        this.applyLocalPlayerInput(local, 0.016);
      }
    }
  };

  private handleKeyUp = (e: KeyboardEvent): void => {
    this.keysHeld.delete(e.code);
  };

  public setTouchJoystick(active: boolean, angle: number): void {
    this.touchJoystickActive = active;
    if (active) {
      this.lastInputSource = 'touch';
      this.touchAngle = angle;
    }
  }

  public setTouchBoost(active: boolean): void {
    if (active && !this.touchBoostHeld) {
      cosmicAudio.playBoostStart();
    }
    this.touchBoostHeld = active;
  }

  public triggerMagnetAbility(): void {
    this.triggerLocalAbilitySlot(2);
  }

  public triggerLocalAbilitySlot(slotIndex: 0 | 1 | 2): void {
    const local = this.getLocalPlayer();
    if (!local || !local.alive) return;

    const blueAbilities: AbilityId[] = ['shield', 'surge', 'attract'];
    const purpleAbilities: AbilityId[] = ['pulse', 'vortex', 'attract'];
    const abilityId =
      local.faction === 'blue'
        ? blueAbilities[slotIndex]
        : purpleAbilities[slotIndex];

    if (this.isAuthoritativeOnline && this.socket) {
      this.socket.emit('player:ability', {
        roomCode: this.currentRoomCode,
        abilityId,
        magnetLevel: local.magnetLevel || this.config.playerMagnetLevel || 1,
      });
    }

    if (this.executeEntityAbility(local, abilityId)) {
      this.emitHudSnapshot();
    }
  }

  private executeEntityAbility(entity: CosmicEntity, abilityId: AbilityId): boolean {
    const res = tryActivateAbility(
      entity,
      abilityId,
      this.config.abilitiesEnabled
    );
    if (!res.activated) return false;

    const isLocal = entity.id === this.localPlayerId;
    if (isLocal) {
      cosmicAudio.playAbility(abilityId);
    }

    applyAbilityWorldEffects({
      caster: entity,
      abilityId,
      entities: this.entities,
      vortices: this.vortices,
      arenaRadius: this.config.arenaRadius,
    });

    if (abilityId === 'shield') {
      this.renderer.spawnShockwave(entity.x, entity.y, 110, '#00F0FF', 0.4);
    } else if (abilityId === 'surge') {
      this.renderer.spawnBurst(entity.x, entity.y, 14, '#38BDF8', 80, 260);
    } else if (abilityId === 'attract') {
      const magSpec = getMagnetUpgradeSpec(entity.magnetLevel || 1);
      this.renderer.spawnShockwave(
        entity.x,
        entity.y,
        magSpec.pullRadius,
        '#FBBF24',
        0.5
      );
    } else if (abilityId === 'pulse') {
      this.renderer.spawnShockwave(entity.x, entity.y, 340, '#E879F9', 0.45);
      this.renderer.addCameraTrauma(isLocal ? 0.35 : 0.15);
    } else if (abilityId === 'vortex') {
      const tail =
        entity.segments[entity.segments.length - 1] || {
          x: entity.x,
          y: entity.y,
        };
      this.renderer.spawnShockwave(tail.x, tail.y, 260, '#C084FC', 0.5);
    } else if (abilityId === 'disrupt') {
      this.renderer.spawnShockwave(entity.x, entity.y, 350, '#F43F5E', 0.45);
    }

    return true;
  }

  public updateSettings(newSettings: GameSettings): void {
    this.settings = { ...newSettings };
    cosmicAudio.setConfig(this.settings.soundEnabled, this.settings.masterVolume);
  }

  private setGameState(
    nextState: GameState,
    summary?: MatchSummarySnapshot
  ): void {
    this.gameState = nextState;
    if (typeof document !== 'undefined') {
      document.body.dataset.state = nextState;
    }
    if (nextState === 'playing') {
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
      this.keysHeld.clear();
      this.mouseBoostHeld = false;
      this.touchBoostHeld = false;
    } else {
      this.releasePointerLock();
    }
    this.onStateChange(nextState, summary);
  }

  /**
   * Populates a calm cosmic starfield and energy particles in the background while on the Title Screen
   * without large player entities overlapping menu elements.
   */
  public setupTitleTourWorld(): void {
    const arenaRadius = 2600;
    this.zones = createArenaEnergyZones(arenaRadius);
    this.particles = [];
    this.vortices = [];
    for (let i = 0; i < 95; i++) {
      this.particles.push(
        createRandomEnergyParticle(`tour_p_${i}`, arenaRadius, this.zones)
      );
    }
    this.entities = [];
  }

  public startMatch(matchConfig: MatchConfig): void {
    this.config = { ...matchConfig };
    this.isAuthoritativeOnline = false;

    this.roundNumber = 1;
    this.blueRoundsWon = 0;
    this.purpleRoundsWon = 0;
    this.killFeed = [];
    this.matchStartTime = performance.now();
    this.matchElapsedSec = 0;

    this.initRoundEntities(true);
    this.setGameState('playing');
    this.emitHudSnapshot();
  }

  private initRoundEntities(resetStats: boolean): void {
    const {
      arenaRadius,
      playerFaction,
      playerName,
      playerSkin,
      playerBodyColor,
    } = this.config;

    // Enforce 6-Player Maximum Limit (Section 10) while preserving independent team sizes
    const { blueSize: clampedBlue, purpleSize: clampedPurple } =
      clampCustomTeamCounts(
        this.config.blueTeamSize,
        this.config.purpleTeamSize
      );
    this.config.blueTeamSize = clampedBlue;
    this.config.purpleTeamSize = clampedPurple;

    this.zones = createArenaEnergyZones(arenaRadius);
    this.vortices = [];
    this.particles = [];
    const targetParticleCount = Math.min(
      540,
      Math.round((arenaRadius / 2200) * 340)
    );
    for (let i = 0; i < targetParticleCount; i++) {
      this.particles.push(
        createRandomEnergyParticle(
          `p_${this.roundNumber}_${this.particleSeq++}`,
          arenaRadius,
          this.zones
        )
      );
    }

    const prevStats = new Map<
      string,
      { eliminations: number; peakMass: number; energyCollected: number }
    >();
    if (!resetStats) {
      for (const e of this.entities) {
        prevStats.set(e.id, {
          eliminations: e.eliminations,
          peakMass: e.peakMass,
          energyCollected: e.energyCollected,
        });
      }
    }

    const nextEntities: CosmicEntity[] = [];
    const aiColorPalette = INNER_BODY_COLORS.map((c) => c.hex);

    const playerStartMass =
      INITIAL_ENTITY_MASS + Math.max(0, this.config.bonusStartMass || 0);
    const playerMagnetLevel = Math.max(
      1,
      Math.min(5, this.config.playerMagnetLevel || 1)
    );

    // Spawn Blue Team (Positive Aura) — every entity starts as ONE small glowing dot (INITIAL_ENTITY_MASS = 10)
    for (let i = 0; i < clampedBlue; i++) {
      const isPlayer = playerFaction === 'blue' && i === 0;
      const id = isPlayer ? this.localPlayerId : `ai_blue_${i}`;
      const entity = createCosmicEntity({
        id,
        name: isPlayer
          ? playerName || 'NOVA-01'
          : AI_BLUE_NAMES[i % AI_BLUE_NAMES.length],
        faction: 'blue',
        isAI: !isPlayer,
        aiArchetype: AI_ARCHETYPES[i % AI_ARCHETYPES.length],
        skinId: isPlayer ? playerSkin : 'celestial',
        bodyColor: isPlayer
          ? playerBodyColor || '#38BDF8'
          : aiColorPalette[i % aiColorPalette.length],
        spawnIndex: i,
        teamTotal: clampedBlue,
        arenaRadius,
        initialMass: isPlayer ? playerStartMass : INITIAL_ENTITY_MASS,
        magnetLevel: isPlayer ? playerMagnetLevel : 1,
      });

      const old = prevStats.get(id);
      if (old) {
        entity.eliminations = old.eliminations;
        entity.peakMass = Math.max(old.peakMass, entity.mass);
        entity.energyCollected = old.energyCollected;
      }
      nextEntities.push(entity);
    }

    // Spawn Purple Team (Negative Aura) — every entity starts as ONE small glowing dot (INITIAL_ENTITY_MASS = 10)
    for (let i = 0; i < clampedPurple; i++) {
      const isPlayer = playerFaction === 'purple' && i === 0;
      const id = isPlayer ? this.localPlayerId : `ai_purple_${i}`;
      const entity = createCosmicEntity({
        id,
        name: isPlayer
          ? playerName || 'NOVA-01'
          : AI_PURPLE_NAMES[i % AI_PURPLE_NAMES.length],
        faction: 'purple',
        isAI: !isPlayer,
        aiArchetype: AI_ARCHETYPES[(i + 1) % AI_ARCHETYPES.length],
        skinId: isPlayer ? playerSkin : 'pulsar',
        bodyColor: isPlayer
          ? playerBodyColor || '#A78BFA'
          : aiColorPalette[(i + 3) % aiColorPalette.length],
        spawnIndex: i,
        teamTotal: clampedPurple,
        arenaRadius,
        initialMass: isPlayer ? playerStartMass : INITIAL_ENTITY_MASS,
        magnetLevel: isPlayer ? playerMagnetLevel : 1,
      });

      const old = prevStats.get(id);
      if (old) {
        entity.eliminations = old.eliminations;
        entity.peakMass = Math.max(old.peakMass, entity.mass);
        entity.energyCollected = old.energyCollected;
      }
      nextEntities.push(entity);
    }

    this.entities = nextEntities;
    this.roundTimeRemaining = this.config.roundDuration;
    this.roundBanner = {
      active: false,
      roundNumber: this.roundNumber,
      winnerFaction: 'blue',
      reason: '',
      countdown: 0,
    };

    const local = this.getLocalPlayer();
    if (local) {
      this.renderer.cameraX = local.x;
      this.renderer.cameraY = local.y;
      this.virtualAimX = Math.cos(local.angle) * 85;
      this.virtualAimY = Math.sin(local.angle) * 85;
    }
  }

  public pauseGame(): void {
    if (this.gameState === 'playing') {
      this.setGameState('paused');
    }
  }

  public resumeGame(): void {
    if (this.gameState === 'paused') {
      this.lastTimestamp = performance.now();
      this.setGameState('playing');
    }
  }

  public returnToTitle(): void {
    this.isAuthoritativeOnline = false;
    this.setupTitleTourWorld();
    this.setGameState('title');
  }

  private getLocalPlayer(): CosmicEntity | null {
    return this.entities.find((e) => e.id === this.localPlayerId) || null;
  }

  private loop = (timestamp: number): void => {
    const rawDt = (timestamp - this.lastTimestamp) / 1000;
    this.lastTimestamp = timestamp;
    // Clamp frame delta time per game craft requirement: Math.min(rawDt, 0.05)
    const dt = Math.min(Math.max(0.001, rawDt), 0.05);

    if (rawDt > 0 && rawDt < 1.0) {
      this.fpsFrameCount += 1;
      this.fpsElapsedSec += rawDt;
      if (this.fpsElapsedSec >= 0.5) {
        const instantFps = Math.round(this.fpsFrameCount / this.fpsElapsedSec);
        this.currentFps = Math.min(144, Math.max(1, instantFps));
        this.fpsFrameCount = 0;
        this.fpsElapsedSec = 0;
      }
    }

    if (this.gameState === 'playing') {
      this.pingProbeAccumulator += dt;
      if (this.pingProbeAccumulator >= 5.0) {
        this.pingProbeAccumulator = 0;
        this.measureSocketPing();
      }
    }

    if (this.gameState === 'title') {
      this.stepTitleTour(dt);
    } else if (this.gameState === 'playing') {
      if (this.hitstopTimer > 0) {
        this.hitstopTimer = Math.max(0, this.hitstopTimer - dt);
      } else {
        this.stepGameplay(dt);
      }
    }

    const local = this.getLocalPlayer();
    const cameraTarget =
      local && local.alive
        ? local
        : this.entities.find((e) => e.alive) || local;

    this.renderer.updateCameraAndFx(
      dt,
      cameraTarget,
      this.gameState === 'title',
      this.settings.cameraZoom
    );

    if (this.canvas && this.ctx) {
      const rect = this.canvas.getBoundingClientRect();
      this.renderer.render({
        ctx: this.ctx,
        width: rect.width,
        height: rect.height,
        arenaRadius:
          this.gameState === 'title' ? 2600 : this.config.arenaRadius,
        zones: this.zones,
        particles: this.particles,
        vortices: this.vortices,
        entities: this.entities,
        localPlayerId: this.localPlayerId,
        settings: this.settings,
      });
    }

    if (this.gameState === 'playing') {
      this.hudSyncAccumulator += dt;
      if (this.hudSyncAccumulator >= 0.25) {
        this.hudSyncAccumulator = 0;
        this.emitHudSnapshot();
      }
    }

    if (!this.destroyed) {
      this.scheduleNextFrame();
    }
  };

  private stepTitleTour(dt: number): void {
    const arenaRadius = 2600;
    for (const e of this.entities) {
      if (!e.alive) continue;
      const decision = computeAIDecision({
        ai: e,
        entities: this.entities,
        particles: this.particles,
        vortices: this.vortices,
        arenaRadius,
        difficulty: 'tactical',
        abilitiesEnabled: false,
      });
      e.targetAngle = decision.targetAngle;
      e.isBoosting = false;
      stepEntityKinematics(e, dt, arenaRadius, 'bounce', 1.0);
    }
  }

  private stepGameplay(dt: number): void {
    this.matchElapsedSec += dt;

    // 1. Update local player steering and boost input
    const local = this.getLocalPlayer();
    if (local && local.alive && this.canvas) {
      this.applyLocalPlayerInput(local, dt);
      if (this.isAuthoritativeOnline && this.socket) {
        this.inputSendAccumulator += dt;
        if (this.inputSendAccumulator >= 0.05) {
          this.inputSendAccumulator = 0;
          this.socket.emit('player:input', {
            roomCode: this.currentRoomCode,
            targetAngle: local.targetAngle,
            isBoosting: local.isBoosting,
          });
        }
      }
    }

    const localTurnSens = this.getActiveTurnSensitivityMultiplier();

    if (this.isAuthoritativeOnline) {
      // Server runs authoritative physics; step local client prediction lightly
      for (const e of this.entities) {
        if (e.alive) {
          stepEntityKinematics(
            e,
            dt,
            this.config.arenaRadius,
            this.config.boundaryRule,
            e.id === this.localPlayerId ? localTurnSens : 1.0
          );
        }
      }
      return;
    }

    // 2. If Round Transition Banner is active, tick countdown to next round
    if (this.roundBanner.active) {
      this.roundBanner.countdown -= dt;
      if (this.roundBanner.countdown <= 0) {
        this.roundNumber++;
        this.initRoundEntities(false);
        this.emitHudSnapshot();
      }
      return;
    }

    this.roundTimeRemaining = Math.max(0, this.roundTimeRemaining - dt);

    // 3. Step AI decisions
    for (const entity of this.entities) {
      if (!entity.alive || !entity.isAI) continue;
      const decision = computeAIDecision({
        ai: entity,
        entities: this.entities,
        particles: this.particles,
        vortices: this.vortices,
        arenaRadius: this.config.arenaRadius,
        difficulty: this.config.aiDifficulty,
        abilitiesEnabled: this.config.abilitiesEnabled,
      });
      entity.targetAngle = decision.targetAngle;
      entity.isBoosting = decision.wantsBoost;
      if (decision.abilityToTrigger) {
        this.executeEntityAbility(entity, decision.abilityToTrigger);
      }
    }

    // 4. Update active Singularity Vortices
    for (let i = this.vortices.length - 1; i >= 0; i--) {
      const v = this.vortices[i];
      v.remaining -= dt;
      if (v.remaining <= 0) {
        this.vortices.splice(i, 1);
        continue;
      }
      for (const entity of this.entities) {
        if (!entity.alive || entity.faction === v.faction) continue;
        const dist = Math.hypot(entity.x - v.x, entity.y - v.y);
        if (dist < v.radius) {
          entity.slowedTimer = 0.25;
          // Gentle gravitational pull toward vortex center
          const pullAngle = Math.atan2(v.y - entity.y, v.x - entity.x);
          entity.x += Math.cos(pullAngle) * 42 * dt;
          entity.y += Math.sin(pullAngle) * 42 * dt;
        }
      }
    }

    // 5. Step kinematics, boost trail energy particles & boundary checks for all entities
    for (const entity of this.entities) {
      const prevAlive = entity.alive;
      const sensMult = entity.id === this.localPlayerId ? localTurnSens : 1.0;
      const { eliminatedByBoundary, droppedMass } = stepEntityKinematics(
        entity,
        dt,
        this.config.arenaRadius,
        this.config.boundaryRule,
        sensMult
      );

      // Leave behind small collectible energy particles when boosting consumes mass (Section 6)
      if (entity.alive && droppedMass > 0) {
        entity.boostTrailCarry = (entity.boostTrailCarry || 0) + droppedMass;
        const tail =
          entity.segments[entity.segments.length - 1] || {
            x: entity.x,
            y: entity.y,
          };
        const backOffset = entity.radius + 36;
        const spawnX = tail.x - Math.cos(entity.angle) * backOffset;
        const spawnY = tail.y - Math.sin(entity.angle) * backOffset;
        while (entity.boostTrailCarry >= 0.6) {
          entity.boostTrailCarry -= 0.6;
          this.particles.push({
            id: `boost_p_${this.roundNumber}_${this.particleSeq++}`,
            x: spawnX + (Math.random() - 0.5) * 10,
            y: spawnY + (Math.random() - 0.5) * 10,
            value: 1.5,
            radius: 4.5,
            kind: 'small',
            hueShift: 0,
            pulsePhase: Math.random() * Math.PI * 2,
            factionTint: entity.faction,
          });
        }
      }

      if (entity.alive && entity.isBoosting && Math.random() < 0.35) {
        const tail =
          entity.segments[entity.segments.length - 1] || {
            x: entity.x,
            y: entity.y,
          };
        this.renderer.spawnBurst(
          tail.x,
          tail.y,
          1,
          entity.faction === 'blue' ? '#00F0FF' : '#E879F9',
          20,
          70,
          1.8,
          3.5,
          0.3
        );
      }

      if (prevAlive && eliminatedByBoundary) {
        this.handleEntityElimination(entity, null, 'boundary');
      }
    }

    // 6. Energy Particle Collection & Harmonic Pull Attraction
    this.stepParticleCollection(dt);

    // 7. Entity-to-Entity Collision Detection
    for (let i = 0; i < this.entities.length; i++) {
      const a = this.entities[i];
      if (!a.alive) continue;
      for (let j = i + 1; j < this.entities.length; j++) {
        const b = this.entities[j];
        if (!b.alive) continue;

        const { aEliminated, bEliminated } = checkEntityCollisionPair(a, b);
        if (aEliminated) {
          this.handleEntityElimination(a, b, 'surround');
        }
        if (bEliminated) {
          this.handleEntityElimination(b, a, 'surround');
        }
      }
    }

    // 8. Maintain rich ambient energy particle density across the arena
    const minParticles = Math.min(
      500,
      Math.round((this.config.arenaRadius / 2200) * 315)
    );
    while (this.particles.length < minParticles) {
      this.particles.push(
        createRandomEnergyParticle(
          `p_${this.roundNumber}_${this.particleSeq++}`,
          this.config.arenaRadius,
          this.zones
        )
      );
    }

    // 9. Evaluate Clash-Style Round Completion
    const outcome = evaluateRoundOutcome({
      entities: this.entities,
      roundTimeRemaining: this.roundTimeRemaining,
    });

    if (outcome.roundEnded && outcome.winnerFaction) {
      this.concludeCurrentRound(outcome.winnerFaction, outcome.reason);
    }
  }

  private applyLocalPlayerInput(local: CosmicEntity, _dt: number): void {
    const leftHeld =
      this.keysHeld.has('KeyA') || this.keysHeld.has('ArrowLeft');
    const rightHeld =
      this.keysHeld.has('KeyD') || this.keysHeld.has('ArrowRight');
    const upHeld = this.keysHeld.has('KeyW') || this.keysHeld.has('ArrowUp');
    const downHeld =
      this.keysHeld.has('KeyS') || this.keysHeld.has('ArrowDown');

    if (this.touchJoystickActive) {
      local.targetAngle = this.touchAngle;
      this.virtualAimX = Math.cos(this.touchAngle) * 85;
      this.virtualAimY = Math.sin(this.touchAngle) * 85;
    } else if (leftHeld || rightHeld || upHeld || downHeld) {
      this.lastInputSource = 'keyboard';
      const kx = (rightHeld ? 1 : 0) - (leftHeld ? 1 : 0);
      const ky = (downHeld ? 1 : 0) - (upHeld ? 1 : 0);
      if (kx !== 0 || ky !== 0) {
        let keyAngle = Math.atan2(ky, kx);
        // If only Left/Right is pressed and the entity is already aligned with that axis, rotate continuously
        if (ky === 0 && kx !== 0) {
          let diff = keyAngle - local.angle;
          while (diff > Math.PI) diff -= Math.PI * 2;
          while (diff < -Math.PI) diff += Math.PI * 2;
          if (Math.abs(diff) < 0.25) {
            keyAngle = local.angle + kx * 1.35;
          }
        }
        local.targetAngle = keyAngle;
        this.virtualAimX = Math.cos(keyAngle) * 85;
        this.virtualAimY = Math.sin(keyAngle) * 85;
      }
    } else if (this.lastInputSource === 'mouse' && this.pointerActive) {
      if (Math.hypot(this.virtualAimX, this.virtualAimY) > 4) {
        local.targetAngle = Math.atan2(this.virtualAimY, this.virtualAimX);
      }
    }

    // Trigger boost with Space / Shift on computer, Left-Click, or Mobile Boost button
    local.isBoosting =
      this.keysHeld.has('Space') ||
      this.keysHeld.has('ShiftLeft') ||
      this.keysHeld.has('ShiftRight') ||
      this.mouseBoostHeld ||
      this.touchBoostHeld;
  }

  private stepParticleCollection(dt: number): void {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      let collectedBy: CosmicEntity | null = null;

      for (const e of this.entities) {
        if (!e.alive) continue;
        // Energy Magnet [F] attraction scaled by entity.magnetLevel (Lv. 1..5)
        const attractActive = e.abilities.attract.activeRemaining > 0;
        const magSpec = attractActive
          ? getMagnetUpgradeSpec(e.magnetLevel || 1)
          : null;
        const pullRadius = magSpec
          ? magSpec.pullRadius
          : e.radius + p.radius + 42;

        const dx = e.x - p.x;
        if (Math.abs(dx) > pullRadius) continue;
        const dy = e.y - p.y;
        if (Math.abs(dy) > pullRadius) continue;

        const dist = Math.hypot(dx, dy);

        if (dist < e.radius + p.radius + 12) {
          collectedBy = e;
          break;
        } else if (dist < pullRadius && dist > 1) {
          const pullSpeed = magSpec ? magSpec.pullSpeed : 310;
          p.x += (dx / dist) * pullSpeed * dt;
          p.y += (dy / dist) * pullSpeed * dt;
        }
      }

      if (collectedBy) {
        collectedBy.mass += p.value;
        collectedBy.energyCollected += p.value;
        if (collectedBy.mass > collectedBy.peakMass) {
          collectedBy.peakMass = collectedBy.mass;
        }

        if (collectedBy.id === this.localPlayerId) {
          cosmicAudio.playCollect(p.value);
        }

        this.renderer.spawnBurst(
          p.x,
          p.y,
          p.value >= 9 ? 8 : 5,
          collectedBy.faction === 'blue' ? '#00F0FF' : '#E879F9',
          40,
          145,
          2.0,
          4.4,
          0.38
        );

        this.particles.splice(i, 1);
      }
    }
  }

  private handleEntityElimination(
    victim: CosmicEntity,
    killer: CosmicEntity | null,
    reason: 'surround' | 'boundary' | 'pulse'
  ): void {
    if (!victim.alive) return;
    victim.alive = false;
    victim.koTimer = 0.45;
    victim.deaths += 1;

    if (killer) {
      killer.eliminations += 1;
      killer.roundEliminations += 1;
      killer.hitFlashTimer = 0.12;
    }

    // Trigger sim-level hitstop (45ms) and weight-scaled camera shake + supernova burst
    this.hitstopTimer = 0.045;
    const isLocalInvolved =
      victim.id === this.localPlayerId || killer?.id === this.localPlayerId;
    this.renderer.addCameraTrauma(isLocalInvolved ? 0.65 : 0.28);

    const burstColor = victim.faction === 'blue' ? '#00F0FF' : '#E879F9';
    this.renderer.spawnBurst(
      victim.x,
      victim.y,
      24,
      burstColor,
      60,
      290,
      2.5,
      6.5,
      0.65
    );
    this.renderer.spawnShockwave(victim.x, victim.y, 180, burstColor, 0.5);

    cosmicAudio.playElimination(victim.id === this.localPlayerId);

    // Drop victim's accumulated mass as collectible cosmic energy orbs
    const droppedOrbs = convertEntityToParticles(
      victim,
      `elim_${Date.now()}_${victim.id}`
    );
    this.particles.push(...droppedOrbs);

    this.killFeed.unshift({
      id: `kf_${Date.now()}_${Math.random()}`,
      timestamp: Date.now(),
      killerName: killer ? killer.name : 'ARENA BOUNDARY',
      killerFaction: killer
        ? killer.faction
        : victim.faction === 'blue'
        ? 'purple'
        : 'blue',
      victimName: victim.name,
      victimFaction: victim.faction,
      reason,
    });
    if (this.killFeed.length > 5) {
      this.killFeed.length = 5;
    }

    this.emitHudSnapshot();
  }

  private concludeCurrentRound(
    winnerFaction: Faction | 'draw',
    reason: string
  ): void {
    if (winnerFaction === 'blue') {
      this.blueRoundsWon += 1;
    } else if (winnerFaction === 'purple') {
      this.purpleRoundsWon += 1;
    }

    const playerWonRound = winnerFaction === this.config.playerFaction;
    cosmicAudio.playRoundEnd(playerWonRound, winnerFaction);

    // Check if either faction reached roundsToWin
    const targetWins = this.config.roundsToWin;
    if (
      this.blueRoundsWon >= targetWins ||
      this.purpleRoundsWon >= targetWins
    ) {
      const matchWinner: Faction | 'draw' =
        this.blueRoundsWon > this.purpleRoundsWon
          ? 'blue'
          : this.purpleRoundsWon > this.blueRoundsWon
          ? 'purple'
          : 'draw';

      const summary = this.buildMatchSummary(matchWinner);
      const local = this.getLocalPlayer();
      this.onMatchCompleteStats({
        won: matchWinner === this.config.playerFaction,
        eliminations: local?.eliminations || 0,
        peakMass: Math.round(local?.peakMass || 65),
        energyCollected: Math.round(local?.energyCollected || 0),
      });

      this.setGameState('gameover', summary);
      return;
    }

    // Otherwise display Clash Squad Round Banner for 3.2s before starting next round
    this.roundBanner = {
      active: true,
      roundNumber: this.roundNumber,
      winnerFaction,
      reason,
      countdown: 3.2,
    };
    this.emitHudSnapshot();
  }

  private buildMatchSummary(winnerFaction: Faction | 'draw'): MatchSummarySnapshot {
    const sorted = [...this.entities].sort((a, b) => {
      if (b.eliminations !== a.eliminations) {
        return b.eliminations - a.eliminations;
      }
      return b.peakMass - a.peakMass;
    });

    const local = this.getLocalPlayer();
    const playerRank =
      Math.max(
        0,
        sorted.findIndex((e) => e.id === this.localPlayerId)
      ) + 1;

    return {
      winnerFaction,
      blueRoundsWon: this.blueRoundsWon,
      purpleRoundsWon: this.purpleRoundsWon,
      totalRoundsPlayed: this.roundNumber,
      matchDurationSec: Math.max(1, Math.round(this.matchElapsedSec)),
      playerEliminations: local?.eliminations || 0,
      playerPeakMass: Math.round(local?.peakMass || 65),
      playerEnergyCollected: Math.round(local?.energyCollected || 0),
      playerFaction: this.config.playerFaction,
      playerRank,
      standings: sorted.map((e) => ({
        id: e.id,
        name: e.name,
        faction: e.faction,
        isAI: e.isAI,
        eliminations: e.eliminations,
        peakMass: Math.round(e.peakMass),
        energyCollected: Math.round(e.energyCollected),
      })),
    };
  }

  public emitHudSnapshot(): void {
    const local = this.getLocalPlayer();
    let blueAlive = 0;
    let purpleAlive = 0;
    let blueTotal = 0;
    let purpleTotal = 0;

    for (const e of this.entities) {
      if (e.faction === 'blue') {
        blueTotal++;
        if (e.alive) blueAlive++;
      } else {
        purpleTotal++;
        if (e.alive) purpleAlive++;
      }
    }

    const sortedByMass = [...this.entities].sort((a, b) => b.mass - a.mass);
    const rankIdx = sortedByMass.findIndex((e) => e.id === this.localPlayerId);

    this.onHudUpdate({
      playerName: local?.name || this.config.playerName || 'NOVA-01',
      roundNumber: this.roundNumber,
      maxRounds: this.config.roundsToWin * 2 - 1,
      roundsToWin: this.config.roundsToWin,
      blueRoundsWon: this.blueRoundsWon,
      purpleRoundsWon: this.purpleRoundsWon,
      blueAlive,
      purpleAlive,
      blueTotal,
      purpleTotal,
      roundTimeRemaining: this.roundTimeRemaining,
      playerMass: Math.round(local?.mass || INITIAL_ENTITY_MASS),
      playerLength: local?.segments.length || 1,
      playerRank: rankIdx >= 0 ? rankIdx + 1 : 1,
      totalEntities: this.entities.length,
      playerAlive: local ? local.alive : false,
      playerFaction: local?.faction || this.config.playerFaction,
      boostEnergy: Math.round(local?.boostEnergy || 100),
      isBoosting: Boolean(local?.isBoosting),
      magnetLevel: local?.magnetLevel || this.config.playerMagnetLevel || 1,
      abilitiesEnabled: Boolean(this.config.abilitiesEnabled),
      abilities:
        local?.abilities || {
          shield: { cooldownRemaining: 0, activeRemaining: 0 },
          surge: { cooldownRemaining: 0, activeRemaining: 0 },
          attract: { cooldownRemaining: 0, activeRemaining: 0 },
          pulse: { cooldownRemaining: 0, activeRemaining: 0 },
          vortex: { cooldownRemaining: 0, activeRemaining: 0 },
          disrupt: { cooldownRemaining: 0, activeRemaining: 0 },
        },
      killFeed: [...this.killFeed],
      roundBanner: { ...this.roundBanner },
      minimapEntities: this.entities
        .filter((e) => e.alive)
        .map((e) => ({
          id: e.id,
          x: e.x,
          y: e.y,
          faction: e.faction,
          isLocal: e.id === this.localPlayerId,
          mass: e.mass,
        })),
      arenaRadius: this.config.arenaRadius,
      isOnlineConnected: Boolean(this.socket?.connected),
      roomCode: this.currentRoomCode,
      onlinePlayersCount: this.onlinePlayersCount,
      isPointerLocked: this.isPointerLocked,
      fps: this.currentFps,
      pingMs: this.currentPingMs,
    });
  }
}
