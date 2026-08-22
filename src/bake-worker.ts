import createCrankwaveBakerModule from '../vendor/crankwave/crankwave-baker';
import {
  CrankwaveBaker,
  type BakedCrankwave,
} from '../vendor/crankwave/runtime/c-api-baker';
import { loadCrankwavePackage } from '../vendor/crankwave/runtime/crankwave-package';
import type {
  BakeInitializeMessage,
  BakeWorkerInboundMessage,
  BakeWorkerOutboundMessage,
} from './bake-protocol';
import { CRANKWAVE_RELEASE_IDENTITY } from './resources';
import { SHA256_CRYPTO, sha256, sha256Hex } from './sha256';

let initialized = false;
const TRANSFER_CHUNK_BYTES = 1024 * 1024;
interface PendingCarrierTransfer {
  readonly bytes: Uint8Array;
  readonly metadata: import('./bake-protocol').BakedCrankwaveMetadata;
  readonly chunkCount: number;
  nextChunkIndex: number;
}
let pendingCarrier: PendingCarrierTransfer | null = null;

function post(message: BakeWorkerOutboundMessage, transfer: Transferable[] = []): void {
  const scope = globalThis as unknown as {
    postMessage(value: BakeWorkerOutboundMessage, transferables?: Transferable[]): void;
  };
  scope.postMessage(message, transfer);
}

function errorText(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
}

async function initialize(message: BakeInitializeMessage): Promise<void> {
  if (initialized) {
    throw new Error('Vehicle engine bake worker is already initialized');
  }
  initialized = true;
  const started = performance.now();
  const wasmBytes = new Uint8Array(message.wasmBinary);
  const catalogBytes = new Uint8Array(message.assetCatalog);
  if (wasmBytes.byteLength === 0 || catalogBytes.byteLength === 0) {
    throw new Error('Vendored baker module or asset catalog is empty');
  }
  for (const asset of message.assets) {
    const actual = sha256Hex(asset.bytes);
    if (actual !== asset.sha256) {
      throw new Error(`Vendored asset '${asset.id}' does not match ${asset.sha256}`);
    }
  }

  post({
    type: 'progress',
    phase: 'loading',
    status: 'Instantiating the full-fidelity Crankwave WASM baker…',
  });
  const module = await createCrankwaveBakerModule({
    wasmBinary: wasmBytes,
    noInitialRun: true,
    locateFile: (path) => path,
  });
  const baker = new CrankwaveBaker(module);
  let baked: BakedCrankwave;
  try {
    post({
      type: 'progress',
      phase: 'baking',
      status: 'Rendering the complete held, directional, and lifecycle package…',
    });
    baked = baker.bake({
      engineJson: message.engineJson,
      assets: message.assets.map((asset) => ({
        kind: asset.kind,
        id: asset.id,
        bytes: asset.bytes,
      })),
      sharedStarterRuntimeJson: message.sharedStarterRuntimeJson,
      sharedStarterAudio: message.sharedStarterAudio,
      releaseIdentity: CRANKWAVE_RELEASE_IDENTITY,
      wasmModuleSha256: sha256(wasmBytes),
      assetCatalogSha256: sha256(catalogBytes),
    });
  } finally {
    baker.dispose();
  }

  post({
    type: 'progress',
    phase: 'verifying',
    status: 'Verifying every carrier entry and runtime descriptor in memory…',
  });
  const verified = await loadCrankwavePackage(baked.bytes, { crypto: SHA256_CRYPTO });
  if (verified.descriptor.engineId !== baked.engineId) {
    throw new Error('Baked carrier engine identity does not match its verified descriptor');
  }
  if (verified.entries.length !== baked.entryCount) {
    throw new Error('Baked carrier entry count changed during runtime verification');
  }

  if (baked.bytes.byteLength !== baked.byteCount) {
    throw new Error(
      `Baker returned ${baked.bytes.byteLength} carrier bytes but declared ${baked.byteCount}`
    );
  }
  const metadata = Object.freeze({
    engineId: baked.engineId,
    profileId: baked.profileId,
    byteCount: baked.byteCount,
    entryCount: baked.entryCount,
    heldCellCount: baked.heldCellCount,
    directionalCaptureCount: baked.directionalCaptureCount,
    lifecycleCaptureCount: baked.lifecycleCaptureCount,
    containerSha256: baked.containerSha256,
    cacheIdentitySha256: baked.cacheIdentitySha256,
    verifiedEntryCount: verified.entries.length,
    elapsedMs: performance.now() - started,
  });
  const chunkCount = Math.ceil(metadata.byteCount / TRANSFER_CHUNK_BYTES);
  pendingCarrier = {
    bytes: baked.bytes,
    metadata,
    chunkCount,
    nextChunkIndex: 0,
  };
  post({
    type: 'progress',
    phase: 'verifying',
    status: `Prepared ${chunkCount} verified carrier chunks for editor memory…`,
  });
  post({ type: 'begin', chunkCount, chunkByteLimit: TRANSFER_CHUNK_BYTES, metadata });
}

function pullChunk(index: number): void {
  const transfer = pendingCarrier;
  if (transfer === null || index !== transfer.nextChunkIndex) {
    throw new Error('Vehicle engine carrier chunk pull was out of order');
  }
  if (index === transfer.chunkCount) {
    post({
      type: 'complete',
      chunkCount: transfer.chunkCount,
      byteCount: transfer.metadata.byteCount,
    });
    pendingCarrier = null;
    return;
  }
  const byteOffset = index * TRANSFER_CHUNK_BYTES;
  const bytes = transfer.bytes.slice(
    byteOffset,
    Math.min(transfer.bytes.byteLength, byteOffset + TRANSFER_CHUNK_BYTES)
  );
  transfer.nextChunkIndex += 1;
  post({ type: 'chunk', index, count: transfer.chunkCount, byteOffset, bytes }, [bytes.buffer]);
}

addEventListener('message', (event: MessageEvent<BakeWorkerInboundMessage>) => {
  const message = event.data;
  if (message.type === 'dispose') {
    close();
    return;
  }
  if (message.type === 'pull-chunk') {
    try {
      pullChunk(message.index);
    } catch (error) {
      pendingCarrier = null;
      post({ type: 'error', error: errorText(error) });
    }
    return;
  }
  void initialize(message).catch((error: unknown) => {
    post({ type: 'error', error: errorText(error) });
  });
});
