export interface EngineSimAsset {
  readonly kind: 'audio' | 'accessory-configuration';
  readonly id: string;
  readonly bytes: Uint8Array;
}

export interface EngineSimDescriptor {
  readonly physicsRateHz: number;
  readonly deliveryRateHz: number;
  readonly physicsFramesPerBlock: number;
  readonly deliveryFramesPerBlock: number;
  readonly preparationBlockCount: string;
}

export interface EngineSimQuantity {
  readonly value: number;
  readonly availability: number;
  readonly completeness: number;
}

export interface EngineSimTorqueValue {
  readonly valueNm: number;
  readonly availability: number;
  readonly completeness: number;
}

export interface EngineSimTelemetry {
  readonly engineSpeedRpm: number;
  readonly requestedThrottle01: number;
  readonly resolvedThrottle01: number;
  readonly limiterCutActive: boolean;
  readonly torque: {
    readonly cycleMeanNetShaft: EngineSimTorqueValue;
    readonly cycleMeanPowerW: EngineSimQuantity;
  };
}

export interface EngineSimProcess {
  readonly physicsFrameCount: number;
  readonly deliveryFrameCount: number;
}

export interface EngineSimCompletedCycle {
  readonly meanEngineSpeedRpm: number;
  readonly instantaneousNetShaft: {
    readonly cycleMeanTorqueNm: number;
    readonly availability: number;
    readonly completeness: number;
  };
}

export interface EngineSimBlock {
  readonly audible: boolean;
  readonly samples: Float32Array;
  readonly telemetry: readonly EngineSimTelemetry[];
  readonly completedCycles: readonly EngineSimCompletedCycle[];
  readonly process: EngineSimProcess;
}

export interface EngineSimSession {
  readonly descriptor: EngineSimDescriptor;
  readonly nextDeliveryFrame: bigint;
  readonly firstAudibleDeliveryFrame: bigint;
  readonly auditionBus: { readonly sampleRateHz: number; readonly channelCount: number };
  enqueueControls(
    controls: ReadonlyArray<{
      readonly deliveryFrame: bigint;
      readonly kind: string;
      readonly value: number | boolean;
    }>
  ): void;
  processBlock(): EngineSimBlock;
}

export interface CompiledEngineProgram {
  readonly session: EngineSimSession;
  readonly engineId: string;
  readonly scenarioId: string;
  dispose(): void;
}

export class EngineSimCapiClient {
  constructor(module: unknown);
  compile(
    engineJson: string,
    scenarioJson: string,
    assets: readonly EngineSimAsset[],
    executionKind: number
  ): CompiledEngineProgram;
  dispose(): void;
}
