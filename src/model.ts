import { utf8Encode } from '@sparq/shared';
import type { VehicleEngineDocument } from './authoring-contract';

export const ENGINE_SOURCE_SCHEMA = 'crankwave/engine' as const;
export const CRANKWAVE_SOURCE_DIRECTORY = 'crankwave-engines' as const;
export const CRANKWAVE_SOURCE_SUFFIX = '.crankwave.json' as const;
export const CRANKWAVE_RUNTIME_SUFFIX = '.crankwave' as const;
export const ENGINE_MAX_SOURCE_BYTES = 2 * 1024 * 1024;

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
  readonly document: Readonly<VehicleEngineDocument>;
  readonly summary: EngineSourceSummary;
}

type JsonRecord = Readonly<Record<string, unknown>>;

function record(value: unknown, field: string): asserts value is JsonRecord {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${field} must be a JSON object`);
  }
}

function rejectUnknown(value: JsonRecord, field: string, allowed: readonly string[]): void {
  const allowedSet = new Set(allowed);
  const unknown = Object.keys(value).filter((key) => !allowedSet.has(key));
  if (unknown.length > 0) {
    throw new Error(`${field} contains unsupported field '${unknown[0]}'`);
  }
}

function optionalText(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function arrayLength(value: unknown): number {
  return Array.isArray(value) ? value.length : 0;
}

function isJsonRecord(value: unknown): value is JsonRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function redlineRpm(engine: JsonRecord): number | null {
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
  rejectUnknown(value, 'Engine source', ['schema', 'engine', 'presentation', 'rig']);
  if (value.schema !== ENGINE_SOURCE_SCHEMA) {
    throw new Error(`Engine source schema must be '${ENGINE_SOURCE_SCHEMA}'`);
  }
  const engineValue = value.engine;
  record(engineValue, 'engine');
  rejectUnknown(engineValue, 'engine', [
    'identity',
    'cycle',
    'layout',
    'limits',
    'curves',
    'crankshafts',
    'output_crankshaft',
    'journals',
    'connecting_rods',
    'pistons',
    'banks',
    'intakes',
    'exhausts',
    'ports',
    'cam_lobes',
    'camshafts',
    'valvetrains',
    'heads',
    'fuels',
    'default_fuel',
    'accessory_configurations',
    'losses',
    'ignition',
    'throttle_controllers',
    'throttle_controller',
    'starter',
    'cylinders',
    'source_routes',
  ]);
  const presentationValue = value.presentation;
  record(presentationValue, 'presentation');
  rejectUnknown(presentationValue, 'presentation', [
    'assets',
    'cylinder_routes',
    'routes',
    'conditioning',
    'buses',
    'audition',
    'publication_gain_linear',
  ]);
  if (value.rig !== undefined && value.rig !== null) {
    record(value.rig, 'rig');
    rejectUnknown(value.rig, 'rig', ['id', 'vehicle', 'transmission', 'dyno_defaults']);
  }
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
  return Object.freeze({ document: value as unknown as VehicleEngineDocument, summary });
}

export function formatEngineSource(source: string): string {
  const parsed = parseEngineSource(source);
  return `${JSON.stringify(parsed.document, null, 2)}\n`;
}

export function isCrankwaveSourcePath(path: string): boolean {
  return (
    path.startsWith(`${CRANKWAVE_SOURCE_DIRECTORY}/`) &&
    path.endsWith(CRANKWAVE_SOURCE_SUFFIX) &&
    !path.startsWith('/') &&
    !path.includes('\\') &&
    !path.split('/').some((segment) => segment === '' || segment === '.' || segment === '..')
  );
}

export function isCrankwavePath(path: string): boolean {
  return (
    path.endsWith(CRANKWAVE_RUNTIME_SUFFIX) &&
    !path.startsWith('/') &&
    !path.includes('\\') &&
    !path.split('/').some((segment) => segment === '' || segment === '.' || segment === '..')
  );
}

export function crankwaveRuntimePath(engineId: string): string {
  if (!/^[a-z0-9](?:[a-z0-9._-]{0,126}[a-z0-9])?$/.test(engineId)) {
    throw new Error(`Engine ID '${engineId}' cannot be used as a portable runtime filename`);
  }
  return `${CRANKWAVE_SOURCE_DIRECTORY}/${engineId}${CRANKWAVE_RUNTIME_SUFFIX}`;
}

export function crankwaveDocumentNameFromPath(path: string): string {
  const filename = path.slice(path.lastIndexOf('/') + 1);
  return filename.endsWith(CRANKWAVE_SOURCE_SUFFIX)
    ? filename.slice(0, -CRANKWAVE_SOURCE_SUFFIX.length)
    : filename;
}
