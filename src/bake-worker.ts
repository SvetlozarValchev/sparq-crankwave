import createEngineSimBakerModule from '../vendor/engine-sim-wasm/engine-sim-offline-baker';
import {
  EngineSimVehicleEngineBaker,
  type BakedVehicleEngine,
} from '../vendor/engine-sim-wasm/runtime/c-api-baker';
import { loadVehicleEnginePackage } from '../vendor/engine-sim-wasm/runtime/vehicleengine-package';
import type {
  BakeInitializeMessage,
  BakeWorkerInboundMessage,
  BakeWorkerOutboundMessage,
} from './bake-protocol';
import { SHA256_CRYPTO, sha256, sha256Hex } from './sha256';

let initialized = false;

function post(message: BakeWorkerOutboundMessage, transfer: Transferable[] = []): void {
  const scope = globalThis as unknown as {
    postMessage(value: BakeWorkerOutboundMessage, transferables?: Transferable[]): void;
  };
  scope.postMessage(message, transfer);
}

function errorText(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
}

function releaseIdentity(catalogBytes: Uint8Array): string {
  let value: unknown;
  try {
    value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(catalogBytes));
  } catch (error) {
    throw new Error(`Vendored asset catalog is invalid: ${errorText(error)}`);
  }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Vendored asset catalog must be a JSON object');
  }
  const release = (value as Record<string, unknown>).release_identity;
  if (typeof release !== 'string' || release.length === 0) {
    throw new Error('Vendored asset catalog has no release identity');
  }
  return release;
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
    status: 'Instantiating the full-fidelity Engine Sim WASM baker…',
  });
  const module = await createEngineSimBakerModule({
    wasmBinary: wasmBytes,
    noInitialRun: true,
    locateFile: (path) => path,
  });
  const baker = new EngineSimVehicleEngineBaker(module);
  let baked: BakedVehicleEngine;
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
      releaseIdentity: releaseIdentity(catalogBytes),
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
  const verified = await loadVehicleEnginePackage(baked.bytes, { crypto: SHA256_CRYPTO });
  if (verified.descriptor.engineId !== baked.engineId) {
    throw new Error('Baked carrier engine identity does not match its verified descriptor');
  }
  if (verified.entries.length !== baked.entryCount) {
    throw new Error('Baked carrier entry count changed during runtime verification');
  }

  const bytes = baked.bytes.buffer as ArrayBuffer;
  post(
    {
      type: 'complete',
      bytes,
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
    },
    [bytes]
  );
}

addEventListener('message', (event: MessageEvent<BakeWorkerInboundMessage>) => {
  const message = event.data;
  if (message.type === 'dispose') {
    close();
    return;
  }
  void initialize(message).catch((error: unknown) => {
    post({ type: 'error', error: errorText(error) });
  });
});
