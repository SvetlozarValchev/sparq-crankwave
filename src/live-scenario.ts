import { parseEngineSource } from './model';
import { getPackageResourceBySha256 } from './resources';

export const LIVE_PHYSICS_RATE_HZ = 10_000;
export const LIVE_SOURCE_RATE_HZ = 192_000;
export const LIVE_BLOCK_DURATION_MS = 20;

export interface VehicleEngineSourceAsset {
  readonly kind: 'audio' | 'accessory-configuration';
  readonly id: string;
  readonly sha256: string;
  readonly packagePath: string;
}

export interface LiveEngineProgram {
  readonly engineId: string;
  readonly scenarioJson: string;
  readonly assets: readonly VehicleEngineSourceAsset[];
  readonly serviceBrakeAvailable: boolean;
}

type JsonRecord = Readonly<Record<string, unknown>>;

function record(value: unknown, field: string): JsonRecord {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${field} must be a JSON object`);
  }
  return value as JsonRecord;
}

function nonemptyText(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${field} must be a non-empty string`);
  }
  return value;
}

function contentHash(value: unknown, field: string): string {
  const hash = nonemptyText(value, field);
  if (!/^[0-9a-f]{64}$/.test(hash)) {
    throw new Error(`${field} must be a lowercase SHA-256 digest`);
  }
  return hash;
}

function entries(value: unknown, field: string): readonly unknown[] {
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value)) {
    throw new Error(`${field} must be an array`);
  }
  return value;
}

export function collectVehicleEngineSourceAssets(
  source: string
): readonly VehicleEngineSourceAsset[] {
  const parsed = parseEngineSource(source);
  const document = parsed.document as JsonRecord;
  const engine = record(document.engine, 'engine');
  const presentation = record(document.presentation, 'presentation');
  const assets: VehicleEngineSourceAsset[] = [];

  for (const [index, value] of entries(
    engine.accessory_configurations,
    'engine.accessory_configurations'
  ).entries()) {
    const asset = record(value, `engine.accessory_configurations[${index}]`);
    const id = nonemptyText(asset.id, `engine.accessory_configurations[${index}].id`);
    const sha256 = contentHash(
      asset.sha256,
      `engine.accessory_configurations[${index}].sha256`
    );
    const resource = getPackageResourceBySha256(sha256);
    if (resource.kind !== 'accessory-configuration') {
      throw new Error(`Packaged resource '${resource.id}' is not an accessory configuration`);
    }
    assets.push({ kind: 'accessory-configuration', id, sha256, packagePath: resource.packagePath });
  }

  for (const [index, value] of entries(presentation.assets, 'presentation.assets').entries()) {
    const asset = record(value, `presentation.assets[${index}]`);
    if (asset.kind !== 'impulse_response') {
      throw new Error(`presentation.assets[${index}].kind '${String(asset.kind)}' is not supported live`);
    }
    const id = nonemptyText(asset.id, `presentation.assets[${index}].id`);
    const sha256 = contentHash(asset.sha256, `presentation.assets[${index}].sha256`);
    const resource = getPackageResourceBySha256(sha256);
    if (resource.kind !== 'impulse-response') {
      throw new Error(`Packaged resource '${resource.id}' is not an impulse response`);
    }
    assets.push({ kind: 'audio', id, sha256, packagePath: resource.packagePath });
  }
  return Object.freeze(assets.map((asset) => Object.freeze(asset)));
}

function outputBuses(document: JsonRecord): readonly string[] {
  const presentation = record(document.presentation, 'presentation');
  const buses = entries(presentation.buses, 'presentation.buses')
    .map((value, index) => record(value, `presentation.buses[${index}]`))
    .filter((bus) => bus.publish === true)
    .map((bus, index) => nonemptyText(bus.id, `published presentation.buses[${index}].id`));
  if (buses.length === 0) {
    throw new Error('presentation must publish at least one audio bus');
  }
  return buses;
}

function initialCrankAngle(engine: JsonRecord): Readonly<{ value: number; unit: 'rad' }> {
  const outputCrankshaft = nonemptyText(engine.output_crankshaft, 'engine.output_crankshaft');
  const crankshafts = entries(engine.crankshafts, 'engine.crankshafts').map((value, index) =>
    record(value, `engine.crankshafts[${index}]`)
  );
  const crankshaft = crankshafts.find(
    (candidate) => candidate.id === outputCrankshaft
  );
  if (crankshaft === undefined) {
    throw new Error(`engine.output_crankshaft '${outputCrankshaft}' does not identify a crankshaft`);
  }
  const tdc = record(
    crankshaft.tdc_reference_angle,
    `engine.crankshafts['${outputCrankshaft}'].tdc_reference_angle`
  );
  if (typeof tdc.value !== 'number' || !Number.isFinite(tdc.value)) {
    throw new Error(
      `engine.crankshafts['${outputCrankshaft}'].tdc_reference_angle.value must be finite`
    );
  }
  if (tdc.unit !== 'deg' && tdc.unit !== 'rad') {
    throw new Error(
      `engine.crankshafts['${outputCrankshaft}'].tdc_reference_angle.unit must be 'deg' or 'rad'`
    );
  }
  // The current low-order executor stores engine mechanism angles using its
  // frozen legacy-pi conversion, then requires the scenario's initial angle to
  // match that binary64 value exactly. Supplying the original degree quantity
  // would pass through the newer SI converter and differ by a few low bits.
  const value = tdc.unit === 'rad' ? tdc.value : tdc.value * (3.14159265359 / 180);
  return Object.freeze({ value, unit: 'rad' });
}

export function createLiveEngineProgram(source: string): LiveEngineProgram {
  const parsed = parseEngineSource(source);
  const document = parsed.document as JsonRecord;
  const engine = record(document.engine, 'engine');
  const fuel = nonemptyText(engine.default_fuel, 'engine.default_fuel');
  const rig = record(document.rig, 'rig');
  const rigId = nonemptyText(rig.id, 'rig.id');
  const vehicle = record(rig.vehicle, 'rig.vehicle');
  record(rig.transmission, 'rig.transmission');
  const brakeCapacity = vehicle.maximum_service_brake_force;
  const brakeCapacityValue = brakeCapacity === undefined || brakeCapacity === null
    ? undefined
    : record(brakeCapacity, 'rig.vehicle.maximum_service_brake_force').value;
  const serviceBrakeAvailable =
    typeof brakeCapacityValue === 'number' && brakeCapacityValue > 0;
  const scenario = {
    schema: 'crankwave/scenario',
    id: `${parsed.summary.id}-crankwave-live`,
    engine: parsed.summary.id,
    fuel,
    ambient: {
      pressure: { value: 101325, unit: 'Pa' },
      temperature: { value: 298.15, unit: 'K' },
      relative_humidity_01: 0,
    },
    initial_thermal_state: {
      gas_temperature: { value: 298.15, unit: 'K' },
      wall_temperature: { value: 363.15, unit: 'K' },
      coolant_temperature: { value: 363.15, unit: 'K' },
      oil_temperature: { value: 363.15, unit: 'K' },
    },
    crankcase: {
      pressure: { value: 101325, unit: 'Pa' },
      temperature: { value: 298.15, unit: 'K' },
    },
    initial_state: {
      engine_speed: { value: 650, unit: 'rpm' },
      crank_angle: initialCrankAngle(engine),
      ignition_enabled: true,
      fuel_enabled: true,
      starter_enabled: false,
      dyno_enabled: false,
      limiter_enabled: true,
    },
    preparation: {
      type: 'fixed_horizon',
      preparation_duration: { value: 1, unit: 's' },
      trailing_complete_cycle_count: 4,
    },
    mode: {
      type: 'free_vehicle',
      rig: rigId,
      initial_gear: null,
      initial_vehicle_speed: { value: 0, unit: 'm/s' },
      initial_clutch_engagement_01: 0,
      initial_service_brake_application_01: serviceBrakeAvailable ? 1 : 0,
      throttle_01: {
        interpolation: 'right_continuous_hold',
        points: [{ time: { value: 0, unit: 's' }, value: 0.1 }],
      },
    },
    events: [],
    rates: {
      physics: { numerator: String(LIVE_PHYSICS_RATE_HZ), denominator: '1', unit: 'Hz' },
      capture: { numerator: String(LIVE_PHYSICS_RATE_HZ), denominator: '1', unit: 'Hz' },
      source_processing: { numerator: String(LIVE_SOURCE_RATE_HZ), denominator: '1', unit: 'Hz' },
      acoustics: { numerator: String(LIVE_SOURCE_RATE_HZ), denominator: '1', unit: 'Hz' },
      delivery: { numerator: String(LIVE_SOURCE_RATE_HZ), denominator: '1', unit: 'Hz' },
    },
    quality: {
      id: 'listening',
      process_block_capacity_frames: (LIVE_SOURCE_RATE_HZ * LIVE_BLOCK_DURATION_MS) / 1000,
      event_queue_capacity: 3800,
      telemetry_capacity_frames: 1,
    },
    total_duration: { value: 7, unit: 's' },
    audible_start: { value: 1, unit: 's' },
    audible_duration: { value: 6, unit: 's' },
    public_seed: '12648430',
    output: { buses: outputBuses(document), telemetry_channels: [] },
  };

  return Object.freeze({
    engineId: parsed.summary.id,
    scenarioJson: `${JSON.stringify(scenario, null, 2)}\n`,
    assets: collectVehicleEngineSourceAssets(source),
    serviceBrakeAvailable,
  });
}
