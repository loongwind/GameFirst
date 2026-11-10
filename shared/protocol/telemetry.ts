export const EVENT_NAMES = ['dive_start', 'dive_end', 'deposit_done', 'death_occurred', 'rescue_ad_view',
  'oxygen_refill_ad', 'ad_show', 'equip_change', 'equip_synthesize', 'tech_unlock', 'depth_record', 'tutorial_step', 'session_end'] as const;
export type EventName = typeof EVENT_NAMES[number];
export interface LocalEvent { id: string; name: EventName; at: number; properties: Record<string, string | number | boolean> }
export interface TelemetryBatch { command: 'telemetry.batch'; protocolVersion: 1; events: LocalEvent[] }
