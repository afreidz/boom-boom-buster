import Phaser from 'phaser';
import {
  BUSTER_START_X, RAMP_START_X, GROUND_Y, RUN_BODY_SIZE,
  RUN_BACKUP_DISTANCE, RUN_BACKUP_SPEED, RUN_FORWARD_ACCEL, RUN_FORWARD_MAX,
  LAUNCH_SPEED_MIN, LAUNCH_SPEED_RANGE,
} from '../types/GameState';
import { RagdollBodies, createRagdoll, addRagdollToWorld } from './RagdollFactory';
import { getRampGeometry } from './RampFactory';

export type RunPhase = 'backup' | 'forward' | 'ramp' | 'launched';

const RUN_SPRITE_FRAMES = 5;
const RUN_SPRITE_FPS    = 12;
const FRAME_W           = Math.floor(2048 / RUN_SPRITE_FRAMES);
const FRAME_H           = 1360;

export class BusterController {
  private matter: Phaser.Physics.Matter.MatterPhysics;

  runBody: MatterJS.BodyType | null = null;
  ragdoll: RagdollBodies | null = null;

  phase: RunPhase = 'backup';
  isRunning = false;
  isFlying  = false;
  flightAngle = 0;

  private runSpeed = 0;
  private lastPhase: RunPhase | null = null;
  private spriteFrame = 0;
  private spriteLastMs = 0;

  onPhaseChange?: (phase: RunPhase) => void;

  constructor(matter: Phaser.Physics.Matter.MatterPhysics) {
    this.matter = matter;
  }

  create(): void {
    const x = BUSTER_START_X;
    const y = GROUND_Y - 60;
    this.runBody = this.matter.bodies.rectangle(x, y, RUN_BODY_SIZE, RUN_BODY_SIZE, {
      isStatic: true,
      friction: 0.5,
      render: { visible: false },
      label: 'busterRunBody',
    }) as MatterJS.BodyType;
    this.matter.world.add(this.runBody);
    this.ragdoll = createRagdoll(x, this.matter);
  }

  startRun(): void {
    if (!this.runBody) return;
    // Keep the run body STATIC throughout — physics forces are irrelevant during the
    // scripted run-up. Setting it dynamic causes NaN after the first physics step
    // due to degenerate collision geometry (fromVertices ramp body).
    this.isRunning = true;
    this.phase = 'backup';
    this.runSpeed = 0;
    this.lastPhase = null;
  }

  update(speedPct: number, angleDeg: number): void {
    if (this.isFlying && this.ragdoll) {
      this.matter.body.setAngle(this.ragdoll.buster, this.flightAngle);
      this.matter.body.setAngularVelocity(this.ragdoll.buster, 0);
      return;
    }
    if (!this.isRunning || !this.runBody) return;

    if (this.phase !== this.lastPhase) {
      this.onPhaseChange?.(this.phase);
      this.lastPhase = this.phase;
    }

    const pos = this.runBody.position;
    const groundY = GROUND_Y - 60;
    const { rampLength, angleRad } = getRampGeometry(angleDeg);

    if (this.phase === 'backup') {
      const target = BUSTER_START_X - 300; // reduced for testing
      this.matter.body.setPosition(this.runBody, { x: pos.x - RUN_BACKUP_SPEED, y: groundY });
      if (pos.x <= target) { this.phase = 'forward'; this.runSpeed = 2; }

    } else if (this.phase === 'forward') {
      this.runSpeed = Math.min(this.runSpeed + RUN_FORWARD_ACCEL, RUN_FORWARD_MAX);
      this.matter.body.setPosition(this.runBody, { x: pos.x + this.runSpeed, y: groundY });
      if (pos.x >= RAMP_START_X) this.phase = 'ramp';

    } else if (this.phase === 'ramp') {
      const dx = Math.cos(angleRad) * this.runSpeed;
      const dy = Math.sin(angleRad) * this.runSpeed;
      this.matter.body.setPosition(this.runBody, { x: pos.x + dx, y: pos.y + dy });
      if (pos.x >= RAMP_START_X + rampLength) this.launch(speedPct, angleDeg);
    }
  }

  private launch(speedPct: number, angleDeg: number): void {
    if (!this.runBody || !this.ragdoll) return;
    const { angleRad } = getRampGeometry(angleDeg);
    const launchPos = { ...this.runBody.position };

    this.matter.world.remove(this.runBody);
    this.runBody = null;
    this.isRunning = false;

    addRagdollToWorld(this.matter, this.ragdoll, launchPos);

    const launchSpeed = (speedPct / 100) * LAUNCH_SPEED_RANGE + LAUNCH_SPEED_MIN;
    const vx = launchSpeed * Math.cos(angleRad);
    const vy = launchSpeed * Math.sin(angleRad);

    this.flightAngle = angleRad + Math.PI / 2;
    this.isFlying = true;
    this.phase = 'launched';
    this.lastPhase = 'launched';
    this.onPhaseChange?.('launched');

    this.matter.body.setAngle(this.ragdoll.buster, this.flightAngle);
    this.matter.body.setVelocity(this.ragdoll.buster, { x: vx, y: vy });
    this.matter.body.setAngularVelocity(this.ragdoll.buster, 0);
    this.ragdoll.limbs.forEach(limb => this.matter.body.setVelocity(limb, { x: vx, y: vy }));
  }

  drawSprite(
    ctx: CanvasRenderingContext2D,
    bounds: { min: { x: number; y: number }; max: { x: number; y: number } },
    canvasW: number, canvasH: number,
    icon: HTMLImageElement | null,
    runSheet: HTMLImageElement | null,
  ): void {
    const scaleX = canvasW / (bounds.max.x - bounds.min.x);
    const scaleY = canvasH / (bounds.max.y - bounds.min.y);
    const toScreen = (wx: number, wy: number) => ({
      x: (wx - bounds.min.x) * scaleX,
      y: (wy - bounds.min.y) * scaleY,
    });

    const destSize  = RUN_BODY_SIZE * scaleX;
    const srcCropH  = FRAME_W;
    const srcCropY  = (FRAME_H - srcCropH) / 2;

    if (this.runBody && runSheet) {
      const frame = (this.phase === 'forward') ? this.spriteFrame : 0;
      if (this.phase === 'forward') {
        const now = Date.now();
        if (now - this.spriteLastMs > 1000 / RUN_SPRITE_FPS) {
          this.spriteFrame = (this.spriteFrame + 1) % RUN_SPRITE_FRAMES;
          this.spriteLastMs = now;
        }
      }
      const { x, y } = toScreen(this.runBody.position.x, this.runBody.position.y);
      ctx.save();
      ctx.drawImage(runSheet, frame * FRAME_W, srcCropY, FRAME_W, srcCropH, x - destSize / 2, y - destSize / 2, destSize, destSize);
      ctx.restore();
      return;
    }

    if (!icon || !this.ragdoll || this.ragdoll.buster.parts.length < 3) return;
    const head = this.ragdoll.buster.parts[2] as MatterJS.BodyType;
    const headSize = 40 * scaleX;
    const { x, y } = toScreen(head.position.x, head.position.y);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(head.angle);
    ctx.drawImage(icon, -headSize / 2, -headSize / 2, headSize, headSize);
    ctx.restore();
  }

  isBusterPart(body: MatterJS.BodyType): boolean {
    if (!this.ragdoll) return false;
    return (body as any).parent === this.ragdoll.buster || body === this.ragdoll.buster;
  }

  stopFlight(): void { this.isFlying = false; }

  get position(): { x: number; y: number } {
    if (this.runBody) return this.runBody.position;
    if (this.ragdoll) return this.ragdoll.buster.position;
    return { x: BUSTER_START_X, y: GROUND_Y - 60 };
  }

  destroy(): void {
    if (this.runBody) this.matter.world.remove(this.runBody);
    this.runBody = null;
    this.ragdoll = null;
  }
}
