/** @development-only — kept outside Cocos assets and shared release sources. */
import { AdService } from '../assets/scripts/services/local/AdService';
import type { AdDriver, AdHooks } from '../assets/scripts/services/local/AdService';
import type { EconomyService } from '../assets/scripts/services/local/EconomyService';

export class MockAdDriver implements AdDriver {
  readonly isMock = true;
  outcome: 'completed' | 'skipped' | 'unknown' = 'completed';
  loadFailures = 0;
  async load(): Promise<void> { if (this.loadFailures > 0) { this.loadFailures--; throw new Error('Development no fill'); } }
  async show(): Promise<'completed' | 'skipped' | 'unknown'> { return this.outcome; }
}
export class MockAdService extends AdService {
  declare readonly driver: MockAdDriver;
  constructor(economy: EconomyService, hooks?: AdHooks) { super(economy, new MockAdDriver(), hooks); }
}
