export interface VehicleEnginePackageDescriptor {
  readonly schema: string;
  readonly version: number;
  readonly engineId: string;
  readonly runtime: {
    readonly kind: string;
    readonly manifestPath: string;
    readonly manifestSha256: string;
  };
}

export interface VehicleEnginePackageEntry {
  readonly path: string;
  readonly offset: number;
  readonly byteCount: number;
  readonly sha256: string;
}

export interface VerifiedVehicleEnginePackage {
  readonly kind: 'vehicleengine-package';
  readonly version: number;
  readonly descriptor: VehicleEnginePackageDescriptor;
  readonly entries: readonly VehicleEnginePackageEntry[];
  readonly indexSha256: string;
  readonly payloadSha256: string;
}

export interface DigestCrypto {
  readonly subtle: {
    digest(algorithm: string | { readonly name: string }, data: BufferSource): Promise<ArrayBuffer>;
  };
}

export function loadVehicleEnginePackage(
  input: ArrayBuffer | ArrayBufferView,
  options?: { readonly crypto?: DigestCrypto }
): Promise<VerifiedVehicleEnginePackage>;

export function loadResponsiveAudioVehicleEngine(
  input: ArrayBuffer | ArrayBufferView,
  options?: { readonly crypto?: DigestCrypto }
): Promise<unknown>;
