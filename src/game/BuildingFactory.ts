import Phaser from 'phaser';
import {
  BUILDINGS_START_X, BUILDING_SPACING, NUM_BUILDINGS,
  BUILDING_WIDTHS, BUILDING_HEIGHTS, TARGET_HEIGHT,
  BRICK_W, BRICK_H, BRICK_DENSITY, BRICK_FRICTION,
  BRICK_RESTITUTION, BRICK_AIR_FRICTION, GROUND_Y,
  CHAIN_VELOCITY_THRESHOLD,
} from '../types/GameState';

export interface BuildingData {
  solidBodies: MatterJS.BodyType[];   // all static buildings incl. target until hit
  targetBody: MatterJS.BodyType | null; // the single target building solid body
  targetBricks: MatterJS.BodyType[];  // dynamic bricks after target is hit
  secondaryBricks: MatterJS.BodyType[]; // bricks from chain-exploded buildings
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
  const solidBodies: MatterJS.BodyType[]     = [];
  const targetBricks: MatterJS.BodyType[]    = [];
  const secondaryBricks: MatterJS.BodyType[] = [];
  let   targetBody: MatterJS.BodyType | null = null;

  for (let i = 0; i < NUM_BUILDINGS; i++) {
    const x       = BUILDINGS_START_X + i * BUILDING_SPACING;
    const isTarget = i === targetIndex;
    const width    = randomFrom(BUILDING_WIDTHS);
    const height   = isTarget ? TARGET_HEIGHT : randomFrom(BUILDING_HEIGHTS);

    const body = matter.bodies.rectangle(x + width / 2, GROUND_Y - height / 2, width, height, {
      isStatic: true,
      friction: 0.8,
      restitution: 0.4,
      render: { fillColor: isTarget ? 0xFF0000 : 0xA0A0A0, lineColor: 0x000000, lineOpacity: 0.5 },
      label: isTarget ? 'targetBuilding' : `building_${i}`,
    }) as MatterJS.BodyType;
    matter.world.add(body);
    solidBodies.push(body);
    if (isTarget) targetBody = body;
  }

  return { solidBodies, targetBody, targetBricks, secondaryBricks, targetIndex };
}

/**
 * Replace a solid building with fresh dynamic bricks.
 */
export function explodeBuilding(
  matter: Phaser.Physics.Matter.MatterPhysics,
  building: MatterJS.BodyType,
  solidBodies: MatterJS.BodyType[],
  secondaryBricks: MatterJS.BodyType[],
): void {
  const { min, max } = building.bounds;
  const bw = max.x - min.x;
  const bh = max.y - min.y;
  const cx = (min.x + max.x) / 2;
  const cy = (min.y + max.y) / 2;

  matter.world.remove(building);
  const idx = solidBodies.indexOf(building);
  if (idx > -1) solidBodies.splice(idx, 1);

  const cols = Math.max(1, Math.round(bw / BRICK_W));
  const rows = Math.max(1, Math.round(bh / BRICK_H));
  const actualBW = bw / cols;
  const actualBH = bh / rows;

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const bx = min.x + col * actualBW + actualBW / 2;
      const by = min.y + row * actualBH + actualBH / 2;
      const brick = matter.bodies.rectangle(bx, by, actualBW - 2, actualBH - 2, {
        isStatic: false,
        friction: BRICK_FRICTION,
        restitution: BRICK_RESTITUTION,
        density: BRICK_DENSITY,
        frictionAir: BRICK_AIR_FRICTION,
        render: { fillColor: 0x8888AA, lineColor: 0x000000, lineOpacity: 0.3 },
        label: 'secondaryBrick',
      }) as MatterJS.BodyType;

      // Small outward nudge so bricks don't pile up and cause physics instability
      const dx = bx - cx;
      const dy = by - cy;
      const angle = Math.atan2(dy, dx);
      matter.body.setVelocity(brick, {
        x: Math.cos(angle) * 3,
        y: Math.sin(angle) * 3,
      });

      matter.world.add(brick);
      secondaryBricks.push(brick);
    }
  }
}

/**
 * Replace static target bricks with fresh dynamic bodies at the same positions.
 * Avoids Phaser 4's broken static→dynamic conversion.
 * Returns the new dynamic bodies (replaces targetBricks in place).
 */
/**
 * Replace the single solid target body with a grid of fresh dynamic bricks.
 */
export function activateTargetBuilding(
  matter: Phaser.Physics.Matter.MatterPhysics,
  data: BuildingData,
): void {
  if (!data.targetBody) return;

  const { min, max } = data.targetBody.bounds;
  const bw = max.x - min.x;
  const bh = max.y - min.y;

  // Remove solid body from world and tracking
  matter.world.remove(data.targetBody);
  const idx = data.solidBodies.indexOf(data.targetBody);
  if (idx > -1) data.solidBodies.splice(idx, 1);
  data.targetBody = null;

  // Spawn dynamic bricks filling the same footprint
  const cols = Math.max(1, Math.round(bw / BRICK_W));
  const rows = Math.max(1, Math.round(bh / BRICK_H));
  const actualBW = bw / cols;
  const actualBH = bh / rows;

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const cx = min.x + col * actualBW + actualBW / 2;
      const cy = min.y + row * actualBH + actualBH / 2;
      const brick = matter.bodies.rectangle(cx, cy, actualBW - 2, actualBH - 2, {
        isStatic: false,
        friction: BRICK_FRICTION,
        restitution: BRICK_RESTITUTION,
        density: BRICK_DENSITY,
        frictionAir: BRICK_AIR_FRICTION,
        render: { fillColor: 0xFF4444, lineColor: 0x000000, lineOpacity: 0.3 },
        label: 'targetBrick',
      }) as MatterJS.BodyType;
      matter.world.add(brick);
      data.targetBricks.push(brick);
    }
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
