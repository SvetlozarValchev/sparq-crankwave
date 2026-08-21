import type { ReactNode } from '@sparq/react';
import {
  VehicleEngineDocumentService,
  createVehicleEngineDocumentIdentity,
  type VehicleEngineDocumentSnapshot,
  type VehicleEngineRecoveryState,
} from './document-service';
import {
  VehicleEngineLabDocument,
  type VehicleEngineLabDocumentBinding,
} from './VehicleEngineLabDocument';
import { isVehicleEngineProjectPath, VEHICLE_ENGINE_PROJECT_SUFFIX } from './model';
import type {
  CloseParticipantState,
  CloseSaveResult,
  DocumentIdentity,
  JsonValue,
  RecoveryReason,
  RecoverySnapshot,
} from '@sparq/editor-documents';
import type { AssetActionAsset } from '@sparq/editor-context/asset-actions';
import type { WorkbenchDocumentPresentation, WorkbenchDocumentSession } from '@sparq/workbench';
import {
  KeyedDocumentWorkspaceOwner,
  createKeyedRecoverySnapshot,
  titleFromProjectPath,
} from '@sparq/workbench-host/project-authoring';
import type {
  ProjectDocumentExtension,
  ProjectDocumentWorkspace,
} from '@sparq/workbench-host/project-authoring';

export const VEHICLE_ENGINE_LAB_EDITOR_ID = 'vehicle-engine-lab';
const VEHICLE_ENGINE_ICON = 'car-01';

function statusOf(
  snapshot: VehicleEngineDocumentSnapshot
): WorkbenchDocumentPresentation['status'] {
  if (snapshot.phase === 'loading') {
    return 'loading';
  }
  if (snapshot.phase === 'failed' || !snapshot.workingCopy) {
    return 'failed';
  }
  return snapshot.workingCopy.status;
}

export class VehicleEngineWorkbenchSession implements WorkbenchDocumentSession {
  private binding: VehicleEngineLabDocumentBinding | null = null;

  constructor(
    readonly identity: DocumentIdentity,
    readonly service: VehicleEngineDocumentService
  ) {}

  readonly subscribe = (listener: () => void): (() => void) => this.service.subscribe(listener);

  getPresentation(): WorkbenchDocumentPresentation {
    const snapshot = this.service.getSnapshot();
    const path = snapshot.workingCopy?.identity.displayPath ?? this.identity.displayPath;
    return {
      title: titleFromProjectPath(path, VEHICLE_ENGINE_PROJECT_SUFFIX),
      icon: VEHICLE_ENGINE_ICON,
      status: statusOf(snapshot),
      dirty: snapshot.workingCopy?.dirty ?? false,
      readOnly: snapshot.workingCopy?.readOnly ?? true,
    };
  }

  getCloseState(): CloseParticipantState {
    const working = this.service.getSnapshot().workingCopy;
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
    const working = this.service.getSnapshot().workingCopy;
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
    const working = this.service.getSnapshot().workingCopy;
    if (
      !working ||
      (!working.dirty &&
        working.external.kind !== 'modified-conflict' &&
        working.external.kind !== 'deleted')
    ) {
      return null;
    }
    return createKeyedRecoverySnapshot(
      VEHICLE_ENGINE_LAB_EDITOR_ID,
      identity,
      reason,
      working.baselineRevision,
      this.service.captureRecoveryState()
    );
  }

  getRecoveryViewState(): JsonValue {
    return {};
  }

  setRecoveryViewState(_viewState: JsonValue): void {}

  render(_itemId: string): ReactNode {
    this.binding ??= { service: this.service };
    return <VehicleEngineLabDocument binding={this.binding} />;
  }

  dispose(): void {
    this.service.dispose();
  }
}

export class VehicleEngineDocumentWorkspaceExtension implements ProjectDocumentExtension {
  private readonly owner: KeyedDocumentWorkspaceOwner<
    VehicleEngineDocumentService,
    VehicleEngineWorkbenchSession,
    VehicleEngineRecoveryState
  >;

  constructor(
    private readonly projectId: string,
    workspace: ProjectDocumentWorkspace
  ) {
    this.owner = new KeyedDocumentWorkspaceOwner({
      projectId,
      workspace,
      editorId: VEHICLE_ENGINE_LAB_EDITOR_ID,
      recoveryLabel: 'Vehicle Engine Lab',
      documentLabel: 'Vehicle Engine',
      createPersistentIdentity: (path) => createVehicleEngineDocumentIdentity(projectId, path),
      createService: (identity) => new VehicleEngineDocumentService(identity),
      createSession: (identity, service) => new VehicleEngineWorkbenchSession(identity, service),
      isSession: (session): session is VehicleEngineWorkbenchSession =>
        session instanceof VehicleEngineWorkbenchSession,
      restoreService: async (service, _descriptor, recovery) => {
        if (recovery) {
          await service.restoreRecoveryState(recovery);
        } else {
          await service.open();
        }
        if (service.getSnapshot().phase !== 'ready') {
          throw service.getSnapshot().error ?? new Error('Vehicle engine recovery failed');
        }
      },
    });
  }

  canOpenAsset(asset: AssetActionAsset): boolean {
    return (
      asset.assetType === 'data' &&
      typeof asset.path === 'string' &&
      isVehicleEngineProjectPath(asset.path)
    );
  }

  openAsset(asset: AssetActionAsset): void {
    if (!asset.path) {
      throw new Error('A Vehicle Engine asset must have a project-relative path');
    }
    const identity = createVehicleEngineDocumentIdentity(this.projectId, asset.path);
    const opened = this.owner.open(identity);
    if (opened.created) {
      void opened.session.service.open();
    }
  }

  dispose(): void {
    this.owner.dispose();
  }
}
