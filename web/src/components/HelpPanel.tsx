// Keyboard-shortcut help overlay. Toggled with '?' or 'h'. Shows a centred card
// listing every HUD shortcut, and closes on '?' again, 'h', Esc, or a click.

const SHORTCUTS: { keys: string; action: string }[] = [
  { keys: "Drag / Arrows", action: "Look around" },
  { keys: "Wheel / Pinch", action: "Zoom (FOV)" },
  { keys: "Shift + Arrows", action: "Fine adjust heading" },
  { keys: "[ / ]", action: "Narrow / widen FOV" },
  { keys: "Space", action: "Toggle both panels" },
  { keys: "Escape", action: "Deselect → clear search → close panels" },
  { keys: "? / h", action: "Toggle this help" },
  { keys: "Click a contact", action: "Select + centre view" },
  { keys: "Enter / ↗ in search", action: "Focus a matching flight" },
];

export function HelpPanel({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="pointer-events-auto absolute right-3 top-16 z-40 w-80"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="hud-panel px-4 py-3">
        <div className="mb-2 flex items-center justify-between">
          <span className="hud-section-title">Controls</span>
          <button className="hud-btn !px-2 !py-0.5 !text-[9px]" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="flex flex-col gap-1.5">
          {SHORTCUTS.map((s) => (
            <div key={s.keys} className="flex items-center justify-between gap-3 text-[11px]">
              <span className="shrink-0 text-hud-fg-primary">{s.keys}</span>
              <span className="text-right text-hud-fg-secondary">{s.action}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}