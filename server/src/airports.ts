// Airport code search. A small curated worldwide dataset keyed by ICAO/IATA so
// the standalone server needs no bundled CSV. Search by code or city substring.

export interface Airport {
  icao: string;
  iata: string;
  name: string;
  city: string;
  country: string;
  lat: number;
  lon: number;
  elevationFt: number;
}

const AIRPORTS: Airport[] = [
  { icao: "KJFK", iata: "JFK", name: "John F. Kennedy International", city: "New York", country: "USA", lat: 40.6413, lon: -73.7781, elevationFt: 13 },
  { icao: "KLAX", iata: "LAX", name: "Los Angeles International", city: "Los Angeles", country: "USA", lat: 33.9416, lon: -118.4085, elevationFt: 125 },
  { icao: "KSFO", iata: "SFO", name: "San Francisco International", city: "San Francisco", country: "USA", lat: 37.6213, lon: -122.379, elevationFt: 13 },
  { icao: "ORD", iata: "ORD", name: "Chicago O'Hare International", city: "Chicago", country: "USA", lat: 41.9742, lon: -87.9073, elevationFt: 672 },
  { icao: "KATL", iata: "ATL", name: "Hartsfield–Jackson Atlanta Intl", city: "Atlanta", country: "USA", lat: 33.6407, lon: -84.4277, elevationFt: 1026 },
  { icao: "KDEN", iata: "DEN", name: "Denver International", city: "Denver", country: "USA", lat: 39.8561, lon: -104.6737, elevationFt: 5434 },
  { icao: "EGLL", iata: "LHR", name: "London Heathrow", city: "London", country: "UK", lat: 51.47, lon: -0.4543, elevationFt: 83 },
  { icao: "LFPG", iata: "CDG", name: "Charles de Gaulle", city: "Paris", country: "France", lat: 49.0097, lon: 2.5479, elevationFt: 392 },
  { icao: "LFPO", iata: "ORY", name: "Paris Orly", city: "Paris", country: "France", lat: 48.7412, lon: 2.3628, elevationFt: 291 },
  { icao: "EDDF", iata: "FRA", name: "Frankfurt am Main", city: "Frankfurt", country: "Germany", lat: 50.0379, lon: 8.5622, elevationFt: 364 },
  { icao: "EDDM", iata: "MUC", name: "Munich", city: "Munich", country: "Germany", lat: 48.3538, lon: 11.7861, elevationFt: 1487 },
  { icao: "EHAM", iata: "AMS", name: "Amsterdam Schiphol", city: "Amsterdam", country: "Netherlands", lat: 52.3105, lon: 4.7683, elevationFt: -11 },
  { icao: "LEMD", iata: "MAD", name: "Adolfo Suárez Madrid–Barajas", city: "Madrid", country: "Spain", lat: 40.4983, lon: -3.5676, elevationFt: 1998 },
  { icao: "LEBL", iata: "BCN", name: "Josep Tarradellas Barcelona–El Prat", city: "Barcelona", country: "Spain", lat: 41.2971, lon: 2.0835, elevationFt: 14 },
  { icao: "LIRF", iata: "FCO", name: "Leonardo da Vinci–Fiumicino", city: "Rome", country: "Italy", lat: 41.8045, lon: 12.2508, elevationFt: 15 },
  { icao: "LSZH", iata: "ZRH", name: "Zurich", city: "Zurich", country: "Switzerland", lat: 47.4582, lon: 8.5555, elevationFt: 1416 },
  { icao: "VHHH", iata: "HKG", name: "Hong Kong International", city: "Hong Kong", country: "China", lat: 22.308, lon: 113.9185, elevationFt: 28 },
  { icao: "RJTT", iata: "HND", name: "Tokyo Haneda", city: "Tokyo", country: "Japan", lat: 35.5533, lon: 139.7811, elevationFt: 21 },
  { icao: "RJAA", iata: "NRT", name: "Narita International", city: "Tokyo", country: "Japan", lat: 35.7719, lon: 140.3929, elevationFt: 141 },
  { icao: "RKSI", iata: "ICN", name: "Incheon International", city: "Seoul", country: "South Korea", lat: 37.4602, lon: 126.4407, elevationFt: 23 },
  { icao: "WSSS", iata: "SIN", name: "Singapore Changi", city: "Singapore", country: "Singapore", lat: 1.3644, lon: 103.9915, elevationFt: 22 },
  { icao: "OMDB", iata: "DXB", name: "Dubai International", city: "Dubai", country: "UAE", lat: 25.2532, lon: 55.3657, elevationFt: 62 },
  { icao: "YSSY", iata: "SYD", name: "Sydney Kingsford Smith", city: "Sydney", country: "Australia", lat: -33.9399, lon: 151.1753, elevationFt: 21 },
  { icao: "CYYZ", iata: "YYZ", name: "Toronto Pearson International", city: "Toronto", country: "Canada", lat: 43.6777, lon: -79.6248, elevationFt: 569 },
  { icao: "CYVR", iata: "YVR", name: "Vancouver International", city: "Vancouver", country: "Canada", lat: 49.1947, lon: -123.1792, elevationFt: 14 },
  { icao: "SBGR", iata: "GRU", name: "São Paulo/Guarulhos", city: "São Paulo", country: "Brazil", lat: -23.4356, lon: -46.4731, elevationFt: 2459 },
];

/** Search airports by ICAO/IATA code or city substring (case-insensitive). */
export function searchAirports(q: string): Airport[] {
  const query = q.trim().toLowerCase();
  if (!query) return [];
  const hits = AIRPORTS.filter(
    (a) =>
      a.icao.toLowerCase().startsWith(query) ||
      a.iata.toLowerCase() === query ||
      a.iata.toLowerCase().startsWith(query) &&
        a.iata.toLowerCase().length <= query.length ||
      a.city.toLowerCase().includes(query) ||
      a.name.toLowerCase().includes(query),
  );
  return hits.slice(0, 8);
}

/** Look up an airport by exact ICAO or IATA code. */
export function lookupAirport(code: string): Airport | null {
  const c = code.trim().toUpperCase();
  return AIRPORTS.find((a) => a.icao === c || a.iata === c) ?? null;
}
