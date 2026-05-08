import Phaser from 'phaser';
import {
  BUILDINGS_START_X, NUM_BUILDINGS, BUILDING_SPACING,
  WORLD_HEIGHT, BUSTER_START_X, GROUND_Y, TARGET_HEIGHT,
} from '../types/GameState';

function getFullField(camWidth: number) {
  const lastEnd = BUILDINGS_START_X + (NUM_BUILDINGS - 1) * BUILDING_SPACING + 800;
  const padding = 500;
  const minX    = BUSTER_START_X - padding;
  const maxX    = lastEnd + padding;
  return {
    centerX: (minX + maxX) / 2,
    centerY: WORLD_HEIGHT / 2,
    zoom:    camWidth / (maxX - minX),
  };
}

export function setFullWorldView(cam: Phaser.Cameras.Scene2D.Camera): void {
  const { centerX, centerY, zoom } = getFullField(cam.width);
  cam.setZoom(zoom);
  cam.centerOn(centerX, centerY);
}

export class CameraController {
  private cam:   Phaser.Cameras.Scene2D.Camera;
  private scene: Phaser.Scene;

  constructor(scene: Phaser.Scene) {
    this.cam   = scene.cameras.main;
    this.scene = scene;
  }

  playIntro(targetBuildingIndex: number, onComplete: () => void): void {
    const cam = this.cam;

    // Target building occupies GROUND_Y - TARGET_HEIGHT … GROUND_Y in world space
    const targetX      = BUILDINGS_START_X + targetBuildingIndex * BUILDING_SPACING + 400;
    const buildingTop  = GROUND_Y - TARGET_HEIGHT;   // -1100
    const buildingMidY = (buildingTop + GROUND_Y) / 2; // -100

    // Zoom so the building fills the viewport height with a little padding
    const paddingY  = 300;
    const tightZoom = cam.height / (TARGET_HEIGHT + paddingY * 2);

    // Start tight on the target building
    cam.setZoom(tightZoom);
    cam.centerOn(targetX, buildingMidY);

    const { centerX, centerY, zoom: fullZoom } = getFullField(cam.width);

    // Hold briefly, then zoom out to full world from the target building position
    this.scene.time.delayedCall(800, () => {
      this.scene.tweens.add({
        targets: { t: 0 }, t: 1, duration: 2500, ease: 'Sine.easeInOut',
        onUpdate: (tween) => {
          const t = tween.progress;
          cam.setZoom(Phaser.Math.Linear(tightZoom, fullZoom, t));
          cam.centerOn(
            Phaser.Math.Linear(targetX, centerX, t),
            Phaser.Math.Linear(buildingMidY, centerY, t),
          );
        },
        onComplete: () => onComplete(),
      });
    });
  }

  /** Zoom in on Buster then call onComplete so the run can start. */
  zoomToBuster(x: number, y: number, onComplete: () => void): void {
    const cam       = this.cam;
    const startZoom = cam.zoom;
    const startX    = cam.midPoint.x;
    const startY    = cam.midPoint.y;
    const followZoom = cam.width / 2000;

    this.scene.tweens.add({
      targets: { t: 0 }, t: 1, duration: 800, ease: 'Sine.easeInOut',
      onUpdate: (tween) => {
        const t = tween.progress;
        cam.setZoom(Phaser.Math.Linear(startZoom, followZoom, t));
        cam.centerOn(
          Phaser.Math.Linear(startX, x, t),
          Phaser.Math.Linear(startY, y, t),
        );
      },
      onComplete: () => onComplete(),
    });
  }

  followPosition(x: number, y: number): void {
    this.cam.centerOn(x, y);
  }

  /** Smoothly zoom out to full world, biased toward the target building but clamped to field bounds. */
  playOutro(targetX: number, targetY: number): void {
    const cam       = this.cam;
    const lastEnd   = BUILDINGS_START_X + (NUM_BUILDINGS - 1) * BUILDING_SPACING + 800;
    const padding   = 500;
    const minX      = BUSTER_START_X - padding;
    const maxX      = lastEnd + padding;
    const { centerX, centerY, zoom: fullZoom } = getFullField(cam.width);

    // At full zoom the half-width of the viewport equals half the total field width,
    // so the only center that keeps the view inside bounds is centerX.
    // We bias the tween destination toward targetX but clamp so we never exceed the edges.
    const halfW     = (maxX - minX) / 2;
    const halfH     = (cam.height / fullZoom) / 2;
    const destX     = Phaser.Math.Clamp(targetX, minX + halfW, maxX - halfW);
    const destY     = Phaser.Math.Clamp(targetY, -6000 + halfH, WORLD_HEIGHT + 6000 - halfH);

    const startZoom = cam.zoom;
    const startX    = cam.midPoint.x;
    const startY    = cam.midPoint.y;

    this.scene.tweens.add({
      targets: { t: 0 }, t: 1, duration: 2500, ease: 'Sine.easeInOut',
      onUpdate: (tween) => {
        const t = tween.progress;
        cam.setZoom(Phaser.Math.Linear(startZoom, fullZoom, t));
        cam.centerOn(
          Phaser.Math.Linear(startX, destX, t),
          Phaser.Math.Linear(startY, destY, t),
        );
      },
    });

    // Suppress unused-variable hint — centerX/centerY used as fallback reference
    void centerX; void centerY;
  }
}
