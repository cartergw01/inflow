import * as THREE from "three";
import { WORLD_VISUALS, VISUALS_BY_SLUG, activityScale, seeded, worldPosition, type WorldVisual } from "./worlds";
import { computeBridges, controversy, discussionVelocity, type Bridge } from "./metrics";

/**
 * The Observatory engine, v2 grammar. One persistent scene hosts the whole
 * product: the galaxy overview and every galaxy interior are camera
 * positions, never page loads.
 *
 * Visual grammar (always-on tier): galaxy size = activity, pulse = breaking,
 * story size = rank, story brightness = recency. Hover tier: satellite orbit
 * speed = discussion velocity, orbital instability = controversy (never
 * color). Cross-topic stories render as light-trail bridges between
 * galaxies. Motion discipline: the scene is still by default — only breaking
 * pulses, the focused story's system, and camera flight move.
 *
 * Performance model (see NOTES.md): instanced story nodes with unlit
 * materials, one billboarded-quad halo pass per galaxy, glow LOD by view,
 * pooled DOM labels every 3rd frame, dynamic three import, hidden-tab pause,
 * DPR clamp with FPS auto-degrade.
 */

export interface GalaxyStory {
  id: number;
  title: string;
  sourceName: string;
  author: string | null;
  publishedAt: string;
  sourceCheckedAt: string | null;
  excerpt: string | null;
  topics: string[];
  sourceClass: string;
  url: string;
  readingMinutes: number | null;
  alsoCoveredBy: { sourceName: string; url: string }[];
  saved: boolean;
  read: boolean;
  credibilityTier: "major" | "independent" | "social";
  isNew: boolean;
  status: "active" | "updated" | "corrected" | "retracted";
  verificationStatus: "reported" | "corroborated" | "unconfirmed";
}

export interface GalaxyWorldData {
  slug: string;
  label: string;
  affinity: number;
  activity: number;
  breaking: boolean;
  newCount: number;
  entries: GalaxyStory[];
}

export interface GalaxyPayload {
  today: GalaxyWorldData;
  worlds: GalaxyWorldData[];
  updatedAt: string | null;
  lastVisitAt: string | null;
  newCount: number;
  catchUp: GalaxyStory[];
  freshness: {
    latestCheckedAt: string | null;
    oldestCheckedAt: string | null;
    staleSourceCount: number;
    totalSources: number;
  };
}

export interface GalaxyWirePayload {
  today: Omit<GalaxyWorldData, "entries"> & { entryIds: number[] };
  worlds: Array<Omit<GalaxyWorldData, "entries"> & { entryIds: number[] }>;
  stories: Record<string, GalaxyStory>;
  updatedAt: string | null;
  lastVisitAt: string | null;
  newCount: number;
  catchUpIds: number[];
  freshness: GalaxyPayload["freshness"];
}

export function hydrateGalaxyPayload(wire: GalaxyWirePayload): GalaxyPayload {
  const hydrateWorld = ({ entryIds, ...world }: GalaxyWirePayload["today"]): GalaxyWorldData => ({
    ...world,
    entries: entryIds.flatMap((id) => wire.stories[String(id)] ? [wire.stories[String(id)]] : []),
  });
  return {
    today: hydrateWorld(wire.today),
    worlds: wire.worlds.map((world) => hydrateWorld(world)),
    updatedAt: wire.updatedAt,
    lastVisitAt: wire.lastVisitAt,
    newCount: wire.newCount,
    catchUp: wire.catchUpIds.flatMap((id) => wire.stories[String(id)] ? [wire.stories[String(id)]] : []),
    freshness: wire.freshness,
  };
}

export interface HudLabel {
  key: string;
  kind: "world" | "story" | "bridge";
  text: string;
  sub?: string;
  color: string;
  x: number;
  y: number;
  opacity: number;
  /** For bridge labels: tap-to-focus target. */
  storyId?: number;
}

export interface EngineCallbacks {
  onFocus(story: GalaxyStory | null, worldSlug: string | null, x: number, y: number): void;
  onLabels(labels: HudLabel[]): void;
  onView(world: string | null): void;
}

export interface CameraState {
  world: string | null;
  theta: number;
  phi: number;
  radius: number;
}

interface StoryRef {
  story: GalaxyStory;
  world: string;
  index: number;
  local: THREE.Vector3;
}

const EASE = (t: number) => 1 - Math.pow(1 - t, 3);
const TMP = new THREE.Vector3();
const TMP_RIGHT = new THREE.Vector3();
const TMP_UP = new THREE.Vector3();
const WHITE = new THREE.Color(0xffffff);
const EMBER = new THREE.Color(0x272a34);

/* Halos: view-aligned instanced quads, procedural falloff — one draw call
 * per galaxy. (gl_PointSize sprites cap or break on several ANGLE stacks.) */
const GLOW_VERT = `
attribute vec3 iOffset;
attribute vec3 iTint;
attribute float iSize;
attribute float iFresh;
varying vec2 vUv;
varying vec3 vTint;
varying float vFresh;
uniform float uTime;
uniform float uGlowScale;
void main() {
  vUv = position.xy;
  vTint = iTint;
  vFresh = iFresh;
  float pulse = 1.0 + iFresh * 0.22 * sin(uTime * 2.4 + iOffset.x * 3.0);
  vec4 mv = modelViewMatrix * vec4(iOffset, 1.0);
  mv.xy += position.xy * iSize * pulse * uGlowScale;
  gl_Position = projectionMatrix * mv;
}`;

const GLOW_FRAG = `
varying vec2 vUv;
varying vec3 vTint;
varying float vFresh;
void main() {
  float d = length(vUv) * 2.0;
  float a = pow(max(0.0, 1.0 - d), 2.0);
  gl_FragColor = vec4(vTint * (0.7 + vFresh * 0.4), a);
}`;

function makeGlowMesh(count: number, uniforms: { uTime: { value: number }; uGlowScale: { value: number } }) {
  const base = new THREE.PlaneGeometry(1, 1);
  const geo = new THREE.InstancedBufferGeometry();
  geo.index = base.index;
  geo.setAttribute("position", base.getAttribute("position"));
  geo.instanceCount = count;
  const offset = new THREE.InstancedBufferAttribute(new Float32Array(count * 3), 3);
  const tint = new THREE.InstancedBufferAttribute(new Float32Array(count * 3), 3);
  const size = new THREE.InstancedBufferAttribute(new Float32Array(count), 1);
  const fresh = new THREE.InstancedBufferAttribute(new Float32Array(count), 1);
  geo.setAttribute("iOffset", offset);
  geo.setAttribute("iTint", tint);
  geo.setAttribute("iSize", size);
  geo.setAttribute("iFresh", fresh);
  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: GLOW_VERT,
    fragmentShader: GLOW_FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  return { mesh, offset, tint, size, fresh };
}

function thinRing(rIn: number, rOut: number, color: number, opacity: number): THREE.Mesh {
  return new THREE.Mesh(
    new THREE.RingGeometry(rIn, rOut, 96),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity, side: THREE.DoubleSide, depthWrite: false }),
  );
}

interface BridgeRef {
  bridge: Bridge;
  tube: THREE.Mesh;
  mid: THREE.Vector3;
  prominent: boolean;
}

interface FocusSystem {
  group: THREE.Group;
  ring: THREE.Mesh;
  satellites: THREE.Mesh[];
  omega: number;
  instability: number;
  baseR: number;
}

export class GalaxyEngine {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private cb: EngineCallbacks;
  private isMobile: boolean;

  private worldGroups = new Map<string, THREE.Group>();
  private worldScales = new Map<string, number>();
  private glowUniforms = { uTime: { value: 0 }, uGlowScale: { value: 1 } };
  private glows = new Map<string, ReturnType<typeof makeGlowMesh>>();
  private instanced = new Map<string, THREE.InstancedMesh>();
  private hitTargets: THREE.Mesh[] = [];
  private stories = new Map<number, StoryRef[]>();
  private byWorldIndex = new Map<string, GalaxyStory[]>();
  private saveRings = new Map<string, THREE.Mesh>();
  private newRings = new Map<string, THREE.Mesh>();
  private pulses: { ring: THREE.Mesh; halo: THREE.Sprite | null; phase: number; scale: number }[] = [];
  private bridges: BridgeRef[] = [];
  private focusRing: THREE.Mesh;
  private hoverRing: THREE.Mesh;
  private focusSystem: FocusSystem | null = null;
  private focusedId: number | null = null;

  private data: GalaxyPayload;

  private target = new THREE.Vector3(0, 0, 0);
  private theta = 0.4;
  private phi = 1.12;
  private radius = 72; // reset per-device below
  private view: string | null = null;
  private anim: { t0: number; dur: number; from: Snapshot; to: Snapshot; done?: () => void } | null = null;

  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2();
  private dragging = false;
  private moved = false;
  private lastPinch = 0;
  private pinching = false;
  private paused = false;

  private lastFrameAt = performance.now();
  private elapsedSeconds = 0;
  private frame = 0;
  private disposed = false;
  private fpsSamples: number[] = [];
  private droppedDpr = false;

  constructor(
    canvas: HTMLCanvasElement,
    data: GalaxyPayload,
    cb: EngineCallbacks,
    opts: { isMobile: boolean; initial?: CameraState | null },
  ) {
    this.cb = cb;
    this.data = data;
    this.isMobile = opts.isMobile;
    this.radius = opts.isMobile ? 110 : 72;

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: !opts.isMobile, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.setSize(innerWidth, innerHeight);

    this.camera = new THREE.PerspectiveCamera(52, innerWidth / innerHeight, 0.1, 500);
    this.scene.fog = new THREE.FogExp2(0x030407, 0.006);

    this.buildStarfield();
    this.buildEcliptic();
    this.buildWorld(data.today, VISUALS_BY_SLUG.get("today")!);
    for (const w of data.worlds) {
      const visual = VISUALS_BY_SLUG.get(w.slug);
      if (visual) this.buildWorld(w, visual);
    }
    this.buildBridges();

    this.focusRing = thinRing(1, 1.06, 0xffffff, 0);
    this.scene.add(this.focusRing);
    this.hoverRing = thinRing(0.96, 1.04, 0xffffff, 0);
    this.scene.add(this.hoverRing);

    if (opts.initial) {
      this.view = opts.initial.world;
      this.theta = opts.initial.theta;
      this.phi = opts.initial.phi;
      this.radius = opts.initial.radius;
      if (this.view) {
        const g = this.worldGroups.get(this.view);
        if (g) this.target.copy(g.position);
        else this.view = null;
      }
      this.cb.onView(this.view);
    }

    this.bindInput(canvas);
    addEventListener("resize", this.onResize);
    this.loop();
  }

  /* ── construction ──────────────────────────────────────────────── */

  private buildStarfield() {
    const n = this.isMobile ? 1400 : 3200;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const r = 150 + Math.random() * 220;
      const t = Math.random() * Math.PI * 2;
      const p = Math.acos(2 * Math.random() - 1);
      pos[i * 3] = r * Math.sin(p) * Math.cos(t);
      pos[i * 3 + 1] = r * Math.cos(p) * 0.7;
      pos[i * 3 + 2] = r * Math.sin(p) * Math.sin(t);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    this.scene.add(
      new THREE.Points(g, new THREE.PointsMaterial({ color: 0x6b7290, size: 0.22, transparent: true, opacity: 0.5, fog: false })),
    );
  }

  /** Faint reference rings around the sun — the Stellarium chart feel. */
  private buildEcliptic() {
    for (const r of [12, 22, 32, 42]) {
      const ring = thinRing(r - 0.02, r + 0.02, 0x2a3050, 0.14);
      ring.rotation.x = Math.PI / 2;
      this.scene.add(ring);
    }
  }

  private buildCore(visual: WorldVisual, group: THREE.Group, scale: number, breaking: boolean) {
    const mk = (geo: THREE.BufferGeometry, color: number, opacity = 1) => {
      const m = new THREE.Mesh(
        geo,
        new THREE.MeshBasicMaterial({ color, transparent: opacity < 1, opacity, depthWrite: opacity >= 1 }),
      );
      group.add(m);
      return m;
    };
    const line = (geo: THREE.BufferGeometry, color: number, opacity = 1) => {
      const object = new THREE.LineSegments(
        geo,
        new THREE.LineBasicMaterial({ color, transparent: opacity < 1, opacity, depthWrite: false }),
      );
      group.add(object);
      return object;
    };

    switch (visual.core) {
      case "sun": {
        mk(new THREE.SphereGeometry(1.7, 40, 40), 0xe5ce7a);
        const facets = mk(new THREE.IcosahedronGeometry(1.76, 2), 0xffefb2, 0.18);
        (facets.material as THREE.MeshBasicMaterial).wireframe = true;
        const meridian = mk(new THREE.TorusGeometry(2.12, 0.018, 5, 96), 0xd9c26a, 0.34);
        meridian.rotation.x = Math.PI / 2;
        break;
      }
      case "arena": {
        const radius = 1.42 * scale;
        mk(new THREE.SphereGeometry(radius, 36, 28), 0xa94f20);
        const grain = mk(new THREE.SphereGeometry(radius * 1.005, 20, 14), 0xe7904f, 0.18);
        (grain.material as THREE.MeshBasicMaterial).wireframe = true;

        // Raised great-circle seams make the core read as a basketball even
        // when the overview has zoomed far out.
        const seamRotations: Array<[number, number, number]> = [
          [Math.PI / 2, 0, 0],
          [0, Math.PI / 2, 0],
          [0.3, 0.82, 0.18],
          [-0.28, -0.82, -0.18],
        ];
        for (const [x, y, z] of seamRotations) {
          const seam = mk(new THREE.TorusGeometry(radius * 1.01, 0.035 * scale, 6, 72), 0x28130d, 0.92);
          seam.rotation.set(x, y, z);
        }

        const ring = mk(new THREE.RingGeometry(2.45 * scale, 3.18 * scale, 96), visual.color, 0.13);
        ring.rotation.x = Math.PI / 2 - 0.42;
        const court = line(new THREE.EdgesGeometry(new THREE.BoxGeometry(2.4 * scale, 0.02, 1.25 * scale)), 0xf2c9a0, 0.22);
        court.rotation.x = -0.42;
        break;
      }
      case "lattice": {
        const chip = new THREE.Group();
        chip.rotation.set(0.42, 0.62, 0.08);
        group.add(chip);
        const bodySize = 1.78 * scale;
        chip.add(new THREE.Mesh(new THREE.BoxGeometry(bodySize, bodySize, bodySize), new THREE.MeshBasicMaterial({ color: 0x0b342f })));
        chip.add(
          new THREE.LineSegments(
            new THREE.EdgesGeometry(new THREE.BoxGeometry(bodySize * 1.02, bodySize * 1.02, bodySize * 1.02)),
            new THREE.LineBasicMaterial({ color: visual.color, transparent: true, opacity: 0.72 }),
          ),
        );
        const die = new THREE.Mesh(
          new THREE.BoxGeometry(0.78 * scale, 0.78 * scale, 0.78 * scale),
          new THREE.MeshBasicMaterial({ color: 0x5de0cc }),
        );
        chip.add(die);

        const pinCount = 24;
        const pins = new THREE.InstancedMesh(
          new THREE.BoxGeometry(0.48 * scale, 0.075 * scale, 0.075 * scale),
          new THREE.MeshBasicMaterial({ color: 0x89eadc }),
          pinCount,
        );
        const matrix = new THREE.Matrix4();
        let pin = 0;
        for (const side of [-1, 1]) {
          for (let i = 0; i < 6; i++) {
            const offset = (i - 2.5) * 0.25 * scale;
            matrix.makeRotationZ(0).setPosition(side * 1.08 * scale, offset, 0);
            pins.setMatrixAt(pin++, matrix);
            matrix.makeRotationY(Math.PI / 2).setPosition(0, offset, side * 1.08 * scale);
            pins.setMatrixAt(pin++, matrix);
          }
        }
        pins.instanceMatrix.needsUpdate = true;
        chip.add(pins);
        break;
      }
      case "isle": {
        const island = new THREE.Group();
        island.rotation.set(-0.18, -0.34, -0.14);
        group.add(island);

        const shape = new THREE.Shape();
        const outline: Array<[number, number]> = [
          [0.02, 1.72], [0.25, 1.42], [0.36, 1.08], [0.48, 0.67], [0.43, 0.28],
          [0.3, -0.16], [0.13, -0.62], [-0.02, -1.12], [-0.22, -1.72], [-0.4, -1.38],
          [-0.5, -0.88], [-0.48, -0.37], [-0.39, 0.16], [-0.29, 0.72], [-0.17, 1.28],
        ];
        shape.moveTo(outline[0][0] * scale, outline[0][1] * scale);
        for (const [x, y] of outline.slice(1)) shape.lineTo(x * scale, y * scale);
        shape.closePath();
        const islandGeometry = new THREE.ExtrudeGeometry(shape, {
          depth: 0.28 * scale,
          bevelEnabled: true,
          bevelSegments: 2,
          bevelSize: 0.055 * scale,
          bevelThickness: 0.055 * scale,
        });
        islandGeometry.center();
        island.add(new THREE.Mesh(islandGeometry, new THREE.MeshBasicMaterial({ color: 0x1d5a3c })));
        island.add(
          new THREE.LineSegments(
            new THREE.EdgesGeometry(islandGeometry, 22),
            new THREE.LineBasicMaterial({ color: 0x91e6ad, transparent: true, opacity: 0.78 }),
          ),
        );

        // A bright central ridge and nested chart rings carry the island's
        // topography without relying on a photographic texture.
        const ridgePoints = [
          new THREE.Vector3(-0.08, 1.23, 0.2),
          new THREE.Vector3(0.08, 0.62, 0.2),
          new THREE.Vector3(-0.08, 0.02, 0.2),
          new THREE.Vector3(-0.18, -0.63, 0.2),
          new THREE.Vector3(-0.22, -1.22, 0.2),
        ].map((point) => point.multiplyScalar(scale));
        island.add(
          new THREE.Line(
            new THREE.BufferGeometry().setFromPoints(ridgePoints),
            new THREE.LineBasicMaterial({ color: 0xc6f3d2, transparent: true, opacity: 0.62 }),
          ),
        );
        const chartRing = new THREE.Mesh(
          new THREE.RingGeometry(1.84 * scale, 1.92 * scale, 72),
          new THREE.MeshBasicMaterial({ color: 0x5fbf8a, transparent: true, opacity: 0.18, side: THREE.DoubleSide, depthWrite: false }),
        );
        chartRing.position.z = -0.28 * scale;
        island.add(chartRing);

        const lanternPositions: Array<[number, number]> = [[-1.52, 0.82], [1.48, 0.55], [-1.42, -0.92], [1.38, -1.05]];
        for (const [x, y] of lanternPositions) {
          const lantern = new THREE.Mesh(
            new THREE.CylinderGeometry(0.1 * scale, 0.13 * scale, 0.27 * scale, 6),
            new THREE.MeshBasicMaterial({ color: 0xe5a064 }),
          );
          lantern.position.set(x * scale, y * scale, 0.08 * scale);
          island.add(lantern);
        }
        break;
      }
      case "rotunda": {
        const civic = new THREE.Group();
        group.add(civic);
        const base = new THREE.Mesh(
          new THREE.CylinderGeometry(1.48 * scale, 1.58 * scale, 0.3 * scale, 40),
          new THREE.MeshBasicMaterial({ color: 0x25345f }),
        );
        base.position.y = -0.62 * scale;
        civic.add(base);

        const columns = new THREE.InstancedMesh(
          new THREE.CylinderGeometry(0.065 * scale, 0.075 * scale, 0.82 * scale, 8),
          new THREE.MeshBasicMaterial({ color: 0xdde3f5 }),
          16,
        );
        const matrix = new THREE.Matrix4();
        for (let i = 0; i < 16; i++) {
          const angle = (i / 16) * Math.PI * 2;
          matrix.makeTranslation(Math.cos(angle) * 1.16 * scale, -0.12 * scale, Math.sin(angle) * 1.16 * scale);
          columns.setMatrixAt(i, matrix);
        }
        columns.instanceMatrix.needsUpdate = true;
        civic.add(columns);

        const entablature = new THREE.Mesh(
          new THREE.CylinderGeometry(1.34 * scale, 1.34 * scale, 0.18 * scale, 40),
          new THREE.MeshBasicMaterial({ color: 0x94a8dd }),
        );
        entablature.position.y = 0.34 * scale;
        civic.add(entablature);
        const dome = new THREE.Mesh(
          new THREE.SphereGeometry(1.02 * scale, 36, 20, 0, Math.PI * 2, 0, Math.PI / 2),
          new THREE.MeshBasicMaterial({ color: 0xc7d1ee }),
        );
        dome.position.y = 0.42 * scale;
        civic.add(dome);
        const domeLines = new THREE.LineSegments(
          new THREE.EdgesGeometry(new THREE.SphereGeometry(1.035 * scale, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2)),
          new THREE.LineBasicMaterial({ color: 0x6e86ce, transparent: true, opacity: 0.42 }),
        );
        domeLines.position.y = 0.42 * scale;
        civic.add(domeLines);
        const cupola = new THREE.Mesh(
          new THREE.CylinderGeometry(0.2 * scale, 0.26 * scale, 0.38 * scale, 12),
          new THREE.MeshBasicMaterial({ color: 0xe8edfb }),
        );
        cupola.position.y = 1.45 * scale;
        civic.add(cupola);
        const spire = new THREE.Mesh(
          new THREE.ConeGeometry(0.1 * scale, 0.38 * scale, 10),
          new THREE.MeshBasicMaterial({ color: 0xa9b9e2 }),
        );
        spire.position.y = 1.82 * scale;
        civic.add(spire);
        break;
      }
      case "globe": {
        const canvas = document.createElement("canvas");
        canvas.width = 512;
        canvas.height = 256;
        const context = canvas.getContext("2d");
        if (!context) break;
        context.fillStyle = "#17243b";
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.strokeStyle = "rgba(157,176,204,.22)";
        context.lineWidth = 1;
        for (let x = 0; x <= 512; x += 64) {
          context.beginPath(); context.moveTo(x, 0); context.lineTo(x, 256); context.stroke();
        }
        for (let y = 32; y < 256; y += 32) {
          context.beginPath(); context.moveTo(0, y); context.lineTo(512, y); context.stroke();
        }
        context.fillStyle = "#8fa9c6";
        context.strokeStyle = "rgba(232,242,250,.68)";
        context.lineWidth = 1.2;
        const mapPoint = ([longitude, latitude]: [number, number]): [number, number] => [
          ((longitude + 180) / 360) * canvas.width,
          ((90 - latitude) / 180) * canvas.height,
        ];
        const landmass = (coordinates: Array<[number, number]>) => {
          const points = coordinates.map(mapPoint);
          context.beginPath();
          context.moveTo(points[0][0], points[0][1]);
          for (const [x, y] of points.slice(1)) context.lineTo(x, y);
          context.closePath();
          context.fill();
          context.stroke();
        };
        landmass([[-168, 72], [-145, 72], [-126, 58], [-105, 52], [-83, 25], [-96, 16], [-113, 29], [-126, 43], [-148, 57]]);
        landmass([[-82, 13], [-65, 9], [-49, -12], [-57, -31], [-70, -56], [-78, -31], [-82, -5]]);
        landmass([[-63, 79], [-30, 82], [-20, 72], [-42, 58], [-61, 64]]);
        landmass([[-12, 71], [28, 72], [65, 77], [112, 72], [166, 60], [145, 42], [121, 20], [103, 8], [77, 24], [51, 5], [34, 28], [18, 42], [-2, 36], [-12, 54]]);
        landmass([[-18, 35], [10, 38], [36, 29], [45, 7], [28, -35], [7, -35], [-10, -6]]);
        landmass([[112, -11], [154, -10], [151, -38], [127, -43], [112, -25]]);
        const texture = new THREE.CanvasTexture(canvas);
        texture.colorSpace = THREE.SRGBColorSpace;
        const globe = mk(new THREE.SphereGeometry(1.48 * scale, 40, 28), 0xffffff);
        (globe.material as THREE.MeshBasicMaterial).map = texture;
        (globe.material as THREE.MeshBasicMaterial).needsUpdate = true;
        globe.rotation.set(0.08, 0.85, -0.18);
        const grid = mk(new THREE.SphereGeometry(1.495 * scale, 18, 12), visual.color, 0.24);
        (grid.material as THREE.MeshBasicMaterial).wireframe = true;
        grid.rotation.copy(globe.rotation);
        break;
      }
    }

    // thin orbital reference lanes
    for (const lane of visual.lanes) {
      const ring = thinRing(lane.r * scale - 0.025, lane.r * scale + 0.025, visual.color, 0.13);
      ring.rotation.x = Math.PI / 2 - lane.tiltX;
      if (lane.tiltZ) ring.rotation.z = lane.tiltZ;
      group.add(ring);
    }

    // breaking pulse ring (animated in the loop) — the only ambient motion
    if (breaking && visual.core !== "sun") {
      const pulse = thinRing(2.2 * scale, 2.32 * scale, visual.color, 0.55);
      pulse.rotation.x = Math.PI / 2;
      group.add(pulse);
      this.pulses.push({ ring: pulse, halo: null, phase: Math.random() * Math.PI * 2, scale });
    }
  }

  private buildWorld(world: GalaxyWorldData, visual: WorldVisual) {
    const scale = world.slug === "today" ? 1 : activityScale(world.activity);
    this.worldScales.set(world.slug, scale);

    const group = new THREE.Group();
    group.position.copy(TMP.copy(worldPosition(visual, world.affinity) as THREE.Vector3Like));
    if (this.isMobile && world.slug !== "today") group.position.multiplyScalar(0.72);
    this.scene.add(group);
    this.worldGroups.set(world.slug, group);
    this.byWorldIndex.set(world.slug, world.entries);

    this.buildCore(visual, group, scale, world.breaking);

    const hit = new THREE.Mesh(new THREE.SphereGeometry(6.5 * Math.max(scale, 0.8), 8, 8), new THREE.MeshBasicMaterial({ visible: false }));
    hit.userData.world = world.slug;
    group.add(hit);
    this.hitTargets.push(hit);

    const n = world.entries.length;
    const count = n + 1;
    const geo = new THREE.SphereGeometry(1, 12, 12);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const mesh = new THREE.InstancedMesh(geo, mat, Math.max(n, 1));
    mesh.userData.world = world.slug;
    group.add(mesh);
    this.instanced.set(world.slug, mesh);

    const glow = makeGlowMesh(count, this.glowUniforms);
    group.add(glow.mesh);
    this.glows.set(world.slug, glow);

    const m4 = new THREE.Matrix4();
    const colMain = new THREE.Color(visual.color);
    const colAlt = new THREE.Color(visual.altColor);
    const now = Date.now();

    world.entries.forEach((story, i) => {
      const raw = visual.layout(i, story.id);
      const p = new THREE.Vector3(raw.x * scale, raw.y * scale, raw.z * scale);
      const size = this.storySize(i);
      m4.makeScale(size, size, size).setPosition(p);
      mesh.setMatrixAt(i, m4);

      const useAlt = seeded(story.id, 53) > 0.6;
      const tint = story.read ? EMBER : useAlt ? colAlt : colMain;
      mesh.setColorAt(i, story.read ? EMBER : tint.clone().lerp(WHITE, 0.5));

      const ageH = (now - new Date(story.publishedAt).getTime()) / 3600_000;
      const fresh = story.read ? 0 : Math.max(0, 1 - ageH / 24);
      glow.offset.setXYZ(i, p.x, p.y, p.z);
      glow.tint.setXYZ(i, tint.r, tint.g, tint.b);
      glow.size.setX(i, size * (story.read ? 2.2 : 3.5 + fresh * 3));
      glow.fresh.setX(i, fresh > 0.85 ? 1 : 0);

      const ref = { story, world: world.slug, index: i, local: p };
      this.stories.set(story.id, [...(this.stories.get(story.id) ?? []), ref]);
      if (story.isNew && !story.read) {
        const ring = thinRing(size * 1.38, size * 1.48, visual.color, 0.68);
        ring.position.copy(p);
        group.add(ring);
        this.newRings.set(`${world.slug}:${story.id}`, ring);
      }
      if (story.saved) this.setSaved(story.id, true);
    });
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;

    // core halo as final glow instance — restrained
    glow.offset.setXYZ(n, 0, 0, 0);
    glow.tint.setXYZ(n, colMain.r, colMain.g, colMain.b);
    glow.size.setX(n, visual.core === "sun" ? 8 : 4.5 * scale);
    glow.fresh.setX(n, 0);
  }

  /** Light trails between galaxies for cross-topic stories. */
  private buildBridges() {
    const bridges = computeBridges(
      [this.data.today, ...this.data.worlds].map((w) => ({ slug: w.slug, entries: w.entries })),
      5,
    ).filter((b) => b.a !== "today" && b.b !== "today");

    bridges.forEach((bridge, i) => {
      const ga = this.worldGroups.get(bridge.a);
      const gb = this.worldGroups.get(bridge.b);
      if (!ga || !gb) return;
      const a = ga.position.clone();
      const b = gb.position.clone();
      const mid = a.clone().add(b).multiplyScalar(0.5);
      mid.y += a.distanceTo(b) * 0.22;
      const curve = new THREE.QuadraticBezierCurve3(a, mid, b);
      const prominent = i === 0;
      const tube = new THREE.Mesh(
        new THREE.TubeGeometry(curve, 40, 0.04, 6, false),
        new THREE.MeshBasicMaterial({
          color: 0xaac8de,
          transparent: true,
          opacity: prominent ? 0.42 : 0.16,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }),
      );
      tube.userData.bridgeStory = bridge.storyId;
      this.scene.add(tube);
      this.bridges.push({ bridge, tube, mid: curve.getPoint(0.5), prominent });
    });
  }

  private storySize(index: number): number {
    return Math.max(0.12, 0.34 - index * 0.007);
  }

  private getStoryRef(id: number, preferredWorld: string | null = this.view): StoryRef | null {
    const refs = this.stories.get(id) ?? [];
    return refs.find((ref) => ref.world === preferredWorld) ?? refs[0] ?? null;
  }

  /* ── input ─────────────────────────────────────────────────────── */

  private bindInput(el: HTMLCanvasElement) {
    el.addEventListener("pointerdown", (e) => {
      if (this.paused || this.pinching) return;
      this.dragging = true;
      this.moved = false;
      this.pointer.set(e.clientX, e.clientY);
    });
    el.addEventListener("pointermove", (e) => {
      if (this.paused || this.pinching) return;
      if (!this.dragging) {
        this.updateHover(el, e.clientX, e.clientY);
        return;
      }
      const dx = e.clientX - this.pointer.x;
      const dy = e.clientY - this.pointer.y;
      if (Math.abs(dx) + Math.abs(dy) > 4) this.moved = true;
      this.pointer.set(e.clientX, e.clientY);
      if (this.anim) return;
      this.panBy(dx, dy);
    });
    el.addEventListener("pointerup", (e) => {
      if (this.paused) return;
      this.dragging = false;
      if (!this.moved) this.tap(e.clientX, e.clientY);
      this.updateHover(el, e.clientX, e.clientY);
    });
    el.addEventListener("pointerleave", () => {
      this.dragging = false;
      el.style.cursor = "default";
      (this.hoverRing.material as THREE.MeshBasicMaterial).opacity = 0;
    });
    el.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();
        if (this.anim || this.paused) return;
        this.radius = this.clampRadius(this.radius * (1 + Math.sign(e.deltaY) * 0.08));
      },
      { passive: false },
    );
    el.addEventListener(
      "touchmove",
      (e) => {
        if (this.paused) return;
        if (e.touches.length === 2) {
          e.preventDefault();
          this.pinching = true;
          this.moved = true;
          const d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
          if (this.lastPinch > 0 && !this.anim) this.radius = this.clampRadius(this.radius * (this.lastPinch / d));
          this.lastPinch = d;
        }
      },
      { passive: false },
    );
    el.addEventListener("touchend", () => {
      this.lastPinch = 0;
      this.pinching = false;
      this.dragging = false;
    });
  }

  private panBy(dx: number, dy: number) {
    const distanceScale = this.radius * (this.isMobile ? 0.0024 : 0.0018);
    TMP_RIGHT.set(1, 0, 0).applyQuaternion(this.camera.quaternion);
    TMP_UP.set(0, 1, 0).applyQuaternion(this.camera.quaternion);
    this.target.addScaledVector(TMP_RIGHT, -dx * distanceScale);
    this.target.addScaledVector(TMP_UP, dy * distanceScale);
    const anchor = this.view ? this.worldGroups.get(this.view)?.position ?? TMP.set(0, 0, 0) : TMP.set(0, 0, 0);
    const maxOffset = this.view ? 7 * (this.worldScales.get(this.view) ?? 1) : 24;
    const offset = this.target.clone().sub(anchor);
    if (offset.length() > maxOffset) this.target.copy(anchor).add(offset.setLength(maxOffset));
  }

  private updateHover(el: HTMLCanvasElement, x: number, y: number) {
    const ndc = new THREE.Vector2((x / innerWidth) * 2 - 1, -(y / innerHeight) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    let position: THREE.Vector3 | null = null;
    let size = 1;

    if (this.view) {
      const mesh = this.instanced.get(this.view);
      const hit = mesh ? this.raycaster.intersectObject(mesh, false)[0] : null;
      if (hit?.instanceId !== undefined) {
        const story = this.byWorldIndex.get(this.view)?.[hit.instanceId];
        const ref = story ? this.getStoryRef(story.id) : null;
        if (ref) {
          position = this.worldGroups.get(ref.world)!.localToWorld(ref.local.clone());
          size = this.storySize(ref.index) * 2.1;
        }
      }
    } else {
      const bridgeHit = this.raycaster.intersectObjects(this.bridges.map((bridge) => bridge.tube), false)[0];
      if (bridgeHit) {
        position = bridgeHit.point.clone();
        size = 0.55;
      } else {
        const worldHit = this.raycaster.intersectObjects(this.hitTargets, false)[0];
        if (worldHit) {
          const slug = worldHit.object.userData.world as string;
          position = this.worldGroups.get(slug)?.position.clone() ?? null;
          size = 1.25 * (this.worldScales.get(slug) ?? 1);
        }
      }
    }

    el.style.cursor = position ? "pointer" : this.dragging ? "grabbing" : "grab";
    const material = this.hoverRing.material as THREE.MeshBasicMaterial;
    material.opacity = position ? 0.42 : 0;
    if (position) {
      this.hoverRing.position.copy(position);
      this.hoverRing.scale.setScalar(size);
    }
  }

  private clampRadius(r: number): number {
    return this.view ? Math.min(30, Math.max(6, r)) : Math.min(110, Math.max(20, r));
  }

  private tap(x: number, y: number) {
    const ndc = new THREE.Vector2((x / innerWidth) * 2 - 1, -(y / innerHeight) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);

    if (this.view === null) {
      // bridges take precedence — they're thin, test them first
      const bridgeHits = this.raycaster.intersectObjects(
        this.bridges.map((b) => b.tube),
        false,
      );
      if (bridgeHits.length > 0) {
        this.warpToStory(bridgeHits[0].object.userData.bridgeStory as number);
        return;
      }
      const hits = this.raycaster.intersectObjects(this.hitTargets, false);
      if (hits.length > 0) {
        this.enterWorld(hits[0].object.userData.world as string);
        return;
      }
      this.clearFocus();
      return;
    }

    const mesh = this.instanced.get(this.view);
    if (!mesh) return;
    const hits = this.raycaster.intersectObject(mesh, false);
    if (hits.length > 0 && hits[0].instanceId !== undefined) {
      const story = this.byWorldIndex.get(this.view)?.[hits[0].instanceId];
      if (story) {
        this.focusStory(story.id);
        return;
      }
    }
    const worldHits = this.raycaster.intersectObjects(this.hitTargets, false);
    const foreign = worldHits.find((hit) => hit.object.userData.world !== this.view);
    if (foreign) {
      this.enterWorld(foreign.object.userData.world as string);
      return;
    }
    this.clearFocus();
  }

  /* ── navigation ────────────────────────────────────────────────── */

  enterWorld(slug: string, fast = false) {
    const group = this.worldGroups.get(slug);
    if (!group) return;
    this.clearFocus();
    this.view = slug;
    this.cb.onView(slug);
    const scale = this.worldScales.get(slug) ?? 1;
    this.flyTo(
      { target: group.position.clone(), theta: this.theta + 0.7, phi: 1.25, radius: (this.isMobile ? 19 : 14) * Math.max(scale, 0.8) },
      fast ? 450 : 1400,
    );
  }

  stepWorld(direction: -1 | 1) {
    if (this.paused || this.focusedId !== null) return;
    const current = WORLD_VISUALS.findIndex((world) => world.slug === this.view);
    const next = current < 0
      ? direction > 0 ? 0 : WORLD_VISUALS.length - 1
      : (current + direction + WORLD_VISUALS.length) % WORLD_VISUALS.length;
    this.enterWorld(WORLD_VISUALS[next].slug);
  }

  rotateOverview(direction: -1 | 1) {
    if (this.paused || this.view !== null) return;
    this.flyTo({ target: this.target.clone(), theta: this.theta + direction * 0.48, phi: this.phi, radius: this.radius }, 420);
  }

  setPaused(paused: boolean) {
    this.paused = paused;
    this.dragging = false;
  }

  exitToGalaxy() {
    this.clearFocus();
    this.view = null;
    this.cb.onView(null);
    this.flyTo({ target: new THREE.Vector3(0, 0, 0), theta: this.theta - 0.5, phi: 1.12, radius: this.isMobile ? 110 : 72 }, 900);
  }

  focusStory(id: number) {
    const ref = this.getStoryRef(id);
    if (!ref) return;
    this.disposeFocusSystem();
    this.focusedId = id;
    const world = this.worldGroups.get(ref.world)!;
    const wp = world.localToWorld(ref.local.clone());
    (this.focusRing.material as THREE.MeshBasicMaterial).opacity = 0.85;
    const s = this.storySize(ref.index) * 2.4;
    this.focusRing.scale.setScalar(s);
    this.focusRing.position.copy(wp);
    const framingRadius = (this.isMobile ? 11 : 9) * Math.max(this.worldScales.get(ref.world) ?? 1, 0.8);
    this.flyTo({ target: wp, theta: this.theta, phi: this.phi, radius: framingRadius }, 520);

    // hover tier: satellites orbit at discussion velocity; instability = controversy
    const velocity = discussionVelocity(ref.story);
    const instability = controversy(ref.story);
    const k = Math.min(Math.max(ref.story.alsoCoveredBy.length, velocity > 0.2 ? 1 : 0), 4);
    if (k > 0 || instability > 0) {
      const group = new THREE.Group();
      group.position.copy(wp);
      const baseR = this.storySize(ref.index) * 3.6;
      const ring = thinRing(baseR - 0.015, baseR + 0.015, 0xdde6f2, 0.4);
      group.add(ring);
      const satellites: THREE.Mesh[] = [];
      for (let i = 0; i < k; i++) {
        const sat = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 8), new THREE.MeshBasicMaterial({ color: 0xdde6f2 }));
        group.add(sat);
        satellites.push(sat);
      }
      this.scene.add(group);
      this.focusSystem = { group, ring, satellites, omega: 0.4 + velocity * 2.4, instability, baseR };
    }
    this.emitFocus();
  }

  clearFocus() {
    const hadFocus = this.focusedId !== null;
    this.focusedId = null;
    (this.focusRing.material as THREE.MeshBasicMaterial).opacity = 0;
    this.disposeFocusSystem();
    this.cb.onFocus(null, null, 0, 0);
    if (hadFocus && this.view) this.pullBackFromStory();
  }

  private disposeFocusSystem() {
    if (!this.focusSystem) return;
    this.focusSystem.group.removeFromParent();
    this.focusSystem = null;
  }

  /** Dive toward a story until its glow fills the frame. Resolves at cover. */
  diveIntoStory(id: number): Promise<void> {
    const ref = this.getStoryRef(id);
    if (!ref) return Promise.resolve();
    const world = this.worldGroups.get(ref.world)!;
    const wp = world.localToWorld(ref.local.clone());
    return new Promise((resolve) => {
      this.flyTo({ target: wp, theta: this.theta, phi: this.phi, radius: 1.6 }, 620, resolve);
    });
  }

  pullBackFromStory() {
    const g = this.view ? this.worldGroups.get(this.view) : null;
    const scale = this.view ? (this.worldScales.get(this.view) ?? 1) : 1;
    this.flyTo(
      {
        target: g ? g.position.clone() : new THREE.Vector3(),
        theta: this.theta,
        phi: this.phi,
        radius: g ? (this.isMobile ? 19 : 14) * Math.max(scale, 0.8) : this.isMobile ? 110 : 72,
      },
      520,
    );
  }

  private flyTo(to: { target: THREE.Vector3; theta: number; phi: number; radius: number }, dur: number, done?: () => void) {
    this.anim = {
      t0: performance.now(),
      dur,
      from: { target: this.target.clone(), theta: this.theta, phi: this.phi, radius: this.radius },
      to,
      done,
    };
  }

  /* ── state mutations from the app ──────────────────────────────── */

  markRead(id: number) {
    const refs = this.stories.get(id) ?? [];
    if (refs.length === 0 || refs[0].story.read) return;
    refs[0].story.read = true;
    refs[0].story.isNew = false;
    for (const ref of refs) {
      const mesh = this.instanced.get(ref.world)!;
      mesh.setColorAt(ref.index, EMBER);
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      const glow = this.glows.get(ref.world)!;
      glow.size.setX(ref.index, this.storySize(ref.index) * 2.2);
      glow.fresh.setX(ref.index, 0);
      glow.tint.setXYZ(ref.index, EMBER.r, EMBER.g, EMBER.b);
      glow.size.needsUpdate = true;
      glow.fresh.needsUpdate = true;
      glow.tint.needsUpdate = true;
      const ringKey = `${ref.world}:${id}`;
      this.newRings.get(ringKey)?.removeFromParent();
      this.newRings.delete(ringKey);
    }
  }

  setSaved(id: number, saved: boolean) {
    const refs = this.stories.get(id) ?? [];
    if (refs.length === 0) return;
    refs[0].story.saved = saved;
    if (!saved) {
      for (const ref of refs) {
        const key = `${ref.world}:${id}`;
        this.saveRings.get(key)?.removeFromParent();
        this.saveRings.delete(key);
      }
      return;
    }
    for (const ref of refs) {
      const key = `${ref.world}:${id}`;
      if (this.saveRings.has(key)) continue;
      const size = this.storySize(ref.index);
      const ring = thinRing(size * 1.7, size * 1.9, 0xd9c26a, 0.85);
      ring.position.copy(ref.local);
      this.worldGroups.get(ref.world)!.add(ring);
      this.saveRings.set(key, ring);
    }
  }

  getCameraState(): CameraState {
    return { world: this.view, theta: this.theta, phi: this.phi, radius: this.radius };
  }

  /** Warp-bar target list: every story with its galaxy. */
  getSearchIndex(): { id: number; title: string; world: string; sourceName: string }[] {
    const out: { id: number; title: string; world: string; sourceName: string }[] = [];
    const seen = new Set<number>();
    for (const [slug, entries] of this.byWorldIndex) {
      for (const s of entries) {
        if (seen.has(s.id)) continue;
        seen.add(s.id);
        out.push({ id: s.id, title: s.title, world: slug, sourceName: s.sourceName });
      }
    }
    return out;
  }

  /** Warp: jump to a story — enter its galaxy fast, then focus. */
  warpToStory(id: number) {
    const ref = this.getStoryRef(id);
    if (!ref) return;
    if (this.view !== ref.world) {
      this.enterWorld(ref.world, true);
      setTimeout(() => this.focusStory(id), 500);
    } else {
      this.focusStory(id);
    }
  }

  /* ── frame loop ────────────────────────────────────────────────── */

  private onResize = () => {
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(innerWidth, innerHeight);
  };

  private emitFocus() {
    if (this.focusedId === null) return;
    const ref = this.getStoryRef(this.focusedId)!;
    const wp = this.worldGroups.get(ref.world)!.localToWorld(ref.local.clone());
    wp.project(this.camera);
    this.cb.onFocus(ref.story, ref.world, ((wp.x + 1) / 2) * innerWidth, ((1 - wp.y) / 2) * innerHeight);
  }

  private emitLabels() {
    const labels: HudLabel[] = [];
    const project = (wp: THREE.Vector3) => {
      const v = wp.clone().project(this.camera);
      return v.z < 1 ? { x: ((v.x + 1) / 2) * innerWidth, y: ((1 - v.y) / 2) * innerHeight } : null;
    };

    if (this.view === null) {
      for (const [slug, group] of this.worldGroups) {
        const visual = VISUALS_BY_SLUG.get(slug)!;
        const data = slug === "today" ? this.data.today : this.data.worlds.find((w) => w.slug === slug);
        if (!data) continue;
        const scale = this.worldScales.get(slug) ?? 1;
        const p = project(group.position.clone().add(TMP.set(0, -(slug === "today" ? 4 : 5 * scale) - 1.2, 0)));
        if (!p) continue;
        p.x = Math.min(Math.max(p.x, 76), innerWidth - 76);
        labels.push({
          key: `w-${slug}`,
          kind: "world",
          text: visual.label.toUpperCase(),
          sub: data.breaking ? "● BREAKING" : data.newCount > 0 ? `${data.newCount} NEW` : "UP TO DATE",
          color: visual.css,
          x: p.x,
          y: p.y,
          opacity: 1,
        });
      }
      if (!this.isMobile) {
        for (const bridge of this.bridges.filter((entry) => entry.prominent)) {
          const p = project(bridge.mid.clone());
          if (!p) continue;
          labels.push({
            key: `b-${bridge.bridge.storyId}`,
            kind: "bridge",
            text: bridge.bridge.title.length > 42 ? `${bridge.bridge.title.slice(0, 42).trimEnd()}…` : bridge.bridge.title,
            sub: `${bridge.bridge.a.toUpperCase()} × ${bridge.bridge.b.toUpperCase()}`,
            color: "#aac8de",
            x: p.x,
            y: p.y,
            opacity: 0.78,
            storyId: bridge.bridge.storyId,
          });
        }
      }
    } else {
      const entries = this.byWorldIndex.get(this.view) ?? [];
      const group = this.worldGroups.get(this.view);
      if (group) {
        const placed: Array<{ x: number; y: number }> = [];
        const limit = this.isMobile ? 4 : 7;
        for (let index = 0; index < entries.length && placed.length < limit; index++) {
          const story = entries[index];
          if (story.id === this.focusedId) continue;
          const ref = this.getStoryRef(story.id);
          if (!ref) continue;
          const p = project(group.localToWorld(ref.local.clone()).add(TMP.set(0, this.storySize(index) * 3 + 0.4, 0)));
          if (!p || p.x < 84 || p.x > innerWidth - 84 || p.y < 70 || p.y > innerHeight - 120) continue;
          if (placed.some((other) => Math.abs(other.x - p.x) < (this.isMobile ? 170 : 230) && Math.abs(other.y - p.y) < 44)) continue;
          placed.push(p);
          labels.push({
            key: `s-${story.id}`,
            kind: "story",
            text: story.title.length > 48 ? `${story.title.slice(0, 48).trimEnd()}…` : story.title,
            sub: `${story.sourceName.toUpperCase()}${story.isNew ? " · NEW" : ""}`,
            color: story.read ? "#747886" : "#eef1f8",
            x: p.x,
            y: p.y,
            opacity: story.read ? 0.48 : 0.92,
          });
        }
      }
    }
    this.cb.onLabels(labels);
  }

  private loop = () => {
    if (this.disposed) return;
    requestAnimationFrame(this.loop);
    if (document.hidden) return;

    const frameAt = performance.now();
    const dt = Math.min((frameAt - this.lastFrameAt) / 1000, 0.1);
    this.lastFrameAt = frameAt;
    if (this.paused) return;
    this.elapsedSeconds += dt;
    const t = this.elapsedSeconds;
    this.frame++;

    if (this.anim) {
      const k = Math.min(1, (performance.now() - this.anim.t0) / this.anim.dur);
      const e = EASE(k);
      const { from, to } = this.anim;
      this.target.lerpVectors(from.target, to.target, e);
      this.theta = from.theta + (to.theta - from.theta) * e;
      this.phi = from.phi + (to.phi - from.phi) * e;
      this.radius = from.radius + (to.radius - from.radius) * e;
      if (k >= 1) {
        const done = this.anim.done;
        this.anim = null;
        done?.();
      }
    }

    this.camera.position.set(
      this.target.x + this.radius * Math.sin(this.phi) * Math.sin(this.theta),
      this.target.y + this.radius * Math.cos(this.phi),
      this.target.z + this.radius * Math.sin(this.phi) * Math.cos(this.theta),
    );
    this.camera.lookAt(this.target);

    this.glowUniforms.uTime.value = t;
    // Glow LOD: soft from orbit, tight inside a galaxy.
    const gs = this.glowUniforms.uGlowScale;
    gs.value += ((this.view ? 0.5 : 1) - gs.value) * Math.min(1, dt * 4);

    // Motion discipline: only breaking pulses and the focused system move.
    for (const p of this.pulses) {
      const k = ((t * 0.42 + p.phase) % 1 + 1) % 1;
      const s = 1 + k * 1.5;
      p.ring.scale.setScalar(s);
      (p.ring.material as THREE.MeshBasicMaterial).opacity = 0.55 * (1 - k);
    }

    if (this.focusSystem) {
      const fs = this.focusSystem;
      const wob = fs.instability;
      fs.group.rotation.y += dt * fs.omega;
      if (wob > 0.05) {
        fs.ring.rotation.x = Math.sin(t * 6.5) * 0.4 * wob;
        (fs.ring.material as THREE.MeshBasicMaterial).opacity = 0.4 + Math.sin(t * 11) * 0.25 * wob;
      }
      fs.satellites.forEach((sat, i) => {
        const a = (i / Math.max(fs.satellites.length, 1)) * Math.PI * 2;
        const jitter = wob > 0.05 ? Math.sin(t * 13 + i * 2.1) * 0.12 * wob : 0;
        const r = fs.baseR * (1 + jitter);
        sat.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
      });
    }

    for (const ring of this.saveRings.values()) ring.lookAt(this.camera.position);
    if (this.focusedId !== null) {
      this.focusRing.lookAt(this.camera.position);
      if (this.focusSystem) this.focusSystem.ring.lookAt(this.camera.position);
      if (this.frame % 2 === 0) this.emitFocus();
    }
    if (this.frame % 3 === 0) this.emitLabels();

    this.renderer.render(this.scene, this.camera);

    if (!this.droppedDpr) {
      this.fpsSamples.push(dt);
      if (this.fpsSamples.length >= 120) {
        const avg = this.fpsSamples.reduce((a, b) => a + b, 0) / this.fpsSamples.length;
        if (avg > 1 / 42) {
          this.renderer.setPixelRatio(Math.min(devicePixelRatio, this.isMobile ? 1.2 : 1));
          this.droppedDpr = true;
        }
        this.fpsSamples = [];
      }
    }
  };

  dispose() {
    this.disposed = true;
    removeEventListener("resize", this.onResize);
    this.renderer.dispose();
  }
}

interface Snapshot {
  target: THREE.Vector3;
  theta: number;
  phi: number;
  radius: number;
}
