// Camera view state helpers: read the view from the store, and expose drag /
// scroll / preset handlers used by the 3D viewport.

import { useUI, type ViewState } from "../store.js";
import { dragView, scrollView, setView } from "../utils/camera.js";

export type { ViewState };

export function useCamera() {
  const view = useUI((s) => s.view);
  const setViewState = useUI((s) => s.setView);

  const drag = (dxPx: number, dyPx: number) => setViewState(dragView(view, dxPx, dyPx));
  const scroll = (dyPx: number) => setViewState(scrollView(view, dyPx));
  const goto = (azimuth: number, elevation: number) => setViewState(setView(view, azimuth, elevation));

  return { view, drag, scroll, goto, setViewState };
}
