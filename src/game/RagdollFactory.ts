import Phaser from 'phaser';
import { HEAD_RADIUS, TORSO_W, TORSO_H, LIMB_W, LIMB_H, BUSTER_DENSITY, LIMB_DENSITY, GROUND_Y } from '../types/GameState';

export interface RagdollBodies {
  buster: MatterJS.BodyType;
  limbs: MatterJS.BodyType[];
  constraints: MatterJS.ConstraintType[];
}

export function createRagdoll(x: number, matter: Phaser.Physics.Matter.MatterPhysics): RagdollBodies {
  const y = GROUND_Y - 60;

  const head  = matter.bodies.circle(x, y - 40, HEAD_RADIUS, { render: { visible: false } }) as MatterJS.BodyType;
  const torso = matter.bodies.rectangle(x, y, TORSO_W, TORSO_H, { render: { fillColor: 0xFF6347 } }) as MatterJS.BodyType;

  const buster = (matter.body as any).create({
    parts: [torso, head],
    friction: 0.5, restitution: 0.3, density: BUSTER_DENSITY, frictionAir: 0.001,
  }) as MatterJS.BodyType;

  const limbOpts = { friction: 0.5, restitution: 0.3, density: LIMB_DENSITY, frictionAir: 0.001 };
  const leftArm  = matter.bodies.rectangle(x - 20, y - 10, LIMB_W, LIMB_H, { ...limbOpts, render: { fillColor: 0xFF6347 } }) as MatterJS.BodyType;
  const rightArm = matter.bodies.rectangle(x + 20, y - 10, LIMB_W, LIMB_H, { ...limbOpts, render: { fillColor: 0xFF6347 } }) as MatterJS.BodyType;
  const leftLeg  = matter.bodies.rectangle(x - 10, y + 45, LIMB_W, LIMB_H, { ...limbOpts, render: { fillColor: 0x4169E1 } }) as MatterJS.BodyType;
  const rightLeg = matter.bodies.rectangle(x + 10, y + 45, LIMB_W, LIMB_H, { ...limbOpts, render: { fillColor: 0x4169E1 } }) as MatterJS.BodyType;

  const limbs = [leftArm, rightArm, leftLeg, rightLeg];
  const cOpts = { stiffness: 0.6, length: 5, render: { visible: false } };

  const constraints = [
    matter.constraint.create({ bodyA: buster, bodyB: leftArm,  pointA: { x: -15, y: -10 }, pointB: { x: 0, y: -LIMB_H / 2 }, ...cOpts }),
    matter.constraint.create({ bodyA: buster, bodyB: rightArm, pointA: { x:  15, y: -10 }, pointB: { x: 0, y: -LIMB_H / 2 }, ...cOpts }),
    matter.constraint.create({ bodyA: buster, bodyB: leftLeg,  pointA: { x: -10, y:  25 }, pointB: { x: 0, y: -LIMB_H / 2 }, ...cOpts }),
    matter.constraint.create({ bodyA: buster, bodyB: rightLeg, pointA: { x:  10, y:  25 }, pointB: { x: 0, y: -LIMB_H / 2 }, ...cOpts }),
  ] as MatterJS.ConstraintType[];

  return { buster, limbs, constraints };
}

export function addRagdollToWorld(matter: Phaser.Physics.Matter.MatterPhysics, rag: RagdollBodies, launchPos: { x: number; y: number }): void {
  matter.body.setPosition(rag.buster, launchPos);
  const offsets = [{ x: -20, y: -10 }, { x: 20, y: -10 }, { x: -10, y: 45 }, { x: 10, y: 45 }];
  rag.limbs.forEach((limb, i) => matter.body.setPosition(limb, { x: launchPos.x + offsets[i].x, y: launchPos.y + offsets[i].y }));
  matter.world.add([...rag.limbs, rag.buster]);
  matter.world.add(rag.constraints);
}

export function breakLimbs(matter: Phaser.Physics.Matter.MatterPhysics, rag: RagdollBodies): void {
  rag.constraints.forEach(c => matter.world.remove(c));
  rag.constraints.length = 0;
}
