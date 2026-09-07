// Right sidebar: wraps the flight list and wires selection.

import { useUI } from "../store.js";
import { useAircraft } from "../hooks/useAircraft.js";
import { FlightList } from "./FlightList.js";

export function SidebarRight() {
  const items = useAircraft();
  const selectedHex = useUI((s) => s.selectedHex);
  const setSelected = useUI((s) => s.setSelected);

  const onSelect = (hex: string) => setSelected(hex);

  return (
    <div className="h-full w-72">
      <FlightList items={items} selectedHex={selectedHex} onSelect={onSelect} />
    </div>
  );
}
