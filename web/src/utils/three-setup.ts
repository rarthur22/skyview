// Three.js scene construction: renderer, camera, lights, sky-gradient dome,
// horizon grid + range rings + cardinal rings. Built once per mount.

import * as THREE from "three";
import { DEFAULT_FOV, HORIZON_RADIUS } from "./constants.js";

export interface SceneRefs {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  envGroup: THREE.Group; // grid + rings + cardinal labels
  skyGroup: THREE.Group; // sun / moon / stars (populated from payload)
  skyMaterial: THREE.ShaderMaterial; // tinted by weather
  sunLight: THREE.DirectionalLight; // follows the real sun
  rimLight: THREE.DirectionalLight; // cool cyan fill from the opposite side
  ambientLight: THREE.AmbientLight; // adjustable for brightness
  cloudGroup: THREE.Group; // drifting cloud sprites (ambiance toggle)
  horizonGlow: THREE.Mesh; // soft horizon band (adjustable opacity)
  setAspect: (w: number, h: number) => void;
}

function makeTextSprite(text: string): THREE.Sprite {
  const canvas = document.createElement("canvas");
  const size = 128;
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, size, size);
  ctx.font = "bold 64px 'JetBrains Mono', monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.shadowColor = "#00d4ff";
  ctx.shadowBlur = 14;
  ctx.fillStyle = "#00d4ff";
  ctx.fillText(text, size / 2, size / 2);
  const tex = new THREE.CanvasTexture(canvas);
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }),
  );
  sprite.scale.set(26, 26, 1);
  return sprite;
}

/** A soft, semi-transparent cloud puff sprite (radial gradient, no texture file). */
function makeCloudSprite(): THREE.Sprite {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext("2d")!;
  const r = 64;
  const grad = ctx.createRadialGradient(r, r, 4, r, r, r);
  grad.addColorStop(0, "rgba(255,255,255,0.9)");
  grad.addColorStop(0.4, "rgba(255,255,255,0.5)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(canvas);
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: 0.24, depthWrite: false }),
  );
  // Stretch into an elongated puff.
  sprite.scale.set(420, 90, 1);
  return sprite;
}

export function createScene(container: HTMLElement, width: number, height: number): SceneRefs {
  const scene = new THREE.Scene();

  const camera = new THREE.PerspectiveCamera(DEFAULT_FOV, width / height, 0.1, 4000);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(width, height);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  container.appendChild(renderer.domElement);

  // --- sky gradient dome (deep navy) ---
  const skyMat = new THREE.ShaderMaterial({
    uniforms: {
      topColor: { value: new THREE.Color(0x1c3f74) },
      bottomColor: { value: new THREE.Color(0x0a1430) },
      offset: { value: 33 },
      exponent: { value: 0.7 },
    },
    vertexShader: `
      varying vec3 vWorldPosition;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorldPosition = wp.xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 topColor;
      uniform vec3 bottomColor;
      uniform float offset;
      uniform float exponent;
      varying vec3 vWorldPosition;
      void main() {
        float h = normalize(vWorldPosition + offset).y;
        gl_FragColor = vec4( mix( bottomColor, topColor, max( pow( max(h, 0.0), exponent ), 0.0 ) ), 1.0 );
      }
    `,
    side: THREE.BackSide,
    depthWrite: false,
  });
  const skyDome = new THREE.Mesh(new THREE.SphereGeometry(1800, 32, 16), skyMat);
  scene.add(skyDome);

  // --- lights ---
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.55);
  scene.add(ambientLight);
  const sunLight = new THREE.DirectionalLight(0xfff3e0, 1.25);
  sunLight.position.set(5, 10, 7);
  scene.add(sunLight);
  // Cool cyan fill from opposite side — gives aircraft a readable rim/edge.
  const rimLight = new THREE.DirectionalLight(0x00d4ff, 0.5);
  rimLight.position.set(-8, 2, -6);
  scene.add(rimLight);

  // --- drifting cloud layer (a scatter of soft, additive sprites high in the
  // dome). Density/opacity is driven from the live weather in the render loop. ---
  const cloudGroup = new THREE.Group();
  cloudGroup.name = "clouds";
  scene.add(cloudGroup);
  for (let i = 0; i < 40; i++) {
    const az = Math.random() * Math.PI * 2;
    const el = 0.18 + Math.random() * 0.5;
    const r = 1600;
    const sprite = makeCloudSprite();
    sprite.position.set(
      Math.sin(az) * Math.cos(el) * r,
      Math.sin(el) * r,
      Math.cos(az) * Math.cos(el) * r,
    );
    sprite.userData.speed = 1.5 + Math.random() * 2.5;
    sprite.userData.az = az;
    cloudGroup.add(sprite);
  }

  // --- environment group: grid, rings, spokes, sweep, cardinal labels ---
  const envGroup = new THREE.Group();
  scene.add(envGroup);

  const grid = new THREE.GridHelper(
    HORIZON_RADIUS * 2,
    72,
    new THREE.Color(0x0a4a5a),
    new THREE.Color(0x151b31),
  );
  grid.position.y = 0;
  grid.name = "grid";
  envGroup.add(grid);

  // Range rings (thin cyan).
  const ringMat = new THREE.LineBasicMaterial({ color: 0x1d6a7c, transparent: true, opacity: 0.5 });
  for (let i = 1; i <= 4; i++) {
    const r = (HORIZON_RADIUS / 4) * i;
    const pts: THREE.Vector3[] = [];
    for (let a = 0; a <= 180; a++) {
      const th = (a / 180) * Math.PI * 2;
      pts.push(new THREE.Vector3(Math.sin(th) * r, 0.02, Math.cos(th) * r));
    }
    const ring = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), ringMat);
    ring.name = "ring";
    envGroup.add(ring);
  }

  // Radial spokes (8 directions) — the "sonar" star.
  const spokeMat = new THREE.LineBasicMaterial({ color: 0x14444f, transparent: true, opacity: 0.55 });
  const spokeGeo = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, 0.02, 6),
    new THREE.Vector3(0, 0.02, HORIZON_RADIUS),
  ]);
  for (let i = 0; i < 8; i++) {
    const spoke = new THREE.Line(spokeGeo, spokeMat);
    spoke.rotation.y = (i / 8) * Math.PI * 2;
    spoke.name = "spoke";
    envGroup.add(spoke);
  }

  // Radar sweep — a thin rotating sector the render loop spins around the axis.
  const sweepGroup = new THREE.Group();
  sweepGroup.name = "sweep";
  sweepGroup.position.y = 0.03;
  const sweepGeo = new THREE.CircleGeometry(HORIZON_RADIUS, 48, 0, (28 * Math.PI) / 180);
  const sweepMat = new THREE.MeshBasicMaterial({
    color: 0x00d4ff,
    transparent: true,
    opacity: 0.07,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const sweepMesh = new THREE.Mesh(sweepGeo, sweepMat);
  sweepMesh.rotation.x = -Math.PI / 2; // lay flat on the ground plane (XZ)
  sweepGroup.add(sweepMesh);
  envGroup.add(sweepGroup);

  // Cardinal labels (N/E/S/W) floating just above the horizon ring.
  const cardinal = [90, 0, 270, 180]; // sprite az of N,E,S,W by our mapping
  const labels = ["N", "E", "S", "W"];
  for (let i = 0; i < 4; i++) {
    const azRad = ((cardinal[i] - 90) * Math.PI) / 180;
    const x = Math.sin(azRad) * HORIZON_RADIUS;
    const z = Math.cos(azRad) * HORIZON_RADIUS;
    const s = makeTextSprite(labels[i]);
    s.position.set(x, 6, z);
    s.name = `cardinal-${labels[i]}`;
    envGroup.add(s);
  }

  // --- sky group (sun/moon/stars) ---
  const skyGroup = new THREE.Group();
  skyGroup.name = "sky";
  scene.add(skyGroup);

  // --- horizon glow: a soft additive band just above the ground plane, so the
  // scene reads as a real horizon rather than a flat grid floating in a dome. ---
  const glowCanvas = document.createElement("canvas");
  glowCanvas.width = 256;
  glowCanvas.height = 64;
  const gc = glowCanvas.getContext("2d")!;
  const gGrad = gc.createLinearGradient(0, 0, 0, 64);
  gGrad.addColorStop(0, "rgba(12,40,64,0)");
  gGrad.addColorStop(0.5, "rgba(12,60,92,0.9)");
  gGrad.addColorStop(0.6, "rgba(24,120,160,0.9)");
  gGrad.addColorStop(1, "rgba(12,40,64,0)");
  gc.fillStyle = gGrad;
  gc.fillRect(0, 0, 256, 64);
  const glowTex = new THREE.CanvasTexture(glowCanvas);
  glowTex.wrapS = THREE.RepeatWrapping;
  const horizonGlow = new THREE.Mesh(
    new THREE.CylinderGeometry(HORIZON_RADIUS, HORIZON_RADIUS, 90, 96, 1, true),
    new THREE.MeshBasicMaterial({
      map: glowTex,
      transparent: true,
      opacity: 0.7,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  horizonGlow.position.y = 40;
  horizonGlow.name = "horizonGlow";
  scene.add(horizonGlow);

  // --- observer marker: a bright ring + needle at the origin ("YOU" position),
  // so the operator always knows where they stand relative to the airspace.
  const youGroup = new THREE.Group();
  youGroup.name = "you";
  const youRing = new THREE.RingGeometry(1.2, 1.9, 32);
  const youMat = new THREE.MeshBasicMaterial({
    color: 0x00d4ff,
    transparent: true,
    opacity: 0.9,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const youMesh = new THREE.Mesh(youRing, youMat);
  youMesh.rotation.x = -Math.PI / 2;
  youMesh.position.y = 0.08;
  youGroup.add(youMesh);
  // A short vertical needle to catch the eye.
  const needleMat = new THREE.MeshBasicMaterial({
    color: 0x00d4ff,
    transparent: true,
    opacity: 0.7,
    depthWrite: false,
  });
  const needle = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 4, 6), needleMat);
  needle.position.y = 2;
  youGroup.add(needle);
  scene.add(youGroup);

  return {
    scene,
    camera,
    renderer,
    envGroup,
    skyGroup,
    skyMaterial: skyMat,
    sunLight,
    rimLight,
    ambientLight,
    cloudGroup,
    horizonGlow,
    setAspect: (w, h) => {
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    },
  };
}
