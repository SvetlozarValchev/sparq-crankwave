import { BakedCrankwaveRuntime } from './runtime';
import type {
  CrankwaveAudioPoint,
  CrankwaveAudioWorkerInbound,
  CrankwaveAudioWorkerOutbound,
} from './audio-worker-protocol';
import { installCrankwaveWorkerUrl } from './worker-url';

installCrankwaveWorkerUrl();

let runtime: BakedCrankwaveRuntime | null = null;
let point: CrankwaveAudioPoint = { rpm: 650, throttle01: 0, load01: 0 };
let streamId = 0;
let targetSamples = 0;
let pendingSamples: Float32Array[] = [];
let pendingSampleOffset = 0;
let rendering = false;
let playing = false;
let pumpTimer: ReturnType<typeof setInterval> | null = null;
let renderedAudioSeconds = 0;
let renderWallMs = 0;
let lastRealtimeFactor = 0;
let lastTelemetryAt = 0;
let outputGainLinear = 1;

interface RealtimeAudioStats {
  readonly queuedSamples: number;
  readonly freeSamples: number;
  readonly capacitySamples: number;
  readonly channelCount: number;
  readonly sampleRate: number;
  readonly underrunCount: number;
  readonly underrunSamples: number;
}

interface RealtimeAudioBridge {
  writePcm(stream: number, samples: Float32Array): number;
  getPcmStats(stream: number): RealtimeAudioStats;
}

function realtimeAudioBridge(): RealtimeAudioBridge {
  const services = (globalThis as typeof globalThis & {
    readonly __sparqWorkerServices?: { readonly realtimeAudio?: RealtimeAudioBridge };
  }).__sparqWorkerServices;
  const bridge = services?.realtimeAudio;
  if (
    bridge === undefined ||
    typeof bridge.writePcm !== 'function' ||
    typeof bridge.getPcmStats !== 'function'
  ) {
    throw new Error('SPARQ did not provide the realtime-audio worker data plane');
  }
  return bridge;
}

function post(message: CrankwaveAudioWorkerOutbound): void {
  const scope = globalThis as unknown as {
    postMessage(value: CrankwaveAudioWorkerOutbound): void;
  };
  scope.postMessage(message);
}

function errorText(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
}

async function initialize(
  message: Extract<CrankwaveAudioWorkerInbound, { readonly type: 'initialize' }>
): Promise<void> {
  if (runtime !== null) {
    throw new Error('Crankwave audio worker is already initialized');
  }
  runtime = await BakedCrankwaveRuntime.load(message.carrier, {
    outputSampleRate: message.outputSampleRate,
    sessionSeed: message.sessionSeed,
  });
  point = {
    rpm: Math.max(runtime.minimumRpm, Math.min(runtime.maximumRpm, message.initialPoint.rpm)),
    throttle01: Math.max(0, Math.min(1, message.initialPoint.throttle01)),
    load01: Math.max(0, Math.min(1, message.initialPoint.load01)),
  };
  if (
    !Number.isFinite(message.targetLeadSeconds) ||
    message.targetLeadSeconds < 0.04 ||
    message.targetLeadSeconds > 1
  ) {
    throw new RangeError('Crankwave targetLeadSeconds must lie in [0.04, 1]');
  }
  if (
    !Number.isFinite(message.outputGainLinear) ||
    message.outputGainLinear <= 0 ||
    message.outputGainLinear > 4
  ) {
    throw new RangeError('Crankwave outputGainLinear must lie in (0, 4]');
  }
  outputGainLinear = message.outputGainLinear;
  targetSamples = Math.ceil(runtime.outputSampleRate * message.targetLeadSeconds);
  while (pendingSampleCount() < targetSamples) {
    renderOneBlock();
  }
  post({
    type: 'ready',
    engineId: runtime.engineId,
    minimumRpm: runtime.minimumRpm,
    maximumRpm: runtime.maximumRpm,
    outputSampleRate: runtime.outputSampleRate,
  });
}

function pendingSampleCount(): number {
  let count = -pendingSampleOffset;
  for (const samples of pendingSamples) {
    count += samples.length;
  }
  return count;
}

function renderOneBlock(): void {
  if (runtime === null) {
    throw new Error('Crankwave render requested before initialization');
  }
  const started = performance.now();
  const samples = runtime.process(point);
  if (outputGainLinear !== 1) {
    for (let index = 0; index < samples.length; index += 1) {
      samples[index] = samples[index]! * outputGainLinear;
    }
  }
  const elapsed = performance.now() - started;
  pendingSamples.push(samples);
  renderedAudioSeconds += samples.length / runtime.outputSampleRate;
  renderWallMs += elapsed;
  if (renderWallMs > 0) {
    lastRealtimeFactor = renderedAudioSeconds / (renderWallMs / 1_000);
  }
}

function flushPendingSamples(bridge: RealtimeAudioBridge): void {
  while (pendingSamples.length > 0) {
    const samples = pendingSamples[0]!;
    const written = bridge.writePcm(streamId, samples.subarray(pendingSampleOffset));
    if (written <= 0) {
      return;
    }
    pendingSampleOffset += written;
    if (pendingSampleOffset < samples.length) {
      return;
    }
    pendingSamples.shift();
    pendingSampleOffset = 0;
  }
}

function pump(): void {
  if (runtime === null || streamId === 0 || rendering) {
    return;
  }
  rendering = true;
  try {
    const bridge = realtimeAudioBridge();
    flushPendingSamples(bridge);
    let stats = bridge.getPcmStats(streamId);
    if (stats.sampleRate === 0) {
      return;
    }
    if (pendingSamples.length === 0 && stats.queuedSamples < targetSamples) {
      renderOneBlock();
      flushPendingSamples(bridge);
      stats = bridge.getPcmStats(streamId);
    }
    if (!playing && stats.queuedSamples > 0) {
      playing = true;
      post({ type: 'playing' });
    }
    const now = performance.now();
    if (now - lastTelemetryAt >= 250) {
      lastTelemetryAt = now;
      post({
        type: 'telemetry',
        realtimeFactor: lastRealtimeFactor,
        queuedAudioMs: stats.channelCount === 0 || stats.sampleRate === 0
          ? 0
          : (stats.queuedSamples / stats.channelCount / stats.sampleRate) * 1_000,
        underrunCount: stats.underrunCount,
        underrunAudioMs: stats.channelCount === 0 || stats.sampleRate === 0
          ? 0
          : (stats.underrunSamples / stats.channelCount / stats.sampleRate) * 1_000,
      });
      renderedAudioSeconds = 0;
      renderWallMs = 0;
    }
  } finally {
    rendering = false;
  }
}

function attach(stream: number): void {
  if (runtime === null) {
    throw new Error('Crankwave stream attached before initialization');
  }
  if (!Number.isSafeInteger(stream) || stream <= 0 || streamId !== 0) {
    throw new Error('Crankwave audio worker received an invalid stream attachment');
  }
  streamId = stream;
  pump();
  pumpTimer = setInterval(pump, 4);
}

function dispose(): void {
  if (pumpTimer !== null) {
    clearInterval(pumpTimer);
    pumpTimer = null;
  }
  streamId = 0;
  pendingSamples = [];
  pendingSampleOffset = 0;
  runtime = null;
  close();
}

addEventListener('message', (event: MessageEvent<CrankwaveAudioWorkerInbound>) => {
  try {
    const message = event.data;
    switch (message.type) {
      case 'initialize':
        void initialize(message).catch((error: unknown) =>
          post({ type: 'error', error: errorText(error) })
        );
        break;
      case 'point':
        point = {
          rpm: Math.max(
            runtime?.minimumRpm ?? 0,
            Math.min(runtime?.maximumRpm ?? 10_000, message.point.rpm)
          ),
          throttle01: Math.max(0, Math.min(1, message.point.throttle01)),
          load01: Math.max(0, Math.min(1, message.point.load01)),
        };
        break;
      case 'attach':
        attach(message.streamId);
        break;
      case 'dispose':
        dispose();
        break;
    }
  } catch (error) {
    post({ type: 'error', error: errorText(error) });
  }
});
