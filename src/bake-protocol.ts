export interface BakeWorkerAsset {
  readonly kind: 'audio' | 'accessory-configuration';
  readonly id: string;
  readonly sha256: string;
  readonly bytes: ArrayBuffer;
}

export interface BakeInitializeMessage {
  readonly type: 'initialize';
  readonly wasmBinary: ArrayBuffer;
  readonly engineJson: string;
  readonly assets: readonly BakeWorkerAsset[];
  readonly assetCatalog: ArrayBuffer;
  readonly sharedStarterRuntimeJson: ArrayBuffer;
  readonly sharedStarterAudio: ArrayBuffer;
}

export type BakeWorkerInboundMessage =
  | BakeInitializeMessage
  | { readonly type: 'pull-chunk'; readonly index: number }
  | { readonly type: 'dispose' };

export interface BakedVehicleEngineMetadata {
  readonly engineId: string;
  readonly profileId: string;
  readonly byteCount: number;
  readonly entryCount: number;
  readonly heldCellCount: number;
  readonly directionalCaptureCount: number;
  readonly lifecycleCaptureCount: number;
  readonly containerSha256: string;
  readonly cacheIdentitySha256: string;
  readonly verifiedEntryCount: number;
  readonly elapsedMs: number;
}

export type BakeWorkerOutboundMessage =
  | {
      readonly type: 'progress';
      readonly phase: 'loading' | 'baking' | 'verifying';
      readonly status: string;
    }
  | {
      readonly type: 'begin';
      readonly chunkCount: number;
      readonly chunkByteLimit: number;
      readonly metadata: BakedVehicleEngineMetadata;
    }
  | {
      readonly type: 'chunk';
      readonly index: number;
      readonly count: number;
      readonly byteOffset: number;
      readonly bytes: Uint8Array;
    }
  | { readonly type: 'complete'; readonly chunkCount: number; readonly byteCount: number }
  | { readonly type: 'error'; readonly error: string };
