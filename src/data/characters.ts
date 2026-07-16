import { ACCENT } from './palette';

/** The three playable agent classes. Add a new entry here to ship a new model. */
export type CharId = string;

/** Colours used when building a bird mesh for this character. */
export interface BirdPalette {
  body: number;
  head: number;
  wing: number;
  accent: number;
}

/** The visual "kind" the bird builder branches on for silhouette details. */
export type BirdKind = 'pigeon' | 'magpie' | 'owl' | 'guard' | 'sparrow' | 'phoenix';

/** Combat archetype. Melee strikes an arc in front; ranged fires a projectile. */
export type AtkType = 'melee' | 'ranged';
export interface CombatDef {
  /** Max hit points. */
  hp: number;
  atk: AtkType;
  /** Damage dealt per hit. */
  dmg: number;
  /** Melee arc reach, or ranged max distance (m). */
  range: number;
  /** Attack cooldown (s). */
  atkCd: number;
  /** Projectile speed (m/s) for ranged. */
  projSpeed?: number;
}

/** Per-character active skill (E / touch). Dash & crouch stay common to all. */
export interface SkillDef {
  /** Skill id the engine branches on (signature abilities + sparrow's dart). */
  id: 'poop' | 'backstab' | 'snipe' | 'blink';
  /** Base skill damage (before the skillpow augment). */
  dmg?: number;
  name: string;
  desc: string;
  /** Cooldown (s). */
  cd: number;
}

export interface CharDef {
  /** Display name (Korean). */
  name: string;
  /** Short role label. */
  role: string;
  /** One-line description shown on the character card. */
  desc: string;
  /** Movement-speed multiplier. */
  speed: number;
  /** How easily guards detect this agent (>1 = more visible). */
  detect: number;
  /** Dash cooldown in seconds. */
  dashCd: number;
  /** Mesh silhouette variant. */
  kind: BirdKind;
  /** Mesh colours. */
  pal: BirdPalette;
  /** Combat archetype stats. */
  combat: CombatDef;
  /** Unique active skill. */
  skill: SkillDef;
  /** Hidden from character select (kept in CHARS so peer refs still resolve). */
  disabled?: boolean;
}

export const CHARS: Record<CharId, CharDef> = {
  pigeon: {
    name: '비둘기',
    role: '근접·전사형',
    desc: '체력과 방어가 높은 근접 전사. 버티며 제압한다.',
    speed: 1,
    detect: 1,
    dashCd: 1.4,
    kind: 'pigeon',
    // cool slate-grey with the signature red beak/beret
    pal: { body: 0xdfe4ea, head: 0x2f3540, wing: 0x232830, accent: ACCENT },
    combat: { hp: 6, atk: 'melee', dmg: 1, range: 2.4, atkCd: 0.55 },
    skill: { id: 'poop', name: '비둘기똥', desc: '주위를 도는 폭탄으로 근처 적 타격', cd: 8, dmg: 2 },
  },
  magpie: {
    name: '까치',
    role: '근접·속도형',
    desc: '빠르고 딜이 세지만 체력이 약한 근접 암살자. 눈에 잘 띈다.',
    speed: 1.22,
    detect: 1.18,
    dashCd: 0.9,
    kind: 'magpie',
    // bold black-and-white with an iridescent cyan accent
    pal: { body: 0x17171a, head: 0x17171a, wing: 0xf3f2f2, accent: 0x18a6c4 },
    combat: { hp: 3, atk: 'melee', dmg: 2, range: 1.9, atkCd: 0.32 },
    skill: { id: 'backstab', name: '백어택', desc: '근처 적 배후로 대시해 강타', cd: 6, dmg: 4 },
    disabled: true,
  },
  owl: {
    name: '부엉이',
    role: '원거리·저격형',
    desc: '조용한 원거리 저격수. 사거리가 길고 은신에 유리하다.',
    speed: 0.85,
    detect: 0.68,
    dashCd: 1.8,
    kind: 'owl',
    // warm tan/brown with an amber accent
    pal: { body: 0xcbb79a, head: 0xa2886a, wing: 0x6a5540, accent: 0xe0a021 },
    combat: { hp: 4, atk: 'ranged', dmg: 2, range: 10, atkCd: 0.9, projSpeed: 30 },
    skill: { id: 'snipe', name: '저격', desc: '누르는 만큼 충전 → 놓으면 그 경로로 저격', cd: 7, dmg: 6 },
  },
  sparrow: {
    name: '참새',
    role: '정찰·교란형',
    desc: '아주 빠르지만 약하다. 짧고 빠른 원거리 견제로 치고 빠진다.',
    speed: 1.32,
    detect: 0.8,
    dashCd: 0.8,
    kind: 'sparrow',
    // warm brown low-poly plumage (uses its own baked texture in 3D)
    pal: { body: 0x9c6b3f, head: 0x6f4a2a, wing: 0x4a3018, accent: 0xe0a021 },
    combat: { hp: 3, atk: 'ranged', dmg: 1, range: 9, atkCd: 0.5, projSpeed: 22 },
    skill: { id: 'blink', name: '제비돌격', desc: '전방으로 빠르게 관통 돌격, 지나친 적 타격', cd: 5, dmg: 2 },
  },
};

/** Stable iteration order for menus (also lets new keys append predictably). */
export const CHAR_ORDER: CharId[] = Object.keys(CHARS);
