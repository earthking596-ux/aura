import express from 'express';
import { createServer } from 'http';
import path from 'path';
import { Server as SocketIOServer } from 'socket.io';
import { createServer as createViteServer } from 'vite';
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
  validateTeamSwitch,
} from './src/game/rules';
import {
  AbilityId,
  CosmicEntity,
  DailyMission,
  DEFAULT_MATCH_CONFIG,
  EnergyParticle,
  EnergyZone,
  Faction,
  getMagnetUpgradeSpec,
  KillFeedEvent,
  MatchConfig,
  MAX_TOTAL_PLAYERS,
  RoundBannerState,
  VortexAnomaly,
} from './src/game/types';

interface RoomPlayer {
  id: string;
  name: string;
  faction: Faction;
  skinId: string;
  bodyColor: string;
  targetAngle: number;
  isBoosting: boolean;
}

interface GameRoom {
  roomCode: string;
  hostId: string;
  isPrivate: boolean;
  active: boolean;
  matchStartTime: number;
  config: MatchConfig;
  players: Map<string, RoomPlayer>;
  entities: CosmicEntity[];
  particles: EnergyParticle[];
  vortices: VortexAnomaly[];
  zones: EnergyZone[];
  roundNumber: number;
  blueRoundsWon: number;
  purpleRoundsWon: number;
  roundTimeRemaining: number;
  roundBanner: RoundBannerState;
  killFeed: KillFeedEvent[];
  particleSeq: number;
}

const rooms = new Map<string, GameRoom>();

function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

function recordServerElimination(
  room: GameRoom,
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

  room.particles.push(
    ...convertEntityToParticles(victim, `srv_${Date.now()}_${victim.id}`)
  );

  room.killFeed.unshift({
    id: `srv_kf_${Date.now()}_${Math.random()}`,
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
  if (room.killFeed.length > 5) {
    room.killFeed.length = 5;
  }
}

function spawnRoomRound(room: GameRoom, resetScores: boolean): void {
  if (resetScores) {
    room.roundNumber = 1;
    room.blueRoundsWon = 0;
    room.purpleRoundsWon = 0;
    room.killFeed = [];
    room.matchStartTime = Date.now();
  }
  room.zones = createArenaEnergyZones(room.config.arenaRadius);
  room.vortices = [];
  room.particles = [];
  for (let i = 0; i < 360; i++) {
    room.particles.push(
      createRandomEnergyParticle(
        `srv_p_${room.roundNumber}_${room.particleSeq++}`,
        room.config.arenaRadius,
        room.zones
      )
    );
  }

  const prevStats = new Map<
    string,
    { eliminations: number; peakMass: number; energyCollected: number }
  >();
  if (!resetScores) {
    for (const e of room.entities) {
      prevStats.set(e.id, {
        eliminations: e.eliminations,
        peakMass: e.peakMass,
        energyCollected: e.energyCollected,
      });
    }
  }

  const { blueSize, purpleSize } = clampCustomTeamCounts(
    room.config.blueTeamSize,
    room.config.purpleTeamSize
  );
  room.config.blueTeamSize = blueSize;
  room.config.purpleTeamSize = purpleSize;

  const blueHumans = Array.from(room.players.values())
    .filter((p) => p.faction === 'blue')
    .slice(0, blueSize);
  const purpleHumans = Array.from(room.players.values())
    .filter((p) => p.faction === 'purple')
    .slice(0, purpleSize);

  const entities: CosmicEntity[] = [];
  const aiBlueNames = ['AETHER-7', 'SOLARIS', 'CYGNUS-X', 'LUMEN-9', 'ZENITH'];
  const aiPurpleNames = ['UMBRA-X', 'NYX-09', 'VORTEXA', 'ECLIPSE', 'NEMESIS'];
  const archetypes: Array<'collector' | 'interceptor' | 'enforcer'> = [
    'collector',
    'interceptor',
    'enforcer',
  ];

  // Spawn Blue Team up to custom-selected blueSize (humans first, then remaining custom slots)
  for (let i = 0; i < blueSize; i++) {
    const human = blueHumans[i];
    const id = human ? human.id : `room_ai_blue_${i}`;
    const ent = createCosmicEntity({
      id,
      name: human ? human.name : aiBlueNames[i % aiBlueNames.length],
      faction: 'blue',
      isAI: !human,
      aiArchetype: archetypes[i % archetypes.length],
      skinId: human ? human.skinId || 'celestial' : 'celestial',
      bodyColor: human ? human.bodyColor || '#38BDF8' : '#38BDF8',
      spawnIndex: i,
      teamTotal: blueSize,
      arenaRadius: room.config.arenaRadius,
      initialMass: INITIAL_ENTITY_MASS,
    });
    const old = prevStats.get(id);
    if (old) {
      ent.eliminations = old.eliminations;
      ent.peakMass = old.peakMass;
      ent.energyCollected = old.energyCollected;
    }
    entities.push(ent);
  }

  // Spawn Purple Team up to custom-selected purpleSize (humans first, then remaining custom slots)
  for (let i = 0; i < purpleSize; i++) {
    const human = purpleHumans[i];
    const id = human ? human.id : `room_ai_purple_${i}`;
    const ent = createCosmicEntity({
      id,
      name: human ? human.name : aiPurpleNames[i % aiPurpleNames.length],
      faction: 'purple',
      isAI: !human,
      aiArchetype: archetypes[(i + 1) % archetypes.length],
      skinId: human ? human.skinId || 'pulsar' : 'pulsar',
      bodyColor: human ? human.bodyColor || '#A78BFA' : '#A78BFA',
      spawnIndex: i,
      teamTotal: purpleSize,
      arenaRadius: room.config.arenaRadius,
      initialMass: INITIAL_ENTITY_MASS,
    });
    const old = prevStats.get(id);
    if (old) {
      ent.eliminations = old.eliminations;
      ent.peakMass = old.peakMass;
      ent.energyCollected = old.energyCollected;
    }
    entities.push(ent);
  }

  room.entities = entities;
  room.roundTimeRemaining = room.config.roundDuration;
  room.roundBanner = {
    active: false,
    roundNumber: room.roundNumber,
    winnerFaction: 'blue',
    reason: '',
    countdown: 0,
  };
}

function removePlayerFromAllRooms(io: SocketIOServer, socketId: string): void {
  for (const [code, room] of rooms.entries()) {
    if (room.players.has(socketId)) {
      room.players.delete(socketId);
      // If a player disconnects during an active match, convert their entity to AI so it keeps playing fairly
      const activeEntity = room.entities.find((e) => e.id === socketId);
      if (activeEntity) {
        activeEntity.isAI = true;
      }
      if (room.players.size === 0) {
        rooms.delete(code);
      } else {
        if (room.hostId === socketId) {
          const nextHost = room.players.keys().next().value;
          if (nextHost) {
            room.hostId = nextHost;
          }
        }
        broadcastRoomUpdate(io, room);
      }
    }
  }
}

const playerMissionsMap = new Map<string, DailyMission[]>();

function getOrCreateDailyMissions(playerId: string): DailyMission[] {
  const key = (playerId || 'default_player').trim();
  const existing = playerMissionsMap.get(key);
  if (existing) return existing;

  const fresh: DailyMission[] = [
    {
      id: 'mission_energy_250',
      title: 'Cosmic Harvester',
      description: 'Collect 250 Energy Orbs across matches',
      metric: 'energy',
      target: 250,
      progress: 0,
      rewardCoins: 100,
      rewardBonusMass: 5,
      claimed: false,
    },
    {
      id: 'mission_elims_3',
      title: 'Aura Eliminator',
      description: 'Eliminate 3 opposing players',
      metric: 'eliminations',
      target: 3,
      progress: 0,
      rewardCoins: 120,
      rewardBonusMass: 5,
      claimed: false,
    },
    {
      id: 'mission_wins_1',
      title: 'Victory Champion',
      description: 'Win 1 Match with your Team',
      metric: 'wins',
      target: 1,
      progress: 0,
      rewardCoins: 150,
      rewardBonusMass: 8,
      claimed: false,
    },
  ];
  playerMissionsMap.set(key, fresh);
  return fresh;
}

async function startServer() {
  const app = express();
  const httpServer = createServer(app);
  const io = new SocketIOServer(httpServer, {
    cors: { origin: '*' },
  });

  app.use(express.json());

  app.get('/api/status', (_req, res) => {
    res.json({
      status: 'ok',
      activeRooms: rooms.size,
      connectedClients: io.engine.clientsCount,
    });
  });

  app.get('/api/missions', (req, res) => {
    const playerId = String(req.query.playerId || 'default_player');
    const missions = getOrCreateDailyMissions(playerId);
    res.json({ missions });
  });

  app.post('/api/missions/progress', (req, res) => {
    const {
      playerId = 'default_player',
      energyCollected = 0,
      eliminations = 0,
      won = false,
    } = req.body || {};
    const missions = getOrCreateDailyMissions(String(playerId));

    for (const m of missions) {
      if (m.claimed) continue;
      if (m.metric === 'energy') {
        m.progress = Math.min(
          m.target,
          m.progress + Math.max(0, Math.round(Number(energyCollected) || 0))
        );
      } else if (m.metric === 'eliminations') {
        m.progress = Math.min(
          m.target,
          m.progress + Math.max(0, Math.round(Number(eliminations) || 0))
        );
      } else if (m.metric === 'wins' && won) {
        m.progress = Math.min(m.target, m.progress + 1);
      }
    }

    const matchCoinsEarned =
      25 +
      Math.max(0, Math.round(Number(eliminations) || 0)) * 15 +
      (won ? 40 : 0);

    res.json({
      missions,
      matchCoinsEarned,
    });
  });

  app.post('/api/missions/claim', (req, res) => {
    const { playerId = 'default_player', missionId = '' } = req.body || {};
    const missions = getOrCreateDailyMissions(String(playerId));
    const mission = missions.find((m) => m.id === missionId);
    if (!mission) {
      res.status(404).json({ error: 'Mission not found' });
      return;
    }
    if (mission.claimed) {
      res.status(400).json({ error: 'Mission reward already claimed' });
      return;
    }
    if (mission.progress < mission.target) {
      res.status(400).json({ error: 'Mission not yet completed' });
      return;
    }
    mission.claimed = true;
    res.json({
      missions,
      rewardCoins: mission.rewardCoins,
      rewardBonusMass: mission.rewardBonusMass,
    });
  });

  io.on('connection', (socket) => {
    io.emit('lobby:status', { onlineCount: io.engine.clientsCount });

    socket.on(
      'room:create',
      (payload: {
        config: MatchConfig;
        playerName: string;
        faction: Faction;
        skinId: string;
        bodyColor?: string;
      }) => {
        removePlayerFromAllRooms(io, socket.id);
        const roomCode = generateRoomCode();
        const { blueSize, purpleSize } = clampCustomTeamCounts(
          payload.config?.blueTeamSize,
          payload.config?.purpleTeamSize
        );
        const room: GameRoom = {
          roomCode,
          hostId: socket.id,
          isPrivate: true,
          active: false,
          matchStartTime: Date.now(),
          config: {
            ...DEFAULT_MATCH_CONFIG,
            ...payload.config,
            mode: 'private',
            allowAI: false,
            blueTeamSize: blueSize,
            purpleTeamSize: purpleSize,
            presetLabel: `${blueSize} vs ${purpleSize}`,
            roomCode,
          },
          players: new Map(),
          entities: [],
          particles: [],
          vortices: [],
          zones: [],
          roundNumber: 1,
          blueRoundsWon: 0,
          purpleRoundsWon: 0,
          roundTimeRemaining: 90,
          roundBanner: {
            active: false,
            roundNumber: 1,
            winnerFaction: 'blue',
            reason: '',
            countdown: 0,
          },
          killFeed: [],
          particleSeq: 0,
        };

        room.players.set(socket.id, {
          id: socket.id,
          name: payload.playerName || 'NOVA-01',
          faction: payload.faction || 'blue',
          skinId: payload.skinId || 'celestial',
          bodyColor: payload.bodyColor || payload.config?.playerBodyColor || '#38BDF8',
          targetAngle: 0,
          isBoosting: false,
        });

        rooms.set(roomCode, room);
        socket.join(roomCode);
        broadcastRoomUpdate(io, room);
      }
    );

    socket.on(
      'room:join',
      (payload: {
        roomCode: string;
        playerName: string;
        faction: Faction;
        skinId: string;
        bodyColor?: string;
      }) => {
        const cleanCode = (payload.roomCode || '').trim().toUpperCase();
        const room = rooms.get(cleanCode);
        if (!room) {
          socket.emit('room:error', {
            message: 'Room code not found. Please check the code.',
          });
          return;
        }

        const maxPlayers = Math.min(
          MAX_TOTAL_PLAYERS,
          room.config.blueTeamSize + room.config.purpleTeamSize
        );
        if (
          !room.players.has(socket.id) &&
          room.players.size >= maxPlayers
        ) {
          socket.emit('room:error', {
            message: `This room is already full (Max ${maxPlayers} players).`,
          });
          return;
        }

        removePlayerFromAllRooms(io, socket.id);

        // Balance faction assignment if requested team is full
        const blueCount = Array.from(room.players.values()).filter(
          (p) => p.faction === 'blue'
        ).length;
        const purpleCount = Array.from(room.players.values()).filter(
          (p) => p.faction === 'purple'
        ).length;

        let assignedFaction: Faction = payload.faction || 'blue';
        if (
          assignedFaction === 'blue' &&
          blueCount >= room.config.blueTeamSize &&
          purpleCount < room.config.purpleTeamSize
        ) {
          assignedFaction = 'purple';
        } else if (
          assignedFaction === 'purple' &&
          purpleCount >= room.config.purpleTeamSize &&
          blueCount < room.config.blueTeamSize
        ) {
          assignedFaction = 'blue';
        }

        room.players.set(socket.id, {
          id: socket.id,
          name: payload.playerName || 'PLAYER',
          faction: assignedFaction,
          skinId: payload.skinId || 'celestial',
          bodyColor: payload.bodyColor || '#38BDF8',
          targetAngle: 0,
          isBoosting: false,
        });

        socket.join(cleanCode);
        broadcastRoomUpdate(io, room);
      }
    );

    socket.on(
      'room:switchFaction',
      (payload: {
        roomCode: string;
        faction: Faction;
        targetPlayerId?: string;
      }) => {
        const room = rooms.get(payload.roomCode);
        if (!room || room.active) return;

        const isHost = room.hostId === socket.id;
        const targetId =
          isHost && payload.targetPlayerId
            ? payload.targetPlayerId
            : socket.id;
        const player = room.players.get(targetId);
        if (!player) return;

        const blueCount = Array.from(room.players.values()).filter(
          (p) => p.faction === 'blue'
        ).length;
        const purpleCount = Array.from(room.players.values()).filter(
          (p) => p.faction === 'purple'
        ).length;

        if (isHost && player.faction !== payload.faction) {
          if (
            payload.faction === 'blue' &&
            blueCount >= room.config.blueTeamSize &&
            room.config.blueTeamSize < MAX_TOTAL_PLAYERS - 1
          ) {
            room.config.blueTeamSize = Math.min(
              MAX_TOTAL_PLAYERS - 1,
              blueCount + 1
            );
            room.config.purpleTeamSize = Math.min(
              room.config.purpleTeamSize,
              MAX_TOTAL_PLAYERS - room.config.blueTeamSize
            );
          } else if (
            payload.faction === 'purple' &&
            purpleCount >= room.config.purpleTeamSize &&
            room.config.purpleTeamSize < MAX_TOTAL_PLAYERS - 1
          ) {
            room.config.purpleTeamSize = Math.min(
              MAX_TOTAL_PLAYERS - 1,
              purpleCount + 1
            );
            room.config.blueTeamSize = Math.min(
              room.config.blueTeamSize,
              MAX_TOTAL_PLAYERS - room.config.purpleTeamSize
            );
          }
          room.config.presetLabel = `${room.config.blueTeamSize} vs ${room.config.purpleTeamSize}`;
        }

        const check = validateTeamSwitch({
          roundActive: room.active,
          currentFaction: player.faction,
          requestedFaction: payload.faction,
          blueCount,
          purpleCount,
          maxBlue: room.config.blueTeamSize,
          maxPurple: room.config.purpleTeamSize,
        });

        if (check.allowed) {
          player.faction = payload.faction;
          broadcastRoomUpdate(io, room);
        }
      }
    );

    socket.on(
      'room:updateConfig',
      (payload: { roomCode: string; config: MatchConfig }) => {
        const room = rooms.get(payload.roomCode);
        if (!room || room.active) return;
        if (room.hostId !== socket.id) return;

        const { blueSize, purpleSize } = clampCustomTeamCounts(
          payload.config.blueTeamSize,
          payload.config.purpleTeamSize
        );

        room.config = {
          ...room.config,
          ...payload.config,
          mode: 'private',
          allowAI: false,
          blueTeamSize: blueSize,
          purpleTeamSize: purpleSize,
          presetLabel: `${blueSize} vs ${purpleSize}`,
          roomCode: room.roomCode,
        };
        broadcastRoomUpdate(io, room);
      }
    );

    socket.on('room:leave', (payload: { roomCode?: string }) => {
      if (payload?.roomCode) {
        socket.leave(payload.roomCode);
      }
      removePlayerFromAllRooms(io, socket.id);
      socket.emit('room:left');
    });

    socket.on(
      'room:start',
      (payload: { roomCode: string; config: MatchConfig }) => {
        const room = rooms.get(payload.roomCode);
        if (!room) return;
        if (room.hostId !== socket.id) return;

        const { blueSize, purpleSize } = clampCustomTeamCounts(
          payload.config?.blueTeamSize || room.config.blueTeamSize,
          payload.config?.purpleTeamSize || room.config.purpleTeamSize
        );

        room.config = {
          ...room.config,
          ...payload.config,
          mode: 'private',
          allowAI: false,
          blueTeamSize: blueSize,
          purpleTeamSize: purpleSize,
          presetLabel: `${blueSize} vs ${purpleSize}`,
          roomCode: room.roomCode,
        };
        room.active = true;
        spawnRoomRound(room, true);
        io.to(room.roomCode).emit('match:started', {
          roomCode: room.roomCode,
          config: room.config,
          entities: room.entities.map(({ pathHistory, ...rest }) => rest),
          particles: room.particles,
          zones: room.zones,
        });
      }
    );

    socket.on(
      'player:input',
      (payload: {
        roomCode?: string;
        targetAngle: number;
        isBoosting: boolean;
      }) => {
        if (!payload.roomCode) return;
        const room = rooms.get(payload.roomCode);
        if (!room || !room.active) return;
        const entity = room.entities.find((e) => e.id === socket.id);
        if (entity && entity.alive) {
          entity.targetAngle = payload.targetAngle;
          entity.isBoosting = Boolean(payload.isBoosting);
        }
      }
    );

    socket.on(
      'player:ability',
      (payload: {
        roomCode?: string;
        abilityId: AbilityId;
        magnetLevel?: number;
      }) => {
        if (!payload.roomCode) return;
        const room = rooms.get(payload.roomCode);
        if (!room || !room.active) return;
        const entity = room.entities.find((e) => e.id === socket.id);
        if (entity && entity.alive) {
          if (payload.magnetLevel) {
            entity.magnetLevel = Math.max(
              1,
              Math.min(5, Math.round(payload.magnetLevel))
            );
          }
          const res = tryActivateAbility(
            entity,
            payload.abilityId,
            room.config.abilitiesEnabled
          );
          if (res.activated) {
            applyAbilityWorldEffects({
              caster: entity,
              abilityId: payload.abilityId,
              entities: room.entities,
              vortices: room.vortices,
              arenaRadius: room.config.arenaRadius,
            });
          }
        }
      }
    );

    socket.on(
      'net:ping',
      (sentAt: number, ack?: (echoSentAt: number) => void) => {
        if (typeof ack === 'function') {
          ack(sentAt);
        } else {
          socket.emit('net:pong', sentAt);
        }
      }
    );

    socket.on('disconnect', () => {
      removePlayerFromAllRooms(io, socket.id);
      io.emit('lobby:status', { onlineCount: io.engine.clientsCount });
    });
  });

  // Server-authoritative 30Hz physics & collision loop for active multiplayer rooms
  const TICK_DT = 1 / 30;
  setInterval(() => {
    for (const room of rooms.values()) {
      if (!room.active) continue;

      if (room.roundBanner.active) {
        room.roundBanner.countdown -= TICK_DT;
        if (room.roundBanner.countdown <= 0) {
          room.roundNumber++;
          spawnRoomRound(room, false);
        }
      } else {
        room.roundTimeRemaining = Math.max(
          0,
          room.roundTimeRemaining - TICK_DT
        );

        // Update active Singularity Vortices in room
        for (let i = room.vortices.length - 1; i >= 0; i--) {
          const v = room.vortices[i];
          v.remaining -= TICK_DT;
          if (v.remaining <= 0) {
            room.vortices.splice(i, 1);
            continue;
          }
          for (const entity of room.entities) {
            if (!entity.alive || entity.faction === v.faction) continue;
            const dx = v.x - entity.x;
            const dy = v.y - entity.y;
            if (Math.abs(dx) > v.radius || Math.abs(dy) > v.radius) continue;
            const dist = Math.hypot(dx, dy);
            if (dist < v.radius && dist > 1) {
              entity.slowedTimer = 0.25;
              entity.x += (dx / dist) * 42 * TICK_DT;
              entity.y += (dy / dist) * 42 * TICK_DT;
            }
          }
        }

        for (const e of room.entities) {
          if (!e.alive) {
            if (e.koTimer > 0) {
              e.koTimer = Math.max(0, e.koTimer - TICK_DT);
            }
            continue;
          }
          if (e.isAI) {
            const decision = computeAIDecision({
              ai: e,
              entities: room.entities,
              particles: room.particles,
              vortices: room.vortices,
              arenaRadius: room.config.arenaRadius,
              difficulty: room.config.aiDifficulty || 'tactical',
              abilitiesEnabled: room.config.abilitiesEnabled,
            });
            e.targetAngle = decision.targetAngle;
            e.isBoosting = decision.wantsBoost;
            if (decision.abilityToTrigger) {
              const abRes = tryActivateAbility(
                e,
                decision.abilityToTrigger,
                room.config.abilitiesEnabled
              );
              if (abRes.activated) {
                applyAbilityWorldEffects({
                  caster: e,
                  abilityId: decision.abilityToTrigger,
                  entities: room.entities,
                  vortices: room.vortices,
                  arenaRadius: room.config.arenaRadius,
                });
              }
            }
          }
          const { eliminatedByBoundary, droppedMass } = stepEntityKinematics(
            e,
            TICK_DT,
            room.config.arenaRadius,
            room.config.boundaryRule
          );
          if (e.alive && droppedMass > 0) {
            e.boostTrailCarry = (e.boostTrailCarry || 0) + droppedMass;
            const tail =
              e.segments[e.segments.length - 1] || {
                x: e.x,
                y: e.y,
              };
            const backOffset = e.radius + 36;
            const spawnX = tail.x - Math.cos(e.angle) * backOffset;
            const spawnY = tail.y - Math.sin(e.angle) * backOffset;
            while (e.boostTrailCarry >= 0.6) {
              e.boostTrailCarry -= 0.6;
              room.particles.push({
                id: `srv_boost_${room.roundNumber}_${room.particleSeq++}`,
                x: spawnX + (Math.random() - 0.5) * 10,
                y: spawnY + (Math.random() - 0.5) * 10,
                value: 1.5,
                radius: 4.5,
                kind: 'small',
                hueShift: 0,
                pulsePhase: Math.random() * Math.PI * 2,
                factionTint: e.faction,
              });
            }
          }
          if (eliminatedByBoundary) {
            recordServerElimination(room, e, null, 'boundary');
          }
        }

        // Particle collection & replenishment with fast bounding-box pre-check
        for (let i = room.particles.length - 1; i >= 0; i--) {
          const p = room.particles[i];
          for (const e of room.entities) {
            if (!e.alive) continue;
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
              e.mass += p.value;
              e.energyCollected += p.value;
              if (e.mass > e.peakMass) e.peakMass = e.mass;
              room.particles.splice(i, 1);
              break;
            } else if (dist < pullRadius && dist > 1) {
              const pullSpeed = magSpec ? magSpec.pullSpeed : 300;
              p.x += (dx / dist) * pullSpeed * TICK_DT;
              p.y += (dy / dist) * pullSpeed * TICK_DT;
            }
          }
        }

        while (room.particles.length < 320) {
          room.particles.push(
            createRandomEnergyParticle(
              `srv_p_${room.roundNumber}_${room.particleSeq++}`,
              room.config.arenaRadius,
              room.zones
            )
          );
        }

        // Pairwise collision validation
        for (let i = 0; i < room.entities.length; i++) {
          const a = room.entities[i];
          if (!a.alive) continue;
          for (let j = i + 1; j < room.entities.length; j++) {
            const b = room.entities[j];
            if (!b.alive) continue;
            const { aEliminated, bEliminated } = checkEntityCollisionPair(a, b);
            if (aEliminated) {
              recordServerElimination(room, a, b, 'surround');
            }
            if (bEliminated) {
              recordServerElimination(room, b, a, 'surround');
            }
          }
        }

        const outcome = evaluateRoundOutcome({
          entities: room.entities,
          roundTimeRemaining: room.roundTimeRemaining,
        });

        if (outcome.roundEnded && outcome.winnerFaction) {
          if (outcome.winnerFaction === 'blue') room.blueRoundsWon++;
          if (outcome.winnerFaction === 'purple') room.purpleRoundsWon++;

          if (
            room.blueRoundsWon >= room.config.roundsToWin ||
            room.purpleRoundsWon >= room.config.roundsToWin
          ) {
            room.active = false;
            const winnerFaction: Faction | 'draw' =
              room.blueRoundsWon > room.purpleRoundsWon
                ? 'blue'
                : room.purpleRoundsWon > room.blueRoundsWon
                ? 'purple'
                : 'draw';

            const sortedStandings = [...room.entities]
              .sort((a, b) => {
                if (b.eliminations !== a.eliminations) {
                  return b.eliminations - a.eliminations;
                }
                return b.peakMass - a.peakMass;
              })
              .map((e) => ({
                id: e.id,
                name: e.name,
                faction: e.faction,
                isAI: e.isAI,
                eliminations: e.eliminations,
                peakMass: Math.round(e.peakMass),
                energyCollected: Math.round(e.energyCollected),
              }));

            const matchDurationSec = Math.max(
              1,
              Math.round((Date.now() - room.matchStartTime) / 1000)
            );

            io.to(room.roomCode).emit('match:ended', {
              winnerFaction,
              blueRoundsWon: room.blueRoundsWon,
              purpleRoundsWon: room.purpleRoundsWon,
              totalRoundsPlayed: room.roundNumber,
              matchDurationSec,
              playerEliminations: sortedStandings[0]?.eliminations || 0,
              playerPeakMass: sortedStandings[0]?.peakMass || 10,
              playerEnergyCollected: sortedStandings[0]?.energyCollected || 0,
              playerFaction: sortedStandings[0]?.faction || 'blue',
              playerRank: 1,
              standings: sortedStandings,
            });
            continue;
          }

          room.roundBanner = {
            active: true,
            roundNumber: room.roundNumber,
            winnerFaction: outcome.winnerFaction,
            reason: outcome.reason,
            countdown: 3.2,
          };
        }
      }

      io.to(room.roomCode).emit('match:state', {
        entities: room.entities.map(({ pathHistory, ...rest }) => rest),
        particles: room.particles,
        vortices: room.vortices,
        roundNumber: room.roundNumber,
        blueRoundsWon: room.blueRoundsWon,
        purpleRoundsWon: room.purpleRoundsWon,
        roundTimeRemaining: room.roundTimeRemaining,
        roundBanner: room.roundBanner,
        killFeed: room.killFeed,
      });
    }
  }, 1000 / 30);

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const PORT = 3000;
  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`AURA.IO Server running on http://localhost:${PORT}`);
  });
}

function broadcastRoomUpdate(io: SocketIOServer, room: GameRoom): void {
  const players = Array.from(room.players.values()).map((p) => ({
    id: p.id,
    name: p.name,
    faction: p.faction,
    isHost: p.id === room.hostId,
  }));
  const blueCount = players.filter((p) => p.faction === 'blue').length;
  const purpleCount = players.filter((p) => p.faction === 'purple').length;

  io.to(room.roomCode).emit('room:updated', {
    roomCode: room.roomCode,
    hostId: room.hostId,
    blueCount,
    purpleCount,
    players,
    config: room.config,
  });
}

startServer();
