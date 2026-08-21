import { utf8Encode } from '@sparq/shared';

export const ENGINE_SOURCE_SCHEMA = 'engine-sim-offline/engine' as const;
export const VEHICLE_ENGINE_PROJECT_DIRECTORY = 'vehicle-engines' as const;
export const VEHICLE_ENGINE_PROJECT_SUFFIX = '.vehicle-engine.json' as const;
export const VEHICLE_ENGINE_RUNTIME_SUFFIX = '.vehicleengine' as const;
export const ENGINE_MAX_SOURCE_BYTES = 2 * 1024 * 1024;

export type EngineJsonPrimitive = string | number | boolean | null;
export type EngineJsonValue =
  EngineJsonPrimitive | readonly EngineJsonValue[] | { readonly [key: string]: EngineJsonValue };

export interface EngineSourceSummary {
  readonly id: string;
  readonly displayName: string;
  readonly description: string | null;
  readonly layout: string | null;
  readonly cycle: string | null;
  readonly redlineRpm: number | null;
  readonly cylinders: number;
  readonly banks: number;
  readonly crankshafts: number;
  readonly exhaustRoutes: number;
  readonly topLevelSections: readonly string[];
}

export interface ParsedEngineSource {
  /** The complete parsed source. No field projection is used for persistence. */
  readonly document: Readonly<Record<string, EngineJsonValue>>;
  readonly summary: EngineSourceSummary;
}

function record(
  value: unknown,
  field: string
): asserts value is Readonly<Record<string, EngineJsonValue>> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${field} must be a JSON object`);
  }
}

function optionalText(value: EngineJsonValue | undefined): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function arrayLength(value: EngineJsonValue | undefined): number {
  return Array.isArray(value) ? value.length : 0;
}

function isJsonRecord(
  value: EngineJsonValue | undefined
): value is Readonly<Record<string, EngineJsonValue>> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function redlineRpm(engine: Readonly<Record<string, EngineJsonValue>>): number | null {
  const limits = engine.limits;
  if (!isJsonRecord(limits)) {
    return null;
  }
  const redline = limits.redline;
  if (!isJsonRecord(redline)) {
    return null;
  }
  return typeof redline.value === 'number' && Number.isFinite(redline.value) ? redline.value : null;
}

/**
 * Validate only the stable Engine Sim JSON envelope needed to identify a
 * source. Semantic compilation remains the authority of Engine Sim WASM;
 * duplicating its evolving schema in TypeScript would create the reduced,
 * lossy editor model this package explicitly rejects.
 */
export function parseEngineSource(source: string): ParsedEngineSource {
  if (utf8Encode(source).byteLength > ENGINE_MAX_SOURCE_BYTES) {
    throw new Error(`Engine source exceeds ${ENGINE_MAX_SOURCE_BYTES} bytes`);
  }
  let value: unknown;
  try {
    value = JSON.parse(source) as unknown;
  } catch (error) {
    throw new Error(
      `Engine source is not valid JSON: ${error instanceof Error ? error.message : String(error)}`
    );
  }
  record(value, 'Engine source');
  if (value.schema !== ENGINE_SOURCE_SCHEMA) {
    throw new Error(`Engine source schema must be '${ENGINE_SOURCE_SCHEMA}'`);
  }
  const engineValue = value.engine;
  record(engineValue, 'engine');
  const identityValue = engineValue.identity;
  record(identityValue, 'engine.identity');
  const id = optionalText(identityValue.id);
  const displayName = optionalText(identityValue.display_name);
  if (!id || !displayName) {
    throw new Error(
      'engine.identity.id and engine.identity.display_name must be non-empty strings'
    );
  }

  const summary: EngineSourceSummary = Object.freeze({
    id,
    displayName,
    description: optionalText(identityValue.description),
    layout: optionalText(engineValue.layout),
    cycle: optionalText(engineValue.cycle),
    redlineRpm: redlineRpm(engineValue),
    cylinders: arrayLength(engineValue.cylinders),
    banks: arrayLength(engineValue.banks),
    crankshafts: arrayLength(engineValue.crankshafts),
    exhaustRoutes: arrayLength(engineValue.exhausts),
    topLevelSections: Object.freeze(Object.keys(engineValue)),
  });
  return Object.freeze({ document: value, summary });
}

export function formatEngineSource(source: string): string {
  const parsed = parseEngineSource(source);
  return `${JSON.stringify(parsed.document, null, 2)}\n`;
}

export function isVehicleEngineProjectPath(path: string): boolean {
  return (
    path.startsWith(`${VEHICLE_ENGINE_PROJECT_DIRECTORY}/`) &&
    path.endsWith(VEHICLE_ENGINE_PROJECT_SUFFIX) &&
    !path.startsWith('/') &&
    !path.includes('\\') &&
    !path.split('/').some((segment) => segment === '' || segment === '.' || segment === '..')
  );
}

export function isVehicleEngineRuntimePath(path: string): boolean {
  return (
    path.endsWith(VEHICLE_ENGINE_RUNTIME_SUFFIX) &&
    !path.startsWith('/') &&
    !path.includes('\\') &&
    !path.split('/').some((segment) => segment === '' || segment === '.' || segment === '..')
  );
}

export function vehicleEngineRuntimePath(engineId: string): string {
  if (!/^[a-z0-9](?:[a-z0-9._-]{0,126}[a-z0-9])?$/.test(engineId)) {
    throw new Error(`Engine ID '${engineId}' cannot be used as a portable runtime filename`);
  }
  return `${VEHICLE_ENGINE_PROJECT_DIRECTORY}/${engineId}${VEHICLE_ENGINE_RUNTIME_SUFFIX}`;
}

export function vehicleEngineDocumentNameFromPath(path: string): string {
  const filename = path.slice(path.lastIndexOf('/') + 1);
  return filename.endsWith(VEHICLE_ENGINE_PROJECT_SUFFIX)
    ? filename.slice(0, -VEHICLE_ENGINE_PROJECT_SUFFIX.length)
    : filename;
}
