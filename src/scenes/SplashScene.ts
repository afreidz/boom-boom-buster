import Phaser from 'phaser';
import { SCENE, KEY } from '../types/GameState';

export class SplashScene extends Phaser.Scene {
  private theme!: Phaser.Sound.BaseSound;

  constructor() { super({ key: SCENE.SPLASH }); }

  create(): void {
    const splash   = document.getElementById('splash')!;
    const playBtn  = document.getElementById('play-btn')!;

    // Fade in splash
    requestAnimationFrame(() => { splash.style.opacity = '1'; });

    playBtn.addEventListener('click', () => {
      // Start theme music (requires user gesture)
      this.theme = this.sound.add(KEY.THEME, { loop: true });
      this.theme.play();

      // Pre-load ambient sounds here so they persist like theme music
      const ambient = KEY.SFX_AMBIENT.map(k => this.sound.add(k, { volume: 0 }));

      // Fade out splash, then start game
      splash.style.opacity = '0';
      setTimeout(() => {
        splash.style.display = 'none';
        this.scene.start(SCENE.GAME, { theme: this.theme, ambient });
      }, 600);
    }, { once: true });
  }
}
