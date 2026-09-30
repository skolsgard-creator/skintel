import {
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  CircleGeometry,
  Color,
  DirectionalLight,
  Group,
  HemisphereLight,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  Raycaster,
  Scene,
  TorusGeometry,
  Vector2,
  Vector3,
  WebGLRenderer,
} from "three";
import { BODY_REGIONS, FIGURES, type BodySide, type FigureVariant } from "./figur-data";
import {
  placementLabel,
  sideFor,
  type BodyMarker,
  type BodyPoint,
  type FigureHandle,
  type FigureOptions,
  type Vec3,
} from "./kontrakt";
import { loadFigure } from "./ladda";
import { closestPointOnMesh, nearestMarker, trianglesInRegion } from "./traff";

// 3D-figuren (steg 3.1, prov). Ren three.js-kärna utan react-three-fiber
// eller drei: ett mesh, tre ljus, en kamera som kretsar kring figuren, och
// en strålkastare för tryck. Ritar bara när något rör sig -- i vila kostar
// figuren ingenting.
//
// Rymden är figurens egen (fötter på y = 0, z+ fram), samma som databasen.
// Meshet står oförflyttat i origo, så världskoordinater = figurkoordinater.

const FOV = 30;
const DEFAULT_TARGET_Y = 0.96;
const DEFAULT_DISTANCE = 3.9;
const FOCUS_DISTANCE = 2.6;
const MIN_DISTANCE = 1.9;
const MAX_DISTANCE = 4.6;
const MAX_PITCH = 0.5;
const DEFAULT_PITCH = 0.06;
/** Ett helt varv per 1,4 skärmbredder. */
const TURN_PER_PIXEL = (2 * Math.PI) / 1.4;
const TAP_MAX_PX = 6;
const TAP_MAX_MS = 350;
/** Ett tryck inom så här många skärmpixlar från en prick träffar den
 *  (en fingertopp, ungefär 44 punkter i diameter). */
const MARKER_HIT_PX = 22;
const FRICTION = 4; // per sekund, för svängen efter släpp
const SPRING_K = 140;
const SPRING_C = 2 * Math.sqrt(SPRING_K); // kritiskt dämpad: ingen överskjutning

type Spring = { value: number; velocity: number; goal: number };

function spring(value: number): Spring {
  return { value, velocity: 0, goal: value };
}

function stepSpring(s: Spring, dt: number, instant: boolean): boolean {
  if (instant) {
    const moved = s.value !== s.goal;
    s.value = s.goal;
    s.velocity = 0;
    return moved;
  }
  const accel = SPRING_K * (s.goal - s.value) - SPRING_C * s.velocity;
  s.velocity += accel * dt;
  s.value += s.velocity * dt;
  if (Math.abs(s.goal - s.value) < 0.0005 && Math.abs(s.velocity) < 0.002) {
    s.value = s.goal;
    s.velocity = 0;
    return false;
  }
  return true;
}

/** Läser en färgtoken ur CSS via en canvas -- så tolkas även oklch(). */
function cssColor(token: string, fallback: string): Color {
  try {
    const value = getComputedStyle(document.documentElement).getPropertyValue(token).trim();
    const ctx = document.createElement("canvas").getContext("2d");
    if (value && ctx) {
      ctx.fillStyle = "#000";
      ctx.fillStyle = value;
      const hex = ctx.fillStyle;
      if (typeof hex === "string" && hex.startsWith("#")) return new Color(hex);
    }
  } catch {
    /* faller tillbaka */
  }
  return new Color(fallback);
}

function reducedMotion(): boolean {
  return typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export async function mountFigure(container: HTMLElement, options: FigureOptions): Promise<FigureHandle> {
  const t0 = performance.now();
  let variant: FigureVariant = options.variant;
  const meshPromise = loadFigure(FIGURES[variant].url);

  const canvas = document.createElement("canvas");
  canvas.style.cssText = "display:block;width:100%;height:100%;touch-action:none;outline:none";
  canvas.setAttribute("aria-hidden", "true");
  container.appendChild(canvas);

  const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0x000000, 0);

  const scene = new Scene();
  const camera = new PerspectiveCamera(FOV, 1, 0.1, 20);

  const figureColor = cssColor("--color-figure", "#cfc8bb");
  const primary = cssColor("--color-primary", "#195553");

  // Mjukt dagsljus: himmel/mark, en nyckel snett uppifrån vänster som
  // modellerar formen, och en svag kant bakifrån så att konturen står mot
  // bottnen även på figurens skuggsida.
  const hemi = new HemisphereLight(new Color("#fff8ec"), new Color("#aab4b2"), 1.25);
  scene.add(hemi);
  const key = new DirectionalLight(new Color("#ffffff"), 1.7);
  key.position.set(3, 4, 2.5);
  scene.add(key);
  const rim = new DirectionalLight(new Color("#dfe9e7"), 0.8);
  rim.position.set(-2.5, 2, -2.5);
  scene.add(rim);

  const material = new MeshStandardMaterial({ color: figureColor, roughness: 0.92, metalness: 0 });
  const geometry = new BufferGeometry();
  const body = new Mesh(geometry, material);
  scene.add(body);

  // Skuggan under fötterna: en mjuk, platt fläck på golvet (y = 0), så att
  // figuren står på något i stället för att sväva. Den ligger i scenen och
  // följer kameran när man vrider och zoomar; tryck träffar bara kroppen.
  const shadowCanvas = document.createElement("canvas");
  shadowCanvas.width = 128;
  shadowCanvas.height = 128;
  const shadowCtx = shadowCanvas.getContext("2d");
  if (shadowCtx) {
    const g = shadowCtx.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, "rgba(46, 38, 30, 0.26)");
    g.addColorStop(0.55, "rgba(46, 38, 30, 0.10)");
    g.addColorStop(1, "rgba(46, 38, 30, 0)");
    shadowCtx.fillStyle = g;
    shadowCtx.fillRect(0, 0, 128, 128);
  }
  const shadowTexture = new CanvasTexture(shadowCanvas);
  const shadowGeometry = new PlaneGeometry(1.0, 1.1);
  const shadowMaterial = new MeshBasicMaterial({ map: shadowTexture, transparent: true, depthWrite: false });
  const shadow = new Mesh(shadowGeometry, shadowMaterial);
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.set(0, 0.002, 0.03);
  scene.add(shadow);

  const markerGroup = new Group();
  scene.add(markerGroup);
  const markerMaterial = new MeshBasicMaterial({ color: primary });
  // Bärnsten för fläckar där något väntar på patienten. Den mörka tonen
  // (amber-ink): den ljusa accenten syns för dåligt mot figurens papperston.
  const amberMaterial = new MeshBasicMaterial({ color: cssColor("--color-amber-ink", "#8a5a1c") });
  const ringGeometry = new TorusGeometry(0.03, 0.0045, 8, 40);
  const dotGeometry = new CircleGeometry(0.011, 24);
  const selectionRingGeometry = new TorusGeometry(0.042, 0.0055, 8, 48);
  const selectionDotGeometry = new CircleGeometry(0.014, 24);

  let regions: Uint8Array = new Uint8Array(0);
  let meshPositions: Float32Array = new Float32Array(0);
  let meshIndex: Uint16Array = new Uint16Array(0);
  let triangles = 0;

  // Kameran i sfäriska koordinater kring en målpunkt.
  const yaw = spring(0);
  const pitch = spring(DEFAULT_PITCH);
  const distance = spring(DEFAULT_DISTANCE);
  const targetY = spring(DEFAULT_TARGET_Y);
  const target = new Vector3(0, DEFAULT_TARGET_Y, 0);
  let yawVelocity = 0; // sväng efter släpp
  const instant = reducedMotion();

  function placeCamera() {
    target.set(0, targetY.value, 0);
    const cp = Math.cos(pitch.value);
    camera.position.set(
      target.x + distance.value * Math.sin(yaw.value) * cp,
      target.y + distance.value * Math.sin(pitch.value),
      target.z + distance.value * Math.cos(yaw.value) * cp,
    );
    camera.lookAt(target);
  }

  // Ritloopen går bara när något rör sig.
  let frame = 0;
  let lastTime = 0;
  let needsRender = true;
  let destroyed = false;
  let readyReported = false;
  let fpsFrames = 0;
  let fpsSince = 0;

  function requestFrame() {
    if (frame || destroyed) return;
    lastTime = performance.now();
    fpsSince = lastTime;
    fpsFrames = 0;
    frame = requestAnimationFrame(tick);
  }

  function tick(now: number) {
    frame = 0;
    if (destroyed) return;
    const dt = Math.min(0.032, Math.max(0.001, (now - lastTime) / 1000));
    lastTime = now;

    let moving = false;
    if (yawVelocity !== 0) {
      yaw.value += yawVelocity * dt;
      yaw.goal = yaw.value;
      yawVelocity *= Math.exp(-FRICTION * dt);
      if (Math.abs(yawVelocity) < 0.02) yawVelocity = 0;
      moving = true;
    }
    moving = stepSpring(yaw, dt, instant) || moving;
    moving = stepSpring(pitch, dt, instant) || moving;
    moving = stepSpring(distance, dt, instant) || moving;
    moving = stepSpring(targetY, dt, instant) || moving;

    if (moving || needsRender) {
      needsRender = false;
      placeCamera();
      renderer.render(scene, camera);
      fpsFrames += 1;
      if (now - fpsSince >= 500) {
        options.onFps?.(Math.round((fpsFrames * 1000) / (now - fpsSince)));
        fpsSince = now;
        fpsFrames = 0;
      }
      if (!readyReported && triangles > 0) {
        readyReported = true;
        requestAnimationFrame(() => {
          if (!destroyed) options.onReady?.({ firstFrameMs: performance.now() - t0, triangles });
        });
      }
    }
    if (moving) frame = requestAnimationFrame(tick);
  }

  function invalidate() {
    needsRender = true;
    requestFrame();
  }

  // Storlek följer behållaren.
  function resize() {
    const w = container.clientWidth || 1;
    const h = container.clientHeight || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    invalidate();
  }
  const observer = new ResizeObserver(resize);
  observer.observe(container);
  resize();

  // Pekare: ett finger vrider, två zoomar, ett kort tryck väljer.
  type Pointer = { x: number; y: number };
  const pointers = new Map<number, Pointer>();
  let down: { x: number; y: number; time: number; moved: number } | null = null;
  let lastMove: { x: number; time: number } | null = null;
  let lastVelocity = 0;
  let pinchDistance = 0;

  const raycaster = new Raycaster();
  const ndc = new Vector2();

  function pick(clientX: number, clientY: number): BodyPoint | null {
    const rect = canvas.getBoundingClientRect();
    ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    const hit = raycaster.intersectObject(body, false)[0];
    if (!hit || !hit.face) return null;
    const p = hit.point;
    // Regionen: det hörn i den träffade triangeln som ligger närmast punkten.
    const pos = geometry.getAttribute("position") as BufferAttribute;
    let bestIndex = hit.face.a;
    let bestDist = Infinity;
    for (const vi of [hit.face.a, hit.face.b, hit.face.c]) {
      const d = p.distanceToSquared(new Vector3().fromBufferAttribute(pos, vi));
      if (d < bestDist) {
        bestDist = d;
        bestIndex = vi;
      }
    }
    const region = BODY_REGIONS[regions[bestIndex] ?? 0]!;
    const n = (hit.normal ?? hit.face.normal).clone().normalize();
    const side: BodySide = region.paired ? (sideFor(p.x) === "mitten" ? (p.x >= 0 ? "vanster" : "hoger") : sideFor(p.x)) : sideFor(p.x);
    return {
      regionKey: region.key,
      side,
      label: placementLabel(region.key, side),
      position: [round(p.x), round(p.y), round(p.z)],
      normal: [round(n.x), round(n.y), round(n.z)],
    };
  }

  function onPointerDown(e: PointerEvent) {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    yawVelocity = 0;
    lastVelocity = 0;
    // Ett nytt grepp avbryter en pågående kamerarörelse där den är.
    yaw.goal = yaw.value;
    pitch.goal = pitch.value;
    if (pointers.size === 1) {
      down = { x: e.clientX, y: e.clientY, time: e.timeStamp, moved: 0 };
      lastMove = { x: e.clientX, time: e.timeStamp };
    } else if (pointers.size === 2) {
      down = null;
      const [a, b] = [...pointers.values()];
      pinchDistance = Math.hypot(a!.x - b!.x, a!.y - b!.y);
    }
  }

  function onPointerMove(e: PointerEvent) {
    const prev = pointers.get(e.pointerId);
    if (!prev) return;
    const dx = e.clientX - prev.x;
    const dy = e.clientY - prev.y;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 1) {
      const width = canvas.clientWidth || 1;
      yaw.value -= (dx / width) * TURN_PER_PIXEL;
      yaw.goal = yaw.value;
      pitch.value = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, pitch.value + (dy / width) * TURN_PER_PIXEL * 0.6));
      pitch.goal = pitch.value;
      if (down) down.moved += Math.abs(dx) + Math.abs(dy);
      if (lastMove) {
        const dtMs = e.timeStamp - lastMove.time;
        if (dtMs > 0) lastVelocity = (-(e.clientX - lastMove.x) / width) * TURN_PER_PIXEL * (1000 / dtMs);
      }
      lastMove = { x: e.clientX, time: e.timeStamp };
      invalidate();
    } else if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a!.x - b!.x, a!.y - b!.y);
      if (pinchDistance > 0 && d > 0) {
        distance.value = Math.max(MIN_DISTANCE, Math.min(MAX_DISTANCE, (distance.value * pinchDistance) / d));
        distance.goal = distance.value;
      }
      pinchDistance = d;
      invalidate();
    }
  }

  function onPointerUp(e: PointerEvent) {
    if (!pointers.has(e.pointerId)) return;
    pointers.delete(e.pointerId);
    if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
    if (pointers.size === 0 && down) {
      const isTap = down.moved < TAP_MAX_PX && e.timeStamp - down.time < TAP_MAX_MS;
      if (isTap) {
        // En prick nära trycket vinner över kroppen under den.
        const markerId = pickMarker(e.clientX, e.clientY);
        if (markerId) {
          options.onPick({ kind: "marker", id: markerId });
        } else {
          const point = pick(e.clientX, e.clientY);
          options.onPick(point ? { kind: "body", point } : { kind: "none" });
        }
      } else if (!instant && lastMove && e.timeStamp - lastMove.time < 80) {
        yawVelocity = Math.max(-12, Math.min(12, lastVelocity));
        requestFrame();
      }
    }
    down = null;
    lastMove = null;
    pinchDistance = 0;
  }

  function onWheel(e: WheelEvent) {
    e.preventDefault();
    distance.value = Math.max(MIN_DISTANCE, Math.min(MAX_DISTANCE, distance.value * (1 + e.deltaY * 0.0012)));
    distance.goal = distance.value;
    invalidate();
  }

  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("pointercancel", onPointerUp);
  canvas.addEventListener("wheel", onWheel, { passive: false });

  // Markeringar: pricken med ring, som i logotypen, lagd platt mot huden.
  // Den sparade punkten läggs på närmaste punkt på den kropp som visas
  // (traff.ts); prickarna minns sina punkter och läggs om när kroppen byts.
  const markerMeshes: Group[] = [];
  let selectionGroup: Group | null = null;
  let currentMarkers: readonly BodyMarker[] = [];
  let currentSelection: BodyPoint | null = null;
  /** Prickarna där de ligger på ytan -- det som ett tryck prövas mot. */
  let placed: { id: string; position: Vector3; normal: Vector3 }[] = [];

  /** Trianglarna per region på den kropp som visas; töms när kroppen byts. */
  const regionTriangles = new Map<string, Uint32Array>();

  function trianglesFor(regionKey: string | null): ArrayLike<number> {
    const id = regionKey ? BODY_REGIONS.findIndex((r) => r.key === regionKey) : -1;
    if (id < 0) return meshIndex;
    let triangles = regionTriangles.get(regionKey!);
    if (!triangles) {
      triangles = trianglesInRegion(meshIndex, regions, id);
      regionTriangles.set(regionKey!, triangles);
    }
    return triangles.length > 0 ? triangles : meshIndex;
  }

  /** Den sparade punkten på ytan av den kropp som visas, inom sin region. */
  function onSurface(position: Vec3, normal: Vec3, regionKey: string | null): { position: Vector3; normal: Vector3 } {
    const hit = closestPointOnMesh(meshPositions, trianglesFor(regionKey), position);
    const p = hit ? hit.point : position;
    const n = hit ? hit.normal : normal;
    return { position: new Vector3(...p), normal: new Vector3(...n).normalize() };
  }

  function makeMarker(position: Vector3, normal: Vector3, selected: boolean, tone: BodyMarker["tone"]): Group {
    const g = new Group();
    const p = position.clone().addScaledVector(normal, 0.004);
    g.position.copy(p);
    g.lookAt(p.clone().add(normal));
    const material = tone === "amber" ? amberMaterial : markerMaterial;
    const ring = new Mesh(selected ? selectionRingGeometry : ringGeometry, material);
    const dot = new Mesh(selected ? selectionDotGeometry : dotGeometry, material);
    g.add(ring, dot);
    return g;
  }

  function placeMarkers() {
    for (const m of markerMeshes) markerGroup.remove(m);
    markerMeshes.length = 0;
    placed = [];
    for (const m of currentMarkers) {
      const s = onSurface(m.position, m.normal, m.regionKey);
      const g = makeMarker(s.position, s.normal, false, m.tone);
      markerMeshes.push(g);
      markerGroup.add(g);
      placed.push({ id: m.id, position: s.position, normal: s.normal });
    }
    invalidate();
  }

  function placeSelection() {
    if (selectionGroup) {
      markerGroup.remove(selectionGroup);
      selectionGroup = null;
    }
    if (currentSelection) {
      const s = onSurface(currentSelection.position, currentSelection.normal, currentSelection.regionKey || null);
      // Valet är blågrönt: det betyder "svarar på tryck", vilken färg
      // pricken än har.
      selectionGroup = makeMarker(s.position, s.normal, true, "primary");
      markerGroup.add(selectionGroup);
    }
    invalidate();
  }

  function setMarkers(markers: readonly BodyMarker[]) {
    currentMarkers = markers;
    placeMarkers();
  }

  function setSelection(point: BodyPoint | null) {
    currentSelection = point;
    placeSelection();
  }

  /** Pricken under trycket: nära på skärmen, vänd mot kameran och inte
   *  skymd av en annan del av kroppen (en arm framför bålen). */
  function pickMarker(clientX: number, clientY: number): string | null {
    if (placed.length === 0) return null;
    const rect = canvas.getBoundingClientRect();
    const byId = new Map(placed.map((m) => [m.id, m]));
    const projected = placed.map((m) => {
      const v = m.position.clone().project(camera);
      return { id: m.id, x: ((v.x + 1) / 2) * rect.width, y: ((1 - v.y) / 2) * rect.height };
    });
    return nearestMarker(projected, { x: clientX - rect.left, y: clientY - rect.top }, MARKER_HIT_PX, (id) => {
      const m = byId.get(id);
      if (!m) return false;
      const toCamera = camera.position.clone().sub(m.position);
      if (toCamera.dot(m.normal) <= 0) return false;
      const distance = toCamera.length();
      raycaster.set(camera.position, m.position.clone().sub(camera.position).normalize());
      const hit = raycaster.intersectObject(body, false)[0];
      return !hit || hit.distance >= distance - 0.01;
    });
  }

  /** Närmaste väg runt varvet till en vinkel. */
  function turnTo(goalYaw: number) {
    const twoPi = 2 * Math.PI;
    let delta = (goalYaw - yaw.value) % twoPi;
    if (delta > Math.PI) delta -= twoPi;
    if (delta < -Math.PI) delta += twoPi;
    yaw.goal = yaw.value + delta;
    yawVelocity = 0;
  }

  function focus(regionKey: string, side: BodySide): BodyPoint | null {
    const bySide = FIGURES[variant].focus[regionKey];
    const fp = bySide?.[side] ?? bySide?.vanster ?? bySide?.hoger ?? bySide?.mitten;
    if (!fp) return null;
    const [nx, ny, nz] = fp.n;
    turnTo(Math.atan2(nx, nz));
    pitch.goal = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, Math.asin(Math.max(-1, Math.min(1, ny)))));
    distance.goal = FOCUS_DISTANCE;
    targetY.goal = Math.max(0.55, Math.min(1.55, fp.p[1]));
    requestFrame();
    return {
      regionKey,
      side,
      label: placementLabel(regionKey, side),
      position: fp.p,
      normal: fp.n,
    };
  }

  function facing(): "front" | "back" {
    return Math.cos(yaw.goal) >= 0 ? "front" : "back";
  }

  function turn(face: "front" | "back") {
    turnTo(face === "front" ? 0 : Math.PI);
    pitch.goal = DEFAULT_PITCH;
    distance.goal = DEFAULT_DISTANCE;
    targetY.goal = DEFAULT_TARGET_Y;
    requestFrame();
  }

  function destroy() {
    destroyed = true;
    if (frame) cancelAnimationFrame(frame);
    observer.disconnect();
    canvas.removeEventListener("pointerdown", onPointerDown);
    canvas.removeEventListener("pointermove", onPointerMove);
    canvas.removeEventListener("pointerup", onPointerUp);
    canvas.removeEventListener("pointercancel", onPointerUp);
    canvas.removeEventListener("wheel", onWheel);
    geometry.dispose();
    material.dispose();
    markerMaterial.dispose();
    amberMaterial.dispose();
    shadowGeometry.dispose();
    shadowMaterial.dispose();
    shadowTexture.dispose();
    ringGeometry.dispose();
    dotGeometry.dispose();
    selectionRingGeometry.dispose();
    selectionDotGeometry.dispose();
    // dispose() släpper inte WebGL-kontexten; utan det här samlas en kontext
    // per besök på Min hud tills webbläsaren tar slut på dem (ungefär 16).
    renderer.forceContextLoss();
    renderer.dispose();
    canvas.remove();
  }

  function useMesh(mesh: Awaited<typeof meshPromise>) {
    geometry.setAttribute("position", new BufferAttribute(mesh.positions, 3));
    geometry.setIndex(new BufferAttribute(mesh.index, 1));
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
    regions = mesh.regions;
    meshPositions = mesh.positions;
    meshIndex = mesh.index;
    regionTriangles.clear();
    triangles = mesh.triangleCount;
    // Prickarna och valet läggs på den här kroppens yta.
    placeMarkers();
    placeSelection();
    invalidate();
  }

  let variantLoad = 0;
  async function setVariant(next: FigureVariant) {
    if (next === variant) return;
    variant = next;
    const load = ++variantLoad;
    const mesh = await loadFigure(FIGURES[next].url);
    // En senare växling vinner. Valet hör till den kropp det gjordes på;
    // prickarna följer med till den nya.
    if (destroyed || load !== variantLoad) return;
    currentSelection = null;
    useMesh(mesh);
  }

  const handle: FigureHandle = { setVariant, setMarkers, setSelection, focus, turn, facing, destroy };
  const mesh = await meshPromise;
  if (destroyed) return handle;
  useMesh(mesh);
  return handle;
}

function round(v: number): number {
  return Math.round(v * 10000) / 10000;
}
