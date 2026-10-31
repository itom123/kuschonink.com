// The outside of the house that the floor plans don't give, from the south elevation and
// photos: where the eaves are and how the roof is pitched. In metres, plan x → x, plan y → z.
// Used by the 3D house (/house/3d) and by the small turning house beside the floor buttons.

/** The eaves, above ±0.000. */
export const EAVE = 7.35;

/**
 * The roof: pitched roofs over [x0, x1] × [z0, z1], the ridge running along `axis`.
 * `ridge` is the ridge's height relative to the roof's floor level (11.160).
 * Two gables face east and one faces south.
 */
export const GABLES: { x: [number, number]; z: [number, number]; axis: 'x' | 'z'; ridge: number }[] = [
  { x: [-0.3, 8.1], z: [2.4, 6.0], axis: 'x', ridge: -1.0 },
  { x: [-0.3, 14.4], z: [5.6, 11.5], axis: 'x', ridge: 0 },
  { x: [3.4, 11.0], z: [7.8, 11.8], axis: 'z', ridge: -0.8 },
];
