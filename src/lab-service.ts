import type { WorkingCopySaveResult } from '@sparq/editor-documents';
import {
  VehicleEngineDocumentService,
  createVehicleEngineDocumentIdentity,
  type VehicleEngineDocumentSnapshot,
  type VehicleEngineRecoveryState,
} from './document-service';
import {
  CRANKWAVE_SOURCE_DIRECTORY,
  CRANKWAVE_SOURCE_SUFFIX,
  isCrankwaveSourcePath,
  parseEngineSource,
} from './model';

export interface VehicleEngineProjectLibrary {
  list(): Promise<readonly string[]>;
  createExclusive(path: string, source: string): Promise<void>;
  notifyFileChanged?(path: string): Promise<void> | void;
}

export interface VehicleEngineLabSnapshot {
  readonly phase: 'idle' | 'opening' | 'ready' | 'failed';
  readonly activePath: string | null;
  readonly pendingOpenPath: string | null;
  readonly projectPaths: readonly string[];
  readonly document: VehicleEngineDocumentSnapshot | null;
  readonly error: Error | null;
}

export type VehicleEngineOpenResult = 'opened' | 'focused' | 'confirmation-required';

function errorOf(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

function isMissingDirectoryError(error: unknown): boolean {
  const message = errorOf(error).message.toLowerCase();
  return message.includes('enoent') || message.includes('not found') || message.includes('no such file');
}

export function crankwaveSourcePathForName(name: string): string {
  let stem = name.trim();
  if (stem.endsWith(CRANKWAVE_SOURCE_SUFFIX)) {
    stem = stem.slice(0, -CRANKWAVE_SOURCE_SUFFIX.length);
  }
  if (!/^[a-z0-9](?:[a-z0-9._-]{0,126}[a-z0-9])?$/i.test(stem)) {
    throw new Error('Engine file name must use letters, numbers, dots, dashes, or underscores');
  }
  return `${CRANKWAVE_SOURCE_DIRECTORY}/${stem}${CRANKWAVE_SOURCE_SUFFIX}`;
}

export function createVehicleEngineProjectLibrary(): VehicleEngineProjectLibrary {
  let fsPromise: Promise<typeof import('engine:fs')> | null = null;
  let projectPromise: Promise<typeof import('engine:project')> | null = null;
  const getFs = () => (fsPromise ??= import('engine:fs'));
  const getProject = () => (projectPromise ??= import('engine:project'));
  return {
    async list() {
      try {
        const names = await (await getFs()).readdir(CRANKWAVE_SOURCE_DIRECTORY);
        return Object.freeze(
          names
            .map((name) => `${CRANKWAVE_SOURCE_DIRECTORY}/${name}`)
            .filter(isCrankwaveSourcePath)
            .sort((left, right) => left.localeCompare(right))
        );
      } catch (error) {
        if (isMissingDirectoryError(error)) {
          return Object.freeze([]);
        }
        throw error;
      }
    },
    async createExclusive(path, source) {
      if (!isCrankwaveSourcePath(path)) {
        throw new Error(`Invalid vehicle engine project path '${path}'`);
      }
      parseEngineSource(source);
      const fs = await getFs();
      await fs.mkdirRecursive(CRANKWAVE_SOURCE_DIRECTORY, true);
      await fs.writeFileExclusive(path, source);
    },
    async notifyFileChanged(path) {
      (await getProject()).notifyFileChange(path);
    },
  };
}

/**
 * Project-scoped authority for the singleton Crankwave surface.
 * Engine files are working state inside the lab; they never become workbench
 * tab identities themselves.
 */
export class VehicleEngineLabService {
  private documentService: VehicleEngineDocumentService | null = null;
  private unsubscribeDocument: (() => void) | null = null;
  private phase: VehicleEngineLabSnapshot['phase'] = 'idle';
  private activePath: string | null = null;
  private pendingOpenPath: string | null = null;
  private projectPaths: readonly string[] = Object.freeze([]);
  private error: Error | null = null;
  private operationSequence = 0;
  private disposed = false;
  private readonly listeners = new Set<() => void>();
  private snapshot: VehicleEngineLabSnapshot = Object.freeze({
    phase: 'idle',
    activePath: null,
    pendingOpenPath: null,
    projectPaths: Object.freeze([]),
    document: null,
    error: null,
  });

  constructor(
    readonly projectId: string,
    private readonly library: VehicleEngineProjectLibrary = createVehicleEngineProjectLibrary(),
    private readonly createDocumentService: (
      projectId: string,
      path: string
    ) => VehicleEngineDocumentService = (ownerProjectId, path) =>
      new VehicleEngineDocumentService(createVehicleEngineDocumentIdentity(ownerProjectId, path))
  ) {}

  readonly subscribe = (listener: () => void): (() => void) => {
    this.assertActive();
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  readonly getSnapshot = (): VehicleEngineLabSnapshot => {
    this.assertActive();
    return this.snapshot;
  };

  async refreshProjectPaths(): Promise<void> {
    this.assertActive();
    const sequence = this.operationSequence;
    try {
      const paths = await this.library.list();
      if (!this.disposed && sequence === this.operationSequence) {
        this.projectPaths = Object.freeze([...paths]);
        this.emit();
      }
    } catch (error) {
      if (!this.disposed && sequence === this.operationSequence) {
        this.error = errorOf(error);
        this.emit();
      }
    }
  }

  async requestOpen(path: string): Promise<VehicleEngineOpenResult> {
    this.assertPath(path);
    if (path === this.activePath) {
      this.pendingOpenPath = null;
      this.emit();
      return 'focused';
    }
    if (this.isDirty()) {
      this.pendingOpenPath = path;
      this.emit();
      return 'confirmation-required';
    }
    await this.openPath(path);
    return 'opened';
  }

  cancelPendingOpen(): void {
    this.pendingOpenPath = null;
    this.emit();
  }

  async discardAndOpenPending(): Promise<void> {
    const path = this.pendingOpenPath;
    if (!path) {
      return;
    }
    this.documentService?.discardForClose();
    await this.openPath(path);
  }

  async createFromSource(name: string, source: string): Promise<string> {
    this.assertActive();
    parseEngineSource(source);
    const path = crankwaveSourcePathForName(name);
    await this.library.createExclusive(path, source);
    try {
      await this.library.notifyFileChanged?.(path);
    } catch (error) {
      console.warn('[crankwave] created engine but could not broadcast its file change', {
        path,
        error,
      });
    }
    this.documentService?.discardForClose();
    await this.openPath(path);
    return path;
  }

  async saveAs(name: string): Promise<string> {
    const source = this.requireDocumentSnapshot().workingCopy?.content;
    if (source === undefined) {
      throw new Error('Open an engine before using Save As');
    }
    return this.createFromSource(name, source);
  }

  updateSource(source: string): void {
    this.requireDocumentService().updateSource(source);
  }

  save(): Promise<WorkingCopySaveResult> {
    return this.requireDocumentService().save();
  }

  revert(): void {
    this.requireDocumentService().revert();
  }

  acceptExternalModification(): void {
    this.requireDocumentService().acceptExternalModification();
  }

  keepLocalAfterExternalModification(): void {
    this.requireDocumentService().keepLocalAfterExternalModification();
  }

  discardForClose(): void {
    this.documentService?.discardForClose();
  }

  captureRecoveryState(): VehicleEngineRecoveryState | null {
    return this.documentService?.captureRecoveryState() ?? null;
  }

  async restoreRecoveryState(state: VehicleEngineRecoveryState): Promise<void> {
    this.assertPath(state.path);
    const next = this.installDocument(state.path);
    this.phase = 'opening';
    this.error = null;
    this.emit();
    await next.restoreRecoveryState(state);
    this.phase = 'ready';
    this.emit();
    await this.refreshProjectPaths();
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    this.operationSequence += 1;
    this.unsubscribeDocument?.();
    this.unsubscribeDocument = null;
    this.documentService?.dispose();
    this.documentService = null;
    this.listeners.clear();
  }

  private async openPath(path: string): Promise<void> {
    const sequence = ++this.operationSequence;
    const next = this.installDocument(path);
    this.phase = 'opening';
    this.pendingOpenPath = null;
    this.error = null;
    this.emit();
    await next.open();
    if (this.disposed || sequence !== this.operationSequence || next !== this.documentService) {
      return;
    }
    const document = next.getSnapshot();
    this.phase = document.phase === 'ready' ? 'ready' : 'failed';
    this.error = document.error;
    this.emit();
    await this.refreshProjectPaths();
  }

  private installDocument(path: string): VehicleEngineDocumentService {
    this.assertPath(path);
    const next = this.createDocumentService(this.projectId, path);
    this.unsubscribeDocument?.();
    this.documentService?.dispose();
    this.documentService = next;
    this.activePath = path;
    this.unsubscribeDocument = next.subscribe(() => this.emit());
    return next;
  }

  private requireDocumentService(): VehicleEngineDocumentService {
    this.assertActive();
    if (!this.documentService) {
      throw new Error('Open an engine inside Crankwave first');
    }
    return this.documentService;
  }

  private requireDocumentSnapshot(): VehicleEngineDocumentSnapshot {
    return this.requireDocumentService().getSnapshot();
  }

  private isDirty(): boolean {
    return this.documentService?.getSnapshot().workingCopy?.dirty ?? false;
  }

  private assertPath(path: string): void {
    this.assertActive();
    if (!isCrankwaveSourcePath(path)) {
      throw new Error(`Invalid vehicle engine project path '${path}'`);
    }
  }

  private assertActive(): void {
    if (this.disposed) {
      throw new Error('Crankwave service is disposed');
    }
  }

  private emit(): void {
    if (this.disposed) {
      return;
    }
    this.snapshot = Object.freeze({
      phase: this.phase,
      activePath: this.activePath,
      pendingOpenPath: this.pendingOpenPath,
      projectPaths: this.projectPaths,
      document: this.documentService?.getSnapshot() ?? null,
      error: this.error,
    });
    for (const listener of this.listeners) {
      listener();
    }
  }
}
