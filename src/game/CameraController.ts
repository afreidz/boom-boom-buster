import Phaser from 'phaser';
import {
  BUSTER_START_X, BUILDINGS_START_X, NUM_BUILDINGS,
  BUILDING_SPACING, WORLD_HEIGHT,
} from '../types/GameState';

const MAX_BUILDING_WIDTH = 800;

function getFullFieldBounds() {
  const lastEnd = BUILDINGS_START_X + (NUM_BUILDINGS - 1) * BUILDING_SPACING + MAX_BUILDING_WIDTH;
  const padding = 500;
  const minX    = BUSTER_START_X - padding;
  const maxX    = lastEnd + padding;
  return { minX, maxX, centerX: (minX + maxX) / 2, width: maxX - minX };
}

export class CameraController {
  private cam: Phaser.Cameras.Scene2D.Camera;

  constructor(cam: Phaser.Cameras.Scene2D.Camera) {
    this.cam = cam;
  }

  /** Phase 0: hold tight on target building, then Phase 1: zoom out */
  playIntro(targetBuildingIndex: number, onComplete: () => void): void {
    const cam = this.cam;
    const targetX = BUILDINGS_START_X + targetBuildingIndex * BUILDING_SPACING + 400;
    const targetY = WORLD_HEIGHT - 100 - 400;
    const tightZoom = 4;

    // Instantly position camera tight on target building
    cam.stopFollow();
    cam.setZoom(tightZoom);
    cam.centerOn(targetX, targetY);

    // After 800ms, zoom out to full field
    const { centerX, width } = getFullFieldBounds();
    const fullZoom = cam.width / width;
    const centerY = WORLD_HEIGHT / 2;

    cam.pan(centerX, centerY, 2500, 'Sine.easeInOut', false, (cam: Phaser.Cameras.Scene2D.Camera, progress: number) => {
      if (progress === 1) {
        cam.zoomTo(fullZoom, 2500, 'Sine.easeInOut', false, (_c: Phaser.Cameras.Scene2D.Camera, p: number) => {
          if (p === 1) onComplete();
        });
      }
    });

    // Delay the zoom-out start by 800ms
    setTimeout(() => {
      cam.pan(centerX, centerY, 2500, 'Sine.easeInOut');
      cam.zoomTo(fullZoom, 2500, 'Sine.easeInOut');
    }, 800);
  }

  /** Zoom in tight on Buster before the run starts */
  zoomToBuster(busterX: number, busterY: number, onComplete: () => void): void {
    const cam = this.cam;
    cam.pan(busterX, busterY, 800, 'Sine.easeInOut');
    cam.zoomTo(4, 800, 'Sine.easeInOut', false, (_c: Phaser.Cameras.Scene2D.Camera, progress: number) => {
      if (progress === 1) onComplete();
    });
  }

  /** Follow Buster during run and flight */
  follow(body: Phaser.Physics.Matter.MatterPhysics | MatterJS.BodyType): void {
    // In Phaser we'll handle follow in GameScene.update() directly
  }

  /** Zoom back out to full field after run completes */
  playOutro(): void {
    const cam = this.cam;
    const { centerX, width } = getFullFieldBounds();
    const fullZoom = cam.width / width;
    const centerY = WORLD_HEIGHT / 2;

    cam.pan(centerX, centerY, 2000, 'Sine.easeInOut');
    cam.zoomTo(fullZoom, 2000, 'Sine.easeInOut');
  }

  /** Manually center camera on a world position with given world-unit width visible */
  lookAt(worldX: number, worldY: number, worldWidth: number): void {
    const zoom = this.cam.width / worldWidth;
    this.cam.setZoom(zoom);
    this.cam.centerOn(worldX, worldY);
  }

  get fullFieldZoom(): number {
    const { width } = getFullFieldBounds();
    return this.cam.width / width;
  }

  get fullFieldCenter(): { x: number; y: number } {
    const { centerX } = getFullFieldBounds();
    return { x: centerX, y: WORLD_HEIGHT / 2 };
  }
}
