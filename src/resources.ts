export type PackageResourceKind = 'impulse-response' | 'accessory-configuration';

// Must match the semantic release compiled into the vendored crankwave baker.
export const CRANKWAVE_RELEASE_IDENTITY = '1.2.0';

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
  readonly engineIds: readonly string[];
  readonly lossMethod: 'chen-flynn-cycle-mean-aggregate-loss-v1';
}

export type PackageResource =
  | ImpulseResponseResource
  | AccessoryConfigurationResource;

function resourcePath(sha256: string): string {
  return `modules/@svalchev/crankwave/vendor/resources/${sha256}`;
}

function accessory(
  id: string,
  displayName: string,
  engineIds: readonly string[],
  sha256: string
): AccessoryConfigurationResource {
  return Object.freeze({
    id,
    displayName,
    kind: 'accessory-configuration' as const,
    engineIds: Object.freeze([...engineIds]),
    sha256,
    packagePath: resourcePath(sha256),
    lossMethod: 'chen-flynn-cycle-mean-aggregate-loss-v1' as const,
    purpose:
      'Generic warm-running aggregate loss evidence for the preset; not measured component-level accessory data.',
  });
}

export const PACKAGE_RESOURCES: readonly PackageResource[] = Object.freeze([
  Object.freeze({
    id: 'minimal-muffling-01',
    displayName: 'Minimal Muffling 01',
    kind: 'impulse-response' as const,
    sha256: '0d736bb7065686ae527c8487ef7850762c0381c91125e555228cf4599e4ff68c',
    packagePath: resourcePath(
      '0d736bb7065686ae527c8487ef7850762c0381c91125e555228cf4599e4ff68c'
    ),
    purpose: 'Impulse response selected by the radial and Shovelhead-derived presets.',
    tags: Object.freeze(['minimal-muffling']),
    measuredSupportSeconds: null,
    strongestMeasuredPeakHz: null,
    recommendedImpulseResponseGainLinear: null,
    recommendedWetMix01: null,
  }),
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
    purpose: 'Impulse response selected by the Harley Evolution and Subaru EJ25 presets.',
    tags: Object.freeze(['mild-exhaust']),
    measuredSupportSeconds: null,
    strongestMeasuredPeakHz: null,
    recommendedImpulseResponseGainLinear: null,
    recommendedWetMix01: null,
  }),
  Object.freeze({
    id: 'smooth-46',
    displayName: 'Smooth Library 46',
    kind: 'impulse-response' as const,
    sha256: '97408471f8b699a93b888db448367cf7abbe20e6c4891cc8af0d1946889f8b69',
    packagePath: resourcePath(
      '97408471f8b699a93b888db448367cf7abbe20e6c4891cc8af0d1946889f8b69'
    ),
    purpose: 'Impulse response selected by the rough 6.2 L muscle V8 preset.',
    tags: Object.freeze(['smooth']),
    measuredSupportSeconds: null,
    strongestMeasuredPeakHz: null,
    recommendedImpulseResponseGainLinear: null,
    recommendedWetMix01: null,
  }),
  accessory(
    'bmw-m52b28-warm-generic-accessories-v1',
    'BMW M52B28 warm-running aggregate loss',
    ['bmw-m52b28'],
    '6e822e04aea523d5980f53241166a43a971c481d03bb9ba033b6bb097b9debc6'
  ),
  accessory(
    'bmw-m52tub28-cleanroom-warm-generic-accessories-v1',
    'BMW M52TU warm-running aggregate loss',
    ['bmw-m52tub28-cleanroom'],
    '476dc695945fff4b4d91957d3aff77b0ecacb89affd759cd8da9b944e7a40e75'
  ),
  accessory(
    'shovelhead-family-warm-generic-accessories-v1',
    'Shovelhead-derived V-twin warm-running aggregate loss',
    ['cocentered-split-crank-v-twin', 'shovelhead-bank-local-heads'],
    '1d3196cedf46ee3370088ccc2f72273f3aea00a627e1b276d4c2d08028451470'
  ),
  accessory(
    'harley-evolution-1340-cleanroom-warm-generic-accessories-v1',
    'Harley Evolution 1340 warm-running aggregate loss',
    ['harley-evolution-1340-cleanroom'],
    '22a458bb5a2b768403637d36dc8e60af0519050187ee524c9131d796eba93355'
  ),
  accessory(
    '3ur-fe-warm-generic-accessories-v1',
    '3UR-FE warm-running aggregate loss',
    ['3ur-fe'],
    '8a7c4d18ec7734d1c155f582b45ce3d82673052f3188061e2cfa3612e13fbee4'
  ),
  accessory(
    'sequoia-3ur-fe-cleanroom-warm-generic-accessories-v1',
    'Toyota 3UR-FE warm-running aggregate loss',
    ['sequoia-3ur-fe-cleanroom'],
    '258a1d713ddaa4101a5d67c21264d3818eaf8cfb8917a73ccfeb2b569defa2f3'
  ),
  accessory(
    'honda-b18c5-cleanroom-warm-generic-accessories-v1',
    'Honda B18C5 warm-running aggregate loss',
    ['honda-b18c5-cleanroom'],
    'b77df170c2bed0a33b7d5387e5ee4b57a75a4a22df11615948cf2724c859784a'
  ),
  accessory(
    'kohler-ch750-cleanroom-warm-generic-accessories-v1',
    'Kohler CH750 warm-running aggregate loss',
    ['kohler-ch750-cleanroom'],
    'daf329a3a06c52aca49cc80de87ed13da89e8dcb368f5481e6c2a279c50b0f0b'
  ),
  accessory(
    'radial-5-cleanroom-warm-generic-accessories-v1',
    'Radial 5 warm-running aggregate loss',
    ['radial-5-cleanroom'],
    '7acc842390f7c916269f4d0a7080f3353dfaafbd687195e4e9d12e03333de8c6'
  ),
  accessory(
    'raspy-muscle-620-cleanroom-warm-generic-accessories-v1',
    'Rough 6.2 L muscle V8 warm-running aggregate loss',
    ['raspy-muscle-620-cleanroom'],
    '87d514d95c85d847d961908249dff0e18789b90fab522c5ef9d9f5dee334e62e'
  ),
  accessory(
    'subaru-ej25-cleanroom-warm-generic-accessories-v1',
    'Subaru EJ25 warm-running aggregate loss',
    ['subaru-ej25-cleanroom'],
    'a8d4435faed10556d33439a660305955f40d199f904639a2e6c482de3594b01a'
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
    throw new Error(`Crankwave does not package resource '${sha256}'`);
  }
  return resource;
}

export function getPackageResourceById(id: string): PackageResource {
  const resource = PACKAGE_RESOURCES.find((candidate) => candidate.id === id);
  if (!resource) {
    throw new Error(`Crankwave does not package resource '${id}'`);
  }
  return resource;
}
