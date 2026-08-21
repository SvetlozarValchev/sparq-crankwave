import {
  registerProjectContentAssetTemplate,
  registerProjectDocumentExtension,
  type ProjectContentAssetTemplateLease,
  type ProjectDocumentExtensionLease,
} from '@sparq/workbench-host/project-authoring';
import { VEHICLE_ENGINE_PROJECT_DIRECTORY, VEHICLE_ENGINE_PROJECT_SUFFIX } from './model';
import { ENGINE_PRESETS } from './presets';
import {
  VEHICLE_ENGINE_LAB_EDITOR_ID,
  VehicleEngineDocumentWorkspaceExtension,
} from './workbench-document';

export interface VehicleEngineLabActivation {
  readonly active: boolean;
  dispose(): void;
}

type VehicleEngineLabLease = ProjectDocumentExtensionLease | ProjectContentAssetTemplateLease;

let currentActivation: VehicleEngineLabActivation | null = null;

function disposeLeases(leases: readonly VehicleEngineLabLease[]): void {
  const failures: Error[] = [];
  for (let index = leases.length - 1; index >= 0; index -= 1) {
    try {
      leases[index]!.dispose();
    } catch (error) {
      failures.push(error instanceof Error ? error : new Error(String(error)));
    }
  }
  if (failures.length > 0) {
    throw new AggregateError(failures, 'Vehicle Engine Lab cleanup failed');
  }
}

/**
 * Activate the package's Editor-only document and preset contributions.
 * The project `sparq.editor` entry owns the returned lease for its context.
 */
export function activateVehicleEngineLab(): VehicleEngineLabActivation {
  if (currentActivation?.active) {
    throw new Error('Vehicle Engine Lab is already active in this editor context');
  }

  const leases: VehicleEngineLabLease[] = [];
  try {
    leases.push(
      registerProjectDocumentExtension({
        id: VEHICLE_ENGINE_LAB_EDITOR_ID,
        launcher: {
          commandId: 'svalchev.vehicle-engine-lab.open',
          label: 'Vehicle Engine Lab',
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
          id: `svalchev.vehicle-engine.preset.${preset.id}`,
          label: preset.label,
          description: preset.description,
          assetType: 'data',
          defaultName: `${preset.id}${VEHICLE_ENGINE_PROJECT_SUFFIX}`,
          requiredSuffix: VEHICLE_ENGINE_PROJECT_SUFFIX,
          createRoots: [VEHICLE_ENGINE_PROJECT_DIRECTORY],
          instantiate: () => preset.sourceJson,
        })
      );
    }
  } catch (error) {
    disposeLeases(leases);
    throw error;
  }

  let active = true;
  const activation: VehicleEngineLabActivation = {
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
