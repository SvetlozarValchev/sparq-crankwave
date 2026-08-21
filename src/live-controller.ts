import * as audio from 'engine:audio';
import * as fs from 'engine:fs';
import { createWorker } from 'engine:workers';
import { createLiveEngineProgram, LIVE_PHYSICS_RATE_HZ, LIVE_SOURCE_RATE_HZ } from './live-scenario';
import type {
  LiveEngineControls,
  LiveWorkerInboundMessage,
  LiveWorkerOutboundMessage,
} from './live-protocol';

const WASM_PATH =
  'modules/@svalchev/vehicle-engine-lab/vendor/engine-sim-wasm/engine-sim-offline.wasm';
const TARGET_LEAD_SECONDS = 0.25;
const RENDER_BLOCKS_PER_CHUNK = 10;
const PREBUFFER_CHUNKS = 2;

export type LiveEngineBenchPhase = 'idle' | 'loading' | 'preparing' | 'live' | 'failed';

export interface LiveEngineBenchSnapshot {
  readonly phase: LiveEngineBenchPhase;
  readonly status: string;
  readonly controls: LiveEngineControls;
  readonly engineId: string | null;
  readonly rpm: number;
  readonly torqueNm: number | null;
  readonly powerKw: number | null;
  readonly physicsRateHz: number;
  readonly sourceRateHz: number;
  readonly deviceRateHz: number | null;
  readonly mixerTrimDb: number;
  readonly renderMs: number | null;
  readonly realtimeFactor: number | null;
  readonly nativeLeadMs: number | null;
  readonly limiterCut: boolean;
  readonly error: string | null;
}

const INITIAL_CONTROLS: LiveEngineControls = Object.freeze({
  throttle: 0.1,
  ignition: true,
  fuel: true,
  limiter: true,
});

function initialSnapshot(): LiveEngineBenchSnapshot {
  return Object.freeze({
    phase: 'idle',
    status: 'Ready to compile the current engine source',
    controls: INITIAL_CONTROLS,
    engineId: null,
    rpm: 0,
    torqueNm: null,
    powerKw: null,
    physicsRateHz: LIVE_PHYSICS_RATE_HZ,
    sourceRateHz: LIVE_SOURCE_RATE_HZ,
    deviceRateHz: null,
    mixerTrimDb: -6,
    renderMs: null,
    realtimeFactor: null,
    nativeLeadMs: null,
    limiterCut: false,
    error: null,
  });
}

function exactBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

function errorText(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
}

export class LiveEngineBenchController {
  private snapshot: LiveEngineBenchSnapshot = initialSnapshot();
  private readonly listeners = new Set<() => void>();
  private worker: Worker | null = null;
  private streamId = 0;
  private deviceRateHz = 0;
  private workerReady = false;
  private renderInFlight = false;
  private pendingSamples: Float32Array[] = [];
  private pendingSampleOffset = 0;
  private pumpTimer: ReturnType<typeof setInterval> | null = null;
  private generation = 0;
  private disposed = false;

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  readonly getSnapshot = (): LiveEngineBenchSnapshot => this.snapshot;

  async start(source: string): Promise<void> {
    this.assertActive();
    const generation = ++this.generation;
    this.stopRuntime();
    this.replace({
      ...initialSnapshot(),
      phase: 'loading',
      status: 'Loading Engine Sim WASM and engine resources…',
      controls: this.snapshot.controls,
    });

    try {
      const liveProgram = createLiveEngineProgram(source);
      const [wasm, ...resourceBytes] = await Promise.all([
        fs.readFileBuffer(WASM_PATH),
        ...liveProgram.assets.map((asset) => fs.readFileBuffer(asset.packagePath)),
      ]);
      if (generation !== this.generation || this.disposed) {
        return;
      }

      this.deviceRateHz = audio.getSampleRate();
      const worker = createWorker('./live-worker.ts', {
        name: 'vehicle-engine-lab-10khz',
        capabilities: ['thread.realtime-audio'],
      });
      this.worker = worker;
      worker.addEventListener('message', (event: MessageEvent<LiveWorkerOutboundMessage>) => {
        this.onWorkerMessage(generation, event.data);
      });
      worker.addEventListener('error', (event: ErrorEvent) => {
        this.fail(generation, event.message || 'Engine simulation worker failed');
      });

      const wasmBinary = exactBuffer(wasm);
      const assets = liveProgram.assets.map((asset, index) => ({
        kind: asset.kind,
        id: asset.id,
        bytes: exactBuffer(resourceBytes[index]!),
      }));
      const transferables = [wasmBinary, ...assets.map((asset) => asset.bytes)];
      const initialize: LiveWorkerInboundMessage = {
        type: 'initialize',
        wasmBinary,
        engineJson: source,
        scenarioJson: liveProgram.scenarioJson,
        assets,
        outputSampleRate: this.deviceRateHz,
      };
      worker.postMessage(initialize, transferables);
      this.pumpTimer = setInterval(() => this.pump(generation), 10);
      this.replace({
        ...this.snapshot,
        engineId: liveProgram.engineId,
        deviceRateHz: this.deviceRateHz,
        status: 'Compiling the complete engine source…',
      });
    } catch (error) {
      this.fail(generation, errorText(error));
    }
  }

  updateControls(update: Partial<LiveEngineControls>): void {
    this.assertActive();
    const controls: LiveEngineControls = Object.freeze({
      ...this.snapshot.controls,
      ...update,
      throttle: Math.min(1, Math.max(0, update.throttle ?? this.snapshot.controls.throttle)),
    });
    this.replace({ ...this.snapshot, controls });
    this.worker?.postMessage({ type: 'controls', ...controls } satisfies LiveWorkerInboundMessage);
  }

  stop(): void {
    this.assertActive();
    ++this.generation;
    const controls = this.snapshot.controls;
    this.stopRuntime();
    this.replace({ ...initialSnapshot(), controls, status: 'Live bench stopped' });
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    ++this.generation;
    this.stopRuntime();
    this.listeners.clear();
  }

  private onWorkerMessage(generation: number, message: LiveWorkerOutboundMessage): void {
    if (generation !== this.generation || this.disposed) {
      return;
    }
    switch (message.type) {
      case 'ready':
        this.workerReady = true;
        this.replace({
          ...this.snapshot,
          phase: 'preparing',
          status: 'Preparing a warm, audible 10 kHz state…',
          engineId: message.engineId,
          physicsRateHz: message.physicsRateHz,
          sourceRateHz: message.deliveryRateHz,
          deviceRateHz: message.outputSampleRate,
        });
        this.sendControls();
        this.pump(generation);
        break;
      case 'preparing':
        this.renderInFlight = false;
        this.replace({
          ...this.snapshot,
          phase: 'preparing',
          status: `Preparing ${message.completedBlocks}/${message.totalBlocks} blocks…`,
          renderMs: message.renderMs,
        });
        this.pump(generation);
        break;
      case 'pcm':
        this.renderInFlight = false;
        this.pendingSamples.push(message.samples);
        if (this.streamId === 0 && this.pendingSamples.length >= PREBUFFER_CHUNKS) {
          this.streamId = audio.createLivePcmStream(1, audio.AudioBus.SFX);
          if (this.streamId === 0) {
            this.fail(generation, 'Native live PCM stream could not be created');
            return;
          }
        }
        this.flushPendingSamples();
        const buffered = this.streamId !== 0;
        this.replace({
          ...this.snapshot,
          phase: buffered ? 'live' : 'preparing',
          status: buffered
            ? 'LIVE · editor audition · open-ended session'
            : `Building realtime headroom ${this.pendingSamples.length}/${PREBUFFER_CHUNKS} chunks…`,
          rpm: Math.max(0, message.rpm),
          torqueNm: message.torqueNm,
          powerKw: message.powerKw,
          limiterCut: message.limiterCut,
          renderMs: message.renderMs / message.processedBlocks,
          realtimeFactor: message.realtimeFactor,
        });
        this.pump(generation);
        break;
      case 'error':
        this.fail(generation, message.error);
        break;
    }
  }

  private sendControls(): void {
    this.worker?.postMessage({
      type: 'controls',
      ...this.snapshot.controls,
    } satisfies LiveWorkerInboundMessage);
  }

  private flushPendingSamples(): void {
    if (this.streamId === 0 || this.pendingSamples.length === 0) {
      return;
    }
    while (this.pendingSamples.length > 0) {
      const samples = this.pendingSamples[0]!;
      const remaining = samples.subarray(this.pendingSampleOffset);
      const written = audio.writeLivePcmStream(this.streamId, remaining);
      if (written <= 0) {
        return;
      }
      this.pendingSampleOffset += written;
      if (this.pendingSampleOffset < samples.length) {
        return;
      }
      this.pendingSamples.shift();
      this.pendingSampleOffset = 0;
    }
  }

  private pump(generation: number): void {
    if (
      generation !== this.generation ||
      !this.workerReady ||
      this.worker === null ||
      this.snapshot.phase === 'failed'
    ) {
      return;
    }
    if (this.streamId === 0) {
      if (this.pendingSamples.length < PREBUFFER_CHUNKS && !this.renderInFlight) {
        this.renderInFlight = true;
        this.worker.postMessage({
          type: 'render',
          blockCount: RENDER_BLOCKS_PER_CHUNK,
        } satisfies LiveWorkerInboundMessage);
      }
      return;
    }
    this.flushPendingSamples();
    const stats = audio.getLivePcmStreamStats(this.streamId);
    if (stats.sampleRate > 0 && stats.channelCount > 0) {
      const nativeLeadMs =
        (stats.queuedSamples / stats.channelCount / stats.sampleRate) * 1000;
      if (Math.abs(nativeLeadMs - (this.snapshot.nativeLeadMs ?? -100)) >= 1) {
        this.replace({ ...this.snapshot, nativeLeadMs });
      }
    }
    const targetSamples = Math.floor(this.deviceRateHz * TARGET_LEAD_SECONDS);
    if (this.pendingSamples.length === 0 && !this.renderInFlight && stats.queuedSamples < targetSamples) {
      this.renderInFlight = true;
      this.worker.postMessage({
        type: 'render',
        blockCount: RENDER_BLOCKS_PER_CHUNK,
      } satisfies LiveWorkerInboundMessage);
    }
  }

  private fail(generation: number, message: string): void {
    if (generation !== this.generation || this.disposed) {
      return;
    }
    this.stopRuntime();
    this.replace({
      ...this.snapshot,
      phase: 'failed',
      status: 'Live bench failed',
      error: message,
    });
    console.error(`[vehicle-engine-lab] ${message}`);
  }

  private stopRuntime(): void {
    if (this.pumpTimer !== null) {
      clearInterval(this.pumpTimer);
      this.pumpTimer = null;
    }
    if (this.worker !== null) {
      this.worker.postMessage({ type: 'dispose' } satisfies LiveWorkerInboundMessage);
      this.worker.terminate();
      this.worker = null;
    }
    if (this.streamId !== 0) {
      audio.destroyLivePcmStream(this.streamId);
      this.streamId = 0;
    }
    this.workerReady = false;
    this.renderInFlight = false;
    this.pendingSamples = [];
    this.pendingSampleOffset = 0;
  }

  private replace(next: LiveEngineBenchSnapshot): void {
    this.snapshot = Object.freeze(next);
    for (const listener of this.listeners) {
      listener();
    }
  }

  private assertActive(): void {
    if (this.disposed) {
      throw new Error('Live Engine Bench controller is disposed');
    }
  }
}
