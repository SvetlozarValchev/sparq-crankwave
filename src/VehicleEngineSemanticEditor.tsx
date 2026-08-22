import { useCallback } from '@sparq/react';
import type { VehicleEngineDocument } from './authoring-contract';
import { VEHICLE_ENGINE_SECTIONS, type VehicleEngineSectionId } from './authoring-semantics';
import type { EditorPath } from './VehicleEngineEditorControls';
import {
  AirflowSection,
  AudioSection,
  ControlsSection,
  CylindersSection,
  EngineSection,
  FuelSection,
  RotatingSection,
  ValvetrainSection,
  VehicleSection,
} from './VehicleEngineEditorSections';
import styles from './VehicleEngineLabDocument.module.css';

type MutableRecord = Record<string, unknown>;

function valueAt(root: unknown, path: EditorPath): unknown {
  let value = root;
  for (const part of path) value = (value as MutableRecord | unknown[])[part as never];
  return value;
}

function setValueAt(root: unknown, path: EditorPath, next: unknown): void {
  const parent = valueAt(root, path.slice(0, -1)) as MutableRecord | unknown[];
  parent[path[path.length - 1] as never] = next as never;
}

export function VehicleEngineSemanticEditor({ document, section, disabled, onChange }: {
  readonly document: VehicleEngineDocument;
  readonly section: VehicleEngineSectionId;
  readonly disabled: boolean;
  readonly onChange: (document: VehicleEngineDocument) => void;
}) {
  const update = useCallback((path: EditorPath, value: unknown) => {
    const copy = JSON.parse(JSON.stringify(document)) as VehicleEngineDocument;
    setValueAt(copy, path, value);
    onChange(copy);
  }, [document, onChange]);

  const common = { document, disabled, update };
  const content = section === 'overview' ? <EngineSection {...common} />
    : section === 'cylinders' ? <CylindersSection {...common} />
    : section === 'rotating-assembly' ? <RotatingSection {...common} />
    : section === 'airflow' ? <AirflowSection {...common} />
    : section === 'valvetrain' ? <ValvetrainSection {...common} />
    : section === 'fuel-combustion' ? <FuelSection {...common} />
    : section === 'ignition-controls' ? <ControlsSection {...common} />
    : section === 'losses-vehicle' ? <VehicleSection {...common} />
    : <AudioSection {...common} />;
  const descriptor = VEHICLE_ENGINE_SECTIONS.find((entry) => entry.id === section)!;

  return <div className={styles.semanticEditor}>
    <div className={styles.sectionHeader}><h3>{descriptor.label}</h3><p>{descriptor.purpose}</p></div>
    <div className={styles.sectionBody}>{content}</div>
  </div>;
}
