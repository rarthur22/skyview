// Aircraft visual builders. Modes:
//   glyphs — light clean heading dart, oriented by track.
//   mesh   — low-poly procedural airliner (fuselage + swept wings + fin).
//   glb    — glTF model if present, else falls back to mesh.
// All models are built with the nose pointing toward local +Z, so the render
// loop orients them with `group.rotation.y = track`.

import * as THREE from "three";
import { glyphColor } from "@skyview/shared/index.js";

/**
 * Local glTF aircraft model (served from the app's own `public/` folder — no
 * cross-origin fetch, no CORS risk, always available). Change the file name if
 * you drop a different `.glb` into `web/public/models/`.
 */
export const DEFAULT_GLB_URL = "/models/plane.glb";

export interface AircraftObject {
  group: THREE.Group;
  material: THREE.MeshStandardMaterial;
}

function makeMaterial(altFt: number, altitudeColor: boolean): THREE.MeshStandardMaterial {
  const color = altitudeColor ? glyphColor(altFt) : "#00d4ff";
  return new THREE.MeshStandardMaterial({
    color,
    transparent: true,
    opacity: 0.98,
    side: THREE.DoubleSide,
    metalness: 0.5,
    roughness: 0.55,
    emissive: new THREE.Color("#0a1a2e"),
    emissiveIntensity: 0.35,
  });
}

/** A thin, swept wing/stabilizer/flat panel in the XZ plane (leading edge +Z). */
function flatPanel(points: [number, number][], y = 0): THREE.BufferGeometry {
  // points in (x, chord) where +chord maps to +Z (forward).
  const shape = new THREE.Shape();
  shape.moveTo(points[0][0], -points[0][1]);
  for (let i = 1; i < points.length; i++) shape.lineTo(points[i][0], -points[i][1]);
  shape.closePath();
  const geo = new THREE.ShapeGeometry(shape);
  geo.rotateX(-Math.PI / 2); // XY -> XZ, -chord -> +Z forward
  geo.translate(0, y, 0);
  return geo;
}

/** Low-poly airliner fuselage (LatheGeometry profile -> smooth cleaned shape). */
function fuselage(): THREE.BufferGeometry {
  const profile: [number, number][] = [
    [0.02, 4.0],
    [0.6, 3.7],
    [1.05, 3.0],
    [1.15, 2.0],
    [1.15, -1.4],
    [0.95, -2.4],
    [0.6, -3.1],
    [0.2, -3.6],
    [0.02, -3.8],
  ];
  const pts = profile.map(([r, h]) => new THREE.Vector2(r, h));
  const geo = new THREE.LatheGeometry(pts, 22);
  geo.rotateX(Math.PI / 2); // +Y (nose) -> +Z (forward)
  return geo;
}

/** Build a clean low-poly jet. Nose along +Z. */
function createJet(altFt: number, altitudeColor: boolean): AircraftObject {
  const group = new THREE.Group();
  const mat = makeMaterial(altFt, altitudeColor);

  const fuse = new THREE.Mesh(fuselage(), mat);
  fuse.name = "fuselage";
  group.add(fuse);

  // Swept main wings (right + mirrored left).
  const wingPts: [number, number][] = [
    [0, 2.0],
    [5.6, 0.7],
    [5.2, -1.3],
    [0, -1.5],
  ];
  const rightWing = new THREE.Mesh(flatPanel(wingPts), mat);
  const leftWing = new THREE.Mesh(flatPanel(wingPts), mat);
  leftWing.scale.x = -1;
  group.add(rightWing, leftWing);

  // Engine nacelles under each wing (2 cylinders).
  const nacelleGeo = new THREE.CylinderGeometry(0.42, 0.46, 1.3, 10);
  nacelleGeo.rotateX(Math.PI / 2); // align length with +Z (forward)
  for (const sx of [1, -1]) {
    const nac = new THREE.Mesh(nacelleGeo, mat);
    nac.position.set(2.1 * sx, -0.15, -0.3);
    group.add(nac);
  }

  // Horizontal stabilizers (smaller swept).
  const stabPts: [number, number][] = [
    [0, 0.8],
    [2.2, 0.25],
    [2.0, -0.7],
    [0, -0.8],
  ];
  const rightStab = new THREE.Mesh(flatPanel(stabPts, 0.2), mat);
  const leftStab = new THREE.Mesh(flatPanel(stabPts, 0.2), mat);
  leftStab.scale.x = -1;
  rightStab.position.z = -2.6;
  leftStab.position.z = -2.6;
  group.add(rightStab, leftStab);

  // Vertical fin (in YZ plane at rear).
  const finShape = new THREE.Shape();
  finShape.moveTo(0, 0);
  finShape.lineTo(0, 1.9);
  finShape.lineTo(-1.3, 1.5);
  finShape.lineTo(-1.6, 0);
  finShape.closePath();
  const finGeo = new THREE.ShapeGeometry(finShape);
  // Shape is in XY; we need it in ZY (x<->chord). Build manually by orienting:
  finGeo.rotateY(Math.PI / 2); // XY -> ZY plane, +x -> -z
  const fin = new THREE.Mesh(finGeo, mat);
  fin.position.set(0, 0.1, -2.6);
  fin.material.side = THREE.DoubleSide;
  group.add(fin);

  return { group, material: mat };
}

/** Lightweight heading dart (glyph mode) — a clean swept arrow. */
export function createGlyph(altFt: number, altitudeColor: boolean): AircraftObject {
  const group = new THREE.Group();
  const mat = makeMaterial(altFt, altitudeColor);

  // Arrowhead pointing +Z.
  const nose = new THREE.Mesh(new THREE.ConeGeometry(1.0, 3.4, 4), mat);
  nose.rotation.x = Math.PI / 2;
  nose.scale.set(1, 1, 0.8);
  group.add(nose);

  // Swept wings.
  const wings = new THREE.Mesh(flatPanel([
    [0, 1.6],
    [3.4, 0.5],
    [3.2, -1.0],
    [0, -1.2],
  ]), mat);
  group.add(wings);

  return { group, material: mat };
}

export function createMesh(altFt: number, altitudeColor: boolean): AircraftObject {
  return createJet(altFt, altitudeColor);
}

/** Choose the builder for a display mode. glb falls back to mesh when loading fails. */
export function buildAircraft(
  mode: "glyphs" | "glb" | "mesh",
  altFt: number,
  altitudeColor: boolean,
): AircraftObject {
  if (mode === "glyphs") return createGlyph(altFt, altitudeColor);
  return createJet(altFt, altitudeColor);
}

/** Attempt to load the local glTF model. Returns null if unavailable (fallback). */
export async function tryLoadGlb(url: string): Promise<THREE.Group | null> {
  try {
    const { GLTFLoader } = await import("three/examples/jsm/loaders/GLTFLoader.js");
    const loader = new GLTFLoader();
    const gltf = await loader.loadAsync(url);
    const root = gltf.scene;
    // Scale + center to a usable size, nose along +Z (align longest horizontal
    // axis with Z). Assumes the model is roughly a fixed-wing aircraft.
    const box = new THREE.Box3().setFromObject(root);
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z) || 1;
    const scale = 12 / maxDim;
    root.scale.setScalar(scale);
    if (size.x > size.z) root.rotation.y = Math.PI / 2; // length along X -> Z
    box.setFromObject(root);
    const center = box.getCenter(new THREE.Vector3());
    root.position.sub(center);
    return root;
  } catch {
    return null;
  }
}
