/**
 * Pure description of one video frame: which section cards are on screen at
 * a given time, where they sit in 3D, and how they fade or move. The preview
 * and every export format render from this, so they can't drift apart.
 */

import {
  DEFAULT_DOF,
  DEFAULT_GLOBAL_CAMERA,
  DEFAULT_SECTION_CAMERA,
  type AnimationType,
  type AspectRatio,
  type Project,
  type Scene,
  type Screen,
} from '../types';
import { easeInOutSine, getEasing } from './easing';
import {
  chain,
  frameToClip,
  perspective,
  project,
  rotateX,
  rotateY,
  rotateZ,
  scale,
  translate,
  type Mat4,
} from './math';

/**
 * Frames are laid out in reference units: 1000 wide, height from the aspect
 * ratio. Camera offsets, perspective and corner radius use these units, so a
 * 720p export, a 4K export and the preview all frame a scene identically.
 */
export const REFERENCE_WIDTH = 1000;

const ASPECT_RATIOS: Record<AspectRatio, number> = {
  '16:9': 16 / 9,
  '1:1': 1,
  '9:16': 9 / 16,
  '4:3': 4 / 3,
};

// Card styling, in reference units
const CARD_RADIUS = 10;
const SHADOW = { offsetY: 40, blur: 70, spread: -20, opacity: 0.55 };
const VIGNETTE = { strength: 0.15, size: 90 };
// Horizontal pans zoom the section slightly so there is room to move
const HORIZONTAL_PAN_ZOOM = 1.2;

export interface CardLayer {
  sceneId: string;
  imageKey: string;
  /** Maps card-local units (origin at the card center, y down) to clip space. */
  mvp: Mat4;
  width: number;
  height: number;
  /** Visible part of the image: x, y, width, height in 0-1 texture space. */
  uv: [number, number, number, number];
  opacity: number;
  /** The fields below are in card-local units. */
  radius: number;
  blur: number;
  /** The same blur in reference units, for sizing it on screen. */
  blurReference: number;
  shadowOffsetY: number;
  shadowBlur: number;
  shadowSpread: number;
  shadowOpacity: number;
  vignette: number;
  vignetteSize: number;
  depth: number;
}

export interface Frame {
  width: number;
  height: number;
  background: [number, number, number];
  layers: CardLayer[];
}

export interface SceneTiming {
  start: number;
  end: number;
}

export function aspectRatioValue(aspectRatio: AspectRatio): number {
  return ASPECT_RATIOS[aspectRatio] ?? ASPECT_RATIOS['16:9'];
}

export function getSceneTimings(scenes: Scene[]): { timings: SceneTiming[]; total: number } {
  const timings: SceneTiming[] = [];
  let total = 0;
  for (const scene of scenes) {
    timings.push({ start: total, end: total + scene.duration });
    total += scene.duration;
  }
  return { timings, total };
}

/** Index of the scene playing at `time`; the last scene owns the very end. */
export function sceneIndexAt(scenes: Scene[], time: number): number {
  let start = 0;
  for (let i = 0; i < scenes.length; i++) {
    const end = start + scenes[i].duration;
    if (time < end) return i;
    start = end;
  }
  return scenes.length - 1;
}

/**
 * A moment when the scene is fully on screen. Transition halves never reach
 * past the middle of a scene, so the midpoint is always clear of them.
 */
export function sceneRestTime(scenes: Scene[], index: number): number {
  const { timings } = getSceneTimings(scenes);
  const { start, end } = timings[index];
  return (start + end) / 2;
}

export function buildFrame(projectState: Project, timeMs: number): Frame {
  const aspect = aspectRatioValue(projectState.settings.aspectRatio);
  const width = REFERENCE_WIDTH;
  const height = REFERENCE_WIDTH / aspect;
  const background = parseColor(projectState.settings.backgroundColor);
  const scenes = projectState.scenes;

  if (scenes.length === 0) return { width, height, background, layers: [] };

  const { timings, total } = getSceneTimings(scenes);
  const time = clamp(timeMs, 0, total);
  const globalCamera = { ...DEFAULT_GLOBAL_CAMERA, ...projectState.settings.globalCamera };
  const dof = { ...DEFAULT_DOF, ...projectState.settings.dof };
  const screensById = new Map(projectState.screens.map((s) => [s.id, s]));
  const windows = scenes.map((scene, i) => motionWindows(scenes, timings, i));
  const last = scenes.length - 1;

  const layers: CardLayer[] = [];

  for (let i = 0; i < scenes.length; i++) {
    const scene = scenes[i];
    const screen = screensById.get(scene.screenId);
    if (!screen?.imageUrl) continue;

    const { entryStart, entryEnd, exitStart, exitEnd } = windows[i];
    const visibleFrom = i === 0 ? 0 : entryStart;
    // A scene with no exit stays underneath until the next one has fully entered
    const visibleUntil = i === last ? total : Math.max(exitEnd, windows[i + 1].entryEnd);
    const isVisible = time >= visibleFrom && (time < visibleUntil || (i === last && time <= total));
    if (!isVisible) continue;

    const layer = buildLayer({
      scene,
      screen,
      index: i,
      previous: scenes[i - 1],
      timing: timings[i],
      time,
      entry: progress(time, entryStart, entryEnd),
      exit: progress(time, exitStart, exitEnd),
      width,
      height,
      zSpacing: globalCamera.zSpacing,
      dof,
    });
    if (layer.opacity > 0.001) layers.push(layer);
  }

  // Paint far cards first; on a tie the later scene goes on top
  layers.sort((a, b) => a.depth - b.depth);

  return { width, height, background, layers };
}

interface MotionWindows {
  entryStart: number;
  entryEnd: number;
  exitStart: number;
  exitEnd: number;
}

/**
 * Transitions straddle the cut: the outgoing exit and the incoming entry are
 * centered on the boundary and never reach past the middle of either scene.
 * The first entry starts at 0 and the last exit ends with the video.
 */
function motionWindows(scenes: Scene[], timings: SceneTiming[], i: number): MotionWindows {
  const scene = scenes[i];
  const { start, end } = timings[i];
  const last = scenes.length - 1;

  let entryStart = start;
  let entryEnd = start;
  if (scene.motion.entry !== 'none') {
    if (i === 0) {
      entryEnd = start + Math.min(scene.motion.entryDuration, scene.duration / 2);
    } else {
      const half = Math.min(scene.motion.entryDuration / 2, scene.duration / 2, scenes[i - 1].duration / 2);
      entryStart = start - half;
      entryEnd = start + half;
    }
  }

  let exitStart = end;
  let exitEnd = end;
  if (scene.motion.exit !== 'none') {
    if (i === last) {
      exitStart = end - Math.min(scene.motion.exitDuration, scene.duration / 2);
    } else {
      const half = Math.min(scene.motion.exitDuration / 2, scene.duration / 2, scenes[i + 1].duration / 2);
      exitStart = end - half;
      exitEnd = end + half;
    }
  }

  return { entryStart, entryEnd, exitStart, exitEnd };
}

interface LayerInput {
  scene: Scene;
  screen: Screen;
  index: number;
  previous: Scene | undefined;
  timing: SceneTiming;
  time: number;
  entry: number;
  exit: number;
  width: number;
  height: number;
  zSpacing: number;
  dof: typeof DEFAULT_DOF;
}

function buildLayer(input: LayerInput): CardLayer {
  const { scene, screen, previous, timing, time, width, height, zSpacing, dof } = input;
  const transform = scene.transform;
  const distance = transform.perspective || 1000;
  const ease = getEasing(scene.motion.easing);
  const camera = { ...DEFAULT_SECTION_CAMERA, ...scene.camera };

  // Card size and the part of the screenshot it shows
  const imageAspect = screen.width > 0 && screen.height > 0 ? screen.width / screen.height : width / height;
  const direction = camera.moveDirection;
  const horizontal = direction === 'left-to-right' || direction === 'right-to-left';
  const imageWidth = width * (horizontal ? HORIZONTAL_PAN_ZOOM : 1);
  const imageHeight = imageWidth / imageAspect;
  const cardWidth = width;
  const cardHeight = Math.min(height, imageHeight);
  const uvWidth = cardWidth / imageWidth;
  const uvHeight = cardHeight / imageHeight;

  // The camera pans across the whole section over the scene's duration
  const pan = easeInOutSine((time - timing.start) / Math.max(1, timing.end - timing.start));
  let panX = 0;
  let panY = 0;
  switch (direction) {
    case 'top-to-bottom': panY = pan; break;
    case 'bottom-to-top': panY = 1 - pan; break;
    case 'left-to-right': panX = pan; break;
    case 'right-to-left': panX = 1 - pan; break;
    default: panX = 0.5; panY = 0.5;
  }
  const uv: [number, number, number, number] = [
    panX * (1 - uvWidth),
    panY * (1 - uvHeight),
    uvWidth,
    uvHeight,
  ];

  // Scale 1 fits the tilted card inside the frame at its resting camera offset, so nothing is cropped
  const restX = (transform.translateX || 0) + camera.moveOffsetX;
  const restY = (transform.translateY || 0) + camera.moveOffsetY;
  const fit = fitScale(transform.rotateX, transform.rotateY, transform.rotateZ, distance, cardWidth, cardHeight, width, height, restX, restY);
  const cardScale = fit * (transform.scale || 1);

  // Camera offsets move from the previous scene's offset over the transition time
  const prevCamera = previous ? { ...DEFAULT_SECTION_CAMERA, ...previous.camera } : null;
  const fromX = prevCamera ? prevCamera.moveOffsetX : 0;
  const fromY = prevCamera ? prevCamera.moveOffsetY : 0;
  const offsetProgress = camera.transitionDuration > 0
    ? easeInOutSine((time - timing.start) / camera.transitionDuration)
    : 1;
  const offsetX = fromX + (camera.moveOffsetX - fromX) * offsetProgress;
  const offsetY = fromY + (camera.moveOffsetY - fromY) * offsetProgress;

  const motionScale = { width, height, zSpacing, near: Math.min(0.45 * distance, 0.6 * zSpacing) };
  const entering = motionEffect(scene.motion.entry, ease(input.entry), 'in', motionScale);
  const leaving = motionEffect(scene.motion.exit, ease(input.exit), 'out', motionScale);

  const translateX = (transform.translateX || 0) + offsetX + entering.x + leaving.x;
  const translateY = (transform.translateY || 0) + offsetY + entering.y + leaving.y;
  // Never let a card reach the camera, where perspective would flip it
  const translateZ = Math.min((transform.translateZ || 0) + entering.z + leaving.z, 0.5 * distance);

  const mvp = chain(
    frameToClip(width, height),
    perspective(distance),
    translate(translateX, translateY, translateZ),
    rotateX(transform.rotateX),
    rotateY(transform.rotateY + entering.rotateY + leaving.rotateY),
    rotateZ(transform.rotateZ),
    scale(cardScale),
  );

  // Depth of field softens cards that move away from the focal plane
  const focus = dof.enabled
    ? clamp((Math.abs(translateZ) * 2.8) / (Math.max(0.5, dof.aperture) * Math.max(1, zSpacing)), 0, 1)
    : 0;
  const blur = focus * dof.maxBlur;

  return {
    sceneId: scene.id,
    imageKey: screen.imageUrl,
    mvp,
    width: cardWidth,
    height: cardHeight,
    uv,
    opacity: clamp(entering.opacity, 0, 1) * clamp(leaving.opacity, 0, 1),
    radius: CARD_RADIUS / cardScale,
    blur: blur / cardScale,
    blurReference: blur,
    shadowOffsetY: SHADOW.offsetY / cardScale,
    shadowBlur: SHADOW.blur / cardScale,
    shadowSpread: SHADOW.spread / cardScale,
    shadowOpacity: SHADOW.opacity,
    vignette: VIGNETTE.strength,
    vignetteSize: VIGNETTE.size / cardScale,
    depth: translateZ,
  };
}

interface MotionEffect {
  opacity: number;
  x: number;
  y: number;
  z: number;
  rotateY: number;
}

/**
 * Offsets for an entry ('in', eased progress 0 to 1 toward rest) or an exit
 * ('out', eased progress 0 to 1 away from rest). Slides travel past the frame
 * edge, zooms travel in depth by the layer spacing.
 */
function motionEffect(
  type: AnimationType,
  eased: number,
  phase: 'in' | 'out',
  size: { width: number; height: number; zSpacing: number; near: number },
): MotionEffect {
  const effect: MotionEffect = { opacity: 1, x: 0, y: 0, z: 0, rotateY: 0 };
  const away = phase === 'in' ? 1 - eased : eased;
  const fadeIn = Math.min(1, eased * 1.6);
  const slideX = size.width * 1.5;
  const slideY = size.height * 1.5;

  switch (type) {
    case 'fade':
      effect.opacity = phase === 'in' ? eased : 1 - eased;
      break;
    case 'slide-left':
      effect.x = phase === 'in' ? slideX * away : -slideX * away;
      break;
    case 'slide-right':
      effect.x = phase === 'in' ? -slideX * away : slideX * away;
      break;
    case 'slide-up':
      effect.y = phase === 'in' ? slideY * away : -slideY * away;
      break;
    case 'slide-down':
      effect.y = phase === 'in' ? -slideY * away : slideY * away;
      break;
    case 'zoom-in':
      // Arrives from deep in the scene, leaves past the camera
      effect.z = phase === 'in' ? -size.zSpacing * away : size.near * away;
      effect.opacity = phase === 'in' ? fadeIn : 1 - eased;
      break;
    case 'zoom-out':
      // Arrives from near the camera, recedes into the scene
      effect.z = phase === 'in' ? size.near * away : -size.zSpacing * away;
      effect.opacity = phase === 'in' ? fadeIn : 1 - eased;
      break;
    case 'rotate':
      effect.rotateY = phase === 'in' ? -28 * away : 28 * away;
      effect.z = -0.25 * size.zSpacing * away;
      effect.opacity = phase === 'in' ? fadeIn : 1 - eased;
      break;
    default:
      break;
  }

  return effect;
}

const fitCache = new Map<string, number>();

/** Largest scale at which the projected card stays inside the frame. */
function fitScale(
  rx: number,
  ry: number,
  rz: number,
  distance: number,
  cardWidth: number,
  cardHeight: number,
  frameWidth: number,
  frameHeight: number,
  offsetX: number,
  offsetY: number,
): number {
  const key = `${rx},${ry},${rz},${distance},${cardWidth.toFixed(2)},${cardHeight.toFixed(2)},${frameHeight.toFixed(2)},${offsetX},${offsetY}`;
  const cached = fitCache.get(key);
  if (cached !== undefined) return cached;

  const base = chain(perspective(distance), translate(offsetX, offsetY, 0), rotateX(rx), rotateY(ry), rotateZ(rz));
  const halfW = frameWidth / 2;
  const halfH = frameHeight / 2;
  const fits = (k: number) => {
    for (const [cx, cy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const [x, y, w] = project(base, (cx * cardWidth * k) / 2, (cy * cardHeight * k) / 2);
      if (w <= 0.05 || Math.abs(x) > halfW + 1e-3 || Math.abs(y) > halfH + 1e-3) return false;
    }
    return true;
  };

  let lo = 0.01;
  let hi = 4;
  for (let i = 0; i < 32; i++) {
    const mid = (lo + hi) / 2;
    if (fits(mid)) lo = mid;
    else hi = mid;
  }

  if (fitCache.size > 512) fitCache.clear();
  fitCache.set(key, lo);
  return lo;
}

function progress(time: number, start: number, end: number): number {
  if (end <= start) return time >= start ? 1 : 0;
  return clamp((time - start) / (end - start), 0, 1);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function parseColor(color: string | undefined): [number, number, number] {
  const hex = (color ?? '').trim().replace('#', '');
  const full = hex.length === 3 ? hex.split('').map((c) => c + c).join('') : hex;
  if (/^[0-9a-f]{6}$/i.test(full)) {
    return [
      parseInt(full.slice(0, 2), 16) / 255,
      parseInt(full.slice(2, 4), 16) / 255,
      parseInt(full.slice(4, 6), 16) / 255,
    ];
  }
  return [10 / 255, 10 / 255, 10 / 255];
}
