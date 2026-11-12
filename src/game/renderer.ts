import { calculateCameraZoom } from './rules';
import {
  COSMIC_SKINS,
  CosmicEntity,
  EnergyParticle,
  EnergyZone,
  Faction,
  GameSettings,
  getMagnetUpgradeSpec,
  VortexAnomaly,
} from './types';

interface StarPoint {
  x: number;
  y: number;
  size: number;
  alpha: number;
  depth: number;
  tint: string;
}

interface NebulaCloud {
  x: number;
  y: number;
  radius: number;
  colorInner: string;
  colorOuter: string;
}

interface PooledFxParticle {
  active: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  alpha: number;
  life: number;
  maxLife: number;
  color: string;
}

interface ShockwaveRing {
  active: boolean;
  x: number;
  y: number;
  radius: number;
  maxRadius: number;
  life: number;
  maxLife: number;
  color: string;
}

const MAX_FX_PARTICLES = 320;
const MAX_SHOCKWAVES = 24;

export class CosmicCanvasRenderer {
  private stars: StarPoint[] = [];
  private nebulae: NebulaCloud[] = [];
  private fxPool: PooledFxParticle[] = [];
  private fxCursor = 0;
  private shockwaves: ShockwaveRing[] = [];
  private shockwaveCursor = 0;

  public cameraX = 0;
  public cameraY = 0;
  public cameraZoom = 0.92;
  private trauma = 0;
  private time = 0;

  constructor() {
    this.initStarfield();
    this.initPools();
  }

  private initStarfield(): void {
    const tints = ['#E0F2FE', '#BAE6FD', '#DDD6FE', '#F5D0FE', '#F8FAFC'];
    for (let i = 0; i < 240; i++) {
      this.stars.push({
        x: (Math.random() - 0.5) * 9000,
        y: (Math.random() - 0.5) * 9000,
        size: 0.8 + Math.random() * 2.1,
        alpha: 0.25 + Math.random() * 0.65,
        depth: 0.15 + Math.random() * 0.65,
        tint: tints[i % tints.length],
      });
    }

    this.nebulae = [
      {
        x: -1100,
        y: -750,
        radius: 1350,
        colorInner: 'rgba(6, 182, 212, 0.13)',
        colorOuter: 'rgba(14, 116, 144, 0)',
      },
      {
        x: 1150,
        y: 820,
        radius: 1450,
        colorInner: 'rgba(168, 85, 247, 0.14)',
        colorOuter: 'rgba(126, 34, 206, 0)',
      },
      {
        x: 150,
        y: -1200,
        radius: 1100,
        colorInner: 'rgba(56, 189, 248, 0.09)',
        colorOuter: 'rgba(30, 58, 138, 0)',
      },
      {
        x: -950,
        y: 1050,
        radius: 1200,
        colorInner: 'rgba(217, 70, 239, 0.10)',
        colorOuter: 'rgba(88, 28, 135, 0)',
      },
    ];
  }

  private initPools(): void {
    for (let i = 0; i < MAX_FX_PARTICLES; i++) {
      this.fxPool.push({
        active: false,
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        radius: 3,
        alpha: 1,
        life: 0,
        maxLife: 0.5,
        color: '#38BDF8',
      });
    }
    for (let i = 0; i < MAX_SHOCKWAVES; i++) {
      this.shockwaves.push({
        active: false,
        x: 0,
        y: 0,
        radius: 10,
        maxRadius: 200,
        life: 0,
        maxLife: 0.5,
        color: '#38BDF8',
      });
    }
  }

  public addCameraTrauma(amount: number): void {
    this.trauma = Math.min(1, this.trauma + amount);
  }

  public spawnBurst(
    x: number,
    y: number,
    count: number,
    color: string,
    speedMin = 45,
    speedMax = 210,
    radiusMin = 2.2,
    radiusMax = 5.5,
    life = 0.55
  ): void {
    for (let i = 0; i < count; i++) {
      const slot = this.fxPool[this.fxCursor];
      this.fxCursor = (this.fxCursor + 1) % MAX_FX_PARTICLES;

      const angle = Math.random() * Math.PI * 2;
      const speed = speedMin + Math.random() * (speedMax - speedMin);

      slot.active = true;
      slot.x = x;
      slot.y = y;
      slot.vx = Math.cos(angle) * speed;
      slot.vy = Math.sin(angle) * speed;
      slot.radius = radiusMin + Math.random() * (radiusMax - radiusMin);
      slot.life = life * (0.75 + Math.random() * 0.4);
      slot.maxLife = slot.life;
      slot.alpha = 1;
      slot.color = color;
    }
  }

  public spawnShockwave(
    x: number,
    y: number,
    maxRadius: number,
    color: string,
    duration = 0.5
  ): void {
    const ring = this.shockwaves[this.shockwaveCursor];
    this.shockwaveCursor = (this.shockwaveCursor + 1) % MAX_SHOCKWAVES;

    ring.active = true;
    ring.x = x;
    ring.y = y;
    ring.radius = 16;
    ring.maxRadius = maxRadius;
    ring.life = duration;
    ring.maxLife = duration;
    ring.color = color;
  }

  public screenToWorld(
    clientX: number,
    clientY: number,
    canvasRect: DOMRect
  ): { x: number; y: number } {
    const cx = clientX - canvasRect.left - canvasRect.width * 0.5;
    const cy = clientY - canvasRect.top - canvasRect.height * 0.5;
    return {
      x: this.cameraX + cx / this.cameraZoom,
      y: this.cameraY + cy / this.cameraZoom,
    };
  }

  public updateCameraAndFx(
    dt: number,
    targetEntity: CosmicEntity | null,
    isTitleTour: boolean,
    userZoomSetting = 1.0
  ): void {
    this.time += dt;

    if (isTitleTour) {
      // Gentle, slow drift across the cosmic starfield during Title state
      this.cameraX = Math.cos(this.time * 0.04) * 260;
      this.cameraY = Math.sin(this.time * 0.03) * 180;
      this.cameraZoom += (0.85 - this.cameraZoom) * Math.min(1, dt * 2);
    } else if (targetEntity) {
      const distToTarget = Math.hypot(
        targetEntity.x - this.cameraX,
        targetEntity.y - this.cameraY
      );
      if (targetEntity.respawnEffectTimer > 1.4 || distToTarget > 1400) {
        this.cameraX = targetEntity.x;
        this.cameraY = targetEntity.y;
      } else {
        const damp = 1 - Math.exp(-16.5 * dt);
        this.cameraX += (targetEntity.x - this.cameraX) * damp;
        this.cameraY += (targetEntity.y - this.cameraY) * damp;
      }

      const idealZoom = calculateCameraZoom(targetEntity.radius, userZoomSetting);
      this.cameraZoom += (idealZoom - this.cameraZoom) * Math.min(1, dt * 5.0);
    }

    if (this.trauma > 0) {
      this.trauma = Math.max(0, this.trauma - dt * 1.85);
    }

    // Update pooled FX particles in place (Zero-GC)
    for (let i = 0; i < MAX_FX_PARTICLES; i++) {
      const p = this.fxPool[i];
      if (!p.active) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.active = false;
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.94;
      p.vy *= 0.94;
      p.alpha = Math.max(0, p.life / p.maxLife);
    }

    // Update shockwave rings in place
    for (let i = 0; i < MAX_SHOCKWAVES; i++) {
      const r = this.shockwaves[i];
      if (!r.active) continue;
      r.life -= dt;
      if (r.life <= 0) {
        r.active = false;
        continue;
      }
      const progress = 1 - r.life / r.maxLife;
      r.radius = 18 + (r.maxRadius - 18) * (1 - Math.pow(1 - progress, 2));
    }
  }

  public render(params: {
    ctx: CanvasRenderingContext2D;
    width: number;
    height: number;
    arenaRadius: number;
    zones: EnergyZone[];
    particles: EnergyParticle[];
    vortices: VortexAnomaly[];
    entities: CosmicEntity[];
    localPlayerId: string | null;
    settings: GameSettings;
  }): void {
    const {
      ctx,
      width,
      height,
      arenaRadius,
      zones,
      particles,
      vortices,
      entities,
      localPlayerId,
      settings,
    } = params;

    // 1. Deep space backdrop
    ctx.fillStyle = '#040711';
    ctx.fillRect(0, 0, width, height);

    const shakeMag = settings.screenShake ? this.trauma * this.trauma * 18 : 0;
    const shakeX = shakeMag > 0 ? (Math.random() - 0.5) * 2 * shakeMag : 0;
    const shakeY = shakeMag > 0 ? (Math.random() - 0.5) * 2 * shakeMag : 0;

    ctx.save();
    ctx.translate(width * 0.5 + shakeX, height * 0.5 + shakeY);
    ctx.scale(this.cameraZoom, this.cameraZoom);
    ctx.translate(-this.cameraX, -this.cameraY);

    const viewHalfW = (width * 0.5) / this.cameraZoom + 360;
    const viewHalfH = (height * 0.5) / this.cameraZoom + 360;
    const minX = this.cameraX - viewHalfW;
    const maxX = this.cameraX + viewHalfW;
    const minY = this.cameraY - viewHalfH;
    const maxY = this.cameraY + viewHalfH;

    // 2. Nebula atmospheric clouds
    for (const neb of this.nebulae) {
      if (
        neb.x + neb.radius < minX ||
        neb.x - neb.radius > maxX ||
        neb.y + neb.radius < minY ||
        neb.y - neb.radius > maxY
      ) {
        continue;
      }
      const grad = ctx.createRadialGradient(
        neb.x,
        neb.y,
        neb.radius * 0.08,
        neb.x,
        neb.y,
        neb.radius
      );
      grad.addColorStop(0, neb.colorInner);
      grad.addColorStop(1, neb.colorOuter);
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(neb.x, neb.y, neb.radius, 0, Math.PI * 2);
      ctx.fill();
    }

    // 3. Parallax starfield
    for (let i = 0; i < this.stars.length; i++) {
      const s = this.stars[i];
      const sx = s.x + this.cameraX * (1 - s.depth);
      const sy = s.y + this.cameraY * (1 - s.depth);
      if (sx < minX || sx > maxX || sy < minY || sy > maxY) continue;

      const twinkle = 0.72 + 0.28 * Math.sin(this.time * 2.3 + i);
      ctx.globalAlpha = s.alpha * twinkle;
      ctx.fillStyle = s.tint;
      ctx.beginPath();
      ctx.arc(sx, sy, s.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // 4. Subtle cosmic tactical coordinate lattice
    this.renderCosmicGrid(ctx, minX, maxX, minY, maxY, arenaRadius);

    // 5. Glowing Energy Zones
    for (const zone of zones) {
      if (
        zone.x + zone.radius < minX ||
        zone.x - zone.radius > maxX ||
        zone.y + zone.radius < minY ||
        zone.y - zone.radius > maxY
      ) {
        continue;
      }
      const isBlue = zone.type === 'positive_well';
      const isPurple = zone.type === 'negative_well';
      const primaryRgba = isBlue
        ? 'rgba(0, 240, 255, 0.11)'
        : isPurple
        ? 'rgba(192, 132, 252, 0.11)'
        : 'rgba(56, 189, 248, 0.09)';
      const ringStroke = isBlue
        ? 'rgba(0, 240, 255, 0.28)'
        : isPurple
        ? 'rgba(192, 132, 252, 0.28)'
        : 'rgba(148, 163, 184, 0.24)';

      const zGrad = ctx.createRadialGradient(
        zone.x,
        zone.y,
        zone.radius * 0.1,
        zone.x,
        zone.y,
        zone.radius
      );
      zGrad.addColorStop(0, primaryRgba);
      zGrad.addColorStop(1, 'rgba(4, 7, 17, 0)');
      ctx.fillStyle = zGrad;
      ctx.beginPath();
      ctx.arc(zone.x, zone.y, zone.radius, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = ringStroke;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([14, 10]);
      ctx.beginPath();
      ctx.arc(
        zone.x,
        zone.y,
        zone.radius * (0.94 + 0.03 * Math.sin(this.time * 1.8)),
        0,
        Math.PI * 2
      );
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // 6. Active Rift Singularity Vortices
    for (const v of vortices) {
      const pulse = 0.9 + 0.1 * Math.sin(this.time * 8);
      const grad = ctx.createRadialGradient(
        v.x,
        v.y,
        10,
        v.x,
        v.y,
        v.radius * pulse
      );
      grad.addColorStop(0, 'rgba(192, 38, 211, 0.42)');
      grad.addColorStop(0.6, 'rgba(126, 34, 206, 0.18)');
      grad.addColorStop(1, 'rgba(88, 28, 135, 0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(v.x, v.y, v.radius * pulse, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = 'rgba(232, 121, 249, 0.65)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(v.x, v.y, v.radius * 0.55, this.time * 3, this.time * 3 + Math.PI * 1.35);
      ctx.stroke();
    }

    // 7. Collectible Energy Particles
    this.renderEnergyParticles(ctx, particles, minX, maxX, minY, maxY, settings);

    // 8. Cosmic Energy Entities (Bodies & Cores first, local player last, then Name & Mass badges on top)
    for (const entity of entities) {
      if (entity.id === localPlayerId) continue;
      if (!entity.alive && entity.koTimer <= 0) continue;
      this.renderCosmicEntity(ctx, entity, false, settings);
    }
    for (const entity of entities) {
      if (entity.id !== localPlayerId) continue;
      if (!entity.alive && entity.koTimer <= 0) continue;
      this.renderCosmicEntity(ctx, entity, true, settings);
    }
    for (const entity of entities) {
      if (!entity.alive && entity.koTimer <= 0) continue;
      this.renderEntityNameplate(
        ctx,
        entity,
        entity.id === localPlayerId,
        settings
      );
    }

    // 9. Pooled FX Particles & Ability Shockwaves
    for (let i = 0; i < MAX_SHOCKWAVES; i++) {
      const r = this.shockwaves[i];
      if (!r.active) continue;
      const alpha = Math.max(0, r.life / r.maxLife);
      ctx.save();
      ctx.globalAlpha = alpha * 0.85;
      ctx.strokeStyle = r.color;
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      ctx.arc(r.x, r.y, r.radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    for (let i = 0; i < MAX_FX_PARTICLES; i++) {
      const p = this.fxPool[i];
      if (!p.active) continue;
      if (p.x < minX || p.x > maxX || p.y < minY || p.y > maxY) continue;
      ctx.globalAlpha = p.alpha;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // 10. Arena Containment Boundary Ring
    this.renderArenaBoundary(ctx, arenaRadius);

    ctx.restore();

    // 11. Screen-space Directional Indicators for Off-Screen Entities
    if (localPlayerId && entities.length > 1) {
      this.renderOffscreenIndicators(ctx, width, height, entities, localPlayerId);
    }
  }

  private renderOffscreenIndicators(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    entities: CosmicEntity[],
    localPlayerId: string
  ): void {
    const halfW = width * 0.5;
    const halfH = height * 0.5;
    const padX = Math.max(54, width * 0.06);
    const padY = Math.max(76, height * 0.11);
    const maxRx = Math.max(100, halfW - padX);
    const maxRy = Math.max(80, halfH - padY);

    ctx.save();
    for (const ent of entities) {
      if (!ent.alive || ent.id === localPlayerId) continue;

      const screenDx = (ent.x - this.cameraX) * this.cameraZoom;
      const screenDy = (ent.y - this.cameraY) * this.cameraZoom;

      // Skip if entity core is already comfortably visible inside viewport
      if (
        Math.abs(screenDx) < halfW - 36 &&
        Math.abs(screenDy) < halfH - 36
      ) {
        continue;
      }

      const angle = Math.atan2(screenDy, screenDx);
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);

      // Intersect ray with rounded viewport ellipse
      const scale = 1 / Math.hypot(cos / maxRx, sin / maxRy);
      const ix = halfW + cos * scale;
      const iy = halfH + sin * scale;

      const isBlue = ent.faction === 'blue';
      const markerColor = isBlue ? '#00F0FF' : '#C084FC';
      const bgColor = isBlue ? 'rgba(4, 24, 42, 0.88)' : 'rgba(28, 10, 46, 0.88)';

      // Draw directional chevron pointing to off-screen player
      ctx.save();
      ctx.translate(ix, iy);
      ctx.rotate(angle);

      const sizeScale = Math.min(1.45, Math.max(0.85, ent.radius / 26));
      ctx.fillStyle = markerColor;
      ctx.beginPath();
      ctx.moveTo(12 * sizeScale, 0);
      ctx.lineTo(-7 * sizeScale, -7 * sizeScale);
      ctx.lineTo(-3 * sizeScale, 0);
      ctx.lineTo(-7 * sizeScale, 7 * sizeScale);
      ctx.closePath();
      ctx.fill();
      ctx.restore();

      // Compact pill showing Name + Mass
      const label = `${ent.name} · ${Math.round(ent.mass)}`;
      ctx.font = '600 10px "Plus Jakarta Sans", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const textW = ctx.measureText(label).width;
      const pillX = ix - cos * 26;
      const pillY = iy - sin * 22;

      ctx.fillStyle = bgColor;
      ctx.strokeStyle = markerColor;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(pillX - textW * 0.5 - 6, pillY - 9, textW + 12, 18, 6);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = isBlue ? '#E0F2FE' : '#F3E8FF';
      ctx.fillText(label, pillX, pillY);
    }
    ctx.restore();
  }

  private renderCosmicGrid(
    ctx: CanvasRenderingContext2D,
    minX: number,
    maxX: number,
    minY: number,
    maxY: number,
    arenaRadius: number
  ): void {
    const step = 220;
    const startX = Math.floor(Math.max(-arenaRadius, minX) / step) * step;
    const endX = Math.ceil(Math.min(arenaRadius, maxX) / step) * step;
    const startY = Math.floor(Math.max(-arenaRadius, minY) / step) * step;
    const endY = Math.ceil(Math.min(arenaRadius, maxY) / step) * step;

    ctx.strokeStyle = 'rgba(56, 189, 248, 0.05)';
    ctx.lineWidth = 1;
    ctx.beginPath();

    for (let x = startX; x <= endX; x += step) {
      ctx.moveTo(x, startY);
      ctx.lineTo(x, endY);
    }
    for (let y = startY; y <= endY; y += step) {
      ctx.moveTo(startX, y);
      ctx.lineTo(endX, y);
    }
    ctx.stroke();
  }

  private renderEnergyParticles(
    ctx: CanvasRenderingContext2D,
    particles: EnergyParticle[],
    minX: number,
    maxX: number,
    minY: number,
    maxY: number,
    settings: GameSettings
  ): void {
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      if (p.x + 28 < minX || p.x - 28 > maxX || p.y + 28 < minY || p.y - 28 > maxY) {
        continue;
      }

      const pulse = 0.88 + 0.18 * Math.sin(this.time * 3.8 + p.pulsePhase);
      const r = p.radius * pulse;

      let coreColor = '#7DD3FC';
      let haloColor = 'rgba(56, 189, 248, 0.28)';

      if (p.factionTint === 'blue') {
        coreColor = '#00F0FF';
        haloColor = 'rgba(0, 240, 255, 0.40)';
      } else if (p.factionTint === 'purple') {
        coreColor = '#E879F9';
        haloColor = 'rgba(217, 70, 239, 0.40)';
      } else if (p.kind === 'rare') {
        coreColor = '#FDE047';
        haloColor = 'rgba(250, 204, 21, 0.44)';
      } else if (p.kind === 'large') {
        coreColor = '#38BDF8';
        haloColor = 'rgba(14, 165, 233, 0.36)';
      } else if (p.kind === 'medium') {
        coreColor = '#C084FC';
        haloColor = 'rgba(168, 85, 247, 0.32)';
      }

      // Outer energy halo
      if (settings.visualQuality === 'high' || p.kind === 'rare' || p.kind === 'dropped') {
        ctx.fillStyle = haloColor;
        ctx.beginPath();
        ctx.arc(p.x, p.y, r * 2.25, 0, Math.PI * 2);
        ctx.fill();
      }

      // Luminous core
      ctx.fillStyle = coreColor;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fill();

      // White-hot center spark for medium/large/rare orbs
      if (p.radius >= 6.0) {
        ctx.fillStyle = '#FFFFFF';
        ctx.beginPath();
        ctx.arc(p.x, p.y, r * 0.45, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  /**
   * Renders a cosmic energy organism with clear size and thickness differences:
   * - Smooth harmonic energy conduit connecting core to tail scaled by entity.radius
   * - Pulsing energy nodes along the trail with orbiting plasma sparks
   * - Multi-ring glowing energy core with directional corona & active ability visuals
   * - Crisp Name & Mass badge above the entity core
   */
  private renderCosmicEntity(
    ctx: CanvasRenderingContext2D,
    entity: CosmicEntity,
    isLocal: boolean,
    settings: GameSettings
  ): void {
    const isBlue: boolean = entity.faction === 'blue';
    // Permanent Team Identity: Cyan outer glow & outline for Positive Aura, Purple for Negative Aura
    const teamOutlineColor = isBlue ? '#00F0FF' : '#C084FC';
    const outerGlowRgba = isBlue
      ? 'rgba(0, 240, 255, 0.34)'
      : 'rgba(192, 132, 252, 0.34)';
    // Customizable inner body colour chosen by the player
    const innerBodyColor =
      entity.bodyColor || (isBlue ? '#38BDF8' : '#A78BFA');
    const highlightColor = '#FFFFFF';

    const skin =
      COSMIC_SKINS.find((s) => s.id === entity.skinId) || COSMIC_SKINS[0];
    const pulseRate = 5.5 * skin.pulseSpeed;

    ctx.save();
    if (!entity.alive && entity.koTimer > 0) {
      ctx.globalAlpha = Math.max(0, entity.koTimer / 0.45);
    } else if (entity.respawnEffectTimer > 0) {
      ctx.globalAlpha = 0.72 + 0.28 * Math.sin(this.time * 16);
    }

    const segs = entity.segments;
    const segCount = segs.length;

    // A. Outer Flowing Energy Ribbon (Only rendered once the entity grows past 1 segment)
    if (segCount > 1) {
      ctx.save();
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      // 1. Permanent Team Outer Glow Aura
      ctx.strokeStyle = outerGlowRgba;
      ctx.lineWidth = entity.radius * 2.35;
      ctx.beginPath();
      ctx.moveTo(entity.x, entity.y);
      for (let i = 0; i < segCount - 1; i++) {
        const xc = (segs[i].x + segs[i + 1].x) * 0.5;
        const yc = (segs[i].y + segs[i + 1].y) * 0.5;
        ctx.quadraticCurveTo(segs[i].x, segs[i].y, xc, yc);
      }
      const tailSeg = segs[segCount - 1];
      ctx.lineTo(tailSeg.x, tailSeg.y);
      ctx.stroke();

      // 2. Permanent Team Outer Outline
      ctx.strokeStyle = teamOutlineColor;
      ctx.lineWidth = entity.radius * 1.56;
      ctx.stroke();

      // 3. Player's Chosen Inner Body Colour Conduit
      ctx.strokeStyle = innerBodyColor;
      ctx.lineWidth = entity.radius * 1.18;
      ctx.stroke();

      // 4. Inner luminous core spine
      ctx.strokeStyle = highlightColor;
      ctx.lineWidth = Math.max(2.5, entity.radius * 0.36);
      ctx.stroke();
      ctx.restore();
    }

    // B. Segmented Harmonic Energy Nodes along the path (drawn from tail to head when segCount > 1)
    if (segCount > 1) {
      const nodeStep = settings.visualQuality === 'high' ? 1 : 2;
      for (let i = segCount - 1; i >= 1; i -= nodeStep) {
        const seg = segs[i];
        const t = i / Math.max(1, segCount); // 0 at head, 1 at tail
        const taper = Math.max(0.45, 1 - t * 0.52);
        const wavePulse =
          1 + 0.08 * Math.sin(this.time * pulseRate - i * 0.38);
        const nodeRadius = entity.radius * 0.78 * taper * wavePulse;

        ctx.fillStyle = innerBodyColor;
        ctx.strokeStyle = teamOutlineColor;
        ctx.lineWidth = Math.max(1.4, nodeRadius * 0.22);
        ctx.globalAlpha = (1 - t * 0.42) * 0.88;
        ctx.beginPath();
        ctx.arc(seg.x, seg.y, nodeRadius, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    // C. Glowing Dot / Head Core (Starts as ONE small glowing dot at mass 10, grows smoothly)
    const coreR = entity.radius;
    const coreGrad = ctx.createRadialGradient(
      entity.x,
      entity.y,
      coreR * 0.15,
      entity.x,
      entity.y,
      coreR * 2.25
    );
    coreGrad.addColorStop(0, '#FFFFFF');
    coreGrad.addColorStop(0.35, innerBodyColor);
    coreGrad.addColorStop(0.68, teamOutlineColor);
    coreGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');

    ctx.fillStyle = coreGrad;
    ctx.beginPath();
    ctx.arc(entity.x, entity.y, coreR * 2.25, 0, Math.PI * 2);
    ctx.fill();

    // Inner body core disc with permanent team outline
    ctx.fillStyle = entity.hitFlashTimer > 0 ? '#FFFFFF' : innerBodyColor;
    ctx.strokeStyle = teamOutlineColor;
    ctx.lineWidth = Math.max(2.0, coreR * 0.18);
    ctx.beginPath();
    ctx.arc(entity.x, entity.y, coreR * 0.88, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Bright center spark
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(entity.x, entity.y, coreR * 0.38, 0, Math.PI * 2);
    ctx.fill();

    // Rotating cosmic rings & steering guide around the core
    ctx.save();
    ctx.translate(entity.x, entity.y);

    // Real-time steering target guide for local player
    if (isLocal && entity.alive) {
      ctx.save();
      ctx.rotate(entity.targetAngle);
      ctx.strokeStyle = isBlue
        ? 'rgba(0, 240, 255, 0.58)'
        : 'rgba(232, 121, 249, 0.58)';
      ctx.lineWidth = 2.0;
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      ctx.moveTo(coreR * 1.35, 0);
      ctx.lineTo(coreR * 2.9, 0);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = teamOutlineColor;
      ctx.beginPath();
      ctx.arc(coreR * 3.05, 0, 3.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    ctx.rotate(entity.angle);

    // Forward directional team aura arc
    ctx.strokeStyle = teamOutlineColor;
    ctx.lineWidth = Math.max(2.2, coreR * 0.12);
    ctx.beginPath();
    ctx.arc(0, 0, coreR * 1.18, -0.75, 0.75);
    ctx.stroke();
    ctx.restore();

    // D. Active Ability Overlays on Entity
    if (entity.abilities.shield.activeRemaining > 0) {
      ctx.strokeStyle = '#00F0FF';
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      ctx.arc(
        entity.x,
        entity.y,
        coreR * (1.75 + 0.08 * Math.sin(this.time * 14)),
        0,
        Math.PI * 2
      );
      ctx.stroke();
    }

    if (entity.abilities.attract.activeRemaining > 0) {
      const magSpec = getMagnetUpgradeSpec(entity.magnetLevel || 1);
      const maxR = magSpec.pullRadius;
      ctx.save();
      ctx.strokeStyle = 'rgba(251, 191, 36, 0.42)';
      ctx.lineWidth = 2.0;
      ctx.setLineDash([12, 10]);
      ctx.beginPath();
      ctx.arc(entity.x, entity.y, maxR, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);

      // Animated inward-contracting magnetic wave rings
      for (let w = 0; w < 2; w++) {
        const phase = (1 - ((this.time * 1.6 + w * 0.5) % 1));
        const waveR = Math.max(coreR * 1.4, maxR * phase);
        ctx.strokeStyle = isBlue
          ? `rgba(0, 240, 255, ${(1 - phase) * 0.45})`
          : `rgba(232, 121, 249, ${(1 - phase) * 0.45})`;
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.arc(entity.x, entity.y, waveR, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
    }

    if (entity.disruptedTimer > 0) {
      ctx.strokeStyle = '#F43F5E';
      ctx.lineWidth = 2.2;
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      ctx.arc(entity.x, entity.y, coreR * 1.55, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    ctx.restore();
  }

  private renderEntityNameplate(
    ctx: CanvasRenderingContext2D,
    entity: CosmicEntity,
    isLocal: boolean,
    settings: GameSettings
  ): void {
    if (!settings.showPlayerNames && !settings.showMassInfo) {
      return;
    }

    ctx.save();
    if (!entity.alive && entity.koTimer > 0) {
      ctx.globalAlpha = Math.max(0, entity.koTimer / 0.45);
    }
    const isBlue = entity.faction === 'blue';
    const coreR = entity.radius;
    const fontSize = Math.round(Math.min(16, Math.max(11, 10 + coreR * 0.14)));
    ctx.font = `700 ${fontSize}px "Plus Jakarta Sans", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const labelY = entity.y - coreR * 1.65 - 14;

    let tagText = '';
    if (settings.showPlayerNames && settings.showMassInfo) {
      tagText = `${entity.name} · ${Math.round(entity.mass)}`;
    } else if (settings.showPlayerNames) {
      tagText = entity.name;
    } else {
      tagText = `${Math.round(entity.mass)} Mass`;
    }

    const textWidth = ctx.measureText(tagText).width;

    ctx.fillStyle = 'rgba(4, 7, 17, 0.86)';
    ctx.strokeStyle = isBlue
      ? 'rgba(0, 240, 255, 0.55)'
      : 'rgba(192, 132, 252, 0.55)';
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.roundRect(
      entity.x - textWidth * 0.5 - 8,
      labelY - fontSize * 0.72,
      textWidth + 16,
      fontSize * 1.44,
      6
    );
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = isLocal ? '#FFFFFF' : isBlue ? '#7DD3FC' : '#E9D5FF';
    ctx.fillText(tagText, entity.x, labelY);
    ctx.restore();
  }

  private renderArenaBoundary(
    ctx: CanvasRenderingContext2D,
    arenaRadius: number
  ): void {
    ctx.save();
    // Outer warning zone glow
    ctx.strokeStyle = 'rgba(244, 63, 94, 0.18)';
    ctx.lineWidth = 36;
    ctx.beginPath();
    ctx.arc(0, 0, arenaRadius + 18, 0, Math.PI * 2);
    ctx.stroke();

    // Primary containment plasma ring
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.72)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(0, 0, arenaRadius, 0, Math.PI * 2);
    ctx.stroke();

    // Inner dashed harmonic ring
    ctx.strokeStyle = 'rgba(192, 132, 252, 0.55)';
    ctx.lineWidth = 2;
    ctx.setLineDash([24, 16]);
    ctx.beginPath();
    ctx.arc(0, 0, arenaRadius - 14, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }
}
