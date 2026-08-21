export interface LiveEngineControls {
  readonly throttle: number;
  readonly ignition: boolean;
  readonly fuel: boolean;
  readonly limiter: boolean;
}

export interface LiveWorkerAsset {
  readonly kind: 'audio' | 'accessory-configuration';
  readonly id: string;
  readonly bytes: ArrayBuffer;
}

export interface LiveInitializeMessage {
  readonly type: 'initialize';
  readonly wasmBinary: ArrayBuffer;
  readonly engineJson: string;
  readonly scenarioJson: string;
  readonly assets: readonly LiveWorkerAsset[];
  readonly outputSampleRate: number;
}

export type LiveWorkerInboundMessage =
  | LiveInitializeMessage
  | { readonly type: 'render'; readonly blockCount: number }
  | ({ readonly type: 'controls' } & LiveEngineControls)
  | { readonly type: 'dispose' };

export type LiveWorkerOutboundMessage =
  | {
      readonly type: 'ready';
      readonly engineId: string;
      readonly scenarioId: string;
      readonly physicsRateHz: number;
      readonly deliveryRateHz: number;
      readonly preparationBlockCount: string;
      readonly outputSampleRate: number;
    }
  | {
      readonly type: 'preparing';
      readonly completedBlocks: number;
      readonly totalBlocks: string;
      readonly renderMs: number;
    }
  | {
      readonly type: 'pcm';
      readonly samples: Float32Array;
      readonly rpm: number;
      readonly torqueNm: number | null;
      readonly powerKw: number | null;
      readonly limiterCut: boolean;
      readonly renderMs: number;
      readonly processedBlocks: number;
      readonly realtimeFactor: number;
    }
  | { readonly type: 'error'; readonly error: string };
