// Small motion helpers shared by components. Everything respects the phone's Reduce Motion setting.

export const calm = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
