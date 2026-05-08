import Phaser from 'phaser';
import { SCENE, KEY } from '../types/GameState';

export class BootScene extends Phaser.Scene {
  constructor() { super({ key: SCENE.BOOT }); }

  preload(): void {
    // Sprites
    this.load.spritesheet(KEY.RUNNING, '/sprites/running.png', {
      frameWidth:  Math.floor(2048 / 5),
      frameHeight: 1360,
    });
    this.load.image(KEY.EXPLODED,     '/sprites/exploded.png');
    this.load.image(KEY.ICON,         '/buster-icon.png');
    this.load.image(KEY.BUSTER_HEAD,  '/sprites/buster/head.png');
    this.load.image(KEY.BUSTER_TORSO, '/sprites/buster/torso.png');
    this.load.image(KEY.BUSTER_ARM_L, '/sprites/buster/arm-left.png');
    this.load.image(KEY.BUSTER_ARM_R, '/sprites/buster/arm-right.png');
    this.load.image(KEY.BUSTER_LEG_L, '/sprites/buster/leg-left.png');
    this.load.image(KEY.BUSTER_LEG_R, '/sprites/buster/leg-right.png');

    // Audio
    this.load.audio(KEY.THEME,       '/sounds/music/theme.mp3');
    this.load.audio(KEY.SFX_RUNNING, '/sounds/effects/running.mp3');
    this.load.audio(KEY.SFX_WOOSH,   '/sounds/effects/woosh.mp3');
    this.load.audio(KEY.SFX_LAUNCH,  '/sounds/effects/launch.mp3');
    this.load.audio(KEY.SFX_WIND,    '/sounds/effects/wind.mp3');
    this.load.audio(KEY.SFX_CRASH[0], '/sounds/effects/crash1.mp3');
    this.load.audio(KEY.SFX_CRASH[1], '/sounds/effects/crash2.mp3');
    this.load.audio(KEY.SFX_CRASH[2], '/sounds/effects/crash3.mp3');
    this.load.audio(KEY.SFX_SCREAM[0], '/sounds/effects/scream.mp3');
    this.load.audio(KEY.SFX_SCREAM[1], '/sounds/effects/scream2.mp3');
    this.load.audio(KEY.SFX_SCREAM[2], '/sounds/effects/scream3.mp3');
    this.load.audio(KEY.SFX_SCREAM[3], '/sounds/effects/scream4.mp3');
    this.load.audio(KEY.SFX_AMBIENT[0], '/sounds/effects/birds.mp3');
    this.load.audio(KEY.SFX_AMBIENT[1], '/sounds/effects/construction.mp3');
    this.load.audio(KEY.SFX_AMBIENT[2], '/sounds/effects/traffic.mp3');
    this.load.audio(KEY.SFX_CHEERING,  '/sounds/effects/cheering.mp3');
    this.load.audio(KEY.SFX_EXPLOSION, '/sounds/effects/explosion.mp3');
  }

  create(): void {
    // Register run animation
    this.anims.create({
      key: 'run',
      frames: this.anims.generateFrameNumbers(KEY.RUNNING, { start: 0, end: 4 }),
      frameRate: 12,
      repeat: -1,
    });

    this.scene.start(SCENE.SPLASH);
  }
}
