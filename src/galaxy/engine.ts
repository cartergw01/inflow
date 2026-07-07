import * as THREE from "three";
import { VISUALS_BY_SLUG, seeded, worldPosition, type WorldVisual } from "./worlds";

/**
 * The Observatory engine. One persistent scene hosts the whole product:
 * galaxy overview and every world interior are camera positions, never page
 * loads — that continuity is the emotional core of the interface.
 *
 * Performance model (see NOTES.md): story nodes are one InstancedMesh per
 * world with unlit materials (lighting is faked with emissive colors +
 * additive glow), all glows are one shader-driven Points cloud per world
 * (a single draw call each), labels are pooled DOM nodes driven by
 * projected positions, and the loop pauses when the tab is hidden.
 */

export interface GalaxyStory {
  id: number;
  title: string;
  sourceName: string;
  publishedAt: string;
  excerpt: string | null;
  topics: string[];
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
  kind: "world" | "story";
  text: string;
  sub?: string;
  color: string;
  x: number;
  y: number;
  opacity: number;
}

export interface EngineCallbacks {
  /** Story under focus (tap/hover-selected), with screen anchor, or null. */
  onFocus(story: GalaxyStory | null, worldSlug: string | null, x: number, y: number): void;
  /** Fired every few frames with label positions for the DOM layer. */
  onLabels(labels: HudLabel[]): void;
  /** View changed: null = galaxy overview, slug = inside a world. */
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

/*
 * Glow halos: view-aligned instanced quads with a procedural radial falloff.
 * gl_PointSize-based sprites are capped (or broken) on several ANGLE/headless
 * stacks, so billboarded instances are the portable path — still one draw
 * call per world.
 */
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
  float pulse = 1.0 + iFresh * 0.3 * sin(uTime * 2.6 + iOffset.x * 3.0);
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
  float a = pow(max(0.0, 1.0 - d), 1.8);
  gl_FragColor = vec4(vTint * (0.85 + vFresh * 0.5), a);
}`;

function makeGlowMesh(count: number, uniforms: { uTime: { value: number } }): {
  mesh: THREE.Mesh;
  offset: THREE.InstancedBufferAttribute;
  tint: THREE.InstancedBufferAttribute;
  size: THREE.InstancedBufferAttribute;
  fresh: THREE.InstancedBufferAttribute;
} {
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
  mesh.frustumCulled = false; // instance offsets live outside the base quad's bounds
  return { mesh, offset, tint, size, fresh };
}

export class GalaxyEngine {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private cb: EngineCallbacks;
  private isMobile: boolean;

  private worldGroups = new Map<string, THREE.Group>();
  private storyContainers = new Map<string, THREE.Group>();
  private instanced = new Map<string, THREE.InstancedMesh>();
  private glowUniforms = { uTime: { value: 0 }, uGlowScale: { value: 1 } };
  private glows = new Map<string, ReturnType<typeof makeGlowMesh>>();
  private hitTargets: THREE.Mesh[] = [];
  private stories = new Map<number, StoryRef>();
  private byWorldIndex = new Map<string, GalaxyStory[]>();
  private saveRings = new Map<number, THREE.Mesh>();
  private focusRing: THREE.Mesh;
  private focusedId: number | null = null;

  private data: GalaxyPayload;

  // orbit state
  private target = new THREE.Vector3(0, 0, 0);
  private theta = 0.4;
  private phi = 1.12;
  private radius = 58;
  private view: string | null = null; // null = galaxy
  private anim: { t0: number; dur: number; from: CameraSnapshot; to: CameraSnapshot; done?: () => void } | null = null;

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

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: !opts.isMobile, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, opts.isMobile ? 1.5 : 2));
    this.renderer.setSize(innerWidth, innerHeight);

    this.camera = new THREE.PerspectiveCamera(54, innerWidth / innerHeight, 0.1, 500);
    this.scene.fog = new THREE.FogExp2(0x04040a, 0.0075);

    this.buildStarfield();
    this.buildWorld(data.today, VISUALS_BY_SLUG.get("today")!);
    for (const w of data.worlds) {
      const visual = VISUALS_BY_SLUG.get(w.slug);
      if (visual) this.buildWorld(w, visual);
    }

    this.focusRing = new THREE.Mesh(
      new THREE.RingGeometry(1, 1.07, 48),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false }),
    );
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

  private buildStarfield() {
    const n = this.isMobile ? 1200 : 2600;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const r = 140 + Math.random() * 220;
      const t = Math.random() * Math.PI * 2;
      const p = Math.acos(2 * Math.random() - 1);
      pos[i * 3] = r * Math.sin(p) * Math.cos(t);
      pos[i * 3 + 1] = r * Math.cos(p) * 0.6;
      pos[i * 3 + 2] = r * Math.sin(p) * Math.sin(t);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    this.scene.add(new THREE.Points(g, new THREE.PointsMaterial({ color: 0x8890b8, size: 0.3, transparent: true, opacity: 0.65, fog: false })));
  }

  private buildCore(visual: WorldVisual, group: THREE.Group) {
    const mk = (geo: THREE.BufferGeometry, color: number, opacity = 1) => {
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, transparent: opacity < 1, opacity }));
      group.add(m);
      return m;
    };
    switch (visual.core) {
      case "sun":
        mk(new THREE.SphereGeometry(2.6, 40, 40), 0xffe9b0);
        break;
      case "arena": {
        mk(new THREE.SphereGeometry(2.0, 32, 32), 0x552d10);
        const ring = mk(new THREE.RingGeometry(3.0, 4.5, 64), visual.color, 0.28);
        ring.rotation.x = Math.PI / 2 - 0.42;
        break;
      }
      case "lattice":
        mk(new THREE.IcosahedronGeometry(1.7, 0), 0x0b4437);
        break;
      case "isle":
        mk(new THREE.SphereGeometry(1.9, 32, 32), 0x11402a);
        break;
      case "rotunda": {
        mk(new THREE.SphereGeometry(1.8, 32, 32, 0, Math.PI * 2, 0, Math.PI / 2), 0xb9c4e8);
        const base = mk(new THREE.CylinderGeometry(1.8, 1.8, 0.3, 40), 0x2a3568);
        base.position.y = -0.02;
        break;
      }
      case "globe":
        mk(new THREE.SphereGeometry(1.9, 32, 32), 0x2c3b55);
        break;
    }
    // core halo baked into the glow cloud instead (single draw call).
  }

  private buildWorld(world: GalaxyWorldData, visual: WorldVisual) {
    const group = new THREE.Group();
    group.position.copy(TMP.copy(worldPosition(visual, world.affinity) as THREE.Vector3Like));
    this.scene.add(group);
    this.worldGroups.set(world.slug, group);
    this.byWorldIndex.set(world.slug, world.entries);

    this.buildCore(visual, group);

    // invisible hit target for galaxy-view selection
    const hit = new THREE.Mesh(new THREE.SphereGeometry(6.5, 8, 8), new THREE.MeshBasicMaterial({ visible: false }));
    hit.userData.world = world.slug;
    group.add(hit);
    this.hitTargets.push(hit);

    const container = new THREE.Group();
    group.add(container);
    this.storyContainers.set(world.slug, container);

    const n = world.entries.length;
    const count = n + 1; // +1 for the core halo point
    const geo = new THREE.SphereGeometry(1, 12, 12);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const mesh = new THREE.InstancedMesh(geo, mat, Math.max(n, 1));
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.userData.world = world.slug;
    container.add(mesh);
    this.instanced.set(world.slug, mesh);

    const glow = makeGlowMesh(count, this.glowUniforms);
    container.add(glow.mesh);
    this.glows.set(world.slug, glow);

    const m4 = new THREE.Matrix4();
    const colMain = new THREE.Color(visual.color);
    const colAlt = new THREE.Color(visual.altColor);
    const colRead = new THREE.Color(0x2a2c36);
    const now = Date.now();

    world.entries.forEach((story, i) => {
      const local = visual.layout(i, story.id);
      const p = new THREE.Vector3(local.x, local.y, local.z);
      const size = this.storySize(i);
      m4.makeScale(size, size, size).setPosition(p);
      mesh.setMatrixAt(i, m4);

      const useAlt = seeded(story.id, 53) > 0.6;
      const tint = story.read ? colRead : useAlt ? colAlt : colMain;
      // Unread cores read as lit-from-within: node color pushed toward white,
      // the hue carried by its halo. Read stories go dark ember.
      mesh.setColorAt(i, story.read ? colRead : tint.clone().lerp(WHITE, 0.55));

      const ageH = (now - new Date(story.publishedAt).getTime()) / 3600_000;
      const fresh = story.read ? 0 : Math.max(0, 1 - ageH / 24);
      glow.offset.setXYZ(i, p.x, p.y, p.z);
      glow.tint.setXYZ(i, tint.r, tint.g, tint.b);
      glow.size.setX(i, size * (story.read ? 3 : 6.5 + fresh * 4.5));
      glow.fresh.setX(i, fresh > 0.85 ? 1 : 0);

      this.stories.set(story.id, { story, world: world.slug, index: i, local: p });
      if (story.saved) this.setSaved(story.id, true);
    });
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;

    // core halo as the final glow instance
    glow.offset.setXYZ(n, 0, 0, 0);
    glow.tint.setXYZ(n, colMain.r, colMain.g, colMain.b);
    glow.size.setX(n, visual.core === "sun" ? 11 : 6.5);
    glow.fresh.setX(n, 0);
  }

  private storySize(index: number): number {
    return Math.max(0.14, 0.4 - index * 0.008);
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
          const d = Math.hypot(
            e.touches[0].clientX - e.touches[1].clientX,
            e.touches[0].clientY - e.touches[1].clientY,
          );
          if (this.lastPinch > 0 && !this.anim) {
            this.radius = this.clampRadius(this.radius * (this.lastPinch / d));
          }
          this.lastPinch = d;
        }
      },
      { passive: false },
    );
    el.addEventListener("touchend", () => (this.lastPinch = 0));
  }

  private clampRadius(r: number): number {
    return this.view ? Math.min(30, Math.max(6, r)) : Math.min(95, Math.max(20, r));
  }

  private tap(x: number, y: number) {
    const ndc = new THREE.Vector2((x / innerWidth) * 2 - 1, -(y / innerHeight) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);

    if (this.view === null) {
      const hits = this.raycaster.intersectObjects(this.hitTargets, false);
      if (hits.length > 0) this.enterWorld(hits[0].object.userData.world as string);
      return;
    }

    const mesh = this.instanced.get(this.view);
    if (!mesh) return;
    this.raycaster.params.Points.threshold = 0.6;
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
    this.flyTo(
      { target: group.position.clone(), theta: this.theta + 0.7, phi: 1.25, radius: this.isMobile ? 19 : 14 },
      fast ? 450 : 1400,
    );
  }

  exitToGalaxy() {
    this.clearFocus();
    this.view = null;
    this.cb.onView(null);
    this.flyTo({ target: new THREE.Vector3(0, 0, 0), theta: this.theta - 0.5, phi: 1.12, radius: 58 }, 900);
  }

  focusStory(id: number) {
    const ref = this.stories.get(id);
    if (!ref) return;
    this.focusedId = id;
    const world = this.worldGroups.get(ref.world)!;
    const wp = world.localToWorld(ref.local.clone());
    (this.focusRing.material as THREE.MeshBasicMaterial).opacity = 0.9;
    const s = this.storySize(ref.index) * 2.2;
    this.focusRing.scale.setScalar(s);
    this.focusRing.position.copy(wp);
    this.emitFocus();
  }

  clearFocus() {
    this.focusedId = null;
    (this.focusRing.material as THREE.MeshBasicMaterial).opacity = 0;
    this.cb.onFocus(null, null, 0, 0);
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
    this.flyTo(
      { target: g ? g.position.clone() : new THREE.Vector3(), theta: this.theta, phi: this.phi, radius: this.isMobile ? 19 : 14 },
      520,
    );
  }

  private flyTo(to: { target: THREE.Vector3; theta: number; phi: number; radius: number }, dur: number, done?: () => void) {
    this.anim = {
      t0: performance.now(),
      dur,
      from: { target: this.target.clone(), theta: this.theta, phi: this.phi, radius: this.radius },
      to: { target: to.target, theta: to.theta, phi: to.phi, radius: to.radius },
      done,
    };
  }

  /* ── state mutations from the app ──────────────────────────────── */

  markRead(id: number) {
    const ref = this.stories.get(id);
    if (!ref || ref.story.read) return;
    ref.story.read = true;
    const mesh = this.instanced.get(ref.world)!;
    mesh.setColorAt(ref.index, new THREE.Color(0x2a2c36));
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    const glow = this.glows.get(ref.world)!;
    glow.size.setX(ref.index, this.storySize(ref.index) * 3);
    glow.fresh.setX(ref.index, 0);
    glow.tint.setXYZ(ref.index, 0.16, 0.17, 0.21);
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
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(s * 1.7, s * 1.9, 32),
      new THREE.MeshBasicMaterial({ color: 0xffd66b, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false }),
    );
    ring.position.copy(ref.local);
    this.storyContainers.get(ref.world)!.add(ring);
    this.saveRings.set(id, ring);
  }

  getCameraState(): CameraState {
    return { world: this.view, theta: this.theta, phi: this.phi, radius: this.radius };
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
        const p = project(group.position.clone().add(TMP.set(0, slug === "today" ? -4.2 : -5.4, 0)));
        if (!p) continue;
        labels.push({
          key: `w-${slug}`,
          kind: "world",
          text: visual.label.toUpperCase(),
          sub: slug === "today" ? "YOUR BRIEFING" : `${data.entries.length} STORIES · ${data.newCount} NEW`,
          color: visual.css,
          x: p.x,
          y: p.y,
          opacity: 1,
        });
      }
    } else {
      const entries = this.byWorldIndex.get(this.view) ?? [];
      const group = this.worldGroups.get(this.view)!;
      const camDist = this.camera.position.distanceTo(group.position);
      const maxN = camDist < 22 ? (this.isMobile ? 7 : 12) : 0;
      // Greedy screen-space declutter: a label is dropped if its box would
      // overlap one already placed (rank order = placement priority).
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
        // Edge labels wrap into unreadable one-word columns — skip them.
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

    // camera animation
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

    // ambient world motion
    for (const w of this.data.worlds) {
      const container = this.storyContainers.get(w.slug);
      const visual = VISUALS_BY_SLUG.get(w.slug);
      if (!container || !visual) continue;
      switch (visual.motion) {
        case "orbit-fast":
          container.rotation.y += dt * 0.14;
          break;
        case "orbit-slow":
          container.rotation.y += dt * 0.05;
          break;
        case "rise":
          container.position.y = Math.sin(t * 0.35) * 0.35;
          container.rotation.y += dt * 0.03;
          break;
        case "shimmer":
          container.rotation.y = Math.sin(t * 0.22) * 0.1;
          break;
        case "still":
          break;
      }
    }
    const todayC = this.storyContainers.get("today");
    if (todayC) todayC.rotation.y += dt * 0.06;

    this.glowUniforms.uTime.value = t;
    // Glow LOD: soft nebulae from galaxy distance, tight halos up close so
    // dense worlds stay legible. Eased toward the target each frame.
    const glowTarget = this.view ? 0.42 : 1;
    const gs = this.glowUniforms.uGlowScale;
    gs.value += (glowTarget - gs.value) * Math.min(1, dt * 4);

    // saved rings + focus ring billboard toward camera
    for (const ring of this.saveRings.values()) ring.lookAt(this.camera.position);
    if (this.focusedId !== null) {
      this.focusRing.lookAt(this.camera.position);
      if (this.frame % 2 === 0) this.emitFocus();
    }
    if (this.frame % 3 === 0) this.emitLabels();

    this.renderer.render(this.scene, this.camera);

    // adaptive quality: one-time DPR drop if struggling
    if (!this.droppedDpr) {
      this.fpsSamples.push(dt);
      if (this.fpsSamples.length >= 120) {
        const avg = this.fpsSamples.reduce((a, b) => a + b, 0) / this.fpsSamples.length;
        if (avg > 1 / 42) {
          this.renderer.setPixelRatio(1);
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

interface CameraSnapshot {
  target: THREE.Vector3;
  theta: number;
  phi: number;
  radius: number;
}
