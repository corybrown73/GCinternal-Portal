/**
 * One icon per industry, so a deck for a roofer does not open with the same
 * picture as a deck for a pipeline operator.
 *
 * Lucide, because it is already in the app and the set is consistent — one
 * stroke weight, one grid — which is what makes a row of them read as a
 * system rather than a clip-art collection. The names here are lucide
 * component names; `src/lib/server/icon-svg.ts` turns them into SVG on the
 * server, and the deck embeds the SVG directly.
 */

export const INDUSTRY_ICON: Record<string, string> = {
  Construction: "HardHat",
  "Oil & Gas": "Fuel",
  Utilities: "Zap",
  Energy: "Sun",
  Environmental: "Leaf",
  Facilities: "Building2",
  HVAC: "AirVent",
  Roofing: "Home",
  Mining: "Pickaxe",
  Pipeline: "Route",
  "Field Service": "Wrench",
  Manufacturing: "Factory",
  Logistics: "Truck",
  "Property Management": "KeyRound",
  Plumbing: "ShowerHead",
  Mechanical: "Cog",
  Electrical: "PlugZap",
  "Pest Control": "Bug",
  "Water/Wastewater": "Droplets",
  "Education/Government": "Landmark",
  Other: "ClipboardCheck",
};

/** The industry's icon; a typed industry nobody listed gets the general one. */
export function industryIcon(industry: string | null | undefined): string {
  if (!industry) return INDUSTRY_ICON["Other"]!;
  return INDUSTRY_ICON[industry.trim()] ?? INDUSTRY_ICON["Other"]!;
}
