import { createWorker } from 'engine:workers';

export type {
  CrankwaveAudioPoint,
  CrankwaveAudioWorkerInbound,
  CrankwaveAudioWorkerOutbound,
} from './audio-worker-protocol';

/**
 * Create the package-owned realtime playback worker.
 *
 * Keeping the entry point inside this package lets SPARQ apply the validated `file:`
 * dependency sandbox root instead of following a project worker through a symlink.
 * The host sends operating points and stream lifecycle only; generated PCM goes
 * straight from this worker to SPARQ's native live-stream ring.
 */
export function createCrankwaveAudioWorker(name = 'crankwave-audio'): Worker {
  return createWorker('./runtime-audio-worker.ts', {
    name,
    capabilities: ['thread.realtime-audio'],
  });
}
