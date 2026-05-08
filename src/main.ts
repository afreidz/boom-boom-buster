import Matter from 'matter-js';

const Engine = Matter.Engine;
const Render = Matter.Render;
const Runner = Matter.Runner;
const Bodies = Matter.Bodies;
const Composite = Matter.Composite;
const Body = Matter.Body;
const Events = Matter.Events;
const Constraint = Matter.Constraint;

class BoomBoomBuster {
  private engine: Matter.Engine;
  private render: Matter.Render;
  private runner: Matter.Runner;
  private canvas: HTMLCanvasElement;
  private buster: Matter.Body | null = null;
  private busterLimbs: Matter.Body[] = [];
  private limbConstraints: Matter.Constraint[] = [];
  private ramp: Matter.Body | null = null;
  private rampPlank: Matter.Body | null = null;
  private ground: Matter.Body | null = null;
  private buildings: Matter.Body[] = [];
  private buildingBricks: Matter.Body[] = [];
  private targetBuilding: Matter.Body[] = [];
  private rampAngle: number = 45;
  private speed: number = 50;
  private speedIncreasing: boolean = true;
  private speedInterval: number | null = null;
  private gameStarted: boolean = false;
  private initialViewSet: boolean = false;
  private isFlying: boolean = false;
  private flightAngle: number = 0;
  private isZooming: boolean = false;
  private zoomStartTime: number = 0;
  private zoomDuration: number = 800;
  private zoomStartBounds = { minX: 0, maxX: 0, minY: 0, maxY: 0 };
  private zoomEndBounds = { minX: 0, maxX: 0, minY: 0, maxY: 0 };
  private runComplete: boolean = false;
  private limbsBroken: boolean = false;
  private introAnimationPhase: number = -1;
  private introAnimationStartTime: number = 0;
  private outroAnimationStarted: boolean = false;
  private outroAnimationStartTime: number = 0;
  private outroStartBounds = { minX: 0, maxX: 0, minY: 0, maxY: 0 };
  private firstImpact: boolean = false;
  private failsafeTimeout: number | null = null;
  private brickSettleTimeout: number | null = null;
  private impactTimeout: number | null = null;
  private targetBuildingIndex: number = 0;
  private isDraggingAngle: boolean = false;
  private angleCanvas: HTMLCanvasElement | null = null;
  private busterIcon: HTMLImageElement | null = null;
  private clouds: Array<{ x: number; y: number; r: number }> = [];
  private trees: Array<{ x: number; trunkH: number; canopyR: number; color: string }> = [];
  private hitTargetBuilding: boolean = false;
  private isRunning: boolean = false;
  private runPhase: 'backup' | 'forward' | 'ramp' = 'backup';
  private runSpeed: number = 0;
  private busterRunBody: Matter.Body | null = null;

  private readonly WORLD_WIDTH = 18000;
  private readonly WORLD_HEIGHT = 1000;
  private readonly BUSTER_START_X = 1675;
  private readonly RAMP_START_X = 2025;
  private readonly BUILDINGS_START_X = 5300;
  private readonly NUM_BUILDINGS = 30;

  constructor() {
    this.canvas = document.getElementById('game-canvas') as HTMLCanvasElement;

    this.engine = Engine.create({
      gravity: { x: 0, y: 1, scale: 0.004 }
    });

    this.engine.timing.timeScale = 0.9;

    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    this.render = Render.create({
      canvas: this.canvas,
      engine: this.engine,
      options: {
        width: viewportWidth,
        height: viewportHeight,
        wireframes: false,
        background: 'transparent'
      }
    });

    this.runner = Runner.create();

    const minIndex = Math.floor(this.NUM_BUILDINGS / 2);
    const maxIndex = this.NUM_BUILDINGS - 2;
    this.targetBuildingIndex = Math.floor(Math.random() * (maxIndex - minIndex + 1)) + minIndex;

    const img = new Image();
    img.src = '/buster-icon.png';
    img.onload = () => { this.busterIcon = img; };

    // Trees scattered across the playing field
    const fieldEnd = this.BUILDINGS_START_X + (this.NUM_BUILDINGS - 1) * 1000 + 800;
    const treeColors = ['#1B5E20', '#2E7D32', '#33691E', '#388E3C', '#1A3A1A'];
    for (let i = 0; i < 60; i++) {
      this.trees.push({
        x: Math.random() * fieldEnd,
        trunkH: 100 + Math.random() * 250,
        canopyR: 80 + Math.random() * 140,
        color: treeColors[Math.floor(Math.random() * treeColors.length)]
      });
    }

    // Clouds across the full playing field width
    for (let i = 0; i < 50; i++) {
      this.clouds.push({
        x: Math.random() * (fieldEnd + 2000),
        y: -1500 - Math.random() * 2000,
        r: 100 + Math.random() * 200
      });
    }

    this.setupLevel();
    this.setupControls();
    this.setupBackground();
    this.setupCamera();
    this.setupPhysicsEvents();

    Render.run(this.render);
    Runner.run(this.runner, this.engine);

    this.startSpeedMeter();
    this.setupAngleArc();
    this.setupSplash();

    window.addEventListener('resize', () => this.handleResize());
  }

  private setupBackground() {
    const groundY = this.WORLD_HEIGHT - 100;
    const darkAltitude = -8000;
    const skyColor = (worldY: number) => {
      const t = Math.max(0, Math.min(1, (groundY - worldY) / (groundY - darkAltitude)));
      const r = Math.round(135 - t * (135 - 30));
      const g = Math.round(206 - t * (206 - 50));
      const b = Math.round(235 - t * (235 - 90));
      return `rgb(${r},${g},${b})`;
    };

    Events.on(this.render, 'afterRender', () => {
      const ctx = this.render.context;
      const canvas = this.render.canvas;
      const bounds = this.render.bounds;
      const scaleX = canvas.width  / (bounds.max.x - bounds.min.x);
      const scaleY = canvas.height / (bounds.max.y - bounds.min.y);

      ctx.save();
      ctx.globalCompositeOperation = 'destination-over';

      // Trees behind buildings
      const gY = (groundY - bounds.min.y) * scaleY;
      for (const tree of this.trees) {
        const tx = (tree.x - bounds.min.x) * scaleX;
        if (tx < -tree.canopyR * scaleX * 2 || tx > canvas.width + tree.canopyR * scaleX * 2) continue;
        const trunkPx = tree.trunkH * scaleY;
        const canopyPx = tree.canopyR * scaleX;
        const trunkW = Math.max(2, 18 * scaleX);
        ctx.fillStyle = '#5D4037';
        ctx.fillRect(tx - trunkW / 2, gY - trunkPx, trunkW, trunkPx);
        ctx.fillStyle = tree.color;
        ctx.beginPath();
        ctx.arc(tx, gY - trunkPx, canopyPx, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = tree.color + 'cc';
        ctx.beginPath();
        ctx.arc(tx - canopyPx * 0.3, gY - trunkPx - canopyPx * 0.4, canopyPx * 0.65, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(tx + canopyPx * 0.3, gY - trunkPx - canopyPx * 0.3, canopyPx * 0.6, 0, Math.PI * 2);
        ctx.fill();
      }

      // Clouds
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      for (const cloud of this.clouds) {
        const sx = (cloud.x - bounds.min.x) * scaleX;
        const sy = (cloud.y - bounds.min.y) * scaleY;
        const sr = cloud.r * scaleX;
        if (sx + sr * 2.5 < 0 || sx - sr * 2.5 > canvas.width) continue;
        ctx.beginPath();
        ctx.arc(sx,            sy,            sr,       0, Math.PI * 2);
        ctx.arc(sx + sr * 1.2, sy - sr * 0.4, sr * 0.8, 0, Math.PI * 2);
        ctx.arc(sx + sr * 2.2, sy,            sr * 0.9, 0, Math.PI * 2);
        ctx.fill();
      }

      // Sky gradient
      const groundScreenY = (groundY - bounds.min.y) * scaleY;
      const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
      const groundStop = Math.max(0, Math.min(1, groundScreenY / canvas.height));
      if (groundStop > 0) grad.addColorStop(0, skyColor(bounds.min.y));
      grad.addColorStop(groundStop, skyColor(groundY));
      if (groundStop < 1) grad.addColorStop(1, skyColor(groundY));
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.restore();
    });
  }

  private setupLevel() {
    this.ground = Bodies.rectangle(
      this.WORLD_WIDTH / 2,
      this.WORLD_HEIGHT - 50,
      this.WORLD_WIDTH * 5,
      100,
      {
        isStatic: true,
        render: { fillStyle: '#8B4513' }
      }
    );

    this.createBuster();
    this.createRamp();
    this.createBuildings();

    Composite.add(this.engine.world, [this.ground]);
  }

  private createBuster() {
    const headRadius = 20;
    const bodyWidth = 30;
    const bodyHeight = 50;
    const limbWidth = 10;
    const limbLength = 40;

    const busterX = this.BUSTER_START_X;
    const groundY = this.WORLD_HEIGHT - 100;
    const busterY = groundY - 60;

    // Single body used during run-up — sprite will be attached here
    this.busterRunBody = Bodies.rectangle(busterX, busterY, bodyWidth, bodyHeight + headRadius * 2, {
      isStatic: true,
      friction: 0.5,
      render: { fillStyle: '#FF6347' },
      label: 'busterRunBody'
    });

    Composite.add(this.engine.world, this.busterRunBody);

    // Ragdoll — created but NOT added to world yet, added at launch
    const head = Bodies.circle(busterX, busterY - 40, headRadius, {
      render: { fillStyle: 'transparent', opacity: 0 }
    });

    const torso = Bodies.rectangle(busterX, busterY, bodyWidth, bodyHeight, {
      render: { fillStyle: '#FF6347' }
    });

    this.buster = Body.create({
      parts: [torso, head],
      friction: 0.5,
      restitution: 0.3,
      density: 0.008,
      frictionAir: 0.001
    });

    const leftArm = Bodies.rectangle(busterX - 20, busterY - 10, limbWidth, limbLength, {
      render: { fillStyle: '#FF6347' },
      friction: 0.5,
      restitution: 0.3,
      density: 0.006,
      frictionAir: 0.001
    });

    const rightArm = Bodies.rectangle(busterX + 20, busterY - 10, limbWidth, limbLength, {
      render: { fillStyle: '#FF6347' },
      friction: 0.5,
      restitution: 0.3,
      density: 0.006,
      frictionAir: 0.001
    });

    const leftLeg = Bodies.rectangle(busterX - 10, busterY + 45, limbWidth, limbLength, {
      render: { fillStyle: '#4169E1' },
      friction: 0.5,
      restitution: 0.3,
      density: 0.006,
      frictionAir: 0.001
    });

    const rightLeg = Bodies.rectangle(busterX + 10, busterY + 45, limbWidth, limbLength, {
      render: { fillStyle: '#4169E1' },
      friction: 0.5,
      restitution: 0.3,
      density: 0.006,
      frictionAir: 0.001
    });

    this.busterLimbs = [leftArm, rightArm, leftLeg, rightLeg];

    const leftArmConstraint = Constraint.create({
      bodyA: this.buster,
      bodyB: leftArm,
      pointA: { x: -15, y: -10 },
      pointB: { x: 0, y: -limbLength / 2 },
      stiffness: 0.6,
      length: 5,
      render: { visible: false }
    });

    const rightArmConstraint = Constraint.create({
      bodyA: this.buster,
      bodyB: rightArm,
      pointA: { x: 15, y: -10 },
      pointB: { x: 0, y: -limbLength / 2 },
      stiffness: 0.6,
      length: 5,
      render: { visible: false }
    });

    const leftLegConstraint = Constraint.create({
      bodyA: this.buster,
      bodyB: leftLeg,
      pointA: { x: -10, y: 25 },
      pointB: { x: 0, y: -limbLength / 2 },
      stiffness: 0.6,
      length: 5,
      render: { visible: false }
    });

    const rightLegConstraint = Constraint.create({
      bodyA: this.buster,
      bodyB: rightLeg,
      pointA: { x: 10, y: 25 },
      pointB: { x: 0, y: -limbLength / 2 },
      stiffness: 0.6,
      length: 5,
      render: { visible: false }
    });

    this.limbConstraints = [leftArmConstraint, rightArmConstraint, leftLegConstraint, rightLegConstraint];
    // Ragdoll is added to world in launchBuster()
  }

  private createRamp() {
    this.updateRamp();
  }

  private updateRamp() {
    if (this.ramp) {
      Composite.remove(this.engine.world, this.ramp);
    }
    if (this.rampPlank) {
      Composite.remove(this.engine.world, this.rampPlank);
    }

    const rampSlantLength = 600;
    const angleRad = -(this.rampAngle * Math.PI) / 180;
    const groundY = this.WORLD_HEIGHT - 100;

    const rampLength = Math.abs(Math.cos(angleRad) * rampSlantLength);
    const wedgeHeight = Math.abs(Math.sin(angleRad) * rampSlantLength);

    const vertices = [
      { x: 0, y: 0 },
      { x: rampLength, y: 0 },
      { x: rampLength, y: -wedgeHeight }
    ];

    const centerX = this.RAMP_START_X + (2 * rampLength) / 3;
    const centerY = groundY - wedgeHeight / 3;

    this.ramp = Bodies.fromVertices(centerX, centerY, [vertices], {
      isStatic: true,
      render: { fillStyle: '#654321' }
    });

    // Plank along the hypotenuse
    const plankMidX = this.RAMP_START_X + rampLength / 2;
    const plankMidY = groundY - wedgeHeight / 2;

    this.rampPlank = Bodies.rectangle(plankMidX, plankMidY, rampSlantLength, 12, {
      isStatic: true,
      angle: angleRad,
      render: { fillStyle: '#8B5E3C' }
    });

    Composite.add(this.engine.world, [this.ramp, this.rampPlank]);
  }

  private createBuildings() {
    const buildingSpacing = 1000;
    const buildingWidths = [300, 400, 500, 600, 700, 800];

    for (let i = 0; i < this.NUM_BUILDINGS; i++) {
      const x = this.BUILDINGS_START_X + i * buildingSpacing;
      const isTarget = i === this.targetBuildingIndex;

      const buildingWidth = buildingWidths[Math.floor(Math.random() * buildingWidths.length)];

      const buildingHeights = [600, 800, 1000, 1200, 1400, 1600];

      let height;
      if (isTarget) {
        height = 2000;
      } else {
        height = buildingHeights[Math.floor(Math.random() * buildingHeights.length)];
      }

      if (isTarget) {
        this.createBrickBuilding(x, buildingWidth, height, true);
      } else {
        const buildingY = this.WORLD_HEIGHT - 100 - height / 2;
        const building = Bodies.rectangle(x + buildingWidth / 2, buildingY, buildingWidth, height, {
          isStatic: true,
          render: {
            fillStyle: '#A0A0A0',
            strokeStyle: '#000',
            lineWidth: 2
          },
          friction: 0.8,
          restitution: 0.4,
          label: `building_${i}`
        });

        this.buildings.push(building);
        Composite.add(this.engine.world, building);
      }
    }
  }

  private createBrickBuilding(x: number, width: number, height: number, isTarget: boolean) {
    const brickWidth = 100;
    const brickHeight = 60;
    const groundY = this.WORLD_HEIGHT - 100;

    const cols = Math.floor(width / brickWidth);
    const rows = Math.floor(height / brickHeight);

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const brickX = x + col * brickWidth + brickWidth / 2;
        const brickY = groundY - row * brickHeight - brickHeight / 2;

        const brick = Bodies.rectangle(brickX, brickY, brickWidth, brickHeight, {
          isStatic: true,
          render: {
            fillStyle: isTarget ? '#FF0000' : '#A0A0A0',
            strokeStyle: '#000',
            lineWidth: 1
          },
          friction: 0.8,
          restitution: 0.05,
          density: 0.002,
          frictionAir: 0.15,
          label: isTarget ? 'target_brick' : 'brick'
        });

        if (isTarget) {
          this.targetBuilding.push(brick);
        } else {
          this.buildingBricks.push(brick);
        }

        Composite.add(this.engine.world, brick);
      }
    }
  }


  private explodeBuilding(building: Matter.Body) {
    const buildingBounds = building.bounds;
    const buildingX = (buildingBounds.min.x + buildingBounds.max.x) / 2;
    const buildingWidth = buildingBounds.max.x - buildingBounds.min.x;
    const buildingHeight = buildingBounds.max.y - buildingBounds.min.y;

    Composite.remove(this.engine.world, building);

    const index = this.buildings.indexOf(building);
    if (index > -1) {
      this.buildings.splice(index, 1);
    }

    this.createBrickBuilding(buildingX - buildingWidth / 2, buildingWidth, buildingHeight, false);

    const centerX = (buildingBounds.min.x + buildingBounds.max.x) / 2;
    const centerY = (buildingBounds.min.y + buildingBounds.max.y) / 2;

    this.buildingBricks.forEach(brick => {
      if (brick.position.x >= buildingBounds.min.x - 50 &&
          brick.position.x <= buildingBounds.max.x + 50 &&
          brick.position.y >= buildingBounds.min.y - 50 &&
          brick.position.y <= buildingBounds.max.y + 50) {

        Body.setStatic(brick, false);

        const dx = brick.position.x - centerX;
        const dy = brick.position.y - centerY;
        const angle = Math.atan2(dy, dx);

        const explosionForce = 25;
        const randomMagnitude = 0.7 + Math.random() * 0.6;

        const forceX = Math.cos(angle) * explosionForce * randomMagnitude;
        const forceY = Math.sin(angle) * explosionForce * randomMagnitude;

        Body.setVelocity(brick, { x: forceX, y: forceY });
        Body.setAngularVelocity(brick, (Math.random() - 0.5) * 0.4);
      }
    });
  }

  private setupCamera() {
    Events.on(this.render, 'afterRender', () => {
      // Draw sprite FIRST using the same bounds the physics bodies were just rendered with.
      // Updating the camera (Render.lookAt) changes render.bounds — doing that before
      // drawing the sprite causes a one-frame offset that makes the sprite appear disconnected.
      this.drawBusterSprite();

      if (!this.gameStarted && this.introAnimationPhase >= 0 && this.introAnimationPhase < 4) {
        this.updateIntroAnimation();
      } else if (!this.gameStarted && !this.initialViewSet && this.introAnimationPhase === 4) {
        const buildingSpacing = 1000;
        const buildingWidths = [300, 400, 500, 600, 700, 800];
        const maxBuildingWidth = Math.max(...buildingWidths);

        const lastBuildingEnd = this.BUILDINGS_START_X + (this.NUM_BUILDINGS - 1) * buildingSpacing + maxBuildingWidth;

        const padding = 500;
        const minX = this.BUSTER_START_X - padding;
        const maxX = lastBuildingEnd + padding;

        const viewWidth = maxX - minX;
        const aspectRatio = this.render.canvas.width / this.render.canvas.height;
        const viewHeight = viewWidth / aspectRatio;

        const centerX = (minX + maxX) / 2;
        const centerY = this.WORLD_HEIGHT / 2;

        Render.lookAt(this.render, {
          min: { x: centerX - viewWidth / 2, y: centerY - viewHeight / 2 },
          max: { x: centerX + viewWidth / 2, y: centerY + viewHeight / 2 }
        });

        this.initialViewSet = true;
      } else if (this.isZooming) {
        const elapsed = Date.now() - this.zoomStartTime;
        const progress = Math.min(elapsed / this.zoomDuration, 1);
        const eased = this.easeInOutCubic(progress);

        const minX = this.zoomStartBounds.minX + (this.zoomEndBounds.minX - this.zoomStartBounds.minX) * eased;
        const maxX = this.zoomStartBounds.maxX + (this.zoomEndBounds.maxX - this.zoomStartBounds.maxX) * eased;
        const minY = this.zoomStartBounds.minY + (this.zoomEndBounds.minY - this.zoomStartBounds.minY) * eased;
        const maxY = this.zoomStartBounds.maxY + (this.zoomEndBounds.maxY - this.zoomStartBounds.maxY) * eased;

        Render.lookAt(this.render, {
          min: { x: minX, y: minY },
          max: { x: maxX, y: maxY }
        });

        if (progress >= 1) {
          this.isZooming = false;
        }
      } else if (this.runComplete && this.outroAnimationStarted) {
        this.updateOutroAnimation();
      } else if (this.gameStarted && !this.isZooming) {
        const followBody = this.busterRunBody ?? this.buster;
        if (!followBody) return;
        const busterX = followBody.position.x;
        const busterY = followBody.position.y;
        const worldWidth = 2000;
        const aspectRatio = this.render.canvas.width / this.render.canvas.height;
        const worldHeight = worldWidth / aspectRatio;

        Render.lookAt(this.render, {
          min: { x: busterX - worldWidth / 2, y: busterY - worldHeight / 2 },
          max: { x: busterX + worldWidth / 2, y: busterY + worldHeight / 2 }
        });
      }
    });
  }

  private drawBusterSprite() {
    if (!this.busterIcon) return;

    const bounds = this.render.bounds;
    const canvas = this.render.canvas;
    const ctx = this.render.context;
    const scaleX = canvas.width / (bounds.max.x - bounds.min.x);
    const scaleY = canvas.height / (bounds.max.y - bounds.min.y);
    const headRadius = 20;
    const size = headRadius * 2 * scaleX;

    const toScreen = (wx: number, wy: number) => ({
      x: (wx - bounds.min.x) * scaleX,
      y: (wy - bounds.min.y) * scaleY
    });

    const headYOffset = 40; // head is 40 world units above the run body center

    if (this.isRunning && this.busterRunBody) {
      const { x, y } = toScreen(this.busterRunBody.position.x, this.busterRunBody.position.y - headYOffset);
      ctx.save();
      ctx.translate(x, y);
      ctx.drawImage(this.busterIcon, -size / 2, -size / 2, size, size);
      ctx.restore();
    } else if (this.buster && this.buster.parts.length > 2) {
      // Draw at head part position, rotated with the body
      const head = this.buster.parts[2];
      const { x, y } = toScreen(head.position.x, head.position.y);
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(head.angle);
      ctx.drawImage(this.busterIcon, -size / 2, -size / 2, size, size);
      ctx.restore();
    }
  }

  private easeInOutCubic(t: number): number {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  private setupSplash() {
    const splash = document.getElementById('splash')!;
    const playBtn = document.getElementById('play-btn')!;

    // Fade in on next frame so the CSS transition fires
    requestAnimationFrame(() => {
      splash.style.opacity = '1';
    });

    playBtn.addEventListener('click', () => {
      splash.style.opacity = '0';
      setTimeout(() => { splash.style.display = 'none'; }, 600);
      this.startIntroAnimation();
    });
  }

  private startIntroAnimation() {
    this.introAnimationPhase = 0;
    this.introAnimationStartTime = Date.now();
  }

  private startOutroAnimation() {
    this.outroAnimationStarted = true;
    this.outroAnimationStartTime = Date.now();
    this.outroStartBounds = {
      minX: this.render.bounds.min.x,
      maxX: this.render.bounds.max.x,
      minY: this.render.bounds.min.y,
      maxY: this.render.bounds.max.y
    };
  }

  private updateOutroAnimation() {
    const elapsed = Date.now() - this.outroAnimationStartTime;
    const outroDuration = 2000;
    const progress = Math.min(elapsed / outroDuration, 1);
    const eased = this.easeInOutCubic(progress);

    const buildingSpacing = 1000;
    const buildingWidths = [300, 400, 500, 600, 700, 800];
    const maxBuildingWidth = Math.max(...buildingWidths);
    const lastBuildingEnd = this.BUILDINGS_START_X + (this.NUM_BUILDINGS - 1) * buildingSpacing + maxBuildingWidth;

    const padding = 500;
    const finalMinX = this.BUSTER_START_X - padding;
    const finalMaxX = lastBuildingEnd + padding;
    const finalViewWidth = finalMaxX - finalMinX;
    const aspectRatio = this.render.canvas.width / this.render.canvas.height;
    const finalViewHeight = finalViewWidth / aspectRatio;
    const finalCenterX = (finalMinX + finalMaxX) / 2;
    const finalCenterY = this.WORLD_HEIGHT / 2;

    const startMinX = this.outroStartBounds.minX;
    const startMaxX = this.outroStartBounds.maxX;
    const startMinY = this.outroStartBounds.minY;
    const startMaxY = this.outroStartBounds.maxY;

    const currentMinX = startMinX + (finalCenterX - finalViewWidth / 2 - startMinX) * eased;
    const currentMaxX = startMaxX + (finalCenterX + finalViewWidth / 2 - startMaxX) * eased;
    const currentMinY = startMinY + (finalCenterY - finalViewHeight / 2 - startMinY) * eased;
    const currentMaxY = startMaxY + (finalCenterY + finalViewHeight / 2 - startMaxY) * eased;

    Render.lookAt(this.render, {
      min: { x: currentMinX, y: currentMinY },
      max: { x: currentMaxX, y: currentMaxY }
    });
  }

  private updateIntroAnimation() {
    const elapsed = Date.now() - this.introAnimationStartTime;
    const buildingSpacing = 1000;
    const targetBuildingX = this.BUILDINGS_START_X + this.targetBuildingIndex * buildingSpacing + 400;

    const tightWidth = 1500;
    const aspectRatio = this.render.canvas.width / this.render.canvas.height;
    const tightHeight = tightWidth / aspectRatio;
    const groundY = this.WORLD_HEIGHT - 100;
    const targetCenterY = groundY - 400;

    const buildingWidths = [300, 400, 500, 600, 700, 800];
    const maxBuildingWidth = Math.max(...buildingWidths);
    const lastBuildingEnd = this.BUILDINGS_START_X + (this.NUM_BUILDINGS - 1) * buildingSpacing + maxBuildingWidth;
    const padding = 500;
    const finalMinX = this.BUSTER_START_X - padding;
    const finalMaxX = lastBuildingEnd + padding;
    const finalViewWidth = finalMaxX - finalMinX;
    const finalViewHeight = finalViewWidth / aspectRatio;
    const finalCenterX = (finalMinX + finalMaxX) / 2;
    const finalCenterY = this.WORLD_HEIGHT / 2;

    if (this.introAnimationPhase === 0) {
      // Hold tight on target building briefly
      Render.lookAt(this.render, {
        min: { x: targetBuildingX - tightWidth / 2, y: targetCenterY - tightHeight / 2 },
        max: { x: targetBuildingX + tightWidth / 2, y: targetCenterY + tightHeight / 2 }
      });

      if (elapsed >= 800) {
        this.introAnimationPhase = 1;
        this.introAnimationStartTime = Date.now();
      }
    } else if (this.introAnimationPhase === 1) {
      // Zoom out to full playing field
      const zoomDuration = 2500;
      const progress = Math.min(elapsed / zoomDuration, 1);
      const eased = this.easeInOutCubic(progress);

      const currentCenterX = targetBuildingX + (finalCenterX - targetBuildingX) * eased;
      const currentCenterY = targetCenterY  + (finalCenterY  - targetCenterY)  * eased;
      const currentViewWidth  = tightWidth  + (finalViewWidth  - tightWidth)  * eased;
      const currentViewHeight = tightHeight + (finalViewHeight - tightHeight) * eased;

      Render.lookAt(this.render, {
        min: { x: currentCenterX - currentViewWidth / 2,  y: currentCenterY - currentViewHeight / 2 },
        max: { x: currentCenterX + currentViewWidth / 2,  y: currentCenterY + currentViewHeight / 2 }
      });

      if (progress >= 1) {
        this.introAnimationPhase = 4;
        document.getElementById('left-panel')!.style.display = 'flex';
        document.getElementById('right-panel')!.style.display = 'flex';
      }
    }
  }

  private setupPhysicsEvents() {
    Events.on(this.engine, 'beforeUpdate', () => {
      if (this.isRunning && this.busterRunBody) {
        const pos = this.busterRunBody.position;
        const groundY = this.WORLD_HEIGHT - 100;
        const busterGroundY = groundY - 60;
        const angleRad = -(this.rampAngle * Math.PI) / 180;
        const rampSlantLength = 600;
        const rampLength = Math.abs(Math.cos(angleRad) * rampSlantLength);

        if (this.runPhase === 'backup') {
          const backupTarget = this.BUSTER_START_X - 2000;
          Body.setPosition(this.busterRunBody, { x: pos.x - 5, y: busterGroundY });
          Body.setVelocity(this.busterRunBody, { x: -5, y: 0 });
          Body.setAngle(this.busterRunBody, 0);
          Body.setAngularVelocity(this.busterRunBody, 0);
          if (pos.x <= backupTarget) {
            this.runPhase = 'forward';
            this.runSpeed = 2;
          }
        } else if (this.runPhase === 'forward') {
          this.runSpeed = Math.min(this.runSpeed + 0.4, 50);
          Body.setPosition(this.busterRunBody, { x: pos.x + this.runSpeed, y: busterGroundY });
          Body.setVelocity(this.busterRunBody, { x: this.runSpeed, y: 0 });
          Body.setAngle(this.busterRunBody, 0);
          Body.setAngularVelocity(this.busterRunBody, 0);

          if (pos.x >= this.RAMP_START_X) {
            this.runPhase = 'ramp';
          }
        } else if (this.runPhase === 'ramp') {
          const dx = Math.cos(angleRad) * this.runSpeed;
          const dy = Math.sin(angleRad) * this.runSpeed;
          Body.setPosition(this.busterRunBody, { x: pos.x + dx, y: pos.y + dy });
          Body.setVelocity(this.busterRunBody, { x: dx, y: dy });
          Body.setAngle(this.busterRunBody, angleRad);
          Body.setAngularVelocity(this.busterRunBody, 0);

          if (pos.x >= this.RAMP_START_X + rampLength) {
            this.isRunning = false;
            this.launchBuster();
          }
        }
      }

      if (this.isFlying && this.buster) {
        Body.setAngle(this.buster, this.flightAngle);
        Body.setAngularVelocity(this.buster, 0);
      }
    });

    Events.on(this.engine, 'collisionStart', (event) => {
      const pairs = event.pairs;

      for (const pair of pairs) {
        const bodyA = pair.bodyA;
        const bodyB = pair.bodyB;

        const isBusterPart = (body: Matter.Body) => {
          return body.parent === this.buster || body === this.buster;
        };

        const isBuilding = (body: Matter.Body) => {
          return this.buildings.includes(body);
        };

        const isTargetBrick = (body: Matter.Body) => {
          return this.targetBuilding.includes(body);
        };

        const isTargetBrickDynamic = (body: Matter.Body) => {
          return this.targetBuilding.includes(body) && !body.isStatic;
        };

        const busterHitTargetBrick =
          (isBusterPart(bodyA) && isTargetBrick(bodyB)) ||
          (isBusterPart(bodyB) && isTargetBrick(bodyA));

        if (busterHitTargetBrick && this.buster) {
          this.hitTargetBuilding = true;
          const impactPoint = isBusterPart(bodyA) ? bodyB.position : bodyA.position;
          const busterVelocity = this.buster.velocity;

          this.targetBuilding.forEach(brick => {
            Body.setStatic(brick, false);

            const dx = brick.position.x - impactPoint.x;
            const dy = brick.position.y - impactPoint.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            const angle = Math.atan2(dy, dx);

            const falloff = Math.max(0.1, 1 - distance / 800);
            const momentumTransfer = 0.6;

            const velocityX = busterVelocity.x * momentumTransfer * falloff + Math.cos(angle) * 10 * falloff;
            const velocityY = busterVelocity.y * momentumTransfer * falloff + Math.sin(angle) * 10 * falloff;

            Body.setVelocity(brick, { x: velocityX, y: velocityY });
          });
        }

        const isBuildingBrickDynamic = (body: Matter.Body) => {
          return this.buildingBricks.includes(body) && !body.isStatic;
        };

        const targetBrickHitBuilding =
          (isTargetBrickDynamic(bodyA) && isBuilding(bodyB)) ||
          (isTargetBrickDynamic(bodyB) && isBuilding(bodyA));

        const buildingBrickHitBuilding =
          (isBuildingBrickDynamic(bodyA) && isBuilding(bodyB)) ||
          (isBuildingBrickDynamic(bodyB) && isBuilding(bodyA));

        if (targetBrickHitBuilding) {
          const brick = isTargetBrickDynamic(bodyA) ? bodyA : bodyB;
          const building = isBuilding(bodyA) ? bodyA : bodyB;

          const velocity = brick.velocity;
          const speed = Math.sqrt(velocity.x * velocity.x + velocity.y * velocity.y);

          if (speed > 2.125) {
            this.explodeBuilding(building);
          }
        }

        if (buildingBrickHitBuilding) {
          const brick = isBuildingBrickDynamic(bodyA) ? bodyA : bodyB;
          const building = isBuilding(bodyA) ? bodyA : bodyB;

          const velocity = brick.velocity;
          const speed = Math.sqrt(velocity.x * velocity.x + velocity.y * velocity.y);

          if (speed > 2.125) {
            this.explodeBuilding(building);
          }
        }
      }

      if (!this.limbsBroken && this.gameStarted && this.buster) {
        for (const pair of pairs) {
          const bodyA = pair.bodyA;
          const bodyB = pair.bodyB;

          const isBusterPart = (body: Matter.Body) => {
            return body.parent === this.buster || body === this.buster;
          };

          const isBuilding = (body: Matter.Body) => {
            return this.buildings.includes(body);
          };

          const isTargetBrick = (body: Matter.Body) => {
            return this.targetBuilding.includes(body);
          };

          const busterHitBuilding =
            (isBusterPart(bodyA) && isBuilding(bodyB)) ||
            (isBusterPart(bodyB) && isBuilding(bodyA));

          const busterHitGround =
            (isBusterPart(bodyA) && bodyB === this.ground) ||
            (isBusterPart(bodyB) && bodyA === this.ground);

          const busterHitTargetBrick =
            (isBusterPart(bodyA) && isTargetBrick(bodyB)) ||
            (isBusterPart(bodyB) && isTargetBrick(bodyA));

          if (busterHitBuilding || busterHitGround || busterHitTargetBrick) {
            this.limbsBroken = true;

            this.limbConstraints.forEach(constraint => {
              Composite.remove(this.engine.world, constraint);
            });

            this.isFlying = false;

            if (!this.firstImpact) {
              this.firstImpact = true;

              if (this.failsafeTimeout !== null) {
                clearTimeout(this.failsafeTimeout);
                this.failsafeTimeout = null;
              }

              this.impactTimeout = window.setTimeout(() => {
                if (!this.runComplete) {
                  this.runComplete = true;
                  this.startOutroAnimation();

                  // If didn't hit target building, show dialog after outro animation completes
                  if (!this.hitTargetBuilding) {
                    this.impactTimeout = window.setTimeout(() => {
                      const resetModal = document.getElementById('reset-modal')!;
                      resetModal.style.display = 'flex';
                    }, 2000);
                  }
                }
              }, 2000);
            }

            break;
          }
        }
      }
    });
  }

  private setupControls() {
    const startBtn = document.getElementById('start-btn')!;

    startBtn.addEventListener('click', () => {
      if (!this.gameStarted) {
        this.startRun();
        (startBtn as HTMLButtonElement).disabled = true;
        document.getElementById('left-panel')!.style.display = 'none';
        document.getElementById('right-panel')!.style.display = 'none';
      }
    });

    const resetBtn = document.getElementById('reset-btn')!;
    resetBtn.addEventListener('click', () => {
      this.resetGame();
    });
  }

  private resetGame() {
    // Clear pending timers
    if (this.failsafeTimeout !== null)   { clearTimeout(this.failsafeTimeout);   this.failsafeTimeout = null; }
    if (this.brickSettleTimeout !== null) { clearTimeout(this.brickSettleTimeout); this.brickSettleTimeout = null; }
    if (this.impactTimeout !== null)      { clearTimeout(this.impactTimeout);      this.impactTimeout = null; }
    if (this.speedInterval !== null)      { clearInterval(this.speedInterval);     this.speedInterval = null; }

    // Remove accumulated Matter.js event handlers
    Events.off(this.engine, 'beforeUpdate');
    Events.off(this.engine, 'collisionStart');
    Events.off(this.render, 'beforeRender');
    Events.off(this.render, 'afterRender');

    // Clear the physics world
    Composite.clear(this.engine.world, false);

    // Reset arrays
    this.buildings = []; this.buildingBricks = []; this.targetBuilding = [];
    this.busterLimbs = []; this.limbConstraints = [];

    // Reset bodies
    this.buster = null; this.busterRunBody = null;
    this.ramp = null; this.rampPlank = null; this.ground = null;

    // Reset all state flags
    this.gameStarted = false; this.initialViewSet = false;
    this.isFlying = false; this.flightAngle = 0;
    this.isZooming = false;
    this.runComplete = false; this.limbsBroken = false;
    this.introAnimationPhase = -1;
    this.outroAnimationStarted = false;
    this.firstImpact = false; this.hitTargetBuilding = false;
    this.isRunning = false; this.runPhase = 'backup'; this.runSpeed = 0;
    this.speed = 50; this.speedIncreasing = true;

    // New random target building
    const minIndex = Math.floor(this.NUM_BUILDINGS / 2);
    const maxIndex = this.NUM_BUILDINGS - 2;
    this.targetBuildingIndex = Math.floor(Math.random() * (maxIndex - minIndex + 1)) + minIndex;

    // Rebuild world and re-register events
    this.setupLevel();
    this.setupBackground();
    this.setupCamera();
    this.setupPhysicsEvents();
    this.startSpeedMeter();
    this.startIntroAnimation();

    // Reset UI
    document.getElementById('reset-modal')!.style.display = 'none';
    document.getElementById('left-panel')!.style.display = 'none';
    document.getElementById('right-panel')!.style.display = 'none';
    const startBtn = document.getElementById('start-btn')! as HTMLButtonElement;
    startBtn.style.display = 'block';
    startBtn.disabled = false;
  }

  private setupAngleArc() {
    this.angleCanvas = document.getElementById('angle-canvas') as HTMLCanvasElement;
    const ac = this.angleCanvas;
    const ctx = ac.getContext('2d')!;

    const arcCX = ac.width - 105;
    const arcCY = ac.height;
    const arcR  = 85;

    const drawPanel = () => {
      ctx.clearRect(0, 0, ac.width, ac.height);
      ctx.save();

      // Arc track
      const startAngle = (Math.PI / 180) * (10 - 90);
      const endAngle   = (Math.PI / 180) * (80 - 90);
      ctx.strokeStyle = 'rgba(255,255,255,0.4)';
      ctx.lineWidth = 10;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.arc(arcCX, arcCY, arcR, startAngle, endAngle);
      ctx.stroke();

      // Handle
      const handleAngle = -(Math.PI / 180) * this.rampAngle;
      const hx = arcCX + Math.cos(handleAngle) * arcR;
      const hy = arcCY + Math.sin(handleAngle) * arcR;
      ctx.fillStyle = '#ff9800';
      ctx.beginPath();
      ctx.arc(hx, hy, 14, 0, Math.PI * 2);
      ctx.fill();

      // Ramp preview (left side of canvas, bottom-aligned)
      this.drawRampPreview(ctx, ac.width, ac.height);

      ctx.restore();

      requestAnimationFrame(drawPanel);
    };

    drawPanel();

    const getLocalPos = (clientX: number, clientY: number) => {
      const rect = ac.getBoundingClientRect();
      const scaleX = ac.width / rect.width;
      const scaleY = ac.height / rect.height;
      return {
        x: (clientX - rect.left) * scaleX,
        y: (clientY - rect.top) * scaleY
      };
    };

    const onDown = (clientX: number, clientY: number) => {
      if (this.gameStarted) return;
      const { x, y } = getLocalPos(clientX, clientY);
      const hAngle = -(Math.PI / 180) * this.rampAngle;
      const hx = arcCX + Math.cos(hAngle) * arcR;
      const hy = arcCY + Math.sin(hAngle) * arcR;
      if (Math.hypot(x - hx, y - hy) < 40) this.isDraggingAngle = true;
    };

    const onMove = (clientX: number, clientY: number) => {
      if (!this.isDraggingAngle) return;
      const { x, y } = getLocalPos(clientX, clientY);
      const dx = x - arcCX;
      const dy = y - arcCY;
      let degrees = Math.atan2(dy, dx) * (180 / Math.PI) + 90;
      degrees = Math.max(10, Math.min(80, degrees));
      this.rampAngle = Math.round(90 - degrees);
      this.updateRamp();
    };

    ac.addEventListener('mousedown', (e) => onDown(e.clientX, e.clientY));
    ac.addEventListener('mousemove', (e) => onMove(e.clientX, e.clientY));
    ac.addEventListener('mouseup', () => { this.isDraggingAngle = false; });
    ac.addEventListener('mouseleave', () => { this.isDraggingAngle = false; });

    ac.addEventListener('touchstart', (e) => { e.preventDefault(); onDown(e.touches[0].clientX, e.touches[0].clientY); }, { passive: false });
    ac.addEventListener('touchmove',  (e) => { e.preventDefault(); onMove(e.touches[0].clientX, e.touches[0].clientY); }, { passive: false });
    ac.addEventListener('touchend',   () => { this.isDraggingAngle = false; });
  }

  private drawRampPreview(ctx: CanvasRenderingContext2D, _canvasW: number, canvasH: number) {
    const groundY  = canvasH - 8;
    const maxH     = canvasH - 16;
    const maxW     = 110;
    const angleRad = -(this.rampAngle * Math.PI) / 180;

    // Scale slant so 80° fits in maxH and any angle fits in maxW
    const slantByH = maxH / Math.sin((80 * Math.PI) / 180);
    const slantByW = maxW / Math.cos((10 * Math.PI) / 180);
    const slant = Math.min(slantByH, slantByW);

    const w = Math.abs(Math.cos(angleRad) * slant);
    const h = Math.abs(Math.sin(angleRad) * slant);
    const baseX = 10;

    // Ground line
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, groundY);
    ctx.lineTo(baseX + maxW + 10, groundY);
    ctx.stroke();

    // Wedge
    ctx.fillStyle = '#654321';
    ctx.beginPath();
    ctx.moveTo(baseX,     groundY);
    ctx.lineTo(baseX + w, groundY);
    ctx.lineTo(baseX + w, groundY - h);
    ctx.closePath();
    ctx.fill();

    // Plank along hypotenuse
    const midX = baseX + w / 2;
    const midY = groundY - h / 2;
    ctx.save();
    ctx.translate(midX, midY);
    ctx.rotate(angleRad);
    ctx.fillStyle = '#8B5E3C';
    ctx.fillRect(-slant / 2, -4, slant, 8);
    ctx.restore();
  }

  private startSpeedMeter() {
    this.speedInterval = window.setInterval(() => {
      if (!this.gameStarted) {
        if (this.speedIncreasing) {
          this.speed += 4;
          if (this.speed >= 100) {
            this.speed = 100;
            this.speedIncreasing = false;
          }
        } else {
          this.speed -= 4;
          if (this.speed <= 0) {
            this.speed = 0;
            this.speedIncreasing = true;
          }
        }

        const speedBar = document.getElementById('speed-bar')!;
        const speedValue = document.getElementById('speed-value')!;
        speedBar.style.width = `${this.speed}%`;
        speedValue.textContent = `${this.speed}%`;
      }
    }, 50);
  }

  private startRun() {
    this.gameStarted = true;

    if (this.speedInterval) {
      clearInterval(this.speedInterval);
    }

    if (!this.buster || !this.ramp) return;

    this.zoomStartBounds = {
      minX: this.render.bounds.min.x,
      maxX: this.render.bounds.max.x,
      minY: this.render.bounds.min.y,
      maxY: this.render.bounds.max.y
    };

    const busterX = this.buster.position.x;
    const busterY = this.buster.position.y;
    const viewportWidth = this.render.canvas.width;
    const viewportHeight = this.render.canvas.height;

    this.zoomEndBounds = {
      minX: busterX - viewportWidth / 2,
      maxX: busterX + viewportWidth / 2,
      minY: busterY - viewportHeight / 2,
      maxY: busterY + viewportHeight / 2
    };

    this.isZooming = true;
    this.zoomStartTime = Date.now();

    setTimeout(() => {
      this.startRunAnimation();
    }, 1000);
  }

  private startRunAnimation() {
    if (!this.busterRunBody) return;

    Body.setStatic(this.busterRunBody, false);

    this.isRunning = true;
    this.runPhase = 'backup';
    this.runSpeed = 0;
  }

  private launchBuster() {
    if (!this.buster || !this.ramp) return;

    const angleRad = -(this.rampAngle * Math.PI) / 180;

    // Swap run body for ragdoll at the launch position
    if (this.busterRunBody) {
      const launchPos = this.busterRunBody.position;
      Composite.remove(this.engine.world, this.busterRunBody);
      this.busterRunBody = null;

      Body.setPosition(this.buster, { x: launchPos.x, y: launchPos.y });
      this.busterLimbs.forEach((limb, i) => {
        const offsets = [
          { x: -20, y: -10 }, { x: 20, y: -10 },
          { x: -10, y: 45 },  { x: 10, y: 45 }
        ];
        Body.setPosition(limb, { x: launchPos.x + offsets[i].x, y: launchPos.y + offsets[i].y });
      });
    }

    Composite.add(this.engine.world, [this.busterLimbs[0], this.busterLimbs[1], this.busterLimbs[2], this.busterLimbs[3], this.buster]);
    Composite.add(this.engine.world, this.limbConstraints);

    const launchSpeed = (this.speed / 100) * 144 + 64;

    const velocityX = launchSpeed * Math.cos(angleRad);
    const velocityY = launchSpeed * Math.sin(angleRad);

    this.flightAngle = angleRad + (Math.PI / 2);
    this.isFlying = true;

    Body.setAngle(this.buster, this.flightAngle);
    Body.setVelocity(this.buster, { x: velocityX, y: velocityY });
    Body.setAngularVelocity(this.buster, 0);

    this.busterLimbs.forEach(limb => {
      Body.setVelocity(limb, { x: velocityX, y: velocityY });
    });

    this.brickSettleTimeout = window.setTimeout(() => {
      this.brickSettleTimeout = null;
      this.targetBuilding.forEach(brick => {
        if (!brick.isStatic) {
          Body.setVelocity(brick, { x: 0, y: 0 });
          Body.setAngularVelocity(brick, 0);
          Body.setStatic(brick, true);
        }
      });

      this.buildingBricks.forEach(brick => {
        if (!brick.isStatic) {
          Body.setVelocity(brick, { x: 0, y: 0 });
          Body.setAngularVelocity(brick, 0);
          Body.setStatic(brick, true);
        }
      });

      // Show dialog after bricks have settled (only if target was hit)
      if (!this.runComplete) {
        this.runComplete = true;
        this.startOutroAnimation();
      }

      // Only show dialog if target building was hit (otherwise already shown after 2s)
      if (this.hitTargetBuilding) {
        const resetModal = document.getElementById('reset-modal')!;
        resetModal.style.display = 'flex';
      }
    }, 10000);

    this.failsafeTimeout = window.setTimeout(() => {
      if (!this.firstImpact) {
        this.limbsBroken = true;
        this.limbConstraints.forEach(constraint => {
          Composite.remove(this.engine.world, constraint);
        });
        this.isFlying = false;
        this.firstImpact = true;

        this.impactTimeout = window.setTimeout(() => {
          if (!this.runComplete) {
            this.runComplete = true;
            this.startOutroAnimation();
          }
        }, 2000);
      }
    }, 8000);
  }

  private handleResize() {
    this.render.canvas.width = window.innerWidth;
    this.render.canvas.height = window.innerHeight;
    this.render.options.width = window.innerWidth;
    this.render.options.height = window.innerHeight;
    Render.lookAt(this.render, {
      min: { x: this.render.bounds.min.x, y: this.render.bounds.min.y },
      max: { x: this.render.bounds.max.x, y: this.render.bounds.max.y }
    });
  }
}

new BoomBoomBuster();

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js');
}
