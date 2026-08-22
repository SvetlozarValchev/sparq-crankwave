import type { ReactNode } from '@sparq/react';
import {
  createDocumentIdentity,
  createRecoverySnapshot,
  type CloseParticipantState,
  type CloseSaveResult,
  type DocumentIdentity,
  type JsonValue,
  type RecoveryOpenDescriptor,
  type RecoveryReason,
  type RecoverySnapshot,
} from '@sparq/editor-documents';
import type { AssetActionAsset } from '@sparq/editor-context/asset-actions';
import type {
  WorkbenchDocumentPresentation,
  WorkbenchDocumentSession,
} from '@sparq/workbench';
import type {
  ProjectDocumentExtension,
  ProjectDocumentWorkspace,
} from '@sparq/workbench-host/project-authoring';
import {
  VehicleEngineLabDocument,
  type VehicleEngineLabDocumentBinding,
} from './VehicleEngineLabDocument';
import { VehicleEngineLabService } from './lab-service';
import type { VehicleEngineRecoveryState } from './document-service';
import { isCrankwaveSourcePath } from './model';

export const CRANKWAVE_EDITOR_ID = 'crankwave';
const VEHICLE_ENGINE_ICON = 'car-01';
const CRANKWAVE_RESOURCE = 'project-tool:crankwave';

function createVehicleEngineLabIdentity(projectId: string): DocumentIdentity {
  return createDocumentIdentity({
    projectId,
    editorId: CRANKWAVE_EDITOR_ID,
    resourceUri: CRANKWAVE_RESOURCE,
    displayPath: 'Crankwave',
  });
}

function statusOf(snapshot: ReturnType<VehicleEngineLabService['getSnapshot']>): WorkbenchDocumentPresentation['status'] {
  if (snapshot.phase === 'opening' || snapshot.document?.phase === 'loading') {
    return 'loading';
  }
  if (snapshot.phase === 'failed' || snapshot.document?.phase === 'failed') {
    return 'failed';
  }
  return snapshot.document?.workingCopy?.status ?? 'ready';
}

function isJsonRecord(value: JsonValue): value is Readonly<Record<string, JsonValue>> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function recoveryStateOf(snapshot: RecoverySnapshot | undefined): VehicleEngineRecoveryState | null {
  if (!snapshot) {
    return null;
  }
  const payload = snapshot.payload;
  if (
    !isJsonRecord(payload) ||
    payload.kind !== CRANKWAVE_EDITOR_ID ||
    !isJsonRecord(payload.state)
  ) {
    throw new Error('Invalid Crankwave recovery payload');
  }
  const state = payload.state as unknown as VehicleEngineRecoveryState;
  if (
    state.schemaVersion !== 1 ||
    typeof state.path !== 'string' ||
    typeof state.baselineRevision !== 'string' ||
    typeof state.baselineSource !== 'string' ||
    typeof state.source !== 'string'
  ) {
    throw new Error('Invalid Crankwave recovery state');
  }
  return state;
}

function activePathOf(viewState: JsonValue): string | null {
  if (!isJsonRecord(viewState)) {
    return null;
  }
  return typeof viewState.activePath === 'string' && isCrankwaveSourcePath(viewState.activePath)
    ? viewState.activePath
    : null;
}

export class VehicleEngineWorkbenchSession implements WorkbenchDocumentSession {
  private readonly binding: VehicleEngineLabDocumentBinding;

  constructor(
    readonly identity: DocumentIdentity,
    readonly service: VehicleEngineLabService
  ) {
    this.binding = Object.freeze({ service });
  }

  readonly subscribe = (listener: () => void): (() => void) => this.service.subscribe(listener);

  getPresentation(): WorkbenchDocumentPresentation {
    const snapshot = this.service.getSnapshot();
    return {
      title: 'Crankwave',
      icon: VEHICLE_ENGINE_ICON,
      status: statusOf(snapshot),
      dirty: snapshot.document?.workingCopy?.dirty ?? false,
      readOnly: snapshot.document?.workingCopy?.readOnly ?? false,
    };
  }

  getCloseState(): CloseParticipantState {
    const working = this.service.getSnapshot().document?.workingCopy;
    if (!working) {
      return 'clean';
    }
    if (working.status === 'saving') {
      return 'saving';
    }
    if (working.status === 'missing') {
      return 'missing';
    }
    if (working.status === 'conflict') {
      return 'conflict';
    }
    return working.dirty ? 'dirty' : 'clean';
  }

  async saveForClose(): Promise<CloseSaveResult> {
    const working = this.service.getSnapshot().document?.workingCopy;
    if (!working) {
      return { ok: true };
    }
    if (working.status === 'saving') {
      return { ok: false, reason: 'busy' };
    }
    if (working.status === 'conflict') {
      return { ok: false, reason: 'conflict' };
    }
    const result = await this.service.save();
    if (result.status === 'saved' || result.status === 'noop') {
      return { ok: true };
    }
    if (result.status === 'blocked') {
      return {
        ok: false,
        reason:
          result.reason === 'conflict' ? 'conflict' : result.reason === 'busy' ? 'busy' : 'failed',
      };
    }
    return { ok: false, reason: 'failed', error: result.error };
  }

  discardForClose(): void {
    this.service.discardForClose();
  }

  discardWorkingCopy(): void {
    this.service.revert();
  }

  captureRecovery(identity: DocumentIdentity, reason: RecoveryReason): RecoverySnapshot | null {
    const working = this.service.getSnapshot().document?.workingCopy;
    if (
      !working ||
      (!working.dirty &&
        working.external.kind !== 'modified-conflict' &&
        working.external.kind !== 'deleted')
    ) {
      return null;
    }
    const state = this.service.captureRecoveryState();
    if (!state) {
      return null;
    }
    return createRecoverySnapshot({
      identity,
      reason,
      baselineRevision: state.baselineRevision,
      payload: { kind: CRANKWAVE_EDITOR_ID, state } as unknown as JsonValue,
    });
  }

  getRecoveryViewState(): JsonValue {
    return { activePath: this.service.getSnapshot().activePath };
  }

  setRecoveryViewState(_viewState: JsonValue): void {}

  render(_itemId: string): ReactNode {
    return <VehicleEngineLabDocument binding={this.binding} />;
  }

  dispose(): void {
    this.service.dispose();
  }
}

/** Owns one lab session per project; project files are selected inside it. */
export class VehicleEngineDocumentWorkspaceExtension implements ProjectDocumentExtension {
  private readonly identity: DocumentIdentity;
  private readonly unregisterRecoveryAdapter: () => void;
  private disposed = false;

  constructor(
    private readonly projectId: string,
    private readonly workspace: ProjectDocumentWorkspace
  ) {
    this.identity = createVehicleEngineLabIdentity(projectId);
    this.unregisterRecoveryAdapter = workspace.registerRecoveryAdapter({
      editorId: CRANKWAVE_EDITOR_ID,
      label: 'Crankwave',
      restore: (descriptor, snapshot) => this.restore(descriptor, snapshot),
    });
  }

  canOpenAsset(asset: AssetActionAsset): boolean {
    return (
      asset.assetType === 'data' &&
      typeof asset.path === 'string' &&
      isCrankwaveSourcePath(asset.path)
    );
  }

  openAsset(asset: AssetActionAsset): void {
    if (!asset.path) {
      throw new Error('A Crankwave source must have a project-relative path');
    }
    this.assertActive();
    const opened = this.openLabSession();
    void opened.session.service.requestOpen(asset.path);
  }

  openWorkbench(): void {
    const opened = this.openLabSession();
    if (opened.created) {
      void opened.session.service.refreshProjectPaths();
    }
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    try {
      this.workspace.revokeEditorSessions(CRANKWAVE_EDITOR_ID);
    } finally {
      this.unregisterRecoveryAdapter();
    }
  }

  private async restore(
    descriptor: RecoveryOpenDescriptor,
    snapshot: RecoverySnapshot | undefined
  ): Promise<string> {
    this.assertActive();
    if (
      descriptor.identity.projectId !== this.identity.projectId ||
      descriptor.identity.editorId !== this.identity.editorId ||
      descriptor.identity.resourceUri !== this.identity.resourceUri
    ) {
      throw new Error('Crankwave cannot restore a foreign document identity');
    }
    const service = new VehicleEngineLabService(this.projectId);
    try {
      const recovery = recoveryStateOf(snapshot);
      if (recovery) {
        await service.restoreRecoveryState(recovery);
      } else {
        const activePath = activePathOf(descriptor.viewState);
        if (activePath) {
          await service.requestOpen(activePath);
        } else {
          await service.refreshProjectPaths();
        }
      }
      const opened = this.workspace.openRecoveredSession(this.identity, (identity) =>
        new VehicleEngineWorkbenchSession(identity, service)
      );
      if (!opened.created) {
        service.dispose();
      }
      return opened.itemId;
    } catch (error) {
      service.dispose();
      throw error;
    }
  }

  private assertActive(): void {
    if (this.disposed) {
      throw new Error('Crankwave document extension is disposed');
    }
  }

  private openLabSession(): {
    readonly itemId: string;
    readonly session: VehicleEngineWorkbenchSession;
    readonly created: boolean;
  } {
    this.assertActive();
    return this.workspace.openSession(this.identity, (identity) =>
      new VehicleEngineWorkbenchSession(identity, new VehicleEngineLabService(this.projectId))
    );
  }
}
