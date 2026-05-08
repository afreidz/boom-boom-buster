import Phaser from 'phaser';
import {
  WORLD_HEIGHT, GROUND_Y, BUSTER_START_X,
  BUILDINGS_START_X, NUM_BUILDINGS, BUILDING_SPACING,
  RAMP_DEFAULT_ANGLE, RAMP_MIN_ANGLE, RAMP_MAX_ANGLE,
  GRAVITY_SCALE, TIME_SCALE, SCENE, KEY,
} from '../types/GameState';
import { createBackground, generateClouds, generateTrees } from '../game/BackgroundRenderer';
import { createRamp, removeRamp, RampBodies } from '../game/RampFactory';
import { createBuildings, explodeBuilding, settleBricks, shouldChainExplode, BuildingData } from '../game/BuildingFactory';
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
  private theme: Phaser.Sound.BaseSound | null = null;
  private sfxRunning!: Phaser.Sound.BaseSound;
  private sfxWoosh!:   Phaser.Sound.BaseSound;
  private sfxLaunch!:  Phaser.Sound.BaseSound;
  private sfxWind!:    Phaser.Sound.BaseSound;
  private sfxCrashes!: Phaser.Sound.BaseSound[];
  private sfxScreams!: Phaser.Sound.BaseSound[];

  private runSheet!: HTMLImageElement;
  private iconImg!:  HTMLImageElement;

  constructor() { super({ key: SCENE.GAME }); }

  init(data: { theme?: Phaser.Sound.BaseSound }): void {
    if (data?.theme) this.theme = data.theme;
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
    this.cameras.main.setBounds(-2000, -6000, 22000, WORLD_HEIGHT + 6000);
    this.matter.world.setGravity(0, 1, GRAVITY_SCALE);
    this.matter.world.engine.timing.timeScale = TIME_SCALE;

    const minIdx = Math.floor(NUM_BUILDINGS / 2);
    const maxIdx = NUM_BUILDINGS - 2;
    this.targetIndex = Phaser.Math.Between(minIdx, maxIdx);

    const fieldEnd = BUILDINGS_START_X + (NUM_BUILDINGS - 1) * BUILDING_SPACING + 800;
    createBackground(this, generateClouds(fieldEnd), generateTrees(fieldEnd));

    // Ground
    this.ground = this.matter.bodies.rectangle(
      11000, WORLD_HEIGHT - 50, 90000, 100,
      { isStatic: true, render: { fillColor: 0x8B4513 }, label: 'ground' }
    ) as MatterJS.BodyType;
    this.matter.world.add(this.ground);

    this.rampBodies = createRamp(this.matter, this.rampAngle);
    this.buildings  = createBuildings(this.matter, this.targetIndex);

    this.buster = new BusterController(this.matter);
    this.buster.create();
    this.buster.onPhaseChange = (p) => this.onRunPhaseChange(p);

    this.camCtrl = new CameraController(this.cameras.main);

    this.runSheet = new Image(); this.runSheet.src = '/sprites/running.png';
    this.iconImg  = new Image(); this.iconImg.src  = '/buster-icon.png';

    this.sfxRunning = this.sound.add(KEY.SFX_RUNNING, { loop: true });
    this.sfxWoosh   = this.sound.add(KEY.SFX_WOOSH);
    this.sfxLaunch  = this.sound.add(KEY.SFX_LAUNCH);
    this.sfxWind    = this.sound.add(KEY.SFX_WIND, { loop: true });
    this.sfxCrashes = KEY.SFX_CRASH.map(k => this.sound.add(k));
    this.sfxScreams = KEY.SFX_SCREAM.map(k => this.sound.add(k));

    this.setupPhysicsEvents();
    this.setupUI();
    this.startSpeedMeter();

    this.camCtrl.playIntro(this.targetIndex, () => this.onIntroComplete());
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
      this.scene.restart({ theme: this.theme });
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
    this.cameras.main.pan(BUSTER_START_X, GROUND_Y - 60, 800, 'Sine.easeInOut');
    this.cameras.main.zoomTo(4, 800, 'Sine.easeInOut');
    this.time.delayedCall(1000, () => {
      this.buster.startRun();
      this.time.delayedCall(8000, () => { if (!this.firstImpact) this.triggerFailsafe(); });
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
    this.matter.world.on('beforeupdate', () => this.buster.update(this.speed, this.rampAngle));

    this.matter.world.on('collisionstart', (event: { pairs: MatterJS.IPair[] }) => {
      this.handleCollisions(event.pairs);
    });
  }

  private handleCollisions(pairs: MatterJS.IPair[]): void {
    const isGround    = (b: MatterJS.BodyType) => b === this.ground;
    const isSolid     = (b: MatterJS.BodyType) => this.buildings.solidBodies.includes(b);
    const isTarget    = (b: MatterJS.BodyType) => this.buildings.targetBricks.includes(b);
    const isTargetDyn = (b: MatterJS.BodyType) => isTarget(b) && !b.isStatic;
    const isSecDyn    = (b: MatterJS.BodyType) => this.buildings.secondaryBricks.includes(b) && !b.isStatic;

    for (const pair of pairs) {
      // Cast from MatterJS.Body to MatterJS.BodyType
      const a = pair.bodyA as unknown as MatterJS.BodyType;
      const b = pair.bodyB as unknown as MatterJS.BodyType;

      // Buster hits target brick → activate
      if (!this.hitTarget) {
        const hit = (this.buster.isBusterPart(a) && isTarget(b)) || (this.buster.isBusterPart(b) && isTarget(a));
        if (hit) {
          this.hitTarget = true;
          const impactPos = this.buster.isBusterPart(a) ? b.position : a.position;
          const vel = this.buster.ragdoll?.buster.velocity ?? { x: 0, y: 0 };
          this.buildings.targetBricks.forEach(brick => {
            this.matter.body.setStatic(brick, false);
            const dx = brick.position.x - impactPos.x;
            const dy = brick.position.y - impactPos.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            const angle = Math.atan2(dy, dx);
            const falloff = Math.max(0.1, 1 - dist / 800);
            this.matter.body.setVelocity(brick, {
              x: vel.x * 0.6 * falloff + Math.cos(angle) * 10 * falloff,
              y: vel.y * 0.6 * falloff + Math.sin(angle) * 10 * falloff,
            });
          });
        }
      }

      // Chain explosions
      if ((isTargetDyn(a) && isSolid(b)) || (isTargetDyn(b) && isSolid(a))) {
        const brick    = isTargetDyn(a) ? a : b;
        const building = isSolid(a) ? a : b;
        if (shouldChainExplode(brick)) explodeBuilding(this.matter, building, this.buildings.solidBodies, this.buildings.secondaryBricks);
      }
      if ((isSecDyn(a) && isSolid(b)) || (isSecDyn(b) && isSolid(a))) {
        const brick    = isSecDyn(a) ? a : b;
        const building = isSolid(a) ? a : b;
        if (shouldChainExplode(brick)) explodeBuilding(this.matter, building, this.buildings.solidBodies, this.buildings.secondaryBricks);
      }

      // First impact
      if (!this.limbsBroken) {
        const bHit = (this.buster.isBusterPart(a) && (isSolid(b) || isGround(b) || isTarget(b)))
                  || (this.buster.isBusterPart(b) && (isSolid(a) || isGround(a) || isTarget(a)));
        if (bHit) {
          this.limbsBroken = true;
          this.buster.stopFlight();
          if (this.buster.ragdoll) breakLimbs(this.matter, this.buster.ragdoll);
          this.sfxWind.stop();
          this.playImpactSounds();
          if (!this.firstImpact) {
            this.firstImpact = true;
            this.time.delayedCall(2000, () => {
              if (!this.runComplete) { this.runComplete = true; this.camCtrl.playOutro(); }
              if (!this.hitTarget) this.time.delayedCall(2000, () => this.showResetModal());
            });
          }
        }
      }

      // Subsequent impacts
      if (this.limbsBroken && this.firstImpact && !this.runComplete) {
        const now = Date.now();
        if (now - this.lastImpactMs > 800) {
          const bHit = (this.buster.isBusterPart(a) && (isSolid(b) || isGround(b) || isTarget(b)))
                    || (this.buster.isBusterPart(b) && (isSolid(a) || isGround(a) || isTarget(a)));
          if (bHit) { this.lastImpactMs = now; this.playImpactSounds(); }
        }
      }
    }
  }

  private doSettleBricks(): void {
    this.stopAllEffects();
    settleBricks(this.matter, this.buildings.targetBricks);
    settleBricks(this.matter, this.buildings.secondaryBricks);
    if (!this.runComplete) { this.runComplete = true; this.camCtrl.playOutro(); }
    if (this.hitTarget) this.showResetModal();
  }

  private triggerFailsafe(): void {
    if (this.firstImpact) return;
    this.limbsBroken = true;
    this.buster.stopFlight();
    if (this.buster.ragdoll) breakLimbs(this.matter, this.buster.ragdoll);
    this.firstImpact = true;
    this.time.delayedCall(2000, () => { if (!this.runComplete) { this.runComplete = true; this.camCtrl.playOutro(); } });
  }

  private showResetModal(): void {
    this.stopAllEffects();
    document.getElementById('reset-modal')!.style.display = 'flex';
  }

  private stopAllEffects(): void {
    [this.sfxRunning, this.sfxWoosh, this.sfxLaunch, this.sfxWind].forEach(s => s?.stop());
  }

  private playImpactSounds(): void {
    if (this.runComplete) return;
    (this.sfxCrashes[Phaser.Math.Between(0, this.sfxCrashes.length - 1)] as Phaser.Sound.WebAudioSound).play();
    (this.sfxScreams[Phaser.Math.Between(0, this.sfxScreams.length - 1)] as Phaser.Sound.WebAudioSound).play();
  }

  update(): void {
    if (!this.gameStarted) return;
    const pos = this.buster.position;
    this.cameras.main.pan(pos.x, pos.y, 50, 'Linear');
  }
}
