export interface CrankwavePackageDescriptor {
  readonly schema: string;
  readonly version: number;
  readonly engineId: string;
  readonly runtime: {
    readonly kind: string;
    readonly manifestPath: string;
    readonly manifestSha256: string;
  };
}

export interface CrankwavePackageEntry {
  readonly path: string;
  readonly offset: number;
  readonly byteCount: number;
  readonly sha256: string;
}

export interface VerifiedCrankwavePackage {
  readonly kind: 'crankwave-package';
  readonly version: number;
  readonly descriptor: CrankwavePackageDescriptor;
  readonly entries: readonly CrankwavePackageEntry[];
  readonly indexSha256: string;
  readonly payloadSha256: string;
}

export interface DigestCrypto {
  readonly subtle: {
    digest(algorithm: string | { readonly name: string }, data: BufferSource): Promise<ArrayBuffer>;
  };
}

export class CrankwavePackageError extends Error {
  readonly code: string;
}

export function isPortableCrankwavePath(value: unknown): boolean;

export function loadCrankwavePackage(
  input: ArrayBuffer | ArrayBufferView,
  options?: { readonly crypto?: DigestCrypto }
): Promise<VerifiedCrankwavePackage>;

export function loadResponsiveAudioCrankwave(
  input: ArrayBuffer | ArrayBufferView,
  options?: { readonly crypto?: DigestCrypto }
): Promise<unknown>;
