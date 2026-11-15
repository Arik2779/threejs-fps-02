// The look plan, in one place. Six base values, one accent, two team hues and a
// warning red; the lighting makes every shade the game needs. The same names are
// the CSS custom properties in index.html.
export const PALETTE = {
  canvas: '#14161a',
  surface: '#1e2228',
  hairline: '#2c323a',
  ink: '#e9e6df',
  muted: '#98a0a8',
  accent: '#f0a830',
  ember: '#f0a830',
  warden: '#41b8a3',
  danger: '#e0564b',
  steel: '#3d6e8f',
  rust: '#8f5a3d',
};

export function shade(name) {
  return PALETTE[name];
}
