export type Skin = {
  id: string;
  name: string;
  avatar: string;
  price: number;
  box: string;
  source?: string;
  sheetSize?: number;
  reward?: string;
  collection?: string;
};
export const SKINS: Skin[] = [
  {
    id: 'cozy-melt-cat',
    name: '녹아버린',
    avatar: '🐱',
    price: 3200,
    box: '0 0 768 768',
    source: '/characters/cozy-melt-cat.webp',
    sheetSize: 768,
    collection: '콩알의 작은 일상',
  },
  {
    id: 'cozy-peach-rabbit',
    name: '복숭아',
    avatar: '🐰',
    price: 2400,
    box: '0 0 768 768',
    source: '/characters/cozy-peach-rabbit.webp',
    sheetSize: 768,
    collection: '콩알의 작은 일상',
  },
  {
    id: 'cozy-post-bear',
    name: '우체부',
    avatar: '🐻',
    price: 2200,
    box: '0 0 768 768',
    source: '/characters/cozy-post-bear.webp',
    sheetSize: 768,
    collection: '콩알의 작은 일상',
  },
  {
    id: 'cozy-shell-penguin',
    name: '소라집',
    avatar: '🐧',
    price: 2800,
    box: '0 0 768 768',
    source: '/characters/cozy-shell-penguin.webp',
    sheetSize: 768,
    collection: '콩알의 작은 일상',
  },
  {
    id: 'cozy-cloud-fox',
    name: '구름꼬리',
    avatar: '🦊',
    price: 3500,
    box: '0 0 768 768',
    source: '/characters/cozy-cloud-fox.webp',
    sheetSize: 768,
    collection: '콩알의 작은 일상',
  },

  {
    id: 'rare-moon-rabbit',
    name: '달의 정원사',
    avatar: '🐰',
    price: 1500,
    box: '0 0 768 768',
    source: '/characters/rare-moon-rabbit.webp',
    sheetSize: 768,
  },
  {
    id: 'rare-aurora-fox',
    name: '오로라 구미호',
    avatar: '🦊',
    price: 1800,
    box: '0 0 768 768',
    source: '/characters/rare-aurora-fox.webp',
    sheetSize: 768,
  },
  {
    id: 'rare-royal-cat',
    name: '별사탕 왕자',
    avatar: '🐱',
    price: 1600,
    box: '0 0 768 768',
    source: '/characters/rare-royal-cat.webp',
    sheetSize: 768,
  },
  {
    id: 'rare-cloud-bear',
    name: '구름 위 낮잠',
    avatar: '🐻',
    price: 1200,
    box: '0 0 768 768',
    source: '/characters/rare-cloud-bear.webp',
    sheetSize: 768,
  },
  {
    id: 'rare-coral-penguin',
    name: '진주빛 인어',
    avatar: '🐧',
    price: 1500,
    box: '0 0 768 768',
    source: '/characters/rare-coral-penguin.webp',
    sheetSize: 768,
  },
  {
    id: 'rare-dragon-frog',
    name: '꼬마 용기사',
    avatar: '🐸',
    price: 1800,
    box: '0 0 768 768',
    source: '/characters/rare-dragon-frog.webp',
    sheetSize: 768,
  },

  { id: 'strawberry-cat', name: '딸기우유', avatar: '🐱', price: 300, box: '40 0 430 510' },
  { id: 'sleepy-rabbit', name: '잘자요', avatar: '🐰', price: 400, box: '550 0 420 510' },
  { id: 'honey-bear', name: '꿀단지', avatar: '🐻', price: 400, box: '1040 0 420 510' },
  { id: 'space-penguin', name: '우주여행', avatar: '🐧', price: 600, box: '40 515 430 490' },
  { id: 'toast-fox', name: '갓 구운 식빵', avatar: '🦊', price: 400, box: '550 515 420 490' },
  { id: 'rain-frog', name: '비 오는 날', avatar: '🐸', price: 300, box: '1040 515 420 490' },
];

export const SOLO_SKINS: Skin[] = [
  {
    id: 'solo-detective-cat',
    name: '신입 탐정',
    avatar: '🐱',
    price: 0,
    box: '0 0 627 627',
    source: '/characters/solo-rewards.webp',
    sheetSize: 1254,
    reward: '1층 복구',
  },
  {
    id: 'solo-archive-bear',
    name: '기록 수집가',
    avatar: '🐻',
    price: 0,
    box: '627 0 627 627',
    source: '/characters/solo-rewards.webp',
    sheetSize: 1254,
    reward: '3층까지 복구',
  },
  {
    id: 'solo-rescue-penguin',
    name: '별빛 구조대',
    avatar: '🐧',
    price: 0,
    box: '0 627 627 627',
    source: '/characters/solo-rewards.webp',
    sheetSize: 1254,
    reward: '모든 층 복구',
  },
  {
    id: 'solo-golden-penguin',
    name: '황금별 구조대',
    avatar: '🐧',
    price: 0,
    box: '627 627 627 627',
    source: '/characters/solo-rewards.webp',
    sheetSize: 1254,
    reward: '별 45개',
  },
];
export const HOME_SKINS: Skin[] = [
  {
    id: 'home-nap-rabbit',
    name: '낮잠 친구',
    avatar: '🐰',
    price: 0,
    box: '0 0 240 240',
    source: '/characters/home-nap-rabbit.svg',
    sheetSize: 240,
    reward: '콩알 친밀도 12',
  },
  {
    id: 'home-snack-cat',
    name: '간식 대장',
    avatar: '🐱',
    price: 0,
    box: '0 0 240 240',
    source: '/characters/home-snack-cat.svg',
    sheetSize: 240,
    reward: '콩알 친밀도 36',
  },
  {
    id: 'home-star-bear',
    name: '별꿈 친구',
    avatar: '🐻',
    price: 0,
    box: '0 0 240 240',
    source: '/characters/home-star-bear.svg',
    sheetSize: 240,
    reward: '콩알 친밀도 72',
  },
];
export const ALL_SKINS = [...SKINS, ...SOLO_SKINS, ...HOME_SKINS];
export function soloRewardIds(best: Record<string, number>) {
  const through = (n: number) =>
    Array.from({ length: n }, (_, i) => best[i + 1] >= 1 && best[i + 1] <= 3).every(Boolean);
  return SOLO_SKINS.filter((_, i) =>
    i === 3
      ? Array.from({ length: 15 }, (_, j) => best[j + 1] === 3).every(Boolean)
      : through([3, 9, 15][i]),
  ).map((s) => s.id);
}
