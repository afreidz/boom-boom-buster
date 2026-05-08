import Phaser from 'phaser';
import { BUSTER_DENSITY, GROUND_Y } from '../types/GameState';

// ─── Body dimensions (world units, proportional to sprite pixel sizes) ───────
// Torso (249×222) is the reference at 46×41
export const T_W = 46, T_H = 41;                        // torso
export const H_R = 25;                                   // head radius (270×287 ≈ circle r25)
export const AL_W = 24, AL_H = 44;                       // arm-left  142×259 → 24×44
export const AR_W = 24, AR_H = 53;                       // arm-right 140×312 → 24×53
export const LL_W = 33, LL_H = 51;                       // leg-left  200×311 → 33×51
export const LR_W = 30, LR_H = 49;                       // leg-right 177×296 → 30×49

// Limb density is lighter than torso so they react more to impulses
const LIMB_DENSITY = BUSTER_DENSITY * 0.6;

export interface RagdollBodies {
  torso:    MatterJS.BodyType;
  head:     MatterJS.BodyType;
  armL:     MatterJS.BodyType;
  armR:     MatterJS.BodyType;
  legL:     MatterJS.BodyType;
  legR:     MatterJS.BodyType;
  constraints: MatterJS.ConstraintType[];
  /** All six bodies as an array for convenience */
  all: MatterJS.BodyType[];
}

export function createRagdoll(x: number, matter: Phaser.Physics.Matter.MatterPhysics): RagdollBodies {
  const y = GROUND_Y - 60;

  // Negative group: parts in the same negative group never collide with each other
  const group = (matter.body as any).nextGroup(true) as number;
  const noSelfCollide = { group, category: 0x0001, mask: 0xFFFFFFFF } as MatterJS.ICollisionFilter;

  const opts = (density: number) => ({
    friction: 0.5, restitution: 0.3, frictionAir: 0.001, density,
    collisionFilter: noSelfCollide,
  });

  const torso = matter.bodies.rectangle(x,      y,          T_W, T_H, { ...opts(BUSTER_DENSITY), render: { visible: false }, label: 'busterTorso' }) as MatterJS.BodyType;
  const head  = matter.bodies.circle   (x,      y - T_H/2 - H_R - 2, H_R, { ...opts(BUSTER_DENSITY), render: { visible: false }, label: 'busterHead'  }) as MatterJS.BodyType;
  const armL  = matter.bodies.rectangle(x - T_W/2 - AL_W/2 - 2, y - T_H/4, AL_W, AL_H, { ...opts(LIMB_DENSITY), render: { visible: false }, label: 'busterArmL'  }) as MatterJS.BodyType;
  const armR  = matter.bodies.rectangle(x + T_W/2 + AR_W/2 + 2, y - T_H/4, AR_W, AR_H, { ...opts(LIMB_DENSITY), render: { visible: false }, label: 'busterArmR'  }) as MatterJS.BodyType;
  const legL  = matter.bodies.rectangle(x - T_W/4,               y + T_H/2 + LL_H/2 + 2, LL_W, LL_H, { ...opts(LIMB_DENSITY), render: { visible: false }, label: 'busterLegL'  }) as MatterJS.BodyType;
  const legR  = matter.bodies.rectangle(x + T_W/4,               y + T_H/2 + LR_H/2 + 2, LR_W, LR_H, { ...opts(LIMB_DENSITY), render: { visible: false }, label: 'busterLegR'  }) as MatterJS.BodyType;

  const c = (bA: MatterJS.BodyType, pA: MatterJS.Vector, bB: MatterJS.BodyType, pB: MatterJS.Vector, stiffness: number, length = 2) =>
    matter.constraint.create({ bodyA: bA, pointA: pA, bodyB: bB, pointB: pB, stiffness, length, render: { visible: false } }) as MatterJS.ConstraintType;

  const constraints: MatterJS.ConstraintType[] = [
    // Head sits on top of torso
    c(torso, { x: 0, y: -T_H/2 }, head,  { x: 0, y: H_R  }, 0.9),
    // Arms attach at shoulders
    c(torso, { x: -T_W/2, y: -T_H/4 }, armL, { x: 0, y: -AL_H/2 }, 0.6),
    c(torso, { x:  T_W/2, y: -T_H/4 }, armR, { x: 0, y: -AR_H/2 }, 0.6),
    // Legs attach at hips
    c(torso, { x: -T_W/4, y: T_H/2 }, legL, { x: 0, y: -LL_H/2 }, 0.7),
    c(torso, { x:  T_W/4, y: T_H/2 }, legR, { x: 0, y: -LR_H/2 }, 0.7),
  ];

  const all = [torso, head, armL, armR, legL, legR];
  return { torso, head, armL, armR, legL, legR, constraints, all };
}

export function addRagdollToWorld(matter: Phaser.Physics.Matter.MatterPhysics, rag: RagdollBodies, launchPos: { x: number; y: number }): void {
  const dx = launchPos.x - rag.torso.position.x;
  const dy = launchPos.y - rag.torso.position.y;
  rag.all.forEach(b => matter.body.setPosition(b, { x: b.position.x + dx, y: b.position.y + dy }));
  matter.world.add(rag.all);
  matter.world.add(rag.constraints);
}

export function breakLimbs(matter: Phaser.Physics.Matter.MatterPhysics, rag: RagdollBodies): void {
  rag.constraints.forEach(c => matter.world.remove(c));
  rag.constraints.length = 0;
}
