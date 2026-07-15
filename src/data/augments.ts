import type { CharId } from './characters';

/** Roguelite augment ids. Commons apply to any agent; the rest are a single
 *  character's signature-skill upgrade. */
export type AugId = 'shock' | 'speed' | 'skillpow' | 'skillcd' | 'poop' | 'backstab' | 'snipe';

export interface AugDef {
  id: AugId;
  name: string;
  /** One-line effect, `{lv}` is replaced with the level it would become. */
  desc: string;
  /** Restrict to a character (signature upgrade). Omit = common (any agent). */
  char?: CharId;
  /** Highest level obtainable. */
  max: number;
  /** Card accent colour (hex int). */
  color: number;
  /** Card glyph. */
  icon: string;
}

export const AUGMENTS: AugDef[] = [
  { id: 'shock', name: '충격파', desc: '공격 시 주변 충격파 피해', max: 3, color: 0x18a6c4, icon: '◎' },
  { id: 'speed', name: '신속', desc: '이동 속도 +12%', max: 3, color: 0x3fae6b, icon: '»' },
  { id: 'skillpow', name: '스킬 위력', desc: '전용 스킬 피해 증가', max: 3, color: 0xec3013, icon: '✦' },
  { id: 'skillcd', name: '스킬 가속', desc: '전용 스킬 쿨타임 -15%', max: 3, color: 0xe0a021, icon: '⧗' },
  // signature upgrades (one per character)
  { id: 'poop', name: '비둘기똥 증식', desc: '궤도 폭탄 개수 +1 (최대 3)', char: 'pigeon', max: 2, color: 0x9c7b3f, icon: '●' },
  { id: 'backstab', name: '백어택 확장', desc: '배후 대시 반경 +2', char: 'magpie', max: 3, color: 0x18a6c4, icon: '↯' },
  { id: 'snipe', name: '저격 연장', desc: '저격 사거리 +4', char: 'owl', max: 3, color: 0xe0a021, icon: '⊹' },
];

const BY_ID: Record<AugId, AugDef> = Object.fromEntries(AUGMENTS.map((a) => [a.id, a])) as Record<
  AugId,
  AugDef
>;

export function augDef(id: AugId): AugDef {
  return BY_ID[id];
}

/** Augments offered to a character: commons + that character's signature upgrade. */
export function poolFor(char: CharId): AugDef[] {
  return AUGMENTS.filter((a) => !a.char || a.char === char);
}
