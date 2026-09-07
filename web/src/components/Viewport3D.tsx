// The 3D sky viewport. Builds the Three.js scene once, runs a rAF loop that
// orients the camera, manages per-aircraft objects + trails, renders the sky
// layer, and attaches HTML labels via CSS2DRenderer so the text follows each
// aircraft on screen.

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { CSS2DRenderer, CSS2DObject } from "three/examples/jsm/renderers/CSS2DRenderer.js";
import type { SkyData, WeatherCategory } from "@skyview/shared/index.js";
import { glyphColor, formatDistance, llToMeters, groundToSkyAngles } from "@skyview/shared/index.js";
import { createScene } from "../utils/three-setup.js";
import { buildAircraft, DEFAULT_GLB_URL, tryLoadGlb } from "../utils/aircraft-models.js";
import { orientCamera, dragView, scrollView } from "../utils/camera.js";
import { skyPos } from "../utils/calculations.js";
import { dataManager, type AircraftFrame, DOME_RADIUS } from "../utils/data-processing.js";
import { alertForAircraft } from "../utils/alerts.js";
import { SKY_DOME_RADIUS, DEFAULT_FOV } from "../utils/constants.js";
import { useUI, type DisplayPrefs } from "../store.js";

interface Vehicle {
  object: { group: THREE.Group; material: THREE.MeshStandardMaterial };
  history: { p: THREE.Vector3; t: number }[];
  line: THREE.Line;
  label: CSS2DObject;
  leader: THREE.Line;
  lastFrame: number;
  /** Screen-space declutter offset (pixels of upward shift) applied to the label. */
  labelDy: number;
}

/** Constant model scale — all contacts sit on a fixed-radius dome, so every
 *  aircraft keeps the same screen size (readability over realism). */
const AC_SCALE = 5.5;

const MAX_TRAIL = 240;
const LABEL_OFFSET_Y = 6;

/** A short vertical leader line between an aircraft and its hovering label,
 *  so the text doesn't sit on top of the model. */
function makeLeader(): THREE.Line {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(6), 3));
  const mat = new THREE.LineBasicMaterial({
    color: 0x00d4ff,
    transparent: true,
    opacity: 0.35,
  });
  const line = new THREE.Line(geo, mat);
  line.frustumCulled = false;
  return line;
}

function setLeader(line: THREE.Line, a: THREE.Vector3, b: THREE.Vector3): void {
  const attr = line.geometry.getAttribute("position") as THREE.BufferAttribute;
  attr.setXYZ(0, a.x, a.y, a.z);
  attr.setXYZ(1, b.x, b.y, b.z);
  attr.needsUpdate = true;
}

/** Accent colour for the leader line + label by flight phase. */
function phaseHex(f: AircraftFrame): string {
  if (f.altitude < 1000) return "#9aa4b5";
  if (f.climbRate > 300) return "#7dffb0";
  if (f.climbRate < -300) return "#ffb347";
  return "#00d4ff";
}

/** Fade far contacts so the foreground stays readable. 0.85 → 0.35 across range. */
function fadeByDistance(distKm: number): number {
  return Math.max(0.35, Math.min(0.85, 0.85 - (distKm - 10) * 0.006));
}

/** A clear, well-separated altitude palette (0–45k ft). Distinct hues so the
 *  operator can read clusters of aircraft at a glance. */
function altColorHex(altFt: number): string {
  if (altFt < 1000) return "#9aa4b5"; // ground
  if (altFt < 10000) return "#7dffb0"; // low (green)
  if (altFt < 20000) return "#ffd166"; // mid-low (yellow)
  if (altFt < 30000) return "#4dd2ff"; // mid (cyan)
  if (altFt < 40000) return "#7aa6ff"; // high (blue)
  return "#ff8ab0"; // very high (pink)
}

/** A small ground marker for an airport referenced by an active route. Draws a
 *  flat diamond + a short vertical needle so it reads as a waypoint on the
 *  ground plane. */
function makeAirportMarker(code: string): { obj: THREE.Group; label: CSS2DObject } {
  const group = new THREE.Group();
  group.name = `airport-${code}`;
  const diamondGeo = new THREE.CircleGeometry(2.4, 4);
  const diamond = new THREE.Mesh(
    diamondGeo,
    new THREE.MeshBasicMaterial({
      color: 0xffd166,
      transparent: true,
      opacity: 0.65,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );
  diamond.rotation.x = -Math.PI / 2;
  diamond.position.y = 0.1;
  group.add(diamond);

  const needle = new THREE.Mesh(
    new THREE.CylinderGeometry(0.12, 0.12, 3, 6),
    new THREE.MeshBasicMaterial({ color: 0xffd166, transparent: true, opacity: 0.5, depthWrite: false }),
  );
  needle.position.y = 1.6;
  group.add(needle);

  const el = document.createElement("div");
  el.className = "airport-label";
  el.textContent = code;
  const label = new CSS2DObject(el);
  label.position.y = 6;
  group.add(label);
  group.userData.labelElement = el;

  return { obj: group, label };
}

function disposeAirport(grp: THREE.Group): void {
  grp.traverse((o) => {
    if (o instanceof CSS2DObject && (o as CSS2DObject).element) {
      (o as CSS2DObject).element.remove();
    }
  });
  grp.removeFromParent();
}

function makeTrail(): THREE.Line {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(MAX_TRAIL * 3);
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setDrawRange(0, 0);
  const mat = new THREE.LineBasicMaterial({ color: 0x00d4ff, transparent: true, opacity: 0.45 });
  const line = new THREE.Line(geo, mat);
  line.frustumCulled = false;
  line.visible = false;
  return line;
}

function setTrail(line: THREE.Line, pts: THREE.Vector3[]): void {
  const attr = line.geometry.getAttribute("position") as THREE.BufferAttribute;
  const n = Math.min(pts.length, MAX_TRAIL);
  for (let i = 0; i < n; i++) attr.setXYZ(i, pts[i].x, pts[i].y, pts[i].z);
  attr.needsUpdate = true;
  line.geometry.setDrawRange(0, n);
  line.visible = n > 1;
}

function makeBodySprite(name: string, hex: string, size: number): THREE.Sprite {  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext("2d")!;
  const grad = ctx.createRadialGradient(64, 64, 4, 64, 64, 64);
  grad.addColorStop(0, hex);
  grad.addColorStop(0.35, hex);
  grad.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(64, 64, 64, 0, Math.PI * 2);
  ctx.fill();
  const tex = new THREE.CanvasTexture(canvas);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  sprite.scale.setScalar(size);
  sprite.userData.body = name;
  return sprite;
}

/** Build the HTML label for an aircraft. The outer element is a transparent
 *  anchor (the CSS2DObject stays glued to the 3D point); the inner `.ac-label`
 *  box is free to be shifted in screen space for declutter. */
function makeLabel(f: AircraftFrame): CSS2DObject {
  const el = document.createElement("div");
  el.className = "ac-label-anchor";
  const box = document.createElement("div");
  box.className = "ac-label";
  box.innerHTML =
    '<div class="ac-label-top"></div><div class="ac-label-type"></div><div class="ac-label-meta"></div>';
  el.appendChild(box);
  const top = box.children[0] as HTMLElement;
  const type = box.children[1] as HTMLElement;
  const meta = box.children[2] as HTMLElement;
  box.addEventListener("pointerdown", (e) => {
    e.stopPropagation();
    useUI.getState().setSelected(f.hex);
  });
  const obj = new CSS2DObject(el);
  obj.userData.top = top;
  obj.userData.type = type;
  obj.userData.meta = meta;
  obj.userData.box = box;
  obj.userData.last = "";
  return obj;
}

function updateLabel(obj: CSS2DObject, f: AircraftFrame): void {
  const top = obj.userData.top as HTMLElement;
  const type = obj.userData.type as HTMLElement;
  const meta = obj.userData.meta as HTMLElement;
  const box = obj.userData.box as HTMLElement;
  const route =
    f.from && f.from !== "?" && f.to && f.to !== "?" ? `${f.from} → ${f.to} · ` : "";
  const key = `${f.callsign}|${f.model}|${route}|${Math.round(f.distance)}`;
  if (obj.userData.last !== key) {
    obj.userData.last = key;
    top.textContent = f.callsign || f.hex.slice(0, 6).toUpperCase();
    type.textContent = f.model || "";
    meta.textContent = route + formatDistance(f.distance);
  }
  box.classList.toggle("selected", useUI.getState().selectedHex === f.hex);
  const alert = alertForAircraft(f);
  box.classList.toggle("alert-warning", alert?.level === "warning");
  box.classList.toggle("alert-caution", alert?.level === "caution");

  // Phase colour only when not in an alert state (alert red/orange wins).
  box.classList.remove("phase-climb", "phase-desc", "phase-ground");
  if (!alert) {
    if (f.altitude < 1000) box.classList.add("phase-ground");
    else if (f.climbRate > 300) box.classList.add("phase-climb");
    else if (f.climbRate < -300) box.classList.add("phase-desc");
  }
}

const WEATHER_SKY = {
  clear: { top: 0x1c3f74, bottom: 0x0a1430 },
  cloudy: { top: 0x303e55, bottom: 0x131a2b },
  rain: { top: 0x22303f, bottom: 0x0b111c },
  snow: { top: 0x3c4a5f, bottom: 0x18202f },
  storm: { top: 0x171c2a, bottom: 0x090d16 },
  fog: { top: 0x3a4658, bottom: 0x1a2130 },
} as const;

function applyWeatherTint(mat: THREE.ShaderMaterial, category: WeatherCategory, isDay: boolean, brightness = 1, nightMode = true): void {
  const c = WEATHER_SKY[category] ?? WEATHER_SKY.cloudy;
  // Day keeps full colour; night dims unless nightMode is off (then keep day).
  const night = isDay || !nightMode ? 1 : 0.45;
  const b = brightness;
  mat.uniforms.topColor.value.copy(new THREE.Color(c.top).multiplyScalar(night * b));
  mat.uniforms.bottomColor.value.copy(new THREE.Color(c.bottom).multiplyScalar(night * b));
}

export function Viewport3D() {
  const containerRef = useRef<HTMLDivElement>(null);
  const vehicles = useRef<Map<string, Vehicle>>(new Map());
  const airports = useRef<Map<string, THREE.Group>>(new Map());
  const zoomTarget = useRef<number | null>(null);
  const zoomAnimate = useRef(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;
    const refs = createScene(container, width, height);
    const { scene, camera, renderer, envGroup, skyGroup, skyMaterial, sunLight, rimLight, ambientLight, cloudGroup, horizonGlow } = refs;
    let weatherSig = "";
    let wrapW = width;
    let wrapH = height;

    const labelRenderer = new CSS2DRenderer();
    labelRenderer.setSize(width, height);
    const le = labelRenderer.domElement;
    le.style.position = "absolute";
    le.style.top = "0";
    le.style.left = "0";
    le.style.pointerEvents = "none";
    le.style.zIndex = "5";
    container.appendChild(le);

    const disposeVehicle = (v: Vehicle) => {
      scene.remove(v.object.group);
      scene.remove(v.line);
      scene.remove(v.leader);
      scene.remove(v.label);
      v.line.geometry.dispose();
      (v.line.material as THREE.Material).dispose();
      v.leader.geometry.dispose();
      (v.leader.material as THREE.Material).dispose();
      v.label.element.remove();
    };

    // "YOU" label floating over the observer marker at the origin.
    const youEl = document.createElement("div");
    youEl.className = "you-label";
    youEl.textContent = "YOU";
    const youLabel = new CSS2DObject(youEl);
    youLabel.position.set(0, 6, 0);
    scene.add(youLabel);

    let skySig = "";
    let builtMode = "";
    let glbRoot: THREE.Group | null = null;

    const rebuildSky = (sky: SkyData | null, prefs: DisplayPrefs, simAz?: number | null, simEl?: number) => {
      skyGroup.clear();
      skyGroup.visible = prefs.showSky && !!sky;
      if (!sky || !prefs.showSky) return;
      if (prefs.showStars) {
        const pts: number[] = [];
        for (const s of sky.stars) {
          const p = skyPos(s.azimuth, s.elevation, SKY_DOME_RADIUS);
          pts.push(p.x, p.y, p.z);
        }
        if (pts.length) {
          const geo = new THREE.BufferGeometry();
          geo.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
          const mat = new THREE.PointsMaterial({ color: 0xbfe9ff, size: 1.8, sizeAttenuation: false, transparent: true, opacity: 0.9 });
          skyGroup.add(new THREE.Points(geo, mat));
        }
      }
      if (prefs.showSun && sky.sun) {
        const az = simAz != null ? simAz : sky.sun.azimuth;
        const el = (simAz != null ? simEl ?? sky.sun.elevation : sky.sun.elevation) as number;
        const p = skyPos(az, Math.max(el, -5), SKY_DOME_RADIUS);
        const sp = makeBodySprite("sun", "#ffd166", 90);
        sp.position.set(p.x, p.y, p.z);
        skyGroup.add(sp);
      }
      if (prefs.showMoon && sky.moon && sky.moon.visible) {
        const p = skyPos(sky.moon.azimuth, Math.max(sky.moon.elevation, -5), SKY_DOME_RADIUS);
        const sp = makeBodySprite("moon", "#dbe4ff", 60);
        sp.position.set(p.x, p.y, p.z);
        skyGroup.add(sp);
      }
      for (const pl of sky.planets) {
        const p = skyPos(pl.azimuth, pl.elevation, SKY_DOME_RADIUS);
        const sp = makeBodySprite(pl.name, "#e6e6ef", 34);
        sp.position.set(p.x, p.y, p.z);
        skyGroup.add(sp);
      }
    };

    const tryMode = async (mode: string) => {
      if (mode === "glb") {
        const root = await tryLoadGlb(DEFAULT_GLB_URL);
        glbRoot = root;
      }
    };

    const loop = () => {
      const st = useUI.getState();
      const prefs = st.prefs;
      const amb = st.amb;
      const config = dataManager.getConfig();
      const sky = dataManager.getSky();

      // Tint the sky by live weather (sunny / cloudy / rain / …). When the user
      // simulates a time-of-day, we rewrite the sun position + isDay locally so
      // the whole scene (lighting + tint + sun sprite) previews that hour.
      const weather = dataManager.getWeather();
      const simHour = st.simHour;
      let sunAz: number | null = null;
      let sunEl = 0;
      let simDay = true;
      if (sky) {
        const s = sky.sun;
        sunAz = s.azimuth;
        sunEl = s.elevation;
        simDay = s.isDay;
        if (simHour != null) {
          // Approximate sun sweep: azimuth ~0 at dawn rising to 180 at dusk;
          // elevation peaks at solar noon. Lat-agnostic but visually believable.
          const frac = simHour / 24;
          sunAz = 180 * frac;
          sunEl = Math.sin(frac * Math.PI) * 85 - 5;
          simDay = sunEl > 0;
        }
      }
      if (weather) {
        const sig = `${weather.category}:${simDay}:${amb.brightness}:${amb.nightMode}`;
        if (sig !== weatherSig) {
          weatherSig = sig;
          applyWeatherTint(skyMaterial, weather.category, simDay, amb.brightness, amb.nightMode);
        }
      } else {
        // No weather yet: still apply brightness/nightMode to the default sky.
        applyWeatherTint(skyMaterial, "clear", simDay, amb.brightness, amb.nightMode);
      }

      // Ambient lighting + rim driven by brightness and time of day.
      ambientLight.intensity = 0.55 * amb.brightness;
      rimLight.intensity = (weather && !simDay ? 0.3 : 0.5) * amb.brightness;

      // Cloud layer: visible only when ambiance is on; opacity scales up with
      // real cloud cover, and the puffs drift slowly.
      cloudGroup.visible = amb.ambiance;
      if (amb.ambiance) {
        const cloudAmt = weather ? Math.max(0.06, (weather.cloudCover / 100) * 0.35) : 0.12;
        cloudGroup.children.forEach((c) => {
          const m = (c as THREE.Sprite).material;
          if (m instanceof THREE.SpriteMaterial) m.opacity = cloudAmt * amb.brightness;
          const az = ((c.userData.az as number) + 0.0004 * (c.userData.speed as number)) % (Math.PI * 2);
          c.userData.az = az;
          const r = 1600;
          const el = 0.35;
          (c as THREE.Sprite).position.set(
            Math.sin(az) * Math.cos(el) * r,
            Math.sin(el) * r,
            Math.cos(az) * Math.cos(el) * r,
          );
        });
      }

      // Move the key light to the (real or simulated) sun, so aircraft shading
      // tracks the time of day, with a cyan rim from the opposite side.
      if (sunAz != null) {
        const sr = 400;
        sunLight.position.set(
          -Math.sin((sunAz * Math.PI) / 180) * sr,
          Math.sin((Math.max(sunEl, 5) * Math.PI) / 180) * sr,
          -Math.cos((sunAz * Math.PI) / 180) * sr,
        );
        sunLight.intensity = (0.4 + Math.max(sunEl, 0) / 90) * (simDay ? 1.2 : 0.6) * amb.brightness;
      }

      // Horizon glow follows brightness + time of day (subtler by night).
      (horizonGlow.material as THREE.MeshBasicMaterial).opacity =
        0.7 * amb.brightness * (simDay ? 1 : 0.6);

      let fov = st.view.fov;
      if (zoomAnimate.current && zoomTarget.current != null) {
        const diff = zoomTarget.current - fov;
        if (Math.abs(diff) < 0.5) {
          zoomTarget.current = null;
          zoomAnimate.current = false;
        } else {
          fov += diff * 0.12;
        }
      }
      camera.fov = fov;
      camera.updateProjectionMatrix();
      orientCamera(camera, st.view.azimuth, st.view.elevation);

      // Environment visibility (subtle horizon grid + rings + cardinal marks).
      const gridVisible = !config || config.showGrid;
      const ringVisible = !config || config.showRangeRings;
      envGroup.traverse((o) => {
        if (o.name === "grid") o.visible = gridVisible;
        if (o.name === "ring") o.visible = ringVisible;
        if (o.name === "spoke" || o.name === "sweep") o.visible = false;
        if (o.name.startsWith("cardinal-")) o.visible = prefs.showCompass;
      });

      if (sky) {
        const sig = `${sky.stars.length}:${sky.sun.azimuth}:${sky.moon.phase}:${prefs.showSky}:${prefs.showStars}:${prefs.showSun}:${prefs.showMoon}:${simHour}`;
        if (sig !== skySig) {
          skySig = sig;
          rebuildSky(sky, prefs, simHour != null ? sunAz : null, simHour != null ? sunEl : undefined);
        }
      } else if (skySig !== "none") {
        skySig = "none";
        skyGroup.visible = false;
      }

      if (prefs.displayMode !== builtMode) {
        builtMode = prefs.displayMode;
        void tryMode(prefs.displayMode);
        for (const v of vehicles.current.values()) disposeVehicle(v);
        vehicles.current.clear();
      }

      const frames = dataManager.getFrames(Date.now());
      const seen = new Set<string>();
      const nowMs = Date.now();
      const altitudeColor = prefs.altitudeColor;
      const activeMode = prefs.displayMode;
      // Cap labels to the nearest contacts so a huge airspace stays readable.
      const labelCapped = new Set<string>(
        [...frames].sort((a, b) => a.distance - b.distance).slice(0, amb.labelRatio).map((f) => f.hex),
      );
      // Collect the frames that get a label, for a screen-space declutter pass.
      const labeled: AircraftFrame[] = frames.filter((f) => labelCapped.has(f.hex));

      for (const f of frames) {
        seen.add(f.hex);
        let v = vehicles.current.get(f.hex);
        if (!v) {
          const obj =
            glbRoot && activeMode === "glb"
              ? makeGlbVehicle(glbRoot, f.altitude, altitudeColor)
              : buildAircraft(activeMode === "glb" ? "mesh" : activeMode, f.altitude, altitudeColor);
          scene.add(obj.group);
          const line = makeTrail();
          scene.add(line);
          const leader = makeLeader();
          scene.add(leader);
          const label = makeLabel(f);
          scene.add(label);
          v = { object: obj, history: [], line, leader, label, lastFrame: 0, labelDy: 0 };
          vehicles.current.set(f.hex, v);
        }
        const g = v.object.group;
        g.position.set(f.x, f.y, f.z);
        g.rotation.y = THREE.MathUtils.degToRad(f.track);
        g.scale.setScalar(AC_SCALE);
        if (st.selectedHex === f.hex) v.object.material.color.set("#ffffff");
        else v.object.material.color.set(altitudeColor ? altColorHex(f.altitude) : "#00d4ff");

        if (prefs.showTrails) {
          v.history.push({ p: new THREE.Vector3(f.x, f.y, f.z), t: nowMs });
          while (v.history.length && v.history[0].t < nowMs - prefs.trailSeconds * 1000) v.history.shift();
          if (v.history.length > MAX_TRAIL) v.history.splice(0, v.history.length - MAX_TRAIL);
          setTrail(v.line, v.history.map((e) => e.p));
        } else {
          v.line.visible = false;
          v.history = [];
        }

        // Place label + leader at the aircraft + a per-vehicle screen declutter
        // offset (computed in a post-pass after camera matrices are settled).
        const isLabeled = labelCapped.has(f.hex);
        v.label.position.set(f.x, f.y + LABEL_OFFSET_Y + v.labelDy, f.z);
        v.label.visible = isLabeled;
        v.leader.visible = isLabeled;
        if (isLabeled) {
          updateLabel(v.label, f);
          setLeader(v.leader, new THREE.Vector3(f.x, f.y + LABEL_OFFSET_Y, f.z), new THREE.Vector3(f.x, f.y + LABEL_OFFSET_Y + v.labelDy, f.z));
          const phase = phaseHex(f);
          (v.leader.material as THREE.LineBasicMaterial).color.set(phase);
        }
        v.lastFrame = nowMs;
      }

      for (const [hex, v] of vehicles.current) {
        if (!seen.has(hex) && nowMs - v.lastFrame > 3000) {
          disposeVehicle(v);
          vehicles.current.delete(hex);
        }
      }

      // Reconcile airport markers (origin/destination of active routes).
      if (config) {
        const wanted = new Map<string, { lat: number; lon: number }>();
        for (const f of frames) {
          if (f.from && f.from !== "?" && f.fromLat != null && f.fromLon != null && !wanted.has(f.from)) {
            wanted.set(f.from, { lat: f.fromLat, lon: f.fromLon });
          }
          if (f.to && f.to !== "?" && f.toLat != null && f.toLon != null && !wanted.has(f.to)) {
            wanted.set(f.to, { lat: f.toLat, lon: f.toLon });
          }
        }
        const R = DOME_RADIUS;
        for (const [code, ap] of wanted) {
          let grp = airports.current.get(code);
          if (!grp) {
            const mk = makeAirportMarker(code);
            scene.add(mk.obj);
            grp = mk.obj;
            airports.current.set(code, grp);
          }
          const m = llToMeters(ap.lat, ap.lon, config.centerLat, config.centerLon);
          const ang = groundToSkyAngles(m, 0, 0);
          const r = R + Math.min(450, Math.max(0, (ang.slantM / 1000 - 10) * 1.5));
          const p = skyPos(ang.az, ang.elev, r);
          grp.position.set(p.x, p.y, p.z);
        }
        for (const [code, grp] of airports.current) {
          if (!wanted.has(code)) {
            disposeAirport(grp);
            airports.current.delete(code);
          }
        }
      }

      // Screen-space label declutter + distance fade. The CSS2DObject is glued
      // to the aircraft; we nudge the inner box apart on-screen and fade far
      // contacts so dense low-elevation clusters stay readable.
      if (labeled.length > 0) {
        camera.updateMatrixWorld();
        const v3 = new THREE.Vector3();
        const placed: { minX: number; maxX: number; minY: number; maxY: number }[] = [];
        const W = wrapW || 1;
        const H = wrapH || 1;
        // Nearest first → they get to keep their spot; farther labels get pushed.
        labeled
          .slice()
          .sort((a, b) => a.distance - b.distance)
          .forEach((f) => {
            const veh = vehicles.current.get(f.hex);
            if (!veh) return;
            const baseY = f.y + LABEL_OFFSET_Y;
            v3.set(f.x, baseY, f.z).project(camera);
            const cx = ((v3.x + 1) / 2) * W;
            const cy = ((-v3.y + 1) / 2) * H;
            const boxW = 96;
            const boxH = 26;
            let dy = 0;
            let iters = 0;
            let collides = true;
            while (collides && iters < 12) {
              const minX = cx - boxW / 2;
              const maxX = cx + boxW / 2;
              const minY = cy - boxH / 2 - dy;
              const maxY = cy + boxH / 2 - dy;
              collides = placed.some(
                (p) => minX < p.maxX && maxX > p.minX && minY < p.maxY && maxY > p.minY,
              );
              if (collides) {
                dy += boxH + 4;
                iters += 1;
              } else {
                placed.push({ minX, maxX, minY, maxY });
              }
            }
            veh.labelDy = dy;
            // Reposition instantly (no one-frame lag) and fade by distance.
            veh.label.position.set(f.x, baseY + dy, f.z);
            setLeader(
              veh.leader,
              new THREE.Vector3(f.x, baseY, f.z),
              new THREE.Vector3(f.x, baseY + dy, f.z),
            );
            const fade = fadeByDistance(f.distance);
            const box = veh.label.userData.box as HTMLElement | undefined;
            if (box) {
              box.style.opacity = fade < 1 ? String(fade) : "";
            }
          });
      }

      renderer.render(scene, camera);
      labelRenderer.render(scene, camera);
      rafId = requestAnimationFrame(loop);
    };
    let rafId = requestAnimationFrame(loop);

    // Smooth camera zoom: double-click toggles between the stored FOV and a
    // tight 60° close-up, eased toward the target each render frame.
    const onDblClick = (e: MouseEvent) => {
      const s = useUI.getState();
      const raw = s.view.fov;
      const target = raw > 60 ? 60 : DEFAULT_FOV;
      zoomTarget.current = target;
      zoomAnimate.current = true;
      e.preventDefault();
    };
    container.addEventListener("dblclick", onDblClick);

    const ro = new ResizeObserver(() => {
      const w = container.clientWidth;
      const h = container.clientHeight;
      wrapW = w;
      wrapH = h;
      refs.setAspect(w, h);
      labelRenderer.setSize(w, h);
    });
    ro.observe(container);

    const el = renderer.domElement;
    const pointers = new Map<number, { x: number; y: number }>();
    let dragging = false;
    let last = { x: 0, y: 0 };
    let pinchDist = 0;

    const onDown = (e: PointerEvent) => {
      el.setPointerCapture(e.pointerId);
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 1) {
        dragging = true;
        last = { x: e.clientX, y: e.clientY };
      } else if (pointers.size === 2) {
        dragging = false;
        const arr = [...pointers.values()];
        pinchDist = Math.hypot(arr[0].x - arr[1].x, arr[0].y - arr[1].y);
      }
    };
    const onMove = (e: PointerEvent) => {
      const p = pointers.get(e.pointerId);
      if (!p) return;
      p.x = e.clientX;
      p.y = e.clientY;
      if (pointers.size === 2) {
        const arr = [...pointers.values()];
        const d = Math.hypot(arr[0].x - arr[1].x, arr[0].y - arr[1].y);
        const diff = d - pinchDist;
        pinchDist = d;
        const s = useUI.getState();
        s.setView(scrollView(s.view, diff * 0.2));
      } else if (dragging) {
        const dx = e.clientX - last.x;
        const dy = e.clientY - last.y;
        last = { x: e.clientX, y: e.clientY };
        const s = useUI.getState();
        s.setView(dragView(s.view, dx, dy));
      }
    };
    const onUp = (e: PointerEvent) => {
      pointers.delete(e.pointerId);
      if (pointers.size === 0) dragging = false;
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const s = useUI.getState();
      s.setView(scrollView(s.view, e.deltaY));
    };
    const onKey = (e: KeyboardEvent) => {
      const s = useUI.getState();
      const step = e.shiftKey ? 1 : 5;
      let az = s.view.azimuth;
      let el = s.view.elevation;
      if (e.key === "ArrowLeft") az -= step;
      else if (e.key === "ArrowRight") az += step;
      else if (e.key === "ArrowUp") el += step;
      else if (e.key === "ArrowDown") el -= step;
      else return;
      az = ((az % 360) + 360) % 360;
      el = Math.max(-10, Math.min(89, el));
      s.setView({ azimuth: az, elevation: el });
    };

    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointercancel", onUp);
    el.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("keydown", onKey);

    return () => {
      cancelAnimationFrame(rafId);
      ro.disconnect();
      for (const v of vehicles.current.values()) disposeVehicle(v);
      vehicles.current.clear();
      for (const g of airports.current.values()) disposeAirport(g);
      airports.current.clear();
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointercancel", onUp);
      el.removeEventListener("wheel", onWheel);
      container.removeEventListener("dblclick", onDblClick);
      window.removeEventListener("keydown", onKey);
      labelRenderer.domElement.remove();
      renderer.dispose();
      container.querySelector("canvas")?.remove();
    };
  }, []);

  return (
    <div className="absolute inset-0">
      <div ref={containerRef} className="absolute inset-0" />
    </div>
  );
}

function makeGlbVehicle(root: THREE.Group, altFt: number, altitudeColor: boolean) {
  const clone = root.clone(true);
  const material = new THREE.MeshStandardMaterial({
    color: altitudeColor ? glyphColor(altFt) : "#00d4ff",
    transparent: true,
    opacity: 0.98,
    side: THREE.DoubleSide,
    metalness: 0.5,
    roughness: 0.55,
    emissive: new THREE.Color("#0a1a2e"),
    emissiveIntensity: 0.35,
  });
  clone.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).material = material;
  });
  return { group: clone, material };
}
