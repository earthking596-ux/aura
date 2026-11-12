import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyAbilityWorldEffects,
  calculateCameraZoom,
  calculateEntityRadius,
  calculateTargetSegments,
  checkEntityCollisionPair,
  clampCustomTeamCounts,
  computeAIDecision,
  convertEntityToParticles,
  createCosmicEntity,
  evaluateRoundOutcome,
  stepEntityKinematics,
  tryActivateAbility,
  validateTeamSwitch,
} from './rules';
import { getMagnetUpgradeSpec, VortexAnomaly } from './types';

test('growth math scales radius, segment count, and camera zoom smoothly', () => {
  const rSmall = calculateEntityRadius(60);
  const rLarge = calculateEntityRadius(450);
  assert.ok(rLarge > rSmall, 'larger mass increases core radius');

  const segSmall = calculateTargetSegments(60);
  const segLarge = calculateTargetSegments(450);
  assert.ok(segLarge > segSmall, 'larger mass increases segment count');

  const zoomSmall = calculateCameraZoom(rSmall);
  const zoomLarge = calculateCameraZoom(rLarge);
  assert.ok(zoomLarge < zoomSmall, 'camera zooms out as entity grows');
});

test('own-body collision never eliminates player, opponent body collision eliminates unshielded head', () => {
  const bluePlayer = createCosmicEntity({
    id: 'blue_1',
    name: 'CyanOne',
    faction: 'blue',
    isAI: false,
    spawnIndex: 0,
    teamTotal: 1,
    arenaRadius: 3000,
    initialMass: 100,
  });

  const purpleOpponent = createCosmicEntity({
    id: 'purple_1',
    name: 'VioletOne',
    faction: 'purple',
    isAI: true,
    spawnIndex: 0,
    teamTotal: 1,
    arenaRadius: 3000,
    initialMass: 100,
  });

  // Clear respawn grace timers
  bluePlayer.respawnEffectTimer = 0;
  purpleOpponent.respawnEffectTimer = 0;

  // Own-body collision check (passing same entity)
  const selfCheck = checkEntityCollisionPair(bluePlayer, bluePlayer);
  assert.equal(selfCheck.aEliminated, false);
  assert.equal(selfCheck.bEliminated, false);

  // Place bluePlayer's core directly onto purpleOpponent's 4th body segment
  bluePlayer.x = purpleOpponent.segments[4].x;
  bluePlayer.y = purpleOpponent.segments[4].y;

  const collision = checkEntityCollisionPair(bluePlayer, purpleOpponent);
  assert.equal(collision.aEliminated, true, 'blue head hitting purple body eliminates blue');
  assert.equal(collision.bEliminated, false, 'purple remains alive');

  // Activate Blue's Aegis Halo shield and verify immunity
  const shieldResult = tryActivateAbility(bluePlayer, 'shield', true);
  assert.equal(shieldResult.activated, true);
  const shieldedCollision = checkEntityCollisionPair(bluePlayer, purpleOpponent);
  assert.equal(shieldedCollision.aEliminated, false, 'shield protects blue core from elimination');
});

test('faction abilities enforce faction ownership, mass cost, cooldowns, and world effects', () => {
  const blueEntity = createCosmicEntity({
    id: 'b1',
    name: 'Blue',
    faction: 'blue',
    isAI: false,
    spawnIndex: 0,
    teamTotal: 1,
    arenaRadius: 2500,
    initialMass: 90,
  });

  // Cannot trigger purple ability 'vortex'
  const wrongFaction = tryActivateAbility(blueEntity, 'vortex', true);
  assert.equal(wrongFaction.activated, false);
  assert.equal(wrongFaction.reason, 'wrong_faction');

  // Can trigger Energy Magnet [F] ('attract') with 0 mass cost
  const attractRes = tryActivateAbility(blueEntity, 'attract', false);
  assert.equal(attractRes.activated, true);
  assert.equal(blueEntity.mass, 90);

  // Immediate re-trigger blocked by cooldown
  const onCooldown = tryActivateAbility(blueEntity, 'attract', false);
  assert.equal(onCooldown.activated, false);
  assert.equal(onCooldown.reason, 'cooldown');

  // Purple vortex spawns a vortex anomaly
  const purpleEntity = createCosmicEntity({
    id: 'p1',
    name: 'Purple',
    faction: 'purple',
    isAI: false,
    spawnIndex: 0,
    teamTotal: 1,
    arenaRadius: 2500,
    initialMass: 90,
  });
  const vortices: VortexAnomaly[] = [];
  const vortexRes = tryActivateAbility(purpleEntity, 'vortex', true);
  assert.equal(vortexRes.activated, true);
  applyAbilityWorldEffects({
    caster: purpleEntity,
    abilityId: 'vortex',
    entities: [blueEntity, purpleEntity],
    vortices,
    arenaRadius: 2500,
  });
  assert.equal(vortices.length, 1, 'vortex ability creates active vortex anomaly');
});

test('stepEntityKinematics handles boost mass drain and boundary rules', () => {
  const entity = createCosmicEntity({
    id: 'p1',
    name: 'Runner',
    faction: 'blue',
    isAI: false,
    spawnIndex: 0,
    teamTotal: 1,
    arenaRadius: 1000,
    initialMass: 100,
  });
  entity.isBoosting = true;
  const beforeMass = entity.mass;
  const step1 = stepEntityKinematics(entity, 0.04, 1000, 'eliminate');
  assert.equal(step1.eliminatedByBoundary, false);
  assert.ok(entity.mass < beforeMass, 'boosting consumes mass');

  // Move outside arena boundary with 'eliminate' rule
  entity.x = 1200;
  entity.y = 0;
  const step2 = stepEntityKinematics(entity, 0.04, 1000, 'eliminate');
  assert.equal(step2.eliminatedByBoundary, true);
});

test('validateTeamSwitch and clampCustomTeamCounts enforce 6-player room cap', () => {
  const blockedActive = validateTeamSwitch({
    roundActive: true,
    currentFaction: 'blue',
    requestedFaction: 'purple',
    blueCount: 1,
    purpleCount: 4,
    maxBlue: 1,
    maxPurple: 5,
  });
  assert.equal(blockedActive.allowed, false);
  assert.equal(blockedActive.reason, 'cannot_switch_during_active_round');

  const allowedLobby = validateTeamSwitch({
    roundActive: false,
    currentFaction: 'blue',
    requestedFaction: 'purple',
    blueCount: 1,
    purpleCount: 4,
    maxBlue: 1,
    maxPurple: 5,
  });
  assert.equal(allowedLobby.allowed, true);

  const clamped1 = clampCustomTeamCounts(2, 3);
  assert.deepEqual(clamped1, { blueSize: 2, purpleSize: 3 });

  const clamped2 = clampCustomTeamCounts(5, 5);
  assert.equal(clamped2.blueSize + clamped2.purpleSize, 6, 'room total never exceeds 6 players');
});

test('evaluateRoundOutcome awards round victory when opposing faction is eliminated', () => {
  const blue = createCosmicEntity({
    id: 'b1',
    name: 'Blue',
    faction: 'blue',
    isAI: false,
    spawnIndex: 0,
    teamTotal: 1,
    arenaRadius: 2000,
  });
  const purple = createCosmicEntity({
    id: 'p1',
    name: 'Purple',
    faction: 'purple',
    isAI: true,
    spawnIndex: 0,
    teamTotal: 1,
    arenaRadius: 2000,
  });

  const activeOutcome = evaluateRoundOutcome({
    entities: [blue, purple],
    roundTimeRemaining: 60,
  });
  assert.equal(activeOutcome.roundEnded, false);

  purple.alive = false;
  const blueWinOutcome = evaluateRoundOutcome({
    entities: [blue, purple],
    roundTimeRemaining: 60,
  });
  assert.equal(blueWinOutcome.roundEnded, true);
  assert.equal(blueWinOutcome.winnerFaction, 'blue');

  const drops = convertEntityToParticles(purple, 'p1');
  assert.ok(drops.length >= 8, 'eliminated entity drops collectible energy particles');
});

test('computeAIDecision differentiates collector, interceptor, and enforcer archetypes', () => {
  const collector = createCosmicEntity({
    id: 'ai_col',
    name: 'Collector',
    faction: 'blue',
    isAI: true,
    aiArchetype: 'collector',
    spawnIndex: 0,
    teamTotal: 2,
    arenaRadius: 3000,
    initialMass: 120,
  });
  collector.x = 0;
  collector.y = 0;

  const interceptor = createCosmicEntity({
    id: 'ai_int',
    name: 'Interceptor',
    faction: 'blue',
    isAI: true,
    aiArchetype: 'interceptor',
    spawnIndex: 1,
    teamTotal: 2,
    arenaRadius: 3000,
    initialMass: 120,
  });
  interceptor.x = 0;
  interceptor.y = 0;

  const enemy = createCosmicEntity({
    id: 'enemy_1',
    name: 'Target',
    faction: 'purple',
    isAI: true,
    spawnIndex: 0,
    teamTotal: 1,
    arenaRadius: 3000,
    initialMass: 90,
  });
  enemy.x = 260;
  enemy.y = 80;
  enemy.angle = Math.PI / 2;

  const particle = {
    id: 'orb_1',
    x: -200,
    y: -150,
    kind: 'rare' as const,
    value: 18,
    radius: 11,
    hueShift: 0,
    pulsePhase: 0,
  };

  const colDecision = computeAIDecision({
    ai: collector,
    entities: [collector, interceptor, enemy],
    particles: [particle],
    vortices: [],
    arenaRadius: 3000,
    difficulty: 'tactical',
    abilitiesEnabled: true,
  });

  const intDecision = computeAIDecision({
    ai: interceptor,
    entities: [collector, interceptor, enemy],
    particles: [particle],
    vortices: [],
    arenaRadius: 3000,
    difficulty: 'tactical',
    abilitiesEnabled: true,
  });

  assert.notEqual(
    colDecision.targetAngle,
    intDecision.targetAngle,
    'collector steers toward rare particle while interceptor leads enemy head'
  );
});

test('smooth mouse steering rotates rapidly on large angles and dampens micro-jitter', () => {
  const entity = createCosmicEntity({
    id: 'steer_1',
    name: 'SteerTest',
    faction: 'blue',
    isAI: false,
    spawnIndex: 0,
    teamTotal: 1,
    arenaRadius: 3000,
    initialMass: 70,
  });
  entity.angle = 0;
  entity.targetAngle = Math.PI / 2; // 90 deg turn

  // 10 frames at 60fps (~0.16s) should complete most of a 90-degree turn
  for (let i = 0; i < 10; i++) {
    stepEntityKinematics(entity, 0.016, 3000, 'bounce');
  }
  assert.ok(
    entity.angle > 0.9,
    'entity turns smoothly and quickly toward perpendicular mouse target'
  );
});

test('solo Private Room round stays active when only one team has human players until timer expires', () => {
  const soloBlue = createCosmicEntity({
    id: 'human_1',
    name: 'HostPlayer',
    faction: 'blue',
    isAI: false,
    spawnIndex: 0,
    teamTotal: 1,
    arenaRadius: 2500,
    initialMass: 65,
  });

  const activeSolo = evaluateRoundOutcome({
    entities: [soloBlue],
    roundTimeRemaining: 75,
  });
  assert.equal(
    activeSolo.roundEnded,
    false,
    'solo Private Room does not prematurely end on tick 1'
  );

  const expiredSolo = evaluateRoundOutcome({
    entities: [soloBlue],
    roundTimeRemaining: 0,
  });
  assert.equal(expiredSolo.roundEnded, true);
  assert.equal(expiredSolo.winnerFaction, 'blue');
});

test('energy growth scaling and eliminated player drops produce significant size and length increases', () => {
  const smallR = calculateEntityRadius(10);
  const mediumR = calculateEntityRadius(180);
  const largeR = calculateEntityRadius(550);

  assert.ok(mediumR > smallR + 10, 'medium entity is visibly thicker than starting entity');
  assert.ok(largeR > mediumR + 8, 'large entity is dramatically thicker than medium entity');

  const smallLen = calculateTargetSegments(10);
  const largeLen = calculateTargetSegments(400);
  assert.ok(largeLen > smallLen * 10, 'large entity body length is much longer than starting dot');

  const eliminated = createCosmicEntity({
    id: 'elim_big',
    name: 'Giant',
    faction: 'purple',
    isAI: true,
    spawnIndex: 0,
    teamTotal: 1,
    arenaRadius: 2200,
    initialMass: 200,
  });
  const drops = convertEntityToParticles(eliminated, 'drop_test');
  const totalDroppedEnergy = drops.reduce((sum, p) => sum + p.value, 0);
  assert.ok(drops.length >= 12, 'eliminated player drops a generous cluster of energy orbs');
  assert.ok(totalDroppedEnergy >= 150, 'dropped energy orbs yield substantial mass recovery');
});

test('every player starts as ONE tiny glowing dot and grows smoothly along head path history', () => {
  const starter = createCosmicEntity({
    id: 'starter_dot',
    name: 'TinyDot',
    faction: 'blue',
    isAI: false,
    spawnIndex: 0,
    teamTotal: 1,
    arenaRadius: 2200,
  });

  assert.equal(starter.mass, 10, 'starts at minimum mass 10');
  assert.equal(starter.segments.length, 1, 'starts as ONE small glowing dot (1 segment)');
  assert.equal(starter.radius, 10, 'starts at minimum radius 10px');

  // Simulate collecting energy particles and moving forward along a path
  for (let step = 0; step < 30; step++) {
    starter.mass += 1.5; // collect small energy particle
    stepEntityKinematics(starter, 0.03, 2200, 'bounce', 1.0);
  }

  assert.ok(starter.mass > 50, 'mass increases progressively with collected energy');
  assert.ok(starter.segments.length > 10, 'body grows longer as mass increases');
  assert.ok(starter.radius > 14, 'entity becomes thicker as mass increases');
  assert.ok(starter.pathHistory.length >= 10, 'head positions are stored in pathHistory');
});

test('control sensitivity scales turning speed without changing base movement speed', () => {
  const lowSensEntity = createCosmicEntity({
    id: 'low_sens',
    name: 'Low',
    faction: 'blue',
    isAI: false,
    spawnIndex: 0,
    teamTotal: 1,
    arenaRadius: 2500,
  });
  const highSensEntity = createCosmicEntity({
    id: 'high_sens',
    name: 'High',
    faction: 'blue',
    isAI: false,
    spawnIndex: 0,
    teamTotal: 1,
    arenaRadius: 2500,
  });

  lowSensEntity.angle = 0;
  lowSensEntity.targetAngle = Math.PI / 2;
  highSensEntity.angle = 0;
  highSensEntity.targetAngle = Math.PI / 2;

  stepEntityKinematics(lowSensEntity, 0.02, 2500, 'bounce', 0.71); // Low (25%)
  stepEntityKinematics(highSensEntity, 0.02, 2500, 'bounce', 1.8); // Very High (100%)

  assert.ok(
    highSensEntity.angle > lowSensEntity.angle,
    'higher sensitivity turns faster toward targetAngle than low sensitivity'
  );
  assert.equal(
    lowSensEntity.speed,
    highSensEntity.speed,
    'sensitivity does not alter base movement speed'
  );
});

test('Magnet [F] upgrade tiers scale pull radius, duration, and cooldown across levels 1 to 5', () => {
  const lv1 = getMagnetUpgradeSpec(1);
  const lv3 = getMagnetUpgradeSpec(3);
  const lv5 = getMagnetUpgradeSpec(5);

  assert.ok(lv5.pullRadius > lv3.pullRadius && lv3.pullRadius > lv1.pullRadius, 'pullRadius increases with level');
  assert.ok(lv5.duration > lv3.duration && lv3.duration > lv1.duration, 'duration increases with level');
  assert.ok(lv5.cooldown < lv3.cooldown && lv3.cooldown < lv1.cooldown, 'cooldown decreases (faster) with level');

  const purpleStarter = createCosmicEntity({
    id: 'p_mag',
    name: 'PurpleStarter',
    faction: 'purple',
    isAI: false,
    spawnIndex: 0,
    teamTotal: 1,
    arenaRadius: 2200,
    initialMass: 10,
    magnetLevel: 5,
  });

  const res = tryActivateAbility(purpleStarter, 'attract', false);
  assert.equal(res.activated, true, 'purple starter at mass 10 can activate Magnet [F] even when optional powers are off');
  assert.equal(purpleStarter.abilities.attract.activeRemaining, lv5.duration);
  assert.equal(purpleStarter.abilities.attract.cooldownRemaining, lv5.cooldown);
});

