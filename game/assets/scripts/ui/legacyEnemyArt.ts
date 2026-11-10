import type { Enemy } from '../battle/model';
import type { SeaLayer } from '../battle/SeaContent';
import type { SeaIdentityArt } from './SeaArt';

/** Legacy dives retain their original combat state; only their displayed identity is inferred. */
export function enemyArtKey(
  enemy: Pick<Enemy, 'assetKey' | 'kind' | 'id'>,
  displayedLayer: SeaLayer,
  identities: Readonly<Record<string, Pick<SeaIdentityArt, 'layer' | 'kind'>>>,
): string | undefined {
  if (enemy.assetKey) return enemy.assetKey;
  const candidates = Object.keys(identities).filter(key =>
    identities[key].layer === displayedLayer && identities[key].kind === enemy.kind).sort();
  return candidates.length ? candidates[enemy.id % candidates.length] : undefined;
}
