import Phaser from 'phaser';
import { GROUND_Y, RAMP_START_X, RAMP_SLANT_LENGTH } from '../types/GameState';

export interface RampBodies {
  wedge: MatterJS.BodyType;
  plank: MatterJS.BodyType;
}

export function createRamp(matter: Phaser.Physics.Matter.MatterPhysics, angleDeg: number): RampBodies {
  const angleRad   = -(angleDeg * Math.PI) / 180;
  const rampLength = Math.abs(Math.cos(angleRad) * RAMP_SLANT_LENGTH);
  const wedgeH     = Math.abs(Math.sin(angleRad) * RAMP_SLANT_LENGTH);

  const vertices = [
    { x: 0, y: 0 },
    { x: rampLength, y: 0 },
    { x: rampLength, y: -wedgeH },
  ];

  const centerX = RAMP_START_X + (2 * rampLength) / 3;
  const centerY = GROUND_Y - wedgeH / 3;

  const wedge = (matter.bodies as any).fromVertices(centerX, centerY, [vertices], {
    isStatic: true,
    render: { fillColor: 0x654321 },
    label: 'ramp',
  }) as unknown as MatterJS.BodyType;

  const plankMidX = RAMP_START_X + rampLength / 2;
  const plankMidY = GROUND_Y - wedgeH / 2;

  const plank = matter.bodies.rectangle(plankMidX, plankMidY, RAMP_SLANT_LENGTH, 12, {
    isStatic: true,
    angle: angleRad,
    render: { fillColor: 0x8B5E3C },
    label: 'rampPlank',
  }) as MatterJS.BodyType;

  matter.world.add([wedge, plank]);
  return { wedge, plank };
}

export function removeRamp(matter: Phaser.Physics.Matter.MatterPhysics, bodies: RampBodies): void {
  matter.world.remove(bodies.wedge);
  matter.world.remove(bodies.plank);
}

export function getRampGeometry(angleDeg: number): { rampLength: number; wedgeH: number; angleRad: number } {
  const angleRad   = -(angleDeg * Math.PI) / 180;
  const rampLength = Math.abs(Math.cos(angleRad) * RAMP_SLANT_LENGTH);
  const wedgeH     = Math.abs(Math.sin(angleRad) * RAMP_SLANT_LENGTH);
  return { rampLength, wedgeH, angleRad };
}
