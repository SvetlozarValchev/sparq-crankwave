import type { VehicleEngineDocument } from './authoring-contract';
import { isCrankwavePath } from './model';
import { SHA256_CRYPTO } from './sha256';
import { DeviceRateResampler } from '../vendor/crankwave/runtime/device-resampler';
import {
  CrankwaveAudioEngine,
  type CrankwaveOperatingPoint,
} from '../vendor/crankwave/runtime/crankwave-audio-engine';

export interface BakedCrankwaveRuntimeOptions {
  readonly outputSampleRate: number;
  readonly sessionSeed?: string;
}

export interface BakedCrankwaveRuntimeFormat {
  readonly sourceSampleRate: number;
  readonly outputSampleRate: number;
  readonly channelCount: 1;
  readonly preferredProcessFrames: number;
  readonly latencySourceFrames: number;
}

/**
 * Simulator-independent SPARQ consumer for a verified `*.crankwave` carrier.
 * It has no editor, JSON, WASM, or native-audio dependency and returns device-rate
 * mono PCM for the caller to route through the engine mixer.
 */
export class BakedCrankwaveRuntime {
  static async loadProjectFile(
    path: string,
    options: BakedCrankwaveRuntimeOptions
  ): Promise<BakedCrankwaveRuntime> {
    if (!isCrankwavePath(path)) {
      throw new Error(`Baked vehicle engine path must end in .crankwave: ${path}`);
    }
    const fs = await import('engine:fs');
    return BakedCrankwaveRuntime.load(await fs.readFileBuffer(path), options);
  }

  static async load(
    bytes: ArrayBuffer | ArrayBufferView,
    options: BakedCrankwaveRuntimeOptions
  ): Promise<BakedCrankwaveRuntime> {
    const outputSampleRate = options.outputSampleRate;
    if (!Number.isSafeInteger(outputSampleRate) || outputSampleRate < 8_000 || outputSampleRate > 192_000) {
      throw new RangeError('outputSampleRate must be an integer in [8000, 192000] Hz');
    }
    const engine = await CrankwaveAudioEngine.load(bytes, {
      crypto: SHA256_CRYPTO,
      sessionSeed: options.sessionSeed ?? '0',
    });
    return new BakedCrankwaveRuntime(engine, outputSampleRate);
  }

  private resampler: DeviceRateResampler;

  private constructor(
    private readonly engine: CrankwaveAudioEngine,
    readonly outputSampleRate: number
  ) {
    this.resampler = this.createResampler();
  }

  get engineId(): string { return this.engine.engineId; }
  get minimumRpm(): number { return this.engine.minimumRpm; }
  get maximumRpm(): number { return this.engine.maximumRpm; }
  get preferredSourceFrames(): number { return this.engine.processFrames; }

  get format(): BakedCrankwaveRuntimeFormat {
    return Object.freeze({
      sourceSampleRate: this.engine.sampleRate,
      outputSampleRate: this.outputSampleRate,
      channelCount: 1 as const,
      preferredProcessFrames: this.engine.processFrames,
      latencySourceFrames: this.engine.latencyFrames,
    });
  }

  process(
    point: CrankwaveOperatingPoint,
    sourceFrameCount = this.engine.processFrames
  ): Float32Array {
    return this.resampler.push(this.engine.process(point, sourceFrameCount));
  }

  reset(): void {
    this.engine.reset();
    this.resampler = this.createResampler();
  }

  diagnostics(): unknown {
    return this.engine.diagnostics();
  }

  private createResampler(): DeviceRateResampler {
    return new DeviceRateResampler({
      inputSampleRate: this.engine.sampleRate,
      outputSampleRate: this.outputSampleRate,
      channelCount: 1,
    });
  }
}

export interface VehicleDrivetrainSample extends CrankwaveOperatingPoint {
  readonly gearIndex: number;
  readonly gearId: string;
  readonly gearRatio: number;
  readonly overallRatio: number;
  /** Authored clutch-capacity ceiling reflected through the selected ratio, before wheel distribution. */
  readonly maximumDriveTorqueNm: number;
}

function lengthMetres(value: number, unit: string): number {
  const scale = unit === 'm' ? 1 : unit === 'cm' ? 0.01 : unit === 'mm' ? 0.001 : unit === 'in' ? 0.0254 : NaN;
  return value * scale;
}

function torqueNm(value: number, unit: string): number {
  const scale = unit === 'N*m' ? 1 : unit === 'lb*ft' ? 1.3558179483314004 : NaN;
  return value * scale;
}

/** Maps a real vehicle's linear speed onto the authored tires, differential, and forward gears. */
export class VehicleEngineDrivetrainRuntime {
  private readonly tireRadiusM: number;
  private readonly differentialRatio: number;
  private readonly clutchCapacityNm: number;
  private readonly gears: readonly { readonly id: string; readonly ratio: number }[];

  constructor(
    document: VehicleEngineDocument,
    readonly minimumRpm: number,
    readonly maximumRpm: number,
    readonly drivenWheelCount = 4
  ) {
    const vehicle = document.rig?.vehicle;
    const transmission = document.rig?.transmission;
    if (!vehicle || !transmission || transmission.gears.length === 0) {
      throw new Error('Vehicle runtime requires an authored vehicle and forward transmission');
    }
    this.tireRadiusM = lengthMetres(vehicle.tire_radius.value, vehicle.tire_radius.unit);
    this.differentialRatio = vehicle.differential_ratio;
    this.clutchCapacityNm = torqueNm(
      transmission.maximum_clutch_torque.value,
      transmission.maximum_clutch_torque.unit
    );
    this.gears = Object.freeze(transmission.gears.map((gear) => Object.freeze({ ...gear })));
    if (
      !Number.isFinite(this.tireRadiusM) || this.tireRadiusM <= 0 ||
      !Number.isFinite(this.differentialRatio) || this.differentialRatio <= 0 ||
      !Number.isFinite(this.clutchCapacityNm) || this.clutchCapacityNm <= 0 ||
      !Number.isSafeInteger(drivenWheelCount) || drivenWheelCount <= 0 ||
      !Number.isFinite(minimumRpm) || !Number.isFinite(maximumRpm) ||
      minimumRpm <= 0 || maximumRpm <= minimumRpm ||
      this.gears.some((gear) => !gear.id || !Number.isFinite(gear.ratio) || gear.ratio <= 0)
    ) {
      throw new Error('Vehicle runtime rig contains invalid physical values');
    }
  }

  sample(speedMps: number, throttle01: number): VehicleDrivetrainSample {
    if (!Number.isFinite(speedMps) || speedMps < 0) {
      throw new RangeError('vehicle speed must be finite and non-negative');
    }
    if (!Number.isFinite(throttle01) || throttle01 < 0 || throttle01 > 1) {
      throw new RangeError('throttle must lie in [0, 1]');
    }
    const wheelRpm = speedMps * 60 / (2 * Math.PI * this.tireRadiusM);
    let gearIndex = this.gears.length - 1;
    for (let index = 0; index < this.gears.length; index += 1) {
      const candidateRpm = wheelRpm * this.differentialRatio * this.gears[index]!.ratio;
      if (candidateRpm <= this.maximumRpm) {
        gearIndex = index;
        break;
      }
    }
    const gear = this.gears[gearIndex]!;
    const overallRatio = this.differentialRatio * gear.ratio;
    const rpm = Math.max(this.minimumRpm, Math.min(this.maximumRpm, wheelRpm * overallRatio));
    return Object.freeze({
      rpm,
      throttle01,
      load01: throttle01,
      gearIndex,
      gearId: gear.id,
      gearRatio: gear.ratio,
      overallRatio,
      maximumDriveTorqueNm: this.clutchCapacityNm * overallRatio,
    });
  }
}
