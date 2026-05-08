import Phaser from 'phaser';
import {
  BUSTER_START_X, RAMP_START_X, GROUND_Y,
  RUN_BACKUP_DISTANCE, RUN_BACKUP_SPEED, RUN_FORWARD_ACCEL, RUN_FORWARD_MAX,
  LAUNCH_SPEED_MIN, LAUNCH_SPEED_RANGE,
} from '../types/GameState';
import { RagdollBodies, createRagdoll,
         T_W, T_H, H_R, AL_W, AL_H, AR_W, AR_H, LL_W, LL_H, LR_W, LR_H } from './RagdollFactory';
import { getRampGeometry } from './RampFactory';

export type RunPhase = 'backup' | 'forward' | 'ramp' | 'launched';

// Torso ground clearance: leg bottom = torsoY + T_H/2 + LL_H; keep ~5 above ground
const TORSO_RUN_Y = GROUND_Y - T_H / 2 - LL_H - 5;

// Body-part offsets relative to torso centre (run pose)
const POSE = {
  head: { x: 0,                        y: -(T_H / 2 + H_R + 2)   },
  armL: { x: -(T_W / 2 + AL_W / 2 + 2), y: -T_H / 4               },
  armR: { x:  (T_W / 2 + AR_W / 2 + 2), y: -T_H / 4               },
  legL: { x: -T_W / 4,                 y:  T_H / 2 + LL_H / 2 + 2 },
  legR: { x:  T_W / 4,                 y:  T_H / 2 + LR_H / 2 + 2 },
};

export class BusterController {
  private matter: Phaser.Physics.Matter.MatterPhysics;

  ragdoll: RagdollBodies | null = null;

  phase: RunPhase = 'backup';
  isRunning = false;
  isFlying  = false;

  // Run-phase position tracked independently (bodies not in world during run)
  private torsoX = BUSTER_START_X;
  private torsoY = TORSO_RUN_Y;
  private runAngle = 0;

  private runSpeed  = 0;
  private lastPhase: RunPhase | null = null;

  onPhaseChange?: (phase: RunPhase) => void;

  constructor(matter: Phaser.Physics.Matter.MatterPhysics) {
    this.matter = matter;
  }

  create(): void {
    this.ragdoll = createRagdoll(BUSTER_START_X, this.matter);
    // Bodies are NOT added to the world yet — they live outside the simulation
    // during the run phase so gravity/collisions can't interfere.
    // Constraints are added at launch alongside the bodies.
    this.applyRunPoseToSprites(BUSTER_START_X, TORSO_RUN_Y, 0);
  }

  startRun(): void {
    if (!this.ragdoll) return;
    this.isRunning  = true;
    this.phase      = 'backup';
    this.runSpeed   = 0;
    this.lastPhase  = null;
    this.torsoX     = BUSTER_START_X;
    this.torsoY     = TORSO_RUN_Y;
    this.runAngle   = 0;
  }

  /** Called every beforeupdate tick. */
  update(speedPct: number, angleDeg: number): void {
    if (!this.isRunning || !this.ragdoll) return;

    if (this.phase !== this.lastPhase) {
      this.onPhaseChange?.(this.phase);
      this.lastPhase = this.phase;
    }

    const { rampLength, angleRad } = getRampGeometry(angleDeg);

    if (this.phase === 'backup') {
      this.torsoX -= RUN_BACKUP_SPEED;
      this.applyRunPoseToSprites(this.torsoX, this.torsoY, 0);
      if (this.torsoX <= BUSTER_START_X - RUN_BACKUP_DISTANCE) {
        this.phase = 'forward'; this.runSpeed = 2;
      }

    } else if (this.phase === 'forward') {
      this.runSpeed = Math.min(this.runSpeed + RUN_FORWARD_ACCEL, RUN_FORWARD_MAX);
      this.torsoX += this.runSpeed;
      this.applyRunPoseToSprites(this.torsoX, this.torsoY, 0);
      if (this.torsoX >= RAMP_START_X) this.phase = 'ramp';

    } else if (this.phase === 'ramp') {
      const dx = Math.cos(angleRad) * this.runSpeed;
      const dy = Math.sin(angleRad) * this.runSpeed;
      this.torsoX += dx;
      this.torsoY += dy;
      this.runAngle = angleRad;
      this.applyRunPoseToSprites(this.torsoX, this.torsoY, angleRad);
      if (this.torsoX >= RAMP_START_X + rampLength) this.launch(speedPct, angleDeg);
    }
  }

  /** Write body positions directly so updateBusterSprite() can read them. */
  private applyRunPoseToSprites(tx: number, ty: number, angle: number): void {
    if (!this.ragdoll) return;
    const set = (b: MatterJS.BodyType, ox: number, oy: number) => {
      const cosA = Math.cos(angle), sinA = Math.sin(angle);
      this.matter.body.setPosition(b, {
        x: tx + ox * cosA - oy * sinA,
        y: ty + ox * sinA + oy * cosA,
      });
      this.matter.body.setAngle(b, angle);
    };
    set(this.ragdoll.torso, 0,            0           );
    set(this.ragdoll.head,  POSE.head.x,  POSE.head.y );
    set(this.ragdoll.armL,  POSE.armL.x,  POSE.armL.y );
    set(this.ragdoll.armR,  POSE.armR.x,  POSE.armR.y );
    set(this.ragdoll.legL,  POSE.legL.x,  POSE.legL.y );
    set(this.ragdoll.legR,  POSE.legR.x,  POSE.legR.y );
  }

  private launch(speedPct: number, angleDeg: number): void {
    if (!this.ragdoll) return;
    const { angleRad } = getRampGeometry(angleDeg);
    const launchSpeed  = (speedPct / 100) * LAUNCH_SPEED_RANGE + LAUNCH_SPEED_MIN;
    const vx = launchSpeed * Math.cos(angleRad);
    const vy = launchSpeed * Math.sin(angleRad);

    this.isFlying  = true;
    this.isRunning = false;
    this.phase     = 'launched';
    this.lastPhase = 'launched';
    this.onPhaseChange?.('launched');

    // Bodies enter the physics world for the first time here.
    // setPosition was called on each body by applyRunPoseToSprites, so they
    // start at exactly the right positions. Apply launch velocity then add.
    this.ragdoll.all.forEach(b => {
      this.matter.body.setVelocity(b, { x: vx, y: vy });
    });
    this.matter.world.add(this.ragdoll.all);
    this.matter.world.add(this.ragdoll.constraints);
  }

  isBusterPart(body: MatterJS.BodyType): boolean {
    return !!this.ragdoll?.all.includes(body);
  }

  stopFlight(): void { this.isFlying = false; }

  get position(): { x: number; y: number } {
    // During run, return tracked position; during flight, read from physics body.
    if (this.isRunning) return { x: this.torsoX, y: this.torsoY };
    if (this.ragdoll)   return this.ragdoll.torso.position;
    return { x: BUSTER_START_X, y: GROUND_Y - 60 };
  }

  destroy(): void { this.ragdoll = null; }
}
