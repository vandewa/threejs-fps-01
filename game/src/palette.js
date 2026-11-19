// The look plan, in one place: a night market after dark — warm hanging lamps
// against a blue-black night, wood kiosks, cloth awnings in two alternating
// colours. The same names are the CSS custom properties in index.html, so the
// page chrome and the 3D scene never disagree about the palette.
export const PALETTE = {
  canvas: '#0d0f14', // night sky / page background
  surface: '#241a12', // kiosk wood, dark
  hairline: '#3a2c1e', // stall counters, crates
  ink: '#f2ead9', // warm white: text, stall cloth light
  muted: '#9a8f7a', // dim warm grey: secondary text, asphalt
  accent: '#ffb347', // hanging-lamp amber
  clothA: '#c94f43', // awning red
  clothB: '#2e7f7a', // awning teal (defenders wear this)
  danger: '#e5484d', // bomb / damage flash
};

export function shade(name) {
  return PALETTE[name];
}
