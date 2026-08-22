import * as fs from 'engine:fs';
import type {
  BakedVehicleEngineMetadata,
  BakeWorkerInboundMessage,
  BakeWorkerOutboundMessage,
} from './bake-protocol';
import { collectVehicleEngineSourceAssets } from './live-scenario';
import {
  parseEngineSource,
  VEHICLE_ENGINE_PROJECT_DIRECTORY,
  vehicleEngineRuntimePath,
} from './model';

const PACKAGE_ROOT = 'modules/@svalchev/vehicle-engine-lab/vendor/engine-sim-wasm';
const BAKER_WASM_PATH = `${PACKAGE_ROOT}/engine-sim-offline-baker.wasm`;
const ASSET_CATALOG_PATH = `${PACKAGE_ROOT}/bake/asset-catalog.v1.json`;
const STARTER_ROOT = `${PACKAGE_ROOT}/bake/shared-recorded-starter`;
const STARTER_RUNTIME_PATH = `${STARTER_ROOT}/runtime.json`;
const STARTER_AUDIO_PATH =
  `${STARTER_ROOT}/audio/recorded-starter.cropped.192000hz.mono.f32le`;

export type VehicleEngineBakePhase =
  | 'idle'
  | 'loading'
  | 'baking'
  | 'verifying'
  | 'ready'
  | 'saving'
  | 'failed';

export interface VehicleEngineBakeSnapshot {
  readonly phase: VehicleEngineBakePhase;
  readonly status: string;
  readonly metadata: BakedVehicleEngineMetadata | null;
  readonly runtimePath: string | null;
  readonly savedPath: string | null;
  readonly error: string | null;
}

function initialSnapshot(status = 'Ready to bake the complete working engine source'):
VehicleEngineBakeSnapshot {
  return Object.freeze({
    phase: 'idle',
    status,
    metadata: null,
    runtimePath: null,
    savedPath: null,
    error: null,
  });
}

function exactBuffer(bytes: Uint8Array): ArrayBuffer {
  const output = new Uint8Array(bytes.byteLength);
  output.set(bytes);
  return output.buffer;
}

function errorText(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
}

export class VehicleEngineBakeController {
  private snapshot: VehicleEngineBakeSnapshot = initialSnapshot();
  private readonly listeners = new Set<() => void>();
  private worker: Worker | null = null;
  private bakedBytes: Uint8Array | null = null;
  private bakedSource: string | null = null;
  private bakeAssembly: Uint8Array | null = null;
  private bakeMetadata: BakedVehicleEngineMetadata | null = null;
  private expectedChunkCount = 0;
  private nextChunkIndex = 0;
  private receivedChunkBytes = 0;
  private generation = 0;
  private disposed = false;

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  readonly getSnapshot = (): VehicleEngineBakeSnapshot => this.snapshot;

  isCurrentSource(source: string): boolean {
    return this.bakedSource !== null && this.bakedSource === source;
  }

  async bake(source: string): Promise<void> {
    this.assertActive();
    const generation = ++this.generation;
    this.stopWorker();
    this.bakedBytes = null;
    this.bakedSource = null;
    this.clearChunks();
    this.replace({
      ...initialSnapshot(),
      phase: 'loading',
      status: 'Loading the dedicated WASM baker and complete engine dependencies…',
    });

    try {
      const parsed = parseEngineSource(source);
      const sourceAssets = collectVehicleEngineSourceAssets(source);
      const [wasm, catalog, starterRuntime, starterAudio, ...assetBytes] = await Promise.all([
        fs.readFileBuffer(BAKER_WASM_PATH),
        fs.readFileBuffer(ASSET_CATALOG_PATH),
        fs.readFileBuffer(STARTER_RUNTIME_PATH),
        fs.readFileBuffer(STARTER_AUDIO_PATH),
        ...sourceAssets.map((asset) => fs.readFileBuffer(asset.packagePath)),
      ]);
      if (generation !== this.generation || this.disposed) {
        return;
      }

      const worker = new Worker('./bake-worker.ts', {
        type: 'module',
        name: 'vehicle-engine-full-baker',
      });
      this.worker = worker;
      worker.addEventListener('message', (event: MessageEvent<BakeWorkerOutboundMessage>) => {
        this.onWorkerMessage(generation, source, event.data);
      });
      worker.addEventListener('error', (event: ErrorEvent) => {
        this.fail(generation, event.message || 'Vehicle engine bake worker failed');
      });

      const wasmBinary = exactBuffer(wasm);
      const assetCatalog = exactBuffer(catalog);
      const sharedStarterRuntimeJson = exactBuffer(starterRuntime);
      const sharedStarterAudio = exactBuffer(starterAudio);
      const assets = sourceAssets.map((asset, index) => ({
        kind: asset.kind,
        id: asset.id,
        sha256: asset.sha256,
        bytes: exactBuffer(assetBytes[index]!),
      }));
      const transferables = [
        wasmBinary,
        assetCatalog,
        sharedStarterRuntimeJson,
        sharedStarterAudio,
        ...assets.map((asset) => asset.bytes),
      ];
      worker.postMessage(
        {
          type: 'initialize',
          wasmBinary,
          engineJson: source,
          assets,
          assetCatalog,
          sharedStarterRuntimeJson,
          sharedStarterAudio,
        } satisfies BakeWorkerInboundMessage,
        transferables
      );
      this.replace({
        ...this.snapshot,
        status: `Preparing a full-fidelity bake for ${parsed.summary.displayName}…`,
        runtimePath: vehicleEngineRuntimePath(parsed.summary.id),
      });
    } catch (error) {
      this.fail(generation, errorText(error));
    }
  }

  cancel(): void {
    this.assertActive();
    ++this.generation;
    this.stopWorker();
    this.bakedBytes = null;
    this.bakedSource = null;
    this.clearChunks();
    this.replace(initialSnapshot('Bake cancelled; no carrier was published'));
  }

  async save(): Promise<string> {
    this.assertActive();
    if (
      this.snapshot.phase !== 'ready' ||
      this.bakedBytes === null ||
      this.snapshot.runtimePath === null
    ) {
      throw new Error('No verified in-memory vehicle engine is ready to save');
    }
    const path = this.snapshot.runtimePath;
    this.replace({ ...this.snapshot, phase: 'saving', status: `Writing ${path}…`, error: null });
    try {
      await fs.mkdirRecursive(VEHICLE_ENGINE_PROJECT_DIRECTORY, true);
      await fs.writeFileBuffer(path, this.bakedBytes);
      const written = await fs.stat(path);
      if (written.size !== BigInt(this.bakedBytes.byteLength)) {
        throw new Error(
          `Saved carrier has ${written.size.toString()} bytes; expected ${this.bakedBytes.byteLength}`
        );
      }
      this.replace({
        ...this.snapshot,
        phase: 'ready',
        status: 'Verified carrier remains in memory and is also saved in the project',
        savedPath: path,
      });
      return path;
    } catch (error) {
      const message = errorText(error);
      this.replace({
        ...this.snapshot,
        phase: 'ready',
        status: 'Verified carrier remains in memory; project save failed',
        error: message,
      });
      throw error;
    }
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    ++this.generation;
    this.stopWorker();
    this.bakedBytes = null;
    this.bakedSource = null;
    this.clearChunks();
    this.listeners.clear();
  }

  private onWorkerMessage(
    generation: number,
    source: string,
    message: BakeWorkerOutboundMessage
  ): void {
    if (generation !== this.generation || this.disposed) {
      return;
    }
    if (message.type === 'progress') {
      this.replace({ ...this.snapshot, phase: message.phase, status: message.status, error: null });
      return;
    }
    if (message.type === 'error') {
      this.fail(generation, message.error);
      return;
    }
    if (message.type === 'begin') {
      const metadata = message.metadata;
      if (
        this.bakeAssembly !== null ||
        this.bakeMetadata !== null ||
        !Number.isSafeInteger(message.chunkCount) ||
        message.chunkCount <= 0 ||
        !Number.isSafeInteger(message.chunkByteLimit) ||
        message.chunkByteLimit <= 0 ||
        !Number.isSafeInteger(metadata.byteCount) ||
        metadata.byteCount <= 0 ||
        Math.ceil(metadata.byteCount / message.chunkByteLimit) !== message.chunkCount
      ) {
        this.fail(generation, 'Verified carrier transfer manifest is invalid');
        return;
      }
      this.bakeMetadata = Object.freeze({ ...metadata });
      this.bakeAssembly = new Uint8Array(metadata.byteCount);
      this.expectedChunkCount = message.chunkCount;
      this.nextChunkIndex = 0;
      this.receivedChunkBytes = 0;
      this.worker?.postMessage({ type: 'pull-chunk', index: 0 } satisfies BakeWorkerInboundMessage);
      this.replace({
        ...this.snapshot,
        status: `Receiving verified carrier 0/${message.chunkCount}…`,
      });
      return;
    }
    if (message.type === 'chunk') {
      const expectedBytes = Math.min(
        this.bakeAssembly?.byteLength ?? 0,
        message.byteOffset + message.bytes.byteLength
      ) - message.byteOffset;
      if (
        this.bakeAssembly === null ||
        this.bakeMetadata === null ||
        message.count !== this.expectedChunkCount ||
        message.index !== this.nextChunkIndex ||
        message.byteOffset !== this.receivedChunkBytes ||
        message.bytes.byteLength <= 0 ||
        expectedBytes !== message.bytes.byteLength ||
        message.byteOffset + message.bytes.byteLength > this.bakeAssembly.byteLength
      ) {
        this.fail(generation, 'Verified carrier chunks arrived out of order');
        return;
      }
      this.bakeAssembly.set(message.bytes, message.byteOffset);
      this.receivedChunkBytes += message.bytes.byteLength;
      this.nextChunkIndex += 1;
      this.worker?.postMessage({
        type: 'pull-chunk',
        index: this.nextChunkIndex,
      } satisfies BakeWorkerInboundMessage);
      this.replace({
        ...this.snapshot,
        status: `Receiving verified carrier ${this.nextChunkIndex}/${message.count}…`,
      });
      return;
    }

    const metadata = this.bakeMetadata;
    const assembled = this.bakeAssembly;
    if (
      metadata === null ||
      assembled === null ||
      message.chunkCount !== this.expectedChunkCount ||
      message.byteCount !== metadata.byteCount ||
      this.nextChunkIndex !== this.expectedChunkCount ||
      this.receivedChunkBytes !== metadata.byteCount ||
      assembled.byteLength !== metadata.byteCount
    ) {
      this.fail(
        generation,
        `Transferred carrier is incomplete (${this.receivedChunkBytes}/${metadata?.byteCount ?? 0} bytes, ` +
          `${this.nextChunkIndex}/${this.expectedChunkCount} chunks)`
      );
      return;
    }
    this.stopWorker();
    this.bakeAssembly = null;
    this.bakeMetadata = null;
    this.clearChunks();
    this.bakedBytes = assembled;
    this.bakedSource = source;
    this.replace({
      ...this.snapshot,
      phase: 'ready',
      status: 'Full carrier baked and runtime-verified in memory',
      metadata,
      runtimePath: vehicleEngineRuntimePath(metadata.engineId),
      savedPath: null,
      error: null,
    });
  }

  private fail(generation: number, message: string): void {
    if (generation !== this.generation || this.disposed) {
      return;
    }
    this.stopWorker();
    this.bakedBytes = null;
    this.bakedSource = null;
    this.clearChunks();
    this.replace({
      ...this.snapshot,
      phase: 'failed',
      status: 'Vehicle engine bake failed',
      metadata: null,
      savedPath: null,
      error: message,
    });
  }

  private stopWorker(): void {
    if (this.worker !== null) {
      try {
        this.worker.postMessage({ type: 'dispose' } satisfies BakeWorkerInboundMessage);
      } finally {
        this.worker.terminate();
        this.worker = null;
      }
    }
  }

  private clearChunks(): void {
    this.bakeAssembly = null;
    this.bakeMetadata = null;
    this.expectedChunkCount = 0;
    this.nextChunkIndex = 0;
    this.receivedChunkBytes = 0;
  }

  private replace(snapshot: VehicleEngineBakeSnapshot): void {
    this.snapshot = Object.freeze(snapshot);
    for (const listener of this.listeners) {
      listener();
    }
  }

  private assertActive(): void {
    if (this.disposed) {
      throw new Error('Vehicle engine bake controller is disposed');
    }
  }
}
