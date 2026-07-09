import * as THREE from "three";
import { VISUALS_BY_SLUG, activityScale, seeded, worldPosition, type WorldVisual } from "./worlds";
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
  publishedAt: string;
  excerpt: string | null;
  topics: string[];
  sourceClass: string;
  hasBody: boolean;
  url: string;
  readingMinutes: number | null;
  alsoCoveredBy: { sourceName: string; url: string }[];
  saved: boolean;
  read: boolean;
  exploration: boolean;
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
const WHITE = new THREE.Color(0xffffff);
const EMBER = new THREE.Color(0x272a34);
const TAU = Math.PI * 2;
const GALAXY_BACKDROP_URL = "/images/inflow-spiral-galaxy.png";

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
  private backdropTexture: THREE.Texture | null = null;

  private worldGroups = new Map<string, THREE.Group>();
  private worldScales = new Map<string, number>();
  private glowUniforms = { uTime: { value: 0 }, uGlowScale: { value: 1 } };
  private glows = new Map<string, ReturnType<typeof makeGlowMesh>>();
  private instanced = new Map<string, THREE.InstancedMesh>();
  private hitTargets: THREE.Mesh[] = [];
  private stories = new Map<number, StoryRef>();
  private byWorldIndex = new Map<string, GalaxyStory[]>();
  private saveRings = new Map<number, THREE.Mesh>();
  private pulses: { ring: THREE.Mesh; halo: THREE.Sprite | null; phase: number; scale: number }[] = [];
  private bridges: BridgeRef[] = [];
  private focusRing: THREE.Mesh;
  private focusSystem: FocusSystem | null = null;
  private focusedId: number | null = null;

  private data: GalaxyPayload;

  private target = new THREE.Vector3(0, 0, 0);
  private theta = 0.4;
  private phi = 1.12;
  private radius = 58; // reset per-device below
  private view: string | null = null;
  private anim: { t0: number; dur: number; from: Snapshot; to: Snapshot; done?: () => void } | null = null;

  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2();
  private dragging = false;
  private moved = false;
  private lastPinch = 0;

  private clock = new THREE.Clock();
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
    this.radius = opts.isMobile ? 80 : 58;

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: !opts.isMobile, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.setSize(innerWidth, innerHeight);

    this.camera = new THREE.PerspectiveCamera(52, innerWidth / innerHeight, 0.1, 500);
    this.scene.fog = new THREE.FogExp2(0x030407, 0.006);

    this.loadGalaxyBackdrop();
    this.buildGalacticDisc();
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

  private loadGalaxyBackdrop() {
    const loader = new THREE.TextureLoader();
    loader.load(GALAXY_BACKDROP_URL, (texture) => {
      if (this.disposed) {
        texture.dispose();
        return;
      }
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.minFilter = THREE.LinearFilter;
      texture.magFilter = THREE.LinearFilter;
      this.backdropTexture = texture;
      this.scene.background = texture;
    });
  }

  /** A quiet spiral-disk star bed so the Observatory reads as a galaxy, not a solar map. */
  private buildGalacticDisc() {
    const n = this.isMobile ? 2200 : 5200;
    const pos = new Float32Array(n * 3);
    const colors = new Float32Array(n * 3);
    const core = new THREE.Color(0xffe4bd);
    const arm = new THREE.Color(0x8ea8dd);
    const violet = new THREE.Color(0x7b6bb6);
    const color = new THREE.Color();

    for (let i = 0; i < n; i++) {
      const u = seeded(i + 1, 101);
      const radius = 2.5 + Math.pow(u, 1.85) * 74;
      const armIndex = Math.floor(seeded(i + 1, 103) * 4);
      const spiral = armIndex * (TAU / 4) + radius * 0.255;
      const spread = 0.24 + radius * 0.018;
      const angle = spiral + (seeded(i + 1, 107) - 0.5) * spread * 3.2;
      const lane = (seeded(i + 1, 109) - 0.5) * (0.7 + radius * 0.016);

      pos[i * 3] = Math.cos(angle) * (radius + lane);
      pos[i * 3 + 1] = (seeded(i + 1, 113) - 0.5) * (0.9 + radius * 0.018);
      pos[i * 3 + 2] = Math.sin(angle) * (radius + lane);

      const mix = Math.min(1, radius / 48);
      color.lerpColors(core, seeded(i + 1, 127) > 0.82 ? violet : arm, mix);
      const falloff = 0.45 + Math.max(0, 1 - radius / 82) * 0.5;
      colors[i * 3] = color.r * falloff;
      colors[i * 3 + 1] = color.g * falloff;
      colors[i * 3 + 2] = color.b * falloff;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    const material = new THREE.PointsMaterial({
      size: this.isMobile ? 0.16 : 0.13,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.72,
      vertexColors: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
    });
    const disc = new THREE.Points(geometry, material);
    disc.rotation.y = -0.35;
    disc.renderOrder = -10;
    disc.frustumCulled = false;
    this.scene.add(disc);
  }

  private buildStarfield() {
    const n = this.isMobile ? 1200 : 2600;
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
      new THREE.Points(g, new THREE.PointsMaterial({ color: 0x77809f, size: 0.2, transparent: true, opacity: 0.46, fog: false })),
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

    switch (visual.core) {
      case "sun":
        mk(new THREE.SphereGeometry(1.7, 40, 40), 0xf0e2b0);
        break;
      case "arena": {
        mk(new THREE.SphereGeometry(1.1 * scale, 28, 28), 0x3a2413);
        const ring = mk(new THREE.RingGeometry(2.6 * scale, 3.1 * scale, 96), visual.color, 0.2);
        ring.rotation.x = Math.PI / 2 - 0.42;
        break;
      }
      case "lattice": {
        const ico = mk(new THREE.IcosahedronGeometry(1.15 * scale, 0), 0x0d3a30);
        ico.add(
          new THREE.Mesh(
            new THREE.IcosahedronGeometry(1.16 * scale, 0),
            new THREE.MeshBasicMaterial({ color: visual.color, wireframe: true, transparent: true, opacity: 0.35 }),
          ),
        );
        break;
      }
      case "isle":
        mk(new THREE.SphereGeometry(1.15 * scale, 28, 28), 0x11402a);
        break;
      case "rotunda": {
        mk(new THREE.SphereGeometry(1.05 * scale, 28, 28, 0, Math.PI * 2, 0, Math.PI / 2), 0xb9c4e8);
        const base = mk(new THREE.CylinderGeometry(1.05 * scale, 1.05 * scale, 0.2 * scale, 32), 0x232c58);
        base.position.y = -0.02;
        break;
      }
      case "globe":
        mk(new THREE.SphereGeometry(1.15 * scale, 28, 28), 0x2c3b55);
        break;
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

      this.stories.set(story.id, { story, world: world.slug, index: i, local: p });
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

  /* ── input ─────────────────────────────────────────────────────── */

  private bindInput(el: HTMLCanvasElement) {
    el.addEventListener("pointerdown", (e) => {
      this.dragging = true;
      this.moved = false;
      this.pointer.set(e.clientX, e.clientY);
    });
    el.addEventListener("pointermove", (e) => {
      if (!this.dragging) return;
      const dx = e.clientX - this.pointer.x;
      const dy = e.clientY - this.pointer.y;
      if (Math.abs(dx) + Math.abs(dy) > 4) this.moved = true;
      this.pointer.set(e.clientX, e.clientY);
      if (this.anim) return;
      this.theta -= dx * 0.005;
      this.phi = Math.min(2.6, Math.max(0.35, this.phi - dy * 0.004));
    });
    el.addEventListener("pointerup", (e) => {
      this.dragging = false;
      if (!this.moved) this.tap(e.clientX, e.clientY);
    });
    el.addEventListener("pointerleave", () => (this.dragging = false));
    el.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();
        if (this.anim) return;
        this.radius = this.clampRadius(this.radius * (1 + Math.sign(e.deltaY) * 0.08));
      },
      { passive: false },
    );
    el.addEventListener(
      "touchmove",
      (e) => {
        if (e.touches.length === 2) {
          e.preventDefault();
          const d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
          if (this.lastPinch > 0 && !this.anim) this.radius = this.clampRadius(this.radius * (this.lastPinch / d));
          this.lastPinch = d;
        }
      },
      { passive: false },
    );
    el.addEventListener("touchend", () => (this.lastPinch = 0));
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
        this.focusStory(bridgeHits[0].object.userData.bridgeStory as number);
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

  exitToGalaxy() {
    this.clearFocus();
    this.view = null;
    this.cb.onView(null);
    this.flyTo({ target: new THREE.Vector3(0, 0, 0), theta: this.theta - 0.5, phi: 1.12, radius: this.isMobile ? 80 : 58 }, 900);
  }

  focusStory(id: number) {
    const ref = this.stories.get(id);
    if (!ref) return;
    this.disposeFocusSystem();
    this.focusedId = id;
    const world = this.worldGroups.get(ref.world)!;
    const wp = world.localToWorld(ref.local.clone());
    (this.focusRing.material as THREE.MeshBasicMaterial).opacity = 0.85;
    const s = this.storySize(ref.index) * 2.4;
    this.focusRing.scale.setScalar(s);
    this.focusRing.position.copy(wp);

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
    this.focusedId = null;
    (this.focusRing.material as THREE.MeshBasicMaterial).opacity = 0;
    this.disposeFocusSystem();
    this.cb.onFocus(null, null, 0, 0);
  }

  private disposeFocusSystem() {
    if (!this.focusSystem) return;
    this.focusSystem.group.removeFromParent();
    this.focusSystem = null;
  }

  /** Dive toward a story until its glow fills the frame. Resolves at cover. */
  diveIntoStory(id: number): Promise<void> {
    const ref = this.stories.get(id);
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
        radius: g ? (this.isMobile ? 19 : 14) * Math.max(scale, 0.8) : this.isMobile ? 80 : 58,
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
    const ref = this.stories.get(id);
    if (!ref || ref.story.read) return;
    ref.story.read = true;
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
  }

  setSaved(id: number, saved: boolean) {
    const existing = this.saveRings.get(id);
    if (!saved) {
      if (existing) {
        existing.removeFromParent();
        this.saveRings.delete(id);
      }
      const ref = this.stories.get(id);
      if (ref) ref.story.saved = false;
      return;
    }
    if (existing) return;
    const ref = this.stories.get(id);
    if (!ref) return;
    ref.story.saved = true;
    const s = this.storySize(ref.index);
    const ring = thinRing(s * 1.7, s * 1.9, 0xd9c26a, 0.85);
    ring.position.copy(ref.local);
    this.worldGroups.get(ref.world)!.add(ring);
    this.saveRings.set(id, ring);
  }

  getCameraState(): CameraState {
    return { world: this.view, theta: this.theta, phi: this.phi, radius: this.radius };
  }

  /** Warp-bar target list: every story with its galaxy. */
  getSearchIndex(): { id: number; title: string; world: string; sourceName: string }[] {
    const out: { id: number; title: string; world: string; sourceName: string }[] = [];
    for (const [slug, entries] of this.byWorldIndex) {
      for (const s of entries) out.push({ id: s.id, title: s.title, world: slug, sourceName: s.sourceName });
    }
    return out;
  }

  /** Warp: jump to a story — enter its galaxy fast, then focus. */
  warpToStory(id: number) {
    const ref = this.stories.get(id);
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
    const ref = this.stories.get(this.focusedId)!;
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
          sub: slug === "today" ? "YOUR BRIEFING" : data.breaking ? "◉ BREAKING" : `${data.entries.length} STORIES`,
          color: visual.css,
          x: p.x,
          y: p.y,
          opacity: 1,
        });
      }
      // top bridges get ambient labels; the rest reveal on tap
      for (const ref of this.bridges.filter((b) => b.prominent)) {
        const p = project(ref.mid.clone());
        if (!p) continue;
        const t = ref.bridge.title;
        labels.push({
          key: `b-${ref.bridge.storyId}`,
          kind: "bridge",
          text: t.length > 44 ? `${t.slice(0, 44).trimEnd()}…` : t,
          sub: `${ref.bridge.a.toUpperCase()} × ${ref.bridge.b.toUpperCase()}`,
          color: "#aac8de",
          x: p.x,
          y: p.y,
          opacity: 0.95,
          storyId: ref.bridge.storyId,
        });
      }
    } else {
      const entries = this.byWorldIndex.get(this.view) ?? [];
      const group = this.worldGroups.get(this.view)!;
      const camDist = this.camera.position.distanceTo(group.position);
      const maxN = camDist < 26 ? (this.isMobile ? 7 : 12) : 0;
      const placed: { x: number; y: number }[] = [];
      const W = 250;
      const H = 40;
      const edge = this.isMobile ? 96 : 130;
      for (let i = 0; i < entries.length && labels.length < maxN; i++) {
        const story = entries[i];
        if (story.id === this.focusedId) continue;
        const ref = this.stories.get(story.id)!;
        const p = project(group.localToWorld(ref.local.clone()).add(TMP.set(0, this.storySize(i) * 3 + 0.35, 0)));
        if (!p) continue;
        if (p.x < edge || p.x > innerWidth - edge || p.y < 70 || p.y > innerHeight - 90) continue;
        if (placed.some((q) => Math.abs(q.x - p.x) < W && Math.abs(q.y - p.y) < H)) continue;
        placed.push(p);
        labels.push({
          key: `s-${story.id}`,
          kind: "story",
          text: story.title.length > 54 ? `${story.title.slice(0, 54).trimEnd()}…` : story.title,
          color: story.read ? "#71747f" : "#f2f3f8",
          x: p.x,
          y: p.y,
          opacity: story.read ? 0.5 : 0.9,
        });
      }
    }
    this.cb.onLabels(labels);
  }

  private loop = () => {
    if (this.disposed) return;
    requestAnimationFrame(this.loop);
    if (document.hidden) return;

    const dt = this.clock.getDelta();
    const t = this.clock.elapsedTime;
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
    this.backdropTexture?.dispose();
    this.renderer.dispose();
  }
}

interface Snapshot {
  target: THREE.Vector3;
  theta: number;
  phi: number;
  radius: number;
}
