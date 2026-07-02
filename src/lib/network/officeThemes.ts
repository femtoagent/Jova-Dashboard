/**
 * Team Room office backdrops. One theme ships today; the registry exists so "change the
 * office" is a one-value swap later (OfficeBackdrop renders entirely from these params).
 */

export interface OfficeTheme {
  id: string;
  name: string;
  desc: string;
  /** left / right wall fills (the two iso walls) */
  wallLeft: string;
  wallRight: string;
  /** floor fill + the faint iso grid line color */
  floor: string;
  floorLine: string;
  /** the window's outside glow (the void beyond the office) */
  windowGlow: string;
  /** baseboard / wall trim */
  trim: string;
}

export const OFFICE_THEMES: OfficeTheme[] = [
  {
    id: "midnight",
    name: "Midnight Loft",
    desc: "A dark studio loft with a window on the void",
    wallLeft: "#121624",
    wallRight: "#0d101b",
    floor: "#171c2e",
    floorLine: "rgba(160, 190, 255, 0.06)",
    windowGlow: "rgba(76, 201, 255, 0.35)",
    trim: "rgba(160, 190, 255, 0.12)",
  },
];

export function officeTheme(id?: string): OfficeTheme {
  return OFFICE_THEMES.find((t) => t.id === id) ?? OFFICE_THEMES[0]!;
}
