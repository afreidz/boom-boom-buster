import Phaser from 'phaser';
import { GROUND_Y } from '../types/GameState';

// World Y extents for the gradient
const DARK_Y  = -8000;
const LIGHT_Y = GROUND_Y;

function worldYToSkyColor(worldY: number): number {
  const t = Math.max(0, Math.min(1, (LIGHT_Y - worldY) / (LIGHT_Y - DARK_Y)));
  const r = Math.round(135 - t * (135 - 30));
  const g = Math.round(206 - t * (206 - 50));
  const b = Math.round(235 - t * (235 - 90));
  return Phaser.Display.Color.GetColor(r, g, b);
}

export function createBackground(
  scene: Phaser.Scene,
  clouds: Array<{ x: number; y: number; r: number }>,
  trees:  Array<{ x: number; trunkH: number; canopyR: number; color: number }>,
  fieldEnd = 35100
): void {
  // --- Sky gradient ---
  // Draw gradient from DARK_Y to LIGHT_Y in world space as a tall rectangle.
  // We use multiple horizontal bands to approximate a smooth vertical gradient.
  const BANDS = 40;
  const bandH = (LIGHT_Y - DARK_Y) / BANDS;
  const skyGfx = scene.add.graphics();
  skyGfx.setDepth(-200);

  // Solid dark cap extending far above the gradient so the sky never runs out
  const darkestColor = worldYToSkyColor(DARK_Y);
  skyGfx.fillStyle(darkestColor);
  skyGfx.fillRect(-2000, -200000, fieldEnd + 6000, 200000 + DARK_Y);

  // Tiling star field in the dark zone above the gradient
  const STAR_TOP      = -50000; // cover well above realistic max flight
  const TILE_SIZE     = 3000;   // world units per tile
  const STARS_PER_TILE = 60;
  const xFrom = -2000;
  const xTo   = fieldEnd + 6000;

  // Generate a repeating star pattern (same positions each tile)
  const rng = { v: 42 }; // deterministic seed
  const rand = () => { rng.v = (rng.v * 16807 + 0) % 2147483647; return (rng.v - 1) / 2147483646; };
  const starPattern = Array.from({ length: STARS_PER_TILE }, () => ({
    dx:    rand() * TILE_SIZE,
    dy:    rand() * TILE_SIZE,
    size:  rand() < 0.8 ? 2 : 4,
    alpha: 0.35 + rand() * 0.65,
  }));

  const starGfx = scene.add.graphics();
  starGfx.setDepth(-199);

  for (let tx = xFrom; tx < xTo; tx += TILE_SIZE) {
    for (let ty = STAR_TOP; ty < DARK_Y; ty += TILE_SIZE) {
      for (const s of starPattern) {
        starGfx.fillStyle(0xffffff, s.alpha);
        starGfx.fillRect(tx + s.dx, ty + s.dy, s.size, s.size);
      }
    }
  }

  for (let i = 0; i < BANDS; i++) {
    const topY   = DARK_Y + i * bandH;
    const botY   = topY + bandH;
    const cTop   = worldYToSkyColor(topY);
    const cBot   = worldYToSkyColor(botY);
    skyGfx.fillGradientStyle(cTop, cTop, cBot, cBot, 1);
    skyGfx.fillRect(-2000, topY, fieldEnd + 6000, bandH + 1);
  }

  // --- Clouds ---
  const cloudGfx = scene.add.graphics();
  cloudGfx.setDepth(-100);
  cloudGfx.setAlpha(0.8);
  cloudGfx.fillStyle(0xffffff);

  for (const cloud of clouds) {
    cloudGfx.fillCircle(cloud.x,                cloud.y,              cloud.r);
    cloudGfx.fillCircle(cloud.x + cloud.r * 1.2, cloud.y - cloud.r * 0.4, cloud.r * 0.8);
    cloudGfx.fillCircle(cloud.x + cloud.r * 2.2, cloud.y,              cloud.r * 0.9);
  }

  // --- Trees ---
  const trunkGfx  = scene.add.graphics();
  const canopyGfx = scene.add.graphics();
  trunkGfx.setDepth(-50);
  canopyGfx.setDepth(-50);

  for (const tree of trees) {
    const bx = tree.x;
    const by = GROUND_Y;

    // Trunk
    trunkGfx.fillStyle(0x5d4037);
    trunkGfx.fillRect(bx - 9, by - tree.trunkH, 18, tree.trunkH);

    // Canopy: draw darker base first, then lighter upper clusters on top
    const darkerColor = Phaser.Display.Color.ValueToColor(tree.color).darken(20).color;
    const lighterColor = Phaser.Display.Color.ValueToColor(tree.color).lighten(25).color;

    canopyGfx.fillStyle(darkerColor);
    canopyGfx.fillCircle(bx, by - tree.trunkH, tree.canopyR);

    canopyGfx.fillStyle(lighterColor);
    canopyGfx.fillCircle(bx - tree.canopyR * 0.3, by - tree.trunkH - tree.canopyR * 0.4, tree.canopyR * 0.65);
    canopyGfx.fillCircle(bx + tree.canopyR * 0.3, by - tree.trunkH - tree.canopyR * 0.3, tree.canopyR * 0.6);
  }
}

// Generate cloud data
export function generateClouds(fieldEnd: number): Array<{ x: number; y: number; r: number }> {
  const clouds: Array<{ x: number; y: number; r: number }> = [];
  for (let i = 0; i < 50; i++) {
    clouds.push({
      x: Math.random() * (fieldEnd + 2000),
      y: -1500 - Math.random() * 2000,
      r: 100 + Math.random() * 200,
    });
  }
  return clouds;
}

// Generate tree data
export function generateTrees(fieldEnd: number): Array<{ x: number; trunkH: number; canopyR: number; color: number }> {
  const treeColorHex = [0x1b5e20, 0x2e7d32, 0x33691e, 0x388e3c, 0x1a3a1a];
  const trees: Array<{ x: number; trunkH: number; canopyR: number; color: number }> = [];
  for (let i = 0; i < 60; i++) {
    trees.push({
      x:       Math.random() * fieldEnd,
      trunkH:  100 + Math.random() * 250,
      canopyR: 80  + Math.random() * 140,
      color:   treeColorHex[Math.floor(Math.random() * treeColorHex.length)],
    });
  }
  return trees;
}
