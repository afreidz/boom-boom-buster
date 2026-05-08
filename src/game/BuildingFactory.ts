import Phaser from 'phaser';
import {
  BUILDINGS_START_X, BUILDING_SPACING, NUM_BUILDINGS,
  BUILDING_WIDTHS, BUILDING_HEIGHTS, TARGET_HEIGHT,
  BRICK_W, BRICK_H, BRICK_DENSITY, BRICK_FRICTION,
  BRICK_RESTITUTION, BRICK_AIR_FRICTION, GROUND_Y,
  CHAIN_VELOCITY_THRESHOLD,
} from '../types/GameState';

export interface BuildingData {
  solidBodies: MatterJS.BodyType[];
  targetBricks: MatterJS.BodyType[];
  secondaryBricks: MatterJS.BodyType[];
  targetIndex: number;
}

function randomFrom<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function createBrickBuilding(
  matter: Phaser.Physics.Matter.MatterPhysics,
  x: number, width: number, height: number,
  isTarget: boolean,
  targetBricks: MatterJS.BodyType[],
  secondaryBricks: MatterJS.BodyType[],
): void {
  const cols = Math.floor(width / BRICK_W);
  const rows = Math.floor(height / BRICK_H);

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const bx = x + col * BRICK_W + BRICK_W / 2;
      const by = GROUND_Y - row * BRICK_H - BRICK_H / 2;

      const brick = matter.bodies.rectangle(bx, by, BRICK_W, BRICK_H, {
        isStatic: true,
        friction: BRICK_FRICTION,
        restitution: BRICK_RESTITUTION,
        density: BRICK_DENSITY,
        frictionAir: BRICK_AIR_FRICTION,
        render: { fillColor: isTarget ? 0xFF0000 : 0xA0A0A0, lineColor: 0x000000, lineOpacity: 0.5 },
        label: isTarget ? 'targetBrick' : 'brick',
      }) as MatterJS.BodyType;

      matter.world.add(brick);
      if (isTarget) targetBricks.push(brick);
      else secondaryBricks.push(brick);
    }
  }
}

export function createBuildings(matter: Phaser.Physics.Matter.MatterPhysics, targetIndex: number): BuildingData {
  const solidBodies: MatterJS.BodyType[]    = [];
  const targetBricks: MatterJS.BodyType[]   = [];
  const secondaryBricks: MatterJS.BodyType[] = [];

  for (let i = 0; i < NUM_BUILDINGS; i++) {
    const x       = BUILDINGS_START_X + i * BUILDING_SPACING;
    const isTarget = i === targetIndex;
    const width    = randomFrom(BUILDING_WIDTHS);
    const height   = isTarget ? TARGET_HEIGHT : randomFrom(BUILDING_HEIGHTS);

    if (isTarget) {
      createBrickBuilding(matter, x, width, height, true, targetBricks, secondaryBricks);
    } else {
      const body = matter.bodies.rectangle(x + width / 2, GROUND_Y - height / 2, width, height, {
        isStatic: true,
        friction: 0.8,
        restitution: 0.4,
        render: { fillColor: 0xA0A0A0, lineColor: 0x000000, lineOpacity: 0.5 },
        label: `building_${i}`,
      }) as MatterJS.BodyType;
      matter.world.add(body);
      solidBodies.push(body);
    }
  }

  return { solidBodies, targetBricks, secondaryBricks, targetIndex };
}

export function explodeBuilding(
  matter: Phaser.Physics.Matter.MatterPhysics,
  building: MatterJS.BodyType,
  solidBodies: MatterJS.BodyType[],
  secondaryBricks: MatterJS.BodyType[],
): void {
  const b  = building.bounds;
  const bw = b.max.x - b.min.x;
  const bh = b.max.y - b.min.y;
  const cx = (b.min.x + b.max.x) / 2;
  const cy = (b.min.y + b.max.y) / 2;

  matter.world.remove(building);
  const idx = solidBodies.indexOf(building);
  if (idx > -1) solidBodies.splice(idx, 1);

  const startLen = secondaryBricks.length;
  createBrickBuilding(matter, b.min.x, bw, bh, false, [], secondaryBricks);

  for (let i = startLen; i < secondaryBricks.length; i++) {
    const brick = secondaryBricks[i];
    matter.body.setStatic(brick, false);
    const dx = brick.position.x - cx;
    const dy = brick.position.y - cy;
    const angle = Math.atan2(dy, dx);
    const force = 25 * (0.6 + Math.random() * 0.4);
    matter.body.setVelocity(brick, { x: Math.cos(angle) * force, y: Math.sin(angle) * force });
    matter.body.setAngularVelocity(brick, (Math.random() - 0.5) * 0.4);
  }
}

export function shouldChainExplode(brick: MatterJS.BodyType): boolean {
  const v = brick.velocity;
  return Math.sqrt(v.x * v.x + v.y * v.y) > CHAIN_VELOCITY_THRESHOLD;
}

export function settleBricks(matter: Phaser.Physics.Matter.MatterPhysics, bricks: MatterJS.BodyType[]): void {
  bricks.forEach(brick => {
    if (!brick.isStatic) {
      matter.body.setVelocity(brick, { x: 0, y: 0 });
      matter.body.setAngularVelocity(brick, 0);
      matter.body.setStatic(brick, true);
    }
  });
}
