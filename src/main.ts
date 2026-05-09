import Phaser from 'phaser';
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
      debug: {
        showBody: true,
        showStaticBody: true,
        renderFill: true,
        fillColor: 0xa0a0a0,
        fillOpacity: 1,
        staticFillColor: 0x654321,
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

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js');
}

// Mute button
const muteBtn = document.getElementById('mute-btn')!;
muteBtn.addEventListener('click', () => {
  const muted = !game.sound.mute;
  game.sound.mute = muted;
  muteBtn.textContent = muted ? '🔇' : '🔊';
});

// Quick-reset failsafe button — reloads the page from scratch
document.getElementById('reset-quick-btn')!.addEventListener('click', () => {
  window.location.reload();
});

window.addEventListener('resize', () => {
  game.scale.resize(window.innerWidth, window.innerHeight);
});
