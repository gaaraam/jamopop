export const CARD_SKINS = [{ id: 'card-starlight', name: '별빛 정원', price: 500 }] as const;
export function cardSkinClass(id?: string | null) {
  return CARD_SKINS.some((s) => s.id === id) ? 'card-skin-starlight' : '';
}
