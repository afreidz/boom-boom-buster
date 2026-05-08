// World constants
export const WORLD_WIDTH       = 18000;
export const WORLD_HEIGHT      = 1000;
export const GROUND_Y          = WORLD_HEIGHT - 100;
export const BUSTER_START_X    = 1675;
export const RAMP_START_X      = 2025;
export const BUILDINGS_START_X = 5300;
export const NUM_BUILDINGS     = 30;
export const BUILDING_SPACING  = 1000;

// Physics tuning
export const GRAVITY_SCALE     = 0.004;
export const TIME_SCALE        = 0.9;

// Launch
export const LAUNCH_SPEED_MIN  = 64;   // at 0% speed
export const LAUNCH_SPEED_RANGE = 144; // added at 100% speed

// Run animation
export const RUN_BACKUP_DISTANCE = 2000;
export const RUN_BACKUP_SPEED    = 5;
export const RUN_FORWARD_ACCEL   = 0.4;
export const RUN_FORWARD_MAX     = 50;

// Buster physics
export const BUSTER_DENSITY     = 0.008;
export const LIMB_DENSITY       = 0.006;
export const HEAD_RADIUS        = 20;
export const TORSO_W            = 30;
export const TORSO_H            = 50;
export const LIMB_W             = 10;
export const LIMB_H             = 40;
export const RUN_BODY_SIZE      = 90; // square

// Ramp
export const RAMP_SLANT_LENGTH  = 600;
export const RAMP_MIN_ANGLE     = 10;
export const RAMP_MAX_ANGLE     = 80;
export const RAMP_DEFAULT_ANGLE = 45;

// Buildings
export const BUILDING_WIDTHS  = [300, 400, 500, 600, 700, 800] as const;
export const BUILDING_HEIGHTS = [600, 800, 1000, 1200, 1400, 1600] as const;
export const TARGET_HEIGHT    = 2000;
export const BRICK_W          = 200;
export const BRICK_H          = 150;

// Brick physics — light and bouncy so they scatter and cause chain reactions
export const BRICK_DENSITY      = 0.0001;
export const BRICK_FRICTION     = 0.1;
export const BRICK_RESTITUTION  = 0.6;
export const BRICK_AIR_FRICTION = 0.005;

// Velocity threshold for chain-reaction building destruction
export const CHAIN_VELOCITY_THRESHOLD = 3;

// Scene keys
export const SCENE = {
  BOOT:   'BootScene',
  SPLASH: 'SplashScene',
  GAME:   'GameScene',
} as const;

// Texture/audio keys
export const KEY = {
  RUNNING:  'running',
  EXPLODED: 'exploded',
  ICON:     'busterIcon',
  THEME:    'theme',
  SFX_RUNNING: 'sfxRunning',
  SFX_WOOSH:   'sfxWoosh',
  SFX_LAUNCH:  'sfxLaunch',
  SFX_WIND:    'sfxWind',
  SFX_CRASH:   ['sfxCrash1', 'sfxCrash2', 'sfxCrash3'] as const,
  SFX_SCREAM:  ['sfxScream1', 'sfxScream2', 'sfxScream3', 'sfxScream4'] as const,
} as const;
