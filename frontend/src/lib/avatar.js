const PALETTE = ['#2B4C7E', '#4F7A6B', '#B8932F', '#B5654A', '#5B7FB5', '#7FAE9B'];

/** Cor determinística a partir do nome, pra avatares consistentes entre renders. */
export function colorFor(name) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return PALETTE[Math.abs(hash) % PALETTE.length];
}

export function initials(name) {
  return (name || '')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase();
}
