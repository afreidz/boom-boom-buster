import { RAMP_MIN_ANGLE, RAMP_MAX_ANGLE } from '../types/GameState';

const ARC_R = 85;
const ARC_CX_OFFSET = 105; // from right of canvas

export class AngleArcWidget {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private angle: number;
  private isDragging = false;
  private onAngleChange: (angle: number) => void;
  private rafId = 0;

  constructor(canvas: HTMLCanvasElement, initialAngle: number, onChange: (angle: number) => void) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.angle = initialAngle;
    this.onAngleChange = onChange;
    this.setupEvents();
    this.draw();
  }

  private get arcCX() { return this.canvas.width - ARC_CX_OFFSET; }
  private get arcCY() { return this.canvas.height; }

  private handleAngle(clientX: number, clientY: number) {
    const rect = this.canvas.getBoundingClientRect();
    const sx = this.canvas.width  / rect.width;
    const sy = this.canvas.height / rect.height;
    const mx = (clientX - rect.left) * sx;
    const my = (clientY - rect.top)  * sy;
    const dx = mx - this.arcCX;
    const dy = my - this.arcCY;
    let deg = Math.atan2(dy, dx) * (180 / Math.PI) + 90;
    deg = Math.max(RAMP_MIN_ANGLE, Math.min(RAMP_MAX_ANGLE, deg));
    this.angle = Math.round(90 - deg);
    this.onAngleChange(this.angle);
  }

  private hitTest(clientX: number, clientY: number): boolean {
    const rect = this.canvas.getBoundingClientRect();
    const sx = this.canvas.width  / rect.width;
    const sy = this.canvas.height / rect.height;
    const mx = (clientX - rect.left) * sx;
    const my = (clientY - rect.top)  * sy;
    const hAngle = -(Math.PI / 180) * this.angle;
    const hx = this.arcCX + Math.cos(hAngle) * ARC_R;
    const hy = this.arcCY + Math.sin(hAngle) * ARC_R;
    return Math.hypot(mx - hx, my - hy) < 50;
  }

  private setupEvents() {
    const c = this.canvas;
    c.addEventListener('mousedown',  e => { if (this.hitTest(e.clientX, e.clientY)) this.isDragging = true; });
    c.addEventListener('mousemove',  e => { if (this.isDragging) this.handleAngle(e.clientX, e.clientY); });
    c.addEventListener('mouseup',    () => { this.isDragging = false; });
    c.addEventListener('mouseleave', () => { this.isDragging = false; });
    c.addEventListener('touchstart', e => { e.preventDefault(); if (this.hitTest(e.touches[0].clientX, e.touches[0].clientY)) this.isDragging = true; }, { passive: false });
    c.addEventListener('touchmove',  e => { e.preventDefault(); if (this.isDragging) this.handleAngle(e.touches[0].clientX, e.touches[0].clientY); }, { passive: false });
    c.addEventListener('touchend',   () => { this.isDragging = false; });
  }

  setAngle(angle: number) { this.angle = angle; }

  draw() {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;
    ctx.clearRect(0, 0, w, h);

    // Ramp preview (left side)
    this.drawRampPreview(ctx, w, h);

    // Arc track
    const startA = (Math.PI / 180) * (RAMP_MIN_ANGLE - 90);
    const endA   = (Math.PI / 180) * (RAMP_MAX_ANGLE - 90);
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.4)';
    ctx.lineWidth = 10;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(this.arcCX, this.arcCY, ARC_R, startA, endA);
    ctx.stroke();

    // Handle
    const hAngle = -(Math.PI / 180) * this.angle;
    const hx = this.arcCX + Math.cos(hAngle) * ARC_R;
    const hy = this.arcCY + Math.sin(hAngle) * ARC_R;
    ctx.fillStyle = '#ff9800';
    ctx.beginPath();
    ctx.arc(hx, hy, 14, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    this.rafId = requestAnimationFrame(() => this.draw());
  }

  private drawRampPreview(ctx: CanvasRenderingContext2D, _w: number, h: number) {
    const groundY  = h - 8;
    const maxHpx   = h - 16;
    const angleRad = -(this.angle * Math.PI) / 180;
    const slant    = maxHpx / Math.sin((80 * Math.PI) / 180);
    const rw       = Math.abs(Math.cos(angleRad) * slant);
    const rh       = Math.abs(Math.sin(angleRad) * slant);
    const baseX    = 10;

    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, groundY);
    ctx.lineTo(baseX + Math.min(rw, 110) + 10, groundY);
    ctx.stroke();

    ctx.fillStyle = '#654321';
    ctx.beginPath();
    ctx.moveTo(baseX,      groundY);
    ctx.lineTo(baseX + rw, groundY);
    ctx.lineTo(baseX + rw, groundY - rh);
    ctx.closePath();
    ctx.fill();

    const midX = baseX + rw / 2;
    const midY = groundY - rh / 2;
    ctx.save();
    ctx.translate(midX, midY);
    ctx.rotate(angleRad);
    ctx.fillStyle = '#8B5E3C';
    ctx.fillRect(-slant / 2, -3, slant, 6);
    ctx.restore();
  }

  destroy() {
    cancelAnimationFrame(this.rafId);
  }
}
