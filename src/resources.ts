export type PackageResourceKind = 'impulse-response' | 'accessory-configuration';

// Must match the semantic release compiled into the vendored engine-sim-wasm baker.
export const ENGINE_SIM_WASM_RELEASE_IDENTITY = '1.2.0';

interface PackageResourceBase {
  readonly id: string;
  readonly displayName: string;
  readonly kind: PackageResourceKind;
  readonly sha256: string;
  readonly packagePath: string;
  readonly purpose: string;
}

export interface ImpulseResponseResource extends PackageResourceBase {
  readonly kind: 'impulse-response';
  readonly tags: readonly string[];
  readonly measuredSupportSeconds: number | null;
  readonly strongestMeasuredPeakHz: number | null;
  readonly recommendedImpulseResponseGainLinear: Readonly<{
    minimum: number;
    initial: number;
    maximum: number;
  }> | null;
  readonly recommendedWetMix01: Readonly<{
    minimum: number;
    initial: number;
    maximum: number;
  }> | null;
}

export interface AccessoryConfigurationResource extends PackageResourceBase {
  readonly kind: 'accessory-configuration';
  readonly engineId: string;
  readonly lossMethod: 'chen-flynn-cycle-mean-aggregate-loss-v1';
}

export type PackageResource =
  | ImpulseResponseResource
  | AccessoryConfigurationResource;

function resourcePath(sha256: string): string {
  return `modules/@svalchev/vehicle-engine-lab/vendor/resources/${sha256}`;
}

function accessory(
  id: string,
  displayName: string,
  engineId: string,
  sha256: string
): AccessoryConfigurationResource {
  return Object.freeze({
    id,
    displayName,
    kind: 'accessory-configuration' as const,
    engineId,
    sha256,
    packagePath: resourcePath(sha256),
    lossMethod: 'chen-flynn-cycle-mean-aggregate-loss-v1' as const,
    purpose:
      'Generic warm-running aggregate loss evidence for the preset; not measured component-level accessory data.',
  });
}

export const PACKAGE_RESOURCES: readonly PackageResource[] = Object.freeze([
  Object.freeze({
    id: 'smooth-39',
    displayName: 'Smooth Library 39',
    kind: 'impulse-response' as const,
    sha256: '75de9db47063395665d36b6d4232f477aae385feaa9ba158353fbdaf122db5cc',
    packagePath: resourcePath(
      '75de9db47063395665d36b6d4232f477aae385feaa9ba158353fbdaf122db5cc'
    ),
    purpose:
      'Short-decay, dark-weighted exhaust response with measured support of 0.157 s and its strongest measured one-twelfth-octave peak near 415 Hz.',
    tags: Object.freeze(['damped', 'dark', 'muffled', 'short-decay', 'smooth']),
    measuredSupportSeconds: 0.156621315,
    strongestMeasuredPeakHz: 414.989,
    recommendedImpulseResponseGainLinear: Object.freeze({
      minimum: 0.000265,
      initial: 0.0010601,
      maximum: 0.0042405,
    }),
    recommendedWetMix01: Object.freeze({ minimum: 0.25, initial: 0.75, maximum: 1 }),
  }),
  Object.freeze({
    id: 'mild-exhaust',
    displayName: 'Mild Exhaust',
    kind: 'impulse-response' as const,
    sha256: 'f2875947eba2ed98a15f45a5d62f6ae7b607b0a56389bad5882d75748ad374b9',
    packagePath: resourcePath(
      'f2875947eba2ed98a15f45a5d62f6ae7b607b0a56389bad5882d75748ad374b9'
    ),
    purpose: 'Packaged impulse response used by the Subaru EJ25 preset.',
    tags: Object.freeze([]),
    measuredSupportSeconds: null,
    strongestMeasuredPeakHz: null,
    recommendedImpulseResponseGainLinear: null,
    recommendedWetMix01: null,
  }),
  accessory(
    'sequoia-3ur-fe-cleanroom-warm-generic-accessories-v1',
    'Toyota 3UR-FE warm-running aggregate loss',
    'sequoia-3ur-fe-cleanroom',
    '58feca2e7b011a72a910be8a76dde71bdf53d3beedce5cdd54dbee583135f224'
  ),
  accessory(
    'bmw-m52tub28-cleanroom-warm-generic-accessories-v1',
    'BMW M52TU warm-running aggregate loss',
    'bmw-m52tub28-cleanroom',
    'a1bcdbf0edd62a92ceddecd537f475b17cf2c6503fd65c3d2cf1b5d0d6315ede'
  ),
  accessory(
    'honda-b18c5-cleanroom-warm-generic-accessories-v1',
    'Honda B18C5 warm-running aggregate loss',
    'honda-b18c5-cleanroom',
    'f6a52933a69429ee00e48ff47de613c9effb3509215219ab7b1bdae5e8be9c9b'
  ),
  accessory(
    'subaru-ej25-cleanroom-warm-generic-accessories-v1',
    'Subaru EJ25 warm-running aggregate loss',
    'subaru-ej25-cleanroom',
    'e90f6127213f989e6d75a99eab5bfc15e02d730be7fec7a219007ddd19033f4e'
  ),
]);

export const IMPULSE_RESPONSE_RESOURCES: readonly ImpulseResponseResource[] =
  Object.freeze(
    PACKAGE_RESOURCES.filter(
      (resource): resource is ImpulseResponseResource => resource.kind === 'impulse-response'
    )
  );

export function getPackageResourceBySha256(sha256: string): PackageResource {
  const resource = PACKAGE_RESOURCES.find((candidate) => candidate.sha256 === sha256);
  if (!resource) {
    throw new Error(`Vehicle Engine Lab does not package resource '${sha256}'`);
  }
  return resource;
}

export function getPackageResourceById(id: string): PackageResource {
  const resource = PACKAGE_RESOURCES.find((candidate) => candidate.id === id);
  if (!resource) {
    throw new Error(`Vehicle Engine Lab does not package resource '${id}'`);
  }
  return resource;
}
