import Phaser from 'phaser';
import { WORLD_WIDTH, WORLD_HEIGHT } from './types/GameState';
import { BootScene } from './scenes/BootScene';
import { SplashScene } from './scenes/SplashScene';
import { GameScene } from './scenes/GameScene';

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.WEBGL,
  width:  window.innerWidth,
  height: window.innerHeight,
  backgroundColor: '#87CEEB',
  parent: 'game-container',
  canvas: document.getElementById('game-canvas') as HTMLCanvasElement,
  physics: {
    default: 'matter',
    matter: {
      gravity: { x: 0, y: 1 },
      enableSleeping: false,
      debug: false,
      setBounds: {
        x: -2000, y: -6000,
        width:  WORLD_WIDTH + 4000,
        height: WORLD_HEIGHT + 6000,
      },
    },
  },
  scene: [BootScene, SplashScene, GameScene],
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
};

const game = new Phaser.Game(config);

// Register service worker for PWA
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js');
}

// Resize handler
window.addEventListener('resize', () => {
  game.scale.resize(window.innerWidth, window.innerHeight);
});
