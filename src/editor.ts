import {
  registerProjectContentAssetTemplate,
  registerProjectDocumentExtension,
  type ProjectContentAssetTemplateLease,
  type ProjectDocumentExtensionLease,
} from '@sparq/workbench-host/project-authoring';
import { CRANKWAVE_SOURCE_DIRECTORY, CRANKWAVE_SOURCE_SUFFIX } from './model';
import { ENGINE_PRESETS } from './presets';
import {
  CRANKWAVE_EDITOR_ID,
  VehicleEngineDocumentWorkspaceExtension,
} from './workbench-document';

export interface CrankwaveActivation {
  readonly active: boolean;
  dispose(): void;
}

type CrankwaveLease = ProjectDocumentExtensionLease | ProjectContentAssetTemplateLease;

let currentActivation: CrankwaveActivation | null = null;

function disposeLeases(leases: readonly CrankwaveLease[]): void {
  const failures: Error[] = [];
  for (let index = leases.length - 1; index >= 0; index -= 1) {
    try {
      leases[index]!.dispose();
    } catch (error) {
      failures.push(error instanceof Error ? error : new Error(String(error)));
    }
  }
  if (failures.length > 0) {
    throw new AggregateError(failures, 'Crankwave cleanup failed');
  }
}

/**
 * Activate the package's Editor-only document and preset contributions.
 * The project `sparq.editor` entry owns the returned lease for its context.
 */
export function activateCrankwave(): CrankwaveActivation {
  if (currentActivation?.active) {
    throw new Error('Crankwave is already active in this editor context');
  }

  const leases: CrankwaveLease[] = [];
  try {
    leases.push(
      registerProjectDocumentExtension({
        id: CRANKWAVE_EDITOR_ID,
        launcher: {
          commandId: 'svalchev.crankwave.open',
          label: 'Crankwave',
          category: 'Window',
          icon: 'car-01',
        },
        create: ({ projectId, workspace }) =>
          new VehicleEngineDocumentWorkspaceExtension(projectId, workspace),
      })
    );
    for (const preset of ENGINE_PRESETS) {
      leases.push(
        registerProjectContentAssetTemplate({
          id: `svalchev.crankwave.preset.${preset.id}`,
          label: preset.label,
          description: preset.description,
          assetType: 'data',
          defaultName: `${preset.id}${CRANKWAVE_SOURCE_SUFFIX}`,
          requiredSuffix: CRANKWAVE_SOURCE_SUFFIX,
          createRoots: [CRANKWAVE_SOURCE_DIRECTORY],
          instantiate: () => preset.sourceJson,
        })
      );
    }
  } catch (error) {
    disposeLeases(leases);
    throw error;
  }

  let active = true;
  const activation: CrankwaveActivation = {
    get active(): boolean {
      return active;
    },
    dispose(): void {
      if (!active) {
        return;
      }
      active = false;
      if (currentActivation === activation) {
        currentActivation = null;
      }
      disposeLeases(leases);
    },
  };
  currentActivation = activation;
  return activation;
}

import.meta.hot?.dispose(() => {
  currentActivation?.dispose();
});
