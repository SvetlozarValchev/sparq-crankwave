import {
  WorkingCopy,
  createDocumentIdentity,
  type DocumentIdentity,
  type WorkingCopySaveResult,
  type WorkingCopySnapshot,
} from '@sparq/editor-documents';
import {
  ENGINE_MAX_SOURCE_BYTES,
  isVehicleEngineProjectPath,
  parseEngineSource,
  type EngineSourceSummary,
} from './model';

export interface VehicleEngineVersionedFile {
  readonly data: string;
  readonly version: string;
}

export interface VehicleEngineFileChange {
  readonly path: string;
  readonly type: 'created' | 'modified' | 'deleted' | string;
}

export interface VehicleEngineProjectBackend {
  read(path: string, maxBytes: number): Promise<VehicleEngineVersionedFile>;
  writeVersioned(path: string, data: string, expectedVersion: string): Promise<string>;
  watch?(listener: (event: VehicleEngineFileChange) => void): () => void;
  notifyFileChanged?(path: string): Promise<void> | void;
}

export interface VehicleEngineDocumentDiagnostic {
  readonly severity: 'error';
  readonly message: string;
}

export interface VehicleEngineDocumentSnapshot {
  readonly phase: 'loading' | 'ready' | 'failed';
  readonly workingCopy: WorkingCopySnapshot<string> | null;
  readonly summary: EngineSourceSummary | null;
  readonly diagnostic: VehicleEngineDocumentDiagnostic | null;
  readonly externalSourceError: string | null;
  readonly error: Error | null;
}

export interface VehicleEngineRecoveryState {
  readonly schemaVersion: 1;
  readonly path: string;
  readonly baselineRevision: string;
  readonly baselineSource: string;
  readonly source: string;
}

function errorOf(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

function isMissingFileError(error: unknown): boolean {
  const message = errorOf(error).message.toLowerCase();
  return (
    message.includes('enoent') || message.includes('not found') || message.includes('no such file')
  );
}

/* eslint-disable @sparq/no-empty-catch -- invalid text is normal while the creator is typing */
function inspect(source: string): {
  readonly summary: EngineSourceSummary | null;
  readonly diagnostic: VehicleEngineDocumentDiagnostic | null;
} {
  try {
    return { summary: parseEngineSource(source).summary, diagnostic: null };
  } catch (error) {
    return {
      summary: null,
      diagnostic: Object.freeze({ severity: 'error', message: errorOf(error).message }),
    };
  }
}
/* eslint-enable @sparq/no-empty-catch */

export function createVehicleEngineProjectBackend(): VehicleEngineProjectBackend {
  let fsPromise: Promise<typeof import('engine:fs')> | null = null;
  let projectPromise: Promise<typeof import('engine:project')> | null = null;
  const getFs = () => (fsPromise ??= import('engine:fs'));
  const getProject = () => (projectPromise ??= import('engine:project'));
  return {
    async read(path, maxBytes) {
      return (await getFs()).readFileVersionedBounded(path, maxBytes);
    },
    async writeVersioned(path, data, expectedVersion) {
      return (await getFs()).writeFileVersioned(path, data, expectedVersion);
    },
    watch(listener) {
      let cancelled = false;
      let project: typeof import('engine:project') | null = null;
      let listenerId = 0;
      void getProject().then(
        (module) => {
          if (cancelled) {
            return;
          }
          project = module;
          listenerId = module.onFileChanged(listener);
        },
        (error: unknown) => {
          console.error('[vehicle-engine-lab] project file watching is unavailable', error);
        }
      );
      return () => {
        cancelled = true;
        if (project && listenerId !== 0) {
          project.offFileChanged(listenerId);
        }
      };
    },
    async notifyFileChanged(path) {
      (await getProject()).notifyFileChange(path);
    },
  };
}

/**
 * Exact-text project document authority for one complete Engine Sim WASM source.
 * The working copy stores source text, so unknown schema fields, array order,
 * number spellings, and formatting survive an untouched open/save cycle.
 */
export class VehicleEngineDocumentService {
  private phase: VehicleEngineDocumentSnapshot['phase'] = 'loading';
  private workingCopy: WorkingCopy<string> | null = null;
  private unsubscribeWorkingCopy: (() => void) | null = null;
  private unsubscribeFiles: (() => void) | null = null;
  private summary: EngineSourceSummary | null = null;
  private diagnostic: VehicleEngineDocumentDiagnostic | null = null;
  private externalSourceError: string | null = null;
  private error: Error | null = null;
  private disposed = false;
  private operationSequence = 0;
  private externalSequence = 0;
  private readonly listeners = new Set<() => void>();
  private snapshot: VehicleEngineDocumentSnapshot = Object.freeze({
    phase: 'loading',
    workingCopy: null,
    summary: null,
    diagnostic: null,
    externalSourceError: null,
    error: null,
  });

  constructor(
    readonly identity: DocumentIdentity,
    private readonly backend: VehicleEngineProjectBackend = createVehicleEngineProjectBackend()
  ) {
    if (!isVehicleEngineProjectPath(identity.displayPath)) {
      throw new Error(`Invalid vehicle engine project path '${identity.displayPath}'`);
    }
    this.unsubscribeFiles =
      backend.watch?.((event) => {
        void this.handleExternalEvent(event);
      }) ?? null;
  }

  readonly subscribe = (listener: () => void): (() => void) => {
    this.assertActive();
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  readonly getSnapshot = (): VehicleEngineDocumentSnapshot => {
    this.assertActive();
    return this.snapshot;
  };

  async open(): Promise<void> {
    this.assertActive();
    const sequence = ++this.operationSequence;
    this.phase = 'loading';
    this.error = null;
    this.emit();
    try {
      const file = await this.backend.read(this.identity.displayPath, ENGINE_MAX_SOURCE_BYTES);
      if (!this.isCurrent(sequence)) {
        return;
      }
      parseEngineSource(file.data);
      this.installWorkingCopy(file.data, file.version);
      this.phase = 'ready';
      this.externalSourceError = null;
      this.refreshInspection(file.data);
      this.emit();
    } catch (error) {
      if (this.isCurrent(sequence)) {
        this.phase = 'failed';
        this.error = errorOf(error);
        this.emit();
      }
    }
  }

  updateSource(source: string): void {
    this.requireWorkingCopy().replaceContent(source);
    this.externalSourceError = null;
    this.refreshInspection(source);
    this.emit();
  }

  async save(): Promise<WorkingCopySaveResult> {
    const workingCopy = this.requireWorkingCopy();
    const source = workingCopy.getSnapshot().content;
    const inspection = inspect(source);
    if (inspection.diagnostic) {
      this.summary = null;
      this.diagnostic = inspection.diagnostic;
      this.emit();
      return { status: 'failed', error: new Error('Resolve the engine JSON error before saving.') };
    }
    const result = await workingCopy.save(async (request) => {
      if (!request.expectedRevision) {
        throw new Error('Vehicle Engine Lab documents must already exist in the project');
      }
      const revision = await this.backend.writeVersioned(
        request.identity.displayPath,
        request.content,
        request.expectedRevision
      );
      return { identity: request.identity, content: request.content, revision };
    });
    if (result.status === 'saved') {
      this.externalSourceError = null;
      try {
        await this.backend.notifyFileChanged?.(result.identity.displayPath);
      } catch (error) {
        console.warn('[vehicle-engine-lab] saved engine but could not broadcast its file change', {
          path: result.identity.displayPath,
          error,
        });
      }
    }
    return result;
  }

  revert(): void {
    const workingCopy = this.requireWorkingCopy();
    workingCopy.revert();
    this.externalSourceError = null;
    this.refreshInspection(workingCopy.getSnapshot().content);
    this.emit();
  }

  acceptExternalModification(): void {
    const workingCopy = this.requireWorkingCopy();
    workingCopy.acceptExternalModification();
    this.externalSourceError = null;
    this.refreshInspection(workingCopy.getSnapshot().content);
    this.emit();
  }

  keepLocalAfterExternalModification(): void {
    this.requireWorkingCopy().keepLocalAfterExternalModification();
    this.externalSourceError = null;
    this.emit();
  }

  discardForClose(): void {
    const workingCopy = this.workingCopy;
    if (workingCopy && workingCopy.getSnapshot().status !== 'saving') {
      workingCopy.revert();
    }
  }

  captureRecoveryState(): VehicleEngineRecoveryState {
    const workingCopy = this.requireWorkingCopy();
    const snapshot = workingCopy.getSnapshot();
    if (!snapshot.baselineRevision) {
      throw new Error('Vehicle Engine Lab recovery requires a persisted project document');
    }
    return Object.freeze({
      schemaVersion: 1,
      path: snapshot.identity.displayPath,
      baselineRevision: snapshot.baselineRevision,
      baselineSource: workingCopy.getBaselineContent(),
      source: snapshot.content,
    });
  }

  async restoreRecoveryState(state: VehicleEngineRecoveryState): Promise<void> {
    this.assertActive();
    if (
      state.schemaVersion !== 1 ||
      state.path !== this.identity.displayPath ||
      !state.baselineRevision ||
      typeof state.baselineSource !== 'string' ||
      typeof state.source !== 'string'
    ) {
      throw new Error('Invalid Vehicle Engine Lab recovery state');
    }
    parseEngineSource(state.baselineSource);
    const sequence = ++this.operationSequence;
    this.phase = 'loading';
    this.emit();
    try {
      const current = await this.backend.read(state.path, ENGINE_MAX_SOURCE_BYTES);
      if (!this.isCurrent(sequence)) {
        return;
      }
      parseEngineSource(current.data);
      this.installWorkingCopy(current.data, current.version);
      this.requireWorkingCopy().replaceContent(state.source);
      if (current.version !== state.baselineRevision) {
        this.requireWorkingCopy().notifyExternalModification(current.data, current.version);
      }
    } catch (error) {
      if (!this.isCurrent(sequence)) {
        return;
      }
      if (!isMissingFileError(error)) {
        throw error;
      }
      this.installWorkingCopy(state.baselineSource, state.baselineRevision);
      this.requireWorkingCopy().replaceContent(state.source);
      this.requireWorkingCopy().notifyExternalDeletion(state.baselineRevision);
    }
    this.phase = 'ready';
    this.error = null;
    this.refreshInspection(this.requireWorkingCopy().getSnapshot().content);
    this.emit();
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    this.operationSequence += 1;
    this.externalSequence += 1;
    this.unsubscribeFiles?.();
    this.unsubscribeFiles = null;
    this.unsubscribeWorkingCopy?.();
    this.unsubscribeWorkingCopy = null;
    this.workingCopy?.dispose();
    this.workingCopy = null;
    this.listeners.clear();
  }

  private installWorkingCopy(source: string, revision: string): void {
    this.unsubscribeWorkingCopy?.();
    this.workingCopy?.dispose();
    this.workingCopy = new WorkingCopy({
      identity: this.identity,
      content: source,
      baselineRevision: revision,
      codec: { clone: (value) => value, equals: (left, right) => left === right },
    });
    this.unsubscribeWorkingCopy = this.workingCopy.subscribe(() => this.emit());
  }

  private refreshInspection(source: string): void {
    const result = inspect(source);
    this.summary = result.summary;
    this.diagnostic = result.diagnostic;
  }

  private async handleExternalEvent(event: VehicleEngineFileChange): Promise<void> {
    const workingCopy = this.workingCopy;
    if (this.disposed || !workingCopy || event.path !== this.identity.displayPath) {
      return;
    }
    const sequence = ++this.externalSequence;
    if (event.type === 'deleted') {
      workingCopy.notifyExternalDeletion(workingCopy.getSnapshot().baselineRevision);
      return;
    }
    try {
      const file = await this.backend.read(event.path, ENGINE_MAX_SOURCE_BYTES);
      if (this.disposed || sequence !== this.externalSequence || !this.workingCopy) {
        return;
      }
      if (file.version === this.workingCopy.getSnapshot().baselineRevision) {
        return;
      }
      parseEngineSource(file.data);
      this.externalSourceError = null;
      this.workingCopy.notifyExternalModification(file.data, file.version);
      this.refreshInspection(this.workingCopy.getSnapshot().content);
      this.emit();
    } catch (error) {
      if (this.disposed || sequence !== this.externalSequence) {
        return;
      }
      this.externalSourceError = `The external engine source is invalid: ${errorOf(error).message}`;
      this.emit();
    }
  }

  private requireWorkingCopy(): WorkingCopy<string> {
    this.assertActive();
    if (!this.workingCopy) {
      throw new Error('Vehicle Engine Lab document is not ready');
    }
    return this.workingCopy;
  }

  private isCurrent(sequence: number): boolean {
    return !this.disposed && sequence === this.operationSequence;
  }

  private assertActive(): void {
    if (this.disposed) {
      throw new Error('Vehicle Engine Lab document service is disposed');
    }
  }

  private emit(): void {
    if (this.disposed) {
      return;
    }
    this.snapshot = Object.freeze({
      phase: this.phase,
      workingCopy: this.workingCopy?.getSnapshot() ?? null,
      summary: this.summary,
      diagnostic: this.diagnostic,
      externalSourceError: this.externalSourceError,
      error: this.error,
    });
    for (const listener of [...this.listeners]) {
      try {
        listener();
      } catch {
        // Presentation observers cannot corrupt the source authority.
      }
    }
  }
}

export function createVehicleEngineDocumentIdentity(
  projectId: string,
  path: string
): DocumentIdentity {
  if (!isVehicleEngineProjectPath(path)) {
    throw new Error(`Invalid vehicle engine project path '${path}'`);
  }
  return createDocumentIdentity({
    projectId,
    editorId: 'vehicle-engine-lab',
    resourceUri: `project-file:/${path}`,
    displayPath: path,
  });
}
