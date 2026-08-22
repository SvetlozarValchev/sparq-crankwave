export interface CrankwaveAsset {
  readonly kind: 'audio' | 'accessory-configuration';
  readonly id: string;
  readonly bytes: Uint8Array;
}

export interface CrankwaveDescriptor {
  readonly physicsRateHz: number;
  readonly deliveryRateHz: number;
  readonly physicsFramesPerBlock: number;
  readonly deliveryFramesPerBlock: number;
  readonly preparationBlockCount: string;
}

export interface CrankwaveQuantity {
  readonly value: number;
  readonly availability: number;
  readonly completeness: number;
}

export interface CrankwaveTorqueValue {
  readonly valueNm: number;
  readonly availability: number;
  readonly completeness: number;
}

export interface CrankwaveTelemetry {
  readonly engineSpeedRpm: number;
  readonly requestedThrottle01: number;
  readonly resolvedThrottle01: number;
  readonly limiterCutActive: boolean;
  readonly torque: {
    readonly cycleMeanNetShaft: CrankwaveTorqueValue;
    readonly cycleMeanPowerW: CrankwaveQuantity;
  };
  readonly freeVehicle: null | {
    readonly vehicleSpeedMS: number;
    readonly vehicleDistanceM: number;
    readonly selectedForwardGearOrdinal: number | null;
    readonly clutchEngagement01: number;
    readonly serviceBrakeApplication01: number;
    readonly clutchDisposition: string;
    readonly clutchDispositionCode: number;
    readonly clutchTorqueCapacityNm: number;
    readonly appliedAverageClutchTorqueOnEngineNm: number;
    readonly finalClutchSlipRadS: number | null;
    readonly roadLoadDisposition: string;
    readonly roadLoadDispositionCode: number;
    readonly requestedRoadLoadForceN: number;
    readonly appliedAverageRoadLoadForceN: number;
  };
}

export interface CrankwaveProcess {
  readonly physicsFrameCount: number;
  readonly deliveryFrameCount: number;
}

export interface CrankwaveCompletedCycle {
  readonly meanEngineSpeedRpm: number;
  readonly instantaneousNetShaft: {
    readonly cycleMeanTorqueNm: number;
    readonly availability: number;
    readonly completeness: number;
  };
}

export interface CrankwaveBlock {
  readonly audible: boolean;
  readonly samples: Float32Array;
  readonly telemetry: readonly CrankwaveTelemetry[];
  readonly completedCycles: readonly CrankwaveCompletedCycle[];
  readonly process: CrankwaveProcess;
}

export interface CrankwaveSession {
  readonly descriptor: CrankwaveDescriptor;
  readonly nextDeliveryFrame: bigint;
  readonly firstAudibleDeliveryFrame: bigint;
  readonly auditionBus: { readonly sampleRateHz: number; readonly channelCount: number };
  readonly forwardGears: readonly {
    readonly index: number;
    readonly gearId: number;
    readonly authoredOrdinal: number;
    readonly semanticId: string;
    readonly ratio: number;
  }[];
  enqueueControls(
    controls: ReadonlyArray<{
      readonly deliveryFrame: bigint;
      readonly kind: string;
      readonly value: number | boolean;
    }>
  ): void;
  processBlock(): CrankwaveBlock;
}

export interface CompiledEngineProgram {
  readonly session: CrankwaveSession;
  readonly engineId: string;
  readonly scenarioId: string;
  dispose(): void;
}

export class CrankwaveCapiClient {
  constructor(module: unknown);
  compile(
    engineJson: string,
    scenarioJson: string,
    assets: readonly CrankwaveAsset[],
    executionKind: number
  ): CompiledEngineProgram;
  dispose(): void;
}
