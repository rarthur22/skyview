// Camera pose math. The observer sits at the origin looking outward along the
// (azimuth, elevation) view direction; aircraft are placed on the sky dome.

import type { PerspectiveCamera } from "three";
import { skyPos } from "./calculations.js";

/** Orient the camera to look along a horizontal (azimuth) / vertical (elevation) direction. */
export function orientCamera(
  camera: PerspectiveCamera,
  azimuthDeg: number,
  elevationDeg: number,
): void {
  const dir = skyPos(azimuthDeg, elevationDeg, 1);
  // Force a stable world "up". Elevation is clamped below the exact zenith, so
  // this never degenerates — no gimbal lock at the pole.
  camera.up.set(0, 1, 0);
  camera.position.set(0, 0, 0);
  camera.lookAt(dir.x * 100, dir.y * 100, dir.z * 100);
}

export interface ViewState {
  azimuth: number; // 0-360 deg
  elevation: number; // 0-90 deg
  fov: number; // perspective FOV, deg
}

export const VIEW_MIN = { elevation: -10, fov: 30 };
export const VIEW_MAX = { elevation: 89, fov: 110 };

/** Apply a horizontal drag delta to the view. */
export function dragView(
  view: ViewState,
  dxPx: number,
  dyPx: number,
  sensY = 0.15,
): ViewState {
  const azimuth = (((view.azimuth - dxPx * 0.2) % 360) + 360) % 360;
  const elevation = Math.max(
    VIEW_MIN.elevation,
    Math.min(VIEW_MAX.elevation, view.elevation + dyPx * sensY),
  );
  return { ...view, azimuth, elevation };
}

/** Apply a scroll/pinch vertical delta to the elevation. */
export function scrollView(view: ViewState, dyPx: number): ViewState {
  const elevation = Math.max(
    VIEW_MIN.elevation,
    Math.min(VIEW_MAX.elevation, view.elevation + dyPx * 0.08),
  );
  return { ...view, elevation };
}

export function setView(
  view: ViewState,
  azimuth: number,
  elevation: number,
  fov = view.fov,
): ViewState {
  return { azimuth, elevation, fov };
}
