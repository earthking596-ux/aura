import {
  AbilityId,
  AbilityState,
  AIArchetype,
  AIDifficulty,
  BodySegment,
  BoundaryRule,
  CosmicEntity,
  EnergyParticle,
  EnergyZone,
  Faction,
  FACTION_ABILITIES,
  getMagnetUpgradeSpec,
  ParticleKind,
  VortexAnomaly,
} from './types';

export const MIN_ENTITY_MASS = 10;
export const INITIAL_ENTITY_MASS = 10;
export const BOOST_MIN_MASS = 14;
export const BASE_ENTITY_SPEED = 240;
export const BOOST_SPEED_MULTIPLIER = 1.62;
export const SURGE_SPEED_MULTIPLIER = 1.85;

/**
 * Normalizes an angle in radians to the range [-PI, PI].
 */
export function normalizeAngle(angle: number): number {
  let a = angle;
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

/**
 * Shortest angular difference from currentAngle to targetAngle in [-PI, PI].
 */
export function shortestAngleDelta(currentAngle: number, targetAngle: number): number {
  return normalizeAngle(targetAngle - currentAngle);
}

/**
 * Smoothly rotates currentAngle toward targetAngle with proportional easing for micro-aiming
 * and high angular velocity cap for sharp turns.
 */
export function stepAngleToward(
  currentAngle: number,
  targetAngle: number,
  maxStep: number
): number {
  const delta = shortestAngleDelta(currentAngle, targetAngle);
  if (Math.abs(delta) <= 0.002) {
    return normalizeAngle(targetAngle);
  }
  const proportionalStep = delta * Math.min(1, maxStep * 2.4);
  if (Math.abs(proportionalStep) <= maxStep) {
    return normalizeAngle(currentAngle + proportionalStep);
  }
  return normalizeAngle(currentAngle + Math.sign(delta) * maxStep);
}

/**
 * Calculates entity core radius from current mass.
 * Every player starts at mass 10 as a small glowing dot (radius ~10px) and thickens progressively.
 */
export function calculateEntityRadius(mass: number): number {
  const clamped = Math.max(MIN_ENTITY_MASS, mass);
  return Math.min(54, 10 + Math.pow(Math.max(0, clamped - MIN_ENTITY_MASS), 0.56) * 1.15);
}

/**
 * Calculates number of body segments from current mass.
 * At starting mass (10), returns 1 so every player starts as ONE small glowing dot with no large tail.
 * As mass increases from collecting energy, body length grows smoothly and progressively.
 */
export function calculateTargetSegments(mass: number): number {
  const clamped = Math.max(MIN_ENTITY_MASS, mass);
  if (clamped <= MIN_ENTITY_MASS + 0.4) {
    return 1;
  }
  return Math.min(
    180,
    1 + Math.floor(Math.pow(clamped - MIN_ENTITY_MASS, 0.85) * 0.78)
  );
}

/**
 * Calculates consistent segment spacing along the stored head movement path.
 */
export function calculateSegmentSpacing(radius: number): number {
  return Math.max(6.5, radius * 0.52);
}

/**
 * Calculates ideal camera zoom factor based on entity radius.
 * Gradually zooms out as the player grows while keeping the player clearly visible.
 */
export function calculateCameraZoom(entityRadius: number, userZoomSetting = 1.0): number {
  const baseFactor = 1.04 - Math.max(0, entityRadius - 10) * 0.009;
  const zoomed = baseFactor * Math.max(0.8, Math.min(1.2, userZoomSetting));
  return Math.max(0.55, Math.min(1.18, zoomed));
}

/**
 * Creates initial empty ability states for an entity.
 */
export function createInitialAbilities(): Record<AbilityId, AbilityState> {
  return {
    shield: { cooldownRemaining: 0, activeRemaining: 0 },
    surge: { cooldownRemaining: 0, activeRemaining: 0 },
    attract: { cooldownRemaining: 0, activeRemaining: 0 },
    pulse: { cooldownRemaining: 0, activeRemaining: 0 },
    vortex: { cooldownRemaining: 0, activeRemaining: 0 },
    disrupt: { cooldownRemaining: 0, activeRemaining: 0 },
  };
}

/**
 * Creates a fresh cosmic entity spawned at a well-separated starting position as a single small glowing dot.
 */
export function createCosmicEntity(params: {
  id: string;
  name: string;
  faction: Faction;
  isAI: boolean;
  aiArchetype?: AIArchetype;
  skinId?: string;
  bodyColor?: string;
  spawnIndex: number;
  teamTotal: number;
  arenaRadius: number;
  initialMass?: number;
  magnetLevel?: number;
}): CosmicEntity {
  const {
    id,
    name,
    faction,
    isAI,
    aiArchetype = 'collector',
    skinId = 'celestial',
    bodyColor = faction === 'blue' ? '#38BDF8' : '#A78BFA',
    spawnIndex,
    teamTotal,
    arenaRadius,
    initialMass = INITIAL_ENTITY_MASS,
    magnetLevel = 1,
  } = params;

  // Separate players across wide opposing hemisphere arcs so no two players spawn together
  const spreadArc = Math.min(Math.PI * 0.72, Math.max(0.45, (teamTotal - 1) * 0.34));
  const normalizedSlot =
    teamTotal <= 1 ? 0 : spawnIndex / Math.max(1, teamTotal - 1) - 0.5;
  const baseHemisphereAngle = faction === 'blue' ? Math.PI : 0;
  const spawnPolarAngle = baseHemisphereAngle + normalizedSlot * spreadArc;
  const spawnDist = arenaRadius * 0.46;

  const x = Math.cos(spawnPolarAngle) * spawnDist;
  const y = Math.sin(spawnPolarAngle) * spawnDist;
  const inwardAngle = normalizeAngle(spawnPolarAngle + Math.PI);

  const radius = calculateEntityRadius(initialMass);
  const targetSegments = calculateTargetSegments(initialMass);
  const segmentSpacing = calculateSegmentSpacing(radius);

  // Build initial pathHistory behind the head so if initialMass > MIN_ENTITY_MASS (e.g. in tests), segments sit cleanly along the path
  const pathHistory: BodySegment[] = [{ x, y }];
  const historyPointsNeeded = Math.max(8, targetSegments * 3);
  for (let i = 1; i <= historyPointsNeeded; i++) {
    pathHistory.push({
      x: x - Math.cos(inwardAngle) * i * (segmentSpacing * 0.5),
      y: y - Math.sin(inwardAngle) * i * (segmentSpacing * 0.5),
    });
  }

  const segments: BodySegment[] = [];
  for (let i = 0; i < targetSegments; i++) {
    segments.push({
      x: x - Math.cos(inwardAngle) * i * segmentSpacing,
      y: y - Math.sin(inwardAngle) * i * segmentSpacing,
    });
  }

  return {
    id,
    name,
    faction,
    isAI,
    aiArchetype,
    skinId,
    bodyColor,
    alive: true,
    respawnEffectTimer: 1.5,
    koTimer: 0,
    hitFlashTimer: 0,
    x,
    y,
    vx: Math.cos(inwardAngle) * BASE_ENTITY_SPEED,
    vy: Math.sin(inwardAngle) * BASE_ENTITY_SPEED,
    angle: inwardAngle,
    targetAngle: inwardAngle,
    speed: BASE_ENTITY_SPEED,
    baseSpeed: BASE_ENTITY_SPEED,
    turnRate: 6.4,
    mass: initialMass,
    peakMass: initialMass,
    radius,
    targetSegments,
    segmentSpacing,
    segments,
    pathHistory,
    boostTrailCarry: 0,
    isBoosting: false,
    boostEnergy: 100,
    magnetLevel,
    abilities: createInitialAbilities(),
    disruptedTimer: 0,
    slowedTimer: 0,
    eliminations: 0,
    deaths: 0,
    energyCollected: 0,
    roundEliminations: 0,
  };
}

/**
 * Clamps independent Blue and Purple team counts so each is between 1 and 5
 * and the room total never exceeds MAX_TOTAL_PLAYERS (6).
 */
export function clampCustomTeamCounts(
  blueInput: number,
  purpleInput: number,
  maxTotal = 6
): { blueSize: number; purpleSize: number } {
  const blueSize = Math.max(
    1,
    Math.min(maxTotal - 1, Math.round(Number(blueInput) || 3))
  );
  const purpleSize = Math.max(
    1,
    Math.min(maxTotal - blueSize, Math.round(Number(purpleInput) || 3))
  );
  return { blueSize, purpleSize };
}

/**
 * Places body segments along the stored head movement path (pathHistory) with consistent spacing
 * and smooth linear interpolation so the body automatically follows the exact path taken by the head.
 */
export function updateBodySegments(entity: CosmicEntity): void {
  const desiredCount = calculateTargetSegments(entity.mass);
  entity.targetSegments = desiredCount;
  entity.radius = calculateEntityRadius(entity.mass);
  const spacing = calculateSegmentSpacing(entity.radius);
  entity.segmentSpacing = spacing;

  if (!entity.pathHistory || entity.pathHistory.length === 0) {
    entity.pathHistory = [{ x: entity.x, y: entity.y }];
  }

  // Record head movement into pathHistory whenever head advances
  const newest = entity.pathHistory[0];
  const movedDist = Math.hypot(entity.x - newest.x, entity.y - newest.y);
  if (movedDist >= 1.5) {
    entity.pathHistory.unshift({ x: entity.x, y: entity.y });
  } else {
    newest.x = entity.x;
    newest.y = entity.y;
  }

  // Resize segments array to desiredCount
  while (entity.segments.length < desiredCount) {
    const tail =
      entity.segments.length > 0
        ? entity.segments[entity.segments.length - 1]
        : { x: entity.x, y: entity.y };
    entity.segments.push({ x: tail.x, y: tail.y });
  }
  if (entity.segments.length > desiredCount) {
    entity.segments.length = desiredCount;
  }

  // Segment 0 is anchored at the head (0 arc-length), and each subsequent segment i (1..desiredCount-1)
  // sits at exact arc-length i * spacing along pathHistory so transitioning from 1 dot to 2+ segments is seamless.
  let historyIdx = 0;
  let accumulatedArc = 0;
  let prevX = entity.x;
  let prevY = entity.y;

  for (let segIdx = 0; segIdx < desiredCount; segIdx++) {
    const targetDist = segIdx === 0 ? 0 : segIdx * spacing;

    if (targetDist === 0) {
      entity.segments[segIdx].x = entity.x;
      entity.segments[segIdx].y = entity.y;
      continue;
    }

    while (historyIdx < entity.pathHistory.length - 1) {
      const nextPt = entity.pathHistory[historyIdx + 1];
      const segLen = Math.hypot(nextPt.x - prevX, nextPt.y - prevY);
      if (accumulatedArc + segLen >= targetDist && segLen > 0.0001) {
        const remain = targetDist - accumulatedArc;
        const t = remain / segLen;
        entity.segments[segIdx].x = prevX + (nextPt.x - prevX) * t;
        entity.segments[segIdx].y = prevY + (nextPt.y - prevY) * t;
        break;
      }
      accumulatedArc += segLen;
      prevX = nextPt.x;
      prevY = nextPt.y;
      historyIdx++;
    }

    if (historyIdx >= entity.pathHistory.length - 1) {
      const lastPt = entity.pathHistory[entity.pathHistory.length - 1];
      entity.segments[segIdx].x = lastPt.x;
      entity.segments[segIdx].y = lastPt.y;
    }
  }

  // Prune old pathHistory points beyond what the tail needs
  const maxHistoryPoints = Math.min(600, Math.max(24, historyIdx + 10));
  if (entity.pathHistory.length > maxHistoryPoints) {
    entity.pathHistory.length = maxHistoryPoints;
  }
}

/**
 * Steps a single living entity's movement, boost mass consumption, and active timers.
 * Sensitivity multiplier controls turning responsiveness without altering base movement speed.
 */
export function stepEntityKinematics(
  entity: CosmicEntity,
  dt: number,
  arenaRadius: number,
  boundaryRule: BoundaryRule,
  turnSensitivityMultiplier = 1.0
): { eliminatedByBoundary: boolean; droppedMass: number } {
  if (!entity.alive) {
    if (entity.koTimer > 0) {
      entity.koTimer = Math.max(0, entity.koTimer - dt);
    }
    return { eliminatedByBoundary: false, droppedMass: 0 };
  }

  if (entity.respawnEffectTimer > 0) {
    entity.respawnEffectTimer = Math.max(0, entity.respawnEffectTimer - dt);
  }
  if (entity.hitFlashTimer > 0) {
    entity.hitFlashTimer = Math.max(0, entity.hitFlashTimer - dt);
  }
  if (entity.disruptedTimer > 0) {
    entity.disruptedTimer = Math.max(0, entity.disruptedTimer - dt);
  }
  if (entity.slowedTimer > 0) {
    entity.slowedTimer = Math.max(0, entity.slowedTimer - dt);
  }

  for (const key of Object.keys(entity.abilities) as AbilityId[]) {
    const st = entity.abilities[key];
    if (st.cooldownRemaining > 0) {
      st.cooldownRemaining = Math.max(0, st.cooldownRemaining - dt);
    }
    if (st.activeRemaining > 0) {
      st.activeRemaining = Math.max(0, st.activeRemaining - dt);
    }
  }

  const surgeActive = entity.abilities.surge.activeRemaining > 0;
  const phaseActive = entity.abilities.disrupt.activeRemaining > 0;

  // Determine whether entity can boost (requires mass > BOOST_MIN_MASS and boostEnergy)
  const canBoost =
    entity.isBoosting &&
    entity.disruptedTimer <= 0 &&
    entity.mass > BOOST_MIN_MASS &&
    entity.boostEnergy > 4;

  let droppedMass = 0;
  if (canBoost && !surgeActive) {
    const massDrain = 3.2 * dt;
    const nextMass = Math.max(MIN_ENTITY_MASS, entity.mass - massDrain);
    droppedMass = Math.max(0, entity.mass - nextMass);
    entity.mass = nextMass;
    entity.boostEnergy = Math.max(0, entity.boostEnergy - 24 * dt);
    if (entity.mass <= BOOST_MIN_MASS || entity.boostEnergy <= 4) {
      entity.isBoosting = false;
    }
  } else {
    entity.isBoosting = canBoost;
    entity.boostEnergy = Math.min(100, entity.boostEnergy + 20 * dt);
  }

  // Turning rate scales with turnSensitivityMultiplier (Low = smooth/slow, High = fast)
  // while keeping basic movement speed independent of sensitivity.
  const sizeTurnFactor = Math.max(0.72, 1 - (entity.radius - 10) * 0.0065);
  const disruptionTurnFactor = entity.disruptedTimer > 0 ? 0.58 : 1.0;
  const clampedSens = Math.max(0.25, Math.min(2.2, turnSensitivityMultiplier));
  const effectiveTurnRate =
    entity.turnRate * sizeTurnFactor * disruptionTurnFactor * clampedSens;

  entity.angle = stepAngleToward(
    entity.angle,
    entity.targetAngle,
    effectiveTurnRate * dt
  );

  // Compute movement speed (independent of sensitivity)
  let speedMultiplier = 1.0;
  if (surgeActive) {
    speedMultiplier = SURGE_SPEED_MULTIPLIER;
  } else if (canBoost) {
    speedMultiplier = BOOST_SPEED_MULTIPLIER;
  } else if (phaseActive) {
    speedMultiplier = 1.25;
  }

  if (entity.slowedTimer > 0) {
    speedMultiplier *= 0.6;
  }

  const targetSpeed = entity.baseSpeed * speedMultiplier;
  entity.speed += (targetSpeed - entity.speed) * Math.min(1, dt * 10);

  entity.vx = Math.cos(entity.angle) * entity.speed;
  entity.vy = Math.sin(entity.angle) * entity.speed;

  entity.x += entity.vx * dt;
  entity.y += entity.vy * dt;

  // Check arena boundary
  const distFromCenter = Math.hypot(entity.x, entity.y);
  const maxAllowed = arenaRadius - entity.radius;

  let eliminatedByBoundary = false;
  if (distFromCenter > maxAllowed) {
    const normalAngle = Math.atan2(entity.y, entity.x);
    if (boundaryRule === 'eliminate' && entity.abilities.shield.activeRemaining <= 0) {
      eliminatedByBoundary = true;
    } else if (boundaryRule === 'bounce' || entity.abilities.shield.activeRemaining > 0) {
      entity.x = Math.cos(normalAngle) * maxAllowed;
      entity.y = Math.sin(normalAngle) * maxAllowed;
      entity.angle = normalizeAngle(normalAngle + Math.PI);
      entity.targetAngle = entity.angle;
    } else if (boundaryRule === 'drain') {
      entity.x = Math.cos(normalAngle) * maxAllowed;
      entity.y = Math.sin(normalAngle) * maxAllowed;
      entity.mass = Math.max(MIN_ENTITY_MASS, entity.mass - 12 * dt);
    }
  }

  updateBodySegments(entity);

  return { eliminatedByBoundary, droppedMass };
}

/**
 * Attempts to activate a faction special ability (or the universal Energy Magnet [F] skill) for an entity.
 */
export function tryActivateAbility(
  entity: CosmicEntity,
  abilityId: AbilityId,
  abilitiesEnabled = true
): { activated: boolean; reason?: string } {
  if (!entity.alive) {
    return { activated: false, reason: 'dead' };
  }

  // Energy Magnet [F] ('attract') is universally available to both Blue & Purple teams at 0 Mass cost
  // and scales its duration & cooldown by entity.magnetLevel (Lv. 1..5).
  if (abilityId === 'attract') {
    const state = entity.abilities.attract;
    if (state.cooldownRemaining > 0) {
      return { activated: false, reason: 'cooldown' };
    }
    const magnetSpec = getMagnetUpgradeSpec(entity.magnetLevel || 1);
    state.cooldownRemaining = magnetSpec.cooldown;
    state.activeRemaining = magnetSpec.duration;
    return { activated: true };
  }

  if (!abilitiesEnabled) {
    return { activated: false, reason: 'disabled' };
  }

  const factionSpecs = FACTION_ABILITIES[entity.faction];
  const spec = factionSpecs.find((s) => s.id === abilityId);
  if (!spec) {
    return { activated: false, reason: 'wrong_faction' };
  }

  const state = entity.abilities[abilityId];
  if (state.cooldownRemaining > 0) {
    return { activated: false, reason: 'cooldown' };
  }

  if (entity.mass - spec.massCost < MIN_ENTITY_MASS) {
    return { activated: false, reason: 'insufficient_mass' };
  }

  entity.mass -= spec.massCost;
  state.cooldownRemaining = spec.cooldown;
  state.activeRemaining = spec.duration;

  return { activated: true };
}

/**
 * Applies world-level effects of an activated ability (e.g. Shockwave push, Slow Trap vortex, Boost Jammer)
 * so both local and multiplayer server simulations stay 100% consistent.
 */
export function applyAbilityWorldEffects(params: {
  caster: CosmicEntity;
  abilityId: AbilityId;
  entities: CosmicEntity[];
  vortices: VortexAnomaly[];
  arenaRadius: number;
}): void {
  const { caster, abilityId, entities, vortices, arenaRadius } = params;
  if (abilityId === 'pulse') {
    for (const other of entities) {
      if (!other.alive || other.faction === caster.faction) continue;
      const dx = other.x - caster.x;
      const dy = other.y - caster.y;
      if (Math.abs(dx) > 340 || Math.abs(dy) > 340) continue;
      const dist = Math.hypot(dx, dy);
      if (dist < 340 && dist > 1) {
        const pushForce = ((340 - dist) / 340) * 165;
        other.x += (dx / dist) * pushForce;
        other.y += (dy / dist) * pushForce;
        // Clamp within arena so shockwave push does not unfairly teleport enemies outside bounce border
        const dCenter = Math.hypot(other.x, other.y);
        const maxR = arenaRadius - other.radius;
        if (dCenter > maxR && dCenter > 1) {
          other.x = (other.x / dCenter) * maxR;
          other.y = (other.y / dCenter) * maxR;
        }
        other.hitFlashTimer = 0.14;
      }
    }
  } else if (abilityId === 'vortex') {
    const tail =
      caster.segments[caster.segments.length - 1] || {
        x: caster.x,
        y: caster.y,
      };
    vortices.push({
      id: `vortex_${Date.now()}_${Math.random()}`,
      ownerId: caster.id,
      faction: caster.faction,
      x: tail.x,
      y: tail.y,
      radius: 260,
      remaining: 4.0,
      maxDuration: 4.0,
    });
  } else if (abilityId === 'disrupt') {
    for (const other of entities) {
      if (!other.alive || other.faction === caster.faction) continue;
      const dx = other.x - caster.x;
      const dy = other.y - caster.y;
      if (Math.abs(dx) > 350 || Math.abs(dy) > 350) continue;
      const dist = Math.hypot(dx, dy);
      if (dist < 350) {
        other.disruptedTimer = 2.8;
        other.isBoosting = false;
        other.hitFlashTimer = 0.16;
      }
    }
  }
}

/**
 * Classic Snake/Slither-style collision rules:
 * - If a player's head touches another player's body, that player is eliminated.
 * - The body owner survives.
 * - Own-body collision NEVER eliminates the player.
 */
export function checkEntityCollisionPair(
  a: CosmicEntity,
  b: CosmicEntity
): { aEliminated: boolean; bEliminated: boolean } {
  if (!a.alive || !b.alive || a.id === b.id) {
    return { aEliminated: false, bEliminated: false };
  }
  // Respawn protection grace period
  if (a.respawnEffectTimer > 0.6 || b.respawnEffectTimer > 0.6) {
    return { aEliminated: false, bEliminated: false };
  }
  // Friendly teammates do not eliminate each other
  if (a.faction === b.faction) {
    return { aEliminated: false, bEliminated: false };
  }

  const headDx = a.x - b.x;
  const headDy = a.y - b.y;
  const maxReach =
    (a.segments.length + b.segments.length) *
      Math.max(a.segmentSpacing, b.segmentSpacing) +
    (a.radius + b.radius) * 2;
  if (Math.abs(headDx) > maxReach || Math.abs(headDy) > maxReach) {
    return { aEliminated: false, bEliminated: false };
  }

  const aShielded = a.abilities.shield.activeRemaining > 0;
  const bShielded = b.abilities.shield.activeRemaining > 0;

  let aHitBBody = false;
  let bHitABody = false;

  const bSegRadius = b.radius * 0.78;
  const aHeadHitThreshold = a.radius * 0.8 + bSegRadius;
  const aHeadHitThresholdSq = aHeadHitThreshold * aHeadHitThreshold;

  // Check if A's head touches any trailing segment of B's body (segments[1..n-1])
  if (b.segments.length > 1) {
    for (let i = 1; i < b.segments.length; i++) {
      const seg = b.segments[i];
      const dx = a.x - seg.x;
      if (Math.abs(dx) > aHeadHitThreshold) continue;
      const dy = a.y - seg.y;
      if (Math.abs(dy) > aHeadHitThreshold) continue;
      if (dx * dx + dy * dy <= aHeadHitThresholdSq) {
        aHitBBody = true;
        break;
      }
    }
  }

  const aSegRadius = a.radius * 0.78;
  const bHeadHitThreshold = b.radius * 0.8 + aSegRadius;
  const bHeadHitThresholdSq = bHeadHitThreshold * bHeadHitThreshold;

  // Check if B's head touches any trailing segment of A's body (segments[1..n-1])
  if (a.segments.length > 1) {
    for (let i = 1; i < a.segments.length; i++) {
      const seg = a.segments[i];
      const dx = b.x - seg.x;
      if (Math.abs(dx) > bHeadHitThreshold) continue;
      const dy = b.y - seg.y;
      if (Math.abs(dy) > bHeadHitThreshold) continue;
      if (dx * dx + dy * dy <= bHeadHitThresholdSq) {
        bHitABody = true;
        break;
      }
    }
  }

  // Head-to-head contact: larger entity survives if noticeably bigger, otherwise deflect cleanly
  const headDist = Math.hypot(headDx, headDy);
  if (headDist < (a.radius + b.radius) * 0.82) {
    if (a.mass > b.mass * 1.2) {
      bHitABody = true;
    } else if (b.mass > a.mass * 1.2) {
      aHitBBody = true;
    } else {
      const pushAngle = Math.atan2(headDy, headDx);
      a.x += Math.cos(pushAngle) * 12;
      a.y += Math.sin(pushAngle) * 12;
      b.x -= Math.cos(pushAngle) * 12;
      b.y -= Math.sin(pushAngle) * 12;
    }
  }

  return {
    aEliminated: aHitBBody && !aShielded,
    bEliminated: bHitABody && !bShielded,
  };
}

/**
 * Converts a defeated entity's accumulated mass into valuable collectible energy particles along its body path.
 */
export function convertEntityToParticles(
  entity: CosmicEntity,
  idPrefix: string
): EnergyParticle[] {
  const result: EnergyParticle[] = [];
  const totalRecoverableMass = Math.max(18, entity.mass * 0.95);
  const dropCount = Math.min(
    28,
    Math.max(8, Math.floor(Math.max(4, entity.segments.length) * 0.75))
  );
  const valuePerDrop = Math.max(
    2,
    Number((totalRecoverableMass / dropCount).toFixed(1))
  );

  for (let i = 0; i < dropCount; i++) {
    const segIndex = Math.min(
      Math.max(0, entity.segments.length - 1),
      Math.floor((i / dropCount) * entity.segments.length)
    );
    const basePos = entity.segments[segIndex] || { x: entity.x, y: entity.y };
    const scatterAngle = (i * 2.39996) % (Math.PI * 2);
    const scatterDist = 6 + (i % 4) * 6;

    result.push({
      id: `${idPrefix}_drop_${i}`,
      x: basePos.x + Math.cos(scatterAngle) * scatterDist,
      y: basePos.y + Math.sin(scatterAngle) * scatterDist,
      kind: 'dropped',
      value: valuePerDrop,
      radius: Math.min(13, 6.2 + Math.sqrt(valuePerDrop) * 1.3),
      hueShift: (i * 17) % 40,
      pulsePhase: i * 0.6,
      factionTint: entity.faction,
    });
  }

  return result;
}

/**
 * Generates default cosmic energy zones in the arena.
 */
export function createArenaEnergyZones(arenaRadius: number): EnergyZone[] {
  return [
    {
      id: 'zone_nexus',
      name: 'Astral Core Nexus',
      x: 0,
      y: 0,
      radius: arenaRadius * 0.24,
      type: 'nexus',
    },
    {
      id: 'zone_pos_north',
      name: 'Cyan Harmonic Cluster',
      x: -arenaRadius * 0.34,
      y: -arenaRadius * 0.28,
      radius: arenaRadius * 0.18,
      type: 'positive_well',
    },
    {
      id: 'zone_neg_south',
      name: 'Violet Singularity Rift',
      x: arenaRadius * 0.34,
      y: arenaRadius * 0.28,
      radius: arenaRadius * 0.18,
      type: 'negative_well',
    },
  ];
}

/**
 * Spawns a single ambient energy particle distributed evenly throughout the entire arena.
 * Energy tiers:
 * - Small particles: Common (value = 1.5)
 * - Medium particles: Less common (value = 3.5)
 * - Large particles: Rare (value = 8)
 */
export function createRandomEnergyParticle(
  id: string,
  arenaRadius: number,
  _zones: EnergyZone[],
  rng: () => number = Math.random
): EnergyParticle {
  const roll = rng();
  let kind: ParticleKind = 'small';
  let value = 1.5;
  let radius = 4.8;

  if (roll > 0.9) {
    kind = 'large';
    value = 8;
    radius = 9.6;
  } else if (roll > 0.62) {
    kind = 'medium';
    value = 3.5;
    radius = 6.8;
  }

  // Distribute uniformly throughout the entire circular arena (using sqrt(rng) for uniform 2D area density)
  const a = rng() * Math.PI * 2;
  const r = Math.sqrt(rng()) * (arenaRadius * 0.9);
  const x = Math.cos(a) * r;
  const y = Math.sin(a) * r;

  return {
    id,
    x,
    y,
    kind,
    value,
    radius,
    hueShift: Math.floor(rng() * 50) - 25,
    pulsePhase: rng() * Math.PI * 2,
  };
}

/**
 * Validates team configuration and prevents switching teams during an active round.
 */
export function validateTeamSwitch(params: {
  roundActive: boolean;
  currentFaction: Faction;
  requestedFaction: Faction;
  blueCount: number;
  purpleCount: number;
  maxBlue: number;
  maxPurple: number;
}): { allowed: boolean; reason?: string } {
  const {
    roundActive,
    currentFaction,
    requestedFaction,
    blueCount,
    purpleCount,
    maxBlue,
    maxPurple,
  } = params;

  if (roundActive) {
    return { allowed: false, reason: 'cannot_switch_during_active_round' };
  }
  if (currentFaction === requestedFaction) {
    return { allowed: true };
  }
  if (requestedFaction === 'blue' && blueCount >= maxBlue) {
    return { allowed: false, reason: 'blue_team_full' };
  }
  if (requestedFaction === 'purple' && purpleCount >= maxPurple) {
    return { allowed: false, reason: 'purple_team_full' };
  }
  return { allowed: true };
}

/**
 * Evaluates whether a Clash Squad round has concluded and which team won the round.
 */
export function evaluateRoundOutcome(params: {
  entities: CosmicEntity[];
  roundTimeRemaining: number;
}): {
  roundEnded: boolean;
  winnerFaction: Faction | 'draw' | null;
  reason: string;
  blueAlive: number;
  purpleAlive: number;
} {
  const { entities, roundTimeRemaining } = params;
  let blueSpawned = 0;
  let purpleSpawned = 0;
  let blueAlive = 0;
  let purpleAlive = 0;
  let blueMassSum = 0;
  let purpleMassSum = 0;

  for (const e of entities) {
    if (e.faction === 'blue') {
      blueSpawned++;
      if (e.alive) {
        blueAlive++;
        blueMassSum += e.mass;
      }
    } else {
      purpleSpawned++;
      if (e.alive) {
        purpleAlive++;
        purpleMassSum += e.mass;
      }
    }
  }

  if (blueAlive === 0 && purpleAlive === 0) {
    return {
      roundEnded: true,
      winnerFaction: 'draw',
      reason: 'Both Teams Eliminated',
      blueAlive: 0,
      purpleAlive: 0,
    };
  }

  const bothTeamsPresent = blueSpawned > 0 && purpleSpawned > 0;

  if (bothTeamsPresent && purpleAlive === 0 && blueAlive > 0) {
    return {
      roundEnded: true,
      winnerFaction: 'blue',
      reason: 'Purple Team Eliminated',
      blueAlive,
      purpleAlive: 0,
    };
  }

  if (bothTeamsPresent && blueAlive === 0 && purpleAlive > 0) {
    return {
      roundEnded: true,
      winnerFaction: 'purple',
      reason: 'Blue Team Eliminated',
      blueAlive: 0,
      purpleAlive,
    };
  }

  if (roundTimeRemaining <= 0) {
    if (blueAlive > purpleAlive) {
      return {
        roundEnded: true,
        winnerFaction: 'blue',
        reason: 'More Players Alive',
        blueAlive,
        purpleAlive,
      };
    }
    if (purpleAlive > blueAlive) {
      return {
        roundEnded: true,
        winnerFaction: 'purple',
        reason: 'More Players Alive',
        blueAlive,
        purpleAlive,
      };
    }
    if (blueMassSum > purpleMassSum) {
      return {
        roundEnded: true,
        winnerFaction: 'blue',
        reason: 'Bigger Total Team Size',
        blueAlive,
        purpleAlive,
      };
    }
    if (purpleMassSum > blueMassSum) {
      return {
        roundEnded: true,
        winnerFaction: 'purple',
        reason: 'Bigger Total Team Size',
        blueAlive,
        purpleAlive,
      };
    }
    return {
      roundEnded: true,
      winnerFaction: 'draw',
      reason: 'Time Up — Tie Round',
      blueAlive,
      purpleAlive,
    };
  }

  return {
    roundEnded: false,
    winnerFaction: null,
    reason: '',
    blueAlive,
    purpleAlive,
  };
}

/**
 * Evaluates AI steering, boost, and ability decisions with 3 distinct policies:
 * 1. 'collector': Prioritizes high-value energy clusters & kites away from threats, then chases when grown.
 * 2. 'interceptor': Predicts enemy head velocity and boosts ahead to cut off their path.
 * 3. 'enforcer': Orbits/surrounds enemies and deploys faction special powers.
 */
export function computeAIDecision(params: {
  ai: CosmicEntity;
  entities: CosmicEntity[];
  particles: EnergyParticle[];
  vortices: VortexAnomaly[];
  arenaRadius: number;
  difficulty: AIDifficulty;
  abilitiesEnabled: boolean;
}): {
  targetAngle: number;
  wantsBoost: boolean;
  abilityToTrigger: AbilityId | null;
} {
  const {
    ai,
    entities,
    particles,
    arenaRadius,
    difficulty,
    abilitiesEnabled,
  } = params;

  const lookaheadDist =
    difficulty === 'apex' ? 340 : difficulty === 'tactical' ? 255 : 185;

  // 1. Boundary avoidance vector (starts at 70% of arenaRadius so AI bots stay in the active central battleground and never get stuck in corners)
  const distFromCenter = Math.hypot(ai.x, ai.y);
  if (distFromCenter > arenaRadius * 0.7) {
    const angleToOrigin = Math.atan2(-ai.y, -ai.x);
    return {
      targetAngle: angleToOrigin,
      wantsBoost: distFromCenter > arenaRadius * 0.84,
      abilityToTrigger:
        abilitiesEnabled &&
        ai.faction === 'blue' &&
        distFromCenter > arenaRadius * 0.88
          ? 'shield'
          : null,
    };
  }

  // 2. Scan nearby enemy segments for collision danger
  let repulseX = 0;
  let repulseY = 0;
  let immediateDanger = false;
  let closestEnemy: CosmicEntity | null = null;
  let closestEnemyDist = Infinity;

  const probeX = ai.x + Math.cos(ai.angle) * (lookaheadDist * 0.55);
  const probeY = ai.y + Math.sin(ai.angle) * (lookaheadDist * 0.55);

  for (const other of entities) {
    if (!other.alive || other.id === ai.id || other.faction === ai.faction) {
      continue;
    }

    const headDist = Math.hypot(other.x - ai.x, other.y - ai.y);
    if (headDist < closestEnemyDist) {
      closestEnemyDist = headDist;
      closestEnemy = other;
    }

    // Check enemy body segments for danger
    const step = difficulty === 'novice' ? 3 : 2;
    for (let i = 0; i < other.segments.length; i += step) {
      const seg = other.segments[i];
      const dx = ai.x - seg.x;
      const dy = ai.y - seg.y;
      if (Math.abs(dx) > lookaheadDist * 1.4 || Math.abs(dy) > lookaheadDist * 1.4) {
        continue;
      }
      const dist = Math.hypot(dx, dy);

      const probeDist = Math.hypot(probeX - seg.x, probeY - seg.y);
      if (dist < lookaheadDist || probeDist < lookaheadDist * 0.7) {
        const weight = Math.pow(
          (lookaheadDist - Math.min(dist, probeDist)) / lookaheadDist,
          2
        );
        repulseX += (dx / Math.max(1, dist)) * weight * 3.2;
        repulseY += (dy / Math.max(1, dist)) * weight * 3.2;
        if (dist < ai.radius + other.radius + 55) {
          immediateDanger = true;
        }
      }
    }
  }

  if (immediateDanger || Math.hypot(repulseX, repulseY) > 1.2) {
    const evadeAngle = Math.atan2(repulseY, repulseX);
    let abilityToTrigger: AbilityId | null = null;
    if (abilitiesEnabled && difficulty !== 'novice') {
      if (ai.faction === 'blue' && immediateDanger) {
        abilityToTrigger = 'shield';
      } else if (ai.faction === 'purple' && immediateDanger) {
        abilityToTrigger = 'pulse';
      }
    }
    return {
      targetAngle: evadeAngle,
      wantsBoost: immediateDanger && ai.mass > 22,
      abilityToTrigger,
    };
  }

  const archetype: AIArchetype = ai.aiArchetype || 'collector';
  const chaseRange =
    difficulty === 'apex' ? 1150 : difficulty === 'tactical' ? 920 : 720;
  const surroundRange =
    difficulty === 'apex' ? 680 : difficulty === 'tactical' ? 560 : 440;

  // 3. Surround / coil behavior when close to an enemy and grown
  if (
    closestEnemy &&
    closestEnemyDist < surroundRange &&
    ai.mass >= 24 &&
    (archetype === 'enforcer' ||
      (archetype === 'collector' &&
        ai.mass > closestEnemy.mass * 1.08 &&
        closestEnemyDist < 380))
  ) {
    // Orbit around the enemy at a tightening radius to coil and trap them
    const toEnemyAngle = Math.atan2(
      closestEnemy.y - ai.y,
      closestEnemy.x - ai.x
    );
    const tangentOffset =
      closestEnemyDist < 240 ? Math.PI * 0.48 : Math.PI * 0.38;
    const orbitAngle = normalizeAngle(toEnemyAngle + tangentOffset);

    let abilityToTrigger: AbilityId | null = null;
    if (abilitiesEnabled && difficulty !== 'novice' && closestEnemyDist < 280) {
      abilityToTrigger = ai.faction === 'purple' ? 'vortex' : 'attract';
    }

    return {
      targetAngle: orbitAngle,
      wantsBoost:
        difficulty !== 'novice' && closestEnemyDist < 320 && ai.mass > 32,
      abilityToTrigger,
    };
  }

  // 4. Chase / intercept behavior to cut ahead of enemy movement
  if (
    closestEnemy &&
    closestEnemyDist < chaseRange &&
    ai.mass >= closestEnemy.mass * 0.8 &&
    (archetype === 'interceptor' ||
      (ai.mass > 32 && closestEnemyDist < chaseRange * 0.75))
  ) {
    const leadTime =
      difficulty === 'apex' ? 0.95 : difficulty === 'tactical' ? 0.72 : 0.45;
    const interceptX =
      closestEnemy.x +
      Math.cos(closestEnemy.angle) * (closestEnemy.speed * leadTime + 90);
    const interceptY =
      closestEnemy.y +
      Math.sin(closestEnemy.angle) * (closestEnemy.speed * leadTime + 90);
    const interceptAngle = Math.atan2(interceptY - ai.y, interceptX - ai.x);

    let abilityToTrigger: AbilityId | null = null;
    if (abilitiesEnabled && difficulty !== 'novice' && closestEnemyDist < 340) {
      abilityToTrigger = ai.faction === 'blue' ? 'surge' : 'disrupt';
    }

    return {
      targetAngle: interceptAngle,
      wantsBoost:
        closestEnemyDist < 420 &&
        ai.mass > (difficulty === 'novice' ? 35 : 24),
      abilityToTrigger,
    };
  }

  // 5. Energy collection policy: score nearby energy particles by value / distance, preferring particles inside the main arena
  let bestParticle: EnergyParticle | null = null;
  let bestScore = -Infinity;

  for (let i = 0; i < particles.length; i++) {
    const p = particles[i];
    const pdx = p.x - ai.x;
    if (Math.abs(pdx) > 860) continue;
    const pdy = p.y - ai.y;
    if (Math.abs(pdy) > 860) continue;
    const pCenterDist = Math.hypot(p.x, p.y);
    if (pCenterDist > arenaRadius * 0.86) continue;
    const dist = Math.hypot(pdx, pdy);
    if (dist > 860) continue;
    const score = (p.value * 26) / (dist + 35);
    if (score > bestScore) {
      bestScore = score;
      bestParticle = p;
    }
  }

  if (bestParticle) {
    const angleToParticle = Math.atan2(
      bestParticle.y - ai.y,
      bestParticle.x - ai.x
    );
    const distToParticle = Math.hypot(
      bestParticle.x - ai.x,
      bestParticle.y - ai.y
    );
    let abilityToTrigger: AbilityId | null = null;
    if (
      abilitiesEnabled &&
      ai.faction === 'blue' &&
      bestParticle.value >= 6 &&
      distToParticle < 360
    ) {
      abilityToTrigger = 'attract';
    }
    return {
      targetAngle: angleToParticle,
      wantsBoost:
        bestParticle.value >= 6 && distToParticle > 140 && ai.mass > 26,
      abilityToTrigger,
    };
  }

  // 6. Fallback: move toward closest enemy so opponents stay engaged near the player
  if (closestEnemy) {
    const angleToEnemy = Math.atan2(
      closestEnemy.y - ai.y,
      closestEnemy.x - ai.x
    );
    return {
      targetAngle: angleToEnemy,
      wantsBoost: false,
      abilityToTrigger: null,
    };
  }

  const angleToCenter = Math.atan2(-ai.y, -ai.x);
  return {
    targetAngle: normalizeAngle(angleToCenter + 0.35),
    wantsBoost: false,
    abilityToTrigger: null,
  };
}
