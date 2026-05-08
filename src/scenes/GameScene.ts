import Phaser from 'phaser';
import {
  WORLD_HEIGHT, GROUND_Y, BUSTER_START_X,
  BUILDINGS_START_X, NUM_BUILDINGS, BUILDING_SPACING,
  RAMP_DEFAULT_ANGLE, RAMP_MIN_ANGLE, RAMP_MAX_ANGLE,
  GRAVITY_SCALE, TIME_SCALE, SCENE, KEY, TARGET_HEIGHT,
} from '../types/GameState';
import { createBackground, generateClouds, generateTrees } from '../game/BackgroundRenderer';
import { createRamp, removeRamp, RampBodies } from '../game/RampFactory';
import { createBuildings, activateTargetBuilding, explodeBuilding, settleBricks, shouldChainExplode, BuildingData } from '../game/BuildingFactory';
import { breakLimbs } from '../game/RagdollFactory';
import { BusterController, RunPhase } from '../game/BusterController';
import { CameraController } from '../game/CameraController';
import { AngleArcWidget } from '../ui/AngleArcWidget';

export class GameScene extends Phaser.Scene {
  private rampBodies!: RampBodies;
  private ground!: MatterJS.BodyType;
  private buildings!: BuildingData;

  private buster!: BusterController;
  private camCtrl!: CameraController;
  private arcWidget!: AngleArcWidget;

  private rampAngle    = RAMP_DEFAULT_ANGLE;
  private speed        = 50;
  private speedDir     = 1;
  private gameStarted  = false;
  private firstImpact  = false;
  private hitTarget    = false;
  private runComplete  = false;
  private limbsBroken  = false;
  private lastImpactMs = 0;
  private targetIndex  = 0;

  private speedInterval: number | null = null;
  private followBuster = false;
  private theme: Phaser.Sound.BaseSound | null = null;
  private ambientSounds: Phaser.Sound.BaseSound[] = [];
  private sfxRunning!: Phaser.Sound.BaseSound;
  private sfxWoosh!:   Phaser.Sound.BaseSound;
  private sfxLaunch!:  Phaser.Sound.BaseSound;
  private sfxWind!:    Phaser.Sound.BaseSound;
  private sfxCrashes!:  Phaser.Sound.BaseSound[];
  private sfxScreams!:  Phaser.Sound.BaseSound[];
  private sfxCheering!:   Phaser.Sound.BaseSound;
  private sfxExplosions!: Phaser.Sound.BaseSound[]; // pool for simultaneous playback
  private explosionIdx = 0;

  private busterSprite!: Phaser.GameObjects.Sprite;
  private headSprite!:   Phaser.GameObjects.Image;

  constructor() { super({ key: SCENE.GAME }); }

  init(data: { theme?: Phaser.Sound.BaseSound; ambient?: Phaser.Sound.BaseSound[] }): void {
    if (data?.theme)   this.theme        = data.theme;
    if (data?.ambient) this.ambientSounds = data.ambient;
    this.rampAngle   = RAMP_DEFAULT_ANGLE;
    this.speed       = 50;
    this.speedDir    = 1;
    this.gameStarted = false;
    this.firstImpact = false;
    this.hitTarget   = false;
    this.runComplete = false;
    this.limbsBroken = false;
    this.lastImpactMs = 0;
  }

  create(): void {
    // No camera bounds — bounds clamping at varying zoom levels causes jerky tween motion.
    // The physics world constrains gameplay; the camera can move freely.
    this.matter.world.setGravity(0, 1, GRAVITY_SCALE);
    this.matter.world.engine.timing.timeScale = TIME_SCALE;

    const minIdx = Math.floor(NUM_BUILDINGS / 2);
    const maxIdx = NUM_BUILDINGS - 2;
    this.targetIndex = Phaser.Math.Between(minIdx, maxIdx);

    const fieldEnd = BUILDINGS_START_X + (NUM_BUILDINGS - 1) * BUILDING_SPACING + 800; // ~35100
    createBackground(this, generateClouds(fieldEnd), generateTrees(fieldEnd), fieldEnd);

    // No camera bounds — see above.

    // Ground
    this.ground = this.matter.bodies.rectangle(
      fieldEnd / 2, WORLD_HEIGHT - 50, fieldEnd + 8000, 100,
      { isStatic: true, render: { fillColor: 0x8B4513 }, label: 'ground' }
    ) as MatterJS.BodyType;
    this.matter.world.add(this.ground);

    this.rampBodies = createRamp(this.matter, this.rampAngle);
    this.buildings  = createBuildings(this.matter, this.targetIndex);

    this.buster = new BusterController(this.matter);
    this.buster.create();
    this.buster.onPhaseChange = (p) => this.onRunPhaseChange(p);

    this.camCtrl = new CameraController(this);

    // Sprite game objects — positioned in update() each frame
    this.busterSprite = this.add.sprite(BUSTER_START_X, GROUND_Y - 60, KEY.RUNNING, 0)
      .setDepth(10)
      .setDisplaySize(90, 90);
    this.headSprite = this.add.image(BUSTER_START_X, GROUND_Y - 100, KEY.ICON)
      .setDepth(10)
      .setDisplaySize(40, 40)
      .setVisible(false);

    this.sfxRunning = this.sound.add(KEY.SFX_RUNNING, { loop: true });
    this.sfxWoosh   = this.sound.add(KEY.SFX_WOOSH);
    this.sfxLaunch  = this.sound.add(KEY.SFX_LAUNCH);
    this.sfxWind    = this.sound.add(KEY.SFX_WIND, { loop: true });
    this.sfxCrashes   = KEY.SFX_CRASH.map(k => this.sound.add(k));
    this.sfxScreams   = KEY.SFX_SCREAM.map(k => this.sound.add(k));
    this.sfxCheering  = this.sound.add(KEY.SFX_CHEERING, { loop: true, volume: 0 });
    this.sfxExplosions = Array.from({ length: 6 }, () => this.sound.add(KEY.SFX_EXPLOSION));

    this.setupPhysicsEvents();
    this.setupUI();
    this.startSpeedMeter();

    this.camCtrl.playIntro(this.targetIndex, () => this.onIntroComplete());

    // Start ambient scheduler once, 10s after first game load
    if (!(this.game as any)._ambientStarted && this.ambientSounds.length) {
      (this.game as any)._ambientStarted = true;
      this.time.delayedCall(10000, () => this.playNextAmbient());
    }
  }

  private setupUI(): void {
    const startBtn  = document.getElementById('start-btn') as HTMLButtonElement;
    const resetBtn  = document.getElementById('reset-btn')!;
    const arcCanvas = document.getElementById('angle-canvas') as HTMLCanvasElement;

    this.arcWidget = new AngleArcWidget(arcCanvas, this.rampAngle, (angle) => {
      if (this.gameStarted) return;
      this.rampAngle = Math.max(RAMP_MIN_ANGLE, Math.min(RAMP_MAX_ANGLE, angle));
      removeRamp(this.matter, this.rampBodies);
      this.rampBodies = createRamp(this.matter, this.rampAngle);
    });

    startBtn.addEventListener('click', () => {
      if (!this.gameStarted) {
        this.gameStarted = true;
        if (this.speedInterval) { clearInterval(this.speedInterval); this.speedInterval = null; }
        startBtn.disabled = true;
        document.getElementById('left-panel')!.style.display  = 'none';
        document.getElementById('right-panel')!.style.display = 'none';
        this.startRun();
      }
    }, { once: true });

    resetBtn.addEventListener('click', () => {
      document.getElementById('reset-modal')!.style.display = 'none';
      if (this.arcWidget) this.arcWidget.destroy();
      // Fade out cheering before restart
      const cheer = this.sfxCheering as Phaser.Sound.WebAudioSound;
      if (cheer.isPlaying) {
        this.tweens.add({
          targets: cheer, volume: 0, duration: 1500, ease: 'Linear',
          onComplete: () => { cheer.stop(); this.scene.restart({ theme: this.theme, ambient: this.ambientSounds }); },
        });
      } else {
        this.scene.restart({ theme: this.theme, ambient: this.ambientSounds });
      }
    }, { once: true });
  }

  private onIntroComplete(): void {
    document.getElementById('left-panel')!.style.display  = 'flex';
    document.getElementById('right-panel')!.style.display = 'flex';
    const btn = document.getElementById('start-btn') as HTMLButtonElement;
    btn.style.display = 'block';
    btn.disabled = false;
  }

  private startRun(): void {
    const pos = this.buster.position;
    this.camCtrl.zoomToBuster(pos.x, pos.y, () => {
      this.followBuster = true;
      this.buster.startRun();
      this.time.delayedCall(8000,  () => { if (!this.firstImpact) this.triggerFailsafe(); });
      this.time.delayedCall(10000, () => this.doSettleBricks());
    });
  }

  private startSpeedMeter(): void {
    const bar   = document.getElementById('speed-bar')!;
    const label = document.getElementById('speed-value')!;
    this.speedInterval = window.setInterval(() => {
      if (this.gameStarted) return;
      this.speed += this.speedDir * 4;
      if (this.speed >= 100) { this.speed = 100; this.speedDir = -1; }
      if (this.speed <= 0)   { this.speed = 0;   this.speedDir =  1; }
      bar.style.width   = `${this.speed}%`;
      label.textContent = `${this.speed}%`;
    }, 50);
  }

  private onRunPhaseChange(phase: RunPhase): void {
    this.sfxRunning.stop();
    this.sfxWoosh.stop();
    if (phase === 'backup')   (this.sfxRunning as Phaser.Sound.WebAudioSound).play();
    if (phase === 'forward')  (this.sfxWoosh   as Phaser.Sound.WebAudioSound).play();
    if (phase === 'ramp')     (this.sfxLaunch  as Phaser.Sound.WebAudioSound).play();
    if (phase === 'launched') { this.sfxRunning.stop(); (this.sfxWind as Phaser.Sound.WebAudioSound).play(); }
  }

  private setupPhysicsEvents(): void {
    // Run buster FSM in beforeupdate so setPosition/setVelocity take effect
    // before the physics engine processes them this tick.
    this.matter.world.on('beforeupdate', () => {
      if (this.gameStarted) this.buster.update(this.speed, this.rampAngle);
    });

    this.matter.world.on('collisionstart', (event: any) => {
      this.handleCollisions(event.pairs as MatterJS.IPair[]);
    });
  }

  private handleCollisions(pairs: MatterJS.IPair[]): void {
    const isGround      = (b: MatterJS.BodyType) => b === this.ground;
    const isRamp        = (b: MatterJS.BodyType) => (b as any).label === 'ramp' || (b as any).label === 'rampPlank';
    const isSolid       = (b: MatterJS.BodyType) => this.buildings.solidBodies.includes(b);
    const isTargetBody  = (b: MatterJS.BodyType) => b === this.buildings.targetBody;
    const isTargetBrick = (b: MatterJS.BodyType) => this.buildings.targetBricks.includes(b);
    const isSecBrick    = (b: MatterJS.BodyType) => this.buildings.secondaryBricks.includes(b);

    for (const pair of pairs) {
      // Cast from MatterJS.Body to MatterJS.BodyType
      const a = pair.bodyA as unknown as MatterJS.BodyType;
      const b = pair.bodyB as unknown as MatterJS.BodyType;

      // Buster hits the target building → swap for dynamic bricks
      if (!this.hitTarget) {
        const hit = (this.buster.isBusterPart(a) && isTargetBody(b))
                 || (this.buster.isBusterPart(b) && isTargetBody(a));
        if (hit) {
          this.hitTarget = true;
          this.followBuster = false;
          this.playExplosion();
          activateTargetBuilding(this.matter, this.buildings);

          // Zoom out to show the surrounding damage area
          const tx = BUILDINGS_START_X + this.targetIndex * BUILDING_SPACING + 400;
          const ty = GROUND_Y - TARGET_HEIGHT / 2;
          const damageZoom = this.cameras.main.width / 8000;
          const startZoom = this.cameras.main.zoom;
          const startX    = this.cameras.main.midPoint.x;
          const startY    = this.cameras.main.midPoint.y;

          this.tweens.add({
            targets: { t: 0 }, t: 1, duration: 1200, ease: 'Sine.easeOut',
            onUpdate: (tween) => {
              const t = tween.progress;
              this.cameras.main.setZoom(Phaser.Math.Linear(startZoom, damageZoom, t));
              this.cameras.main.centerOn(
                Phaser.Math.Linear(startX, tx, t),
                Phaser.Math.Linear(startY, ty, t),
              );
            },
          });
        }
      }

      // Chain explosions: target bricks or secondary bricks hitting solid buildings
      const flyingHitsSolid =
        ((isTargetBrick(a) || isSecBrick(a)) && isSolid(b)) ||
        ((isTargetBrick(b) || isSecBrick(b)) && isSolid(a));

      if (flyingHitsSolid) {
        const brick    = (isTargetBrick(a) || isSecBrick(a)) ? a : b;
        const building = isSolid(a) ? a : b;
        if (shouldChainExplode(brick)) {
          explodeBuilding(this.matter, building, this.buildings.solidBodies, this.buildings.secondaryBricks);
          this.playExplosion();
        }
      }

      // First impact
      if (!this.limbsBroken) {
        const bHit = (this.buster.isBusterPart(a) && (isSolid(b) || isGround(b) || isRamp(b) || isTargetBody(b) || isTargetBrick(b)))
                  || (this.buster.isBusterPart(b) && (isSolid(a) || isGround(a) || isRamp(a) || isTargetBody(a) || isTargetBrick(a)));
        if (bHit) {
          this.limbsBroken = true;
          this.buster.stopFlight();
          if (this.buster.ragdoll) breakLimbs(this.matter, this.buster.ragdoll);
          this.sfxWind.stop();
          this.playImpactSounds();
          if (!this.firstImpact) {
            this.firstImpact = true;
            this.time.delayedCall(2000, () => {
              if (!this.runComplete) {
                this.runComplete = true;
                this.followBuster = false;
                this.camCtrl.playOutro(BUILDINGS_START_X + this.targetIndex * BUILDING_SPACING + 400, GROUND_Y - TARGET_HEIGHT / 2);
              }
              if (!this.hitTarget) this.time.delayedCall(2000, () => this.showResetModal());
            });
          }
        }
      }

      // Subsequent impacts
      if (this.limbsBroken && this.firstImpact && !this.runComplete) {
        const now = Date.now();
        if (now - this.lastImpactMs > 800) {
          const bHit = (this.buster.isBusterPart(a) && (isSolid(b) || isGround(b) || isRamp(b) || isTargetBody(b) || isTargetBrick(b)))
                    || (this.buster.isBusterPart(b) && (isSolid(a) || isGround(a) || isRamp(a) || isTargetBody(a) || isTargetBrick(a)));
          if (bHit) { this.lastImpactMs = now; this.playImpactSounds(); }
        }
      }
    }
  }

  private doSettleBricks(): void {
    this.stopAllEffects();
    settleBricks(this.matter, this.buildings.targetBricks);
    settleBricks(this.matter, this.buildings.secondaryBricks);
    if (!this.runComplete) { this.runComplete = true; this.camCtrl.playOutro(BUILDINGS_START_X + this.targetIndex * BUILDING_SPACING + 400, GROUND_Y - TARGET_HEIGHT / 2); }
    // Always show reset modal after bricks settle
    this.time.delayedCall(2500, () => this.showResetModal());
  }

  private triggerFailsafe(): void {
    if (this.firstImpact) return;
    this.limbsBroken = true;
    this.buster.stopFlight();
    if (this.buster.ragdoll) breakLimbs(this.matter, this.buster.ragdoll);
    this.firstImpact = true;
    this.time.delayedCall(2000, () => {
      if (!this.runComplete) { this.runComplete = true; this.camCtrl.playOutro(BUILDINGS_START_X + this.targetIndex * BUILDING_SPACING + 400, GROUND_Y - TARGET_HEIGHT / 2); }
      this.time.delayedCall(2500, () => this.showResetModal());
    });
  }

  private showResetModal(): void {
    this.stopAllEffects();
    if (this.hitTarget) {
      const cheer = this.sfxCheering as Phaser.Sound.WebAudioSound;
      cheer.setVolume(0);
      cheer.play();
      this.tweens.add({ targets: cheer, volume: 0.7, duration: 2000, ease: 'Linear' });
    }
    document.getElementById('reset-modal')!.style.display = 'flex';
  }

  private playNextAmbient(): void {
    if (!this.ambientSounds.length) return;
    const pick = this.ambientSounds[
      Phaser.Math.Between(0, this.ambientSounds.length - 1)
    ] as Phaser.Sound.WebAudioSound;

    pick.setVolume(0);
    pick.play();

    // Fade in to 50%
    this.tweens.add({ targets: pick, volume: 0.5, duration: 3000, ease: 'Linear' });

    // Fade out 3s before end, then schedule next
    pick.once('complete', () => {
      this.tweens.add({
        targets: pick, volume: 0, duration: 2000, ease: 'Linear',
        onComplete: () => {
          const delay = Phaser.Math.Between(15000, 35000);
          this.time.delayedCall(delay, () => this.playNextAmbient());
        },
      });
    });
  }

  private playExplosion(): void {
    const snd = this.sfxExplosions[this.explosionIdx % this.sfxExplosions.length];
    this.explosionIdx++;
    (snd as Phaser.Sound.WebAudioSound).play();
  }

  private stopAllEffects(): void {
    [this.sfxRunning, this.sfxWoosh, this.sfxLaunch, this.sfxWind].forEach(s => s?.stop());
    // Ambient sounds intentionally NOT stopped — they persist across runs and idle states
  }

  private playImpactSounds(): void {
    if (this.runComplete) return;
    (this.sfxCrashes[Phaser.Math.Between(0, this.sfxCrashes.length - 1)] as Phaser.Sound.WebAudioSound).play();
    (this.sfxScreams[Phaser.Math.Between(0, this.sfxScreams.length - 1)] as Phaser.Sound.WebAudioSound).play();
  }

  update(): void {
    this.updateBusterSprite();

    if (this.gameStarted && this.followBuster && !this.runComplete) {
      const pos = this.buster.position;
      this.cameras.main.centerOn(pos.x, pos.y);
    }
  }

  private updateBusterSprite(): void {
    const b = this.buster;
    const RUN_SPRITE_FRAMES = 5;
    const RUN_SPRITE_FPS    = 12;

    if (b.runBody) {
      // Run body visible — show animated or static run sprite
      this.busterSprite.setVisible(true);
      this.headSprite.setVisible(false);
      this.busterSprite.setPosition(b.runBody.position.x, b.runBody.position.y);
      this.busterSprite.setAngle(Phaser.Math.RadToDeg(b.runBody.angle));

      if (b.phase === 'forward') {
        // Advance animation frame manually
        const fps = RUN_SPRITE_FPS;
        const frameMs = 1000 / fps;
        const frame = Math.floor((Date.now() / frameMs) % RUN_SPRITE_FRAMES);
        this.busterSprite.setFrame(frame);
      } else {
        this.busterSprite.setFrame(0);
      }
    } else if (b.ragdoll && b.ragdoll.buster.parts.length > 2) {
      // Ragdoll — show head icon at head part position
      this.busterSprite.setVisible(false);
      const head = b.ragdoll.buster.parts[2] as MatterJS.BodyType;
      this.headSprite.setVisible(true);
      this.headSprite.setPosition(head.position.x, head.position.y);
      this.headSprite.setAngle(Phaser.Math.RadToDeg(head.angle));
    } else {
      this.busterSprite.setVisible(false);
      this.headSprite.setVisible(false);
    }
  }
}
