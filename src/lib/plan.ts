/**
 * Scene planning for the duration system.
 *
 * The provider accepts 4-12 seconds per clip on the current 2.5 protocol, so a
 * 60s video is 12 x 5s by default and a 120s video is 24 x 5s. Variable scene
 * lengths are supported and the durations always add up exactly to the target.
 */
export const MIN_SCENE_SECONDS = 4;
export const MAX_SCENE_SECONDS = 12;

export function scenePlan(durationSec: number, preferredSceneSeconds: number): number[] {
  const total = Math.max(MIN_SCENE_SECONDS, Math.round(durationSec));
  const preferred = Math.min(MAX_SCENE_SECONDS, Math.max(MIN_SCENE_SECONDS, Math.round(preferredSceneSeconds)));

  let count = Math.max(1, Math.round(total / preferred));
  // Never ask the provider for a clip it cannot make.
  while (total / count < MIN_SCENE_SECONDS) count -= 1;
  while (total / count > MAX_SCENE_SECONDS) count += 1;
  count = Math.max(1, count);

  const base = Math.floor(total / count);
  const remainder = total - base * count;
  return Array.from({ length: count }, (_, index) => base + (index < remainder ? 1 : 0));
}

export function sceneCount(durationSec: number, preferredSceneSeconds: number): number {
  return scenePlan(durationSec, preferredSceneSeconds).length;
}

export function estimateWords(durationSec: number): number {
  // ~2.4 spoken words per second reads naturally at normal narration speed.
  return Math.round(durationSec * 2.4);
}

export function pollIntervalMs(index: number, baseSeconds: number): number {
  const base = Math.max(8, baseSeconds) * 1000;
  // Gentle backoff: first polls are quick, later ones stretch out to save quota.
  return Math.min(base * 2, base + index * 2000);
}
