import { useCallback, useEffect, useState, useSyncExternalStore } from '@sparq/react';
import { Button, Field, Modal, Select, Textarea, notify } from '@sparq/ui-kit';
import type { VehicleEngineLabService } from './lab-service';
import { formatEngineSource, vehicleEngineDocumentNameFromPath } from './model';
import { ENGINE_PRESETS, getEnginePreset } from './presets';
import { VehicleEngineLiveBench } from './VehicleEngineLiveBench';
import { VehicleEngineBakeController } from './bake-controller';
import { VehicleEngineBakePanel } from './VehicleEngineBakePanel';
import styles from './VehicleEngineLabDocument.module.css';

export interface VehicleEngineLabDocumentBinding {
  readonly service: VehicleEngineLabService;
}

export interface VehicleEngineLabDocumentProps {
  readonly binding: VehicleEngineLabDocumentBinding;
}

type WorkflowView = 'source' | 'live' | 'bake' | 'vehicle';
type CreateDialog = 'new' | 'save-as' | null;

const WORKFLOW_VIEWS: readonly { readonly value: WorkflowView; readonly label: string }[] = [
  { value: 'source', label: 'Vehicle Engine JSON' },
  { value: 'live', label: 'Dyno + Live' },
  { value: 'bake', label: 'Bake Runtime' },
  { value: 'vehicle', label: 'Vehicle Test' },
];

function metric(value: string | number | null): string {
  return value === null ? '—' : String(value);
}

function phaseLabel(
  phase: 'idle' | 'opening' | 'ready' | 'failed',
  activePath: string | null
): string {
  if (phase === 'opening') {
    return 'Loading engine source…';
  }
  if (phase === 'failed') {
    return 'Engine source failed to load';
  }
  if (!activePath) {
    return 'Create or open an engine to begin';
  }
  return `${activePath} · Full Engine Sim WASM source`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function VehicleEngineLabDocument({ binding }: VehicleEngineLabDocumentProps) {
  const lab = binding.service;
  const labSnapshot = useSyncExternalStore(lab.subscribe, lab.getSnapshot, lab.getSnapshot);
  const snapshot = labSnapshot.document;
  const [presetId, setPresetId] = useState(ENGINE_PRESETS[0]!.id);
  const [confirmPreset, setConfirmPreset] = useState(false);
  const [workflowView, setWorkflowView] = useState<WorkflowView>('source');
  const [selectedPath, setSelectedPath] = useState(labSnapshot.activePath ?? '');
  const [createDialog, setCreateDialog] = useState<CreateDialog>(null);
  const [fileName, setFileName] = useState('');
  const [creating, setCreating] = useState(false);
  const [bakeController] = useState(() => new VehicleEngineBakeController());
  const working = snapshot?.workingCopy ?? null;
  const summary = snapshot?.summary ?? null;
  const selectedPreset = getEnginePreset(presetId);
  const source = working?.content ?? '';
  const busy = working?.status === 'saving' || labSnapshot.phase === 'opening';
  const conflict = working?.external.kind === 'modified-conflict';
  const sourceReady = snapshot?.diagnostic === null && snapshot?.phase === 'ready';

  useEffect(() => () => bakeController.dispose(), [bakeController]);
  useEffect(() => {
    if (labSnapshot.activePath) {
      setSelectedPath(labSnapshot.activePath);
    }
  }, [labSnapshot.activePath]);

  const save = useCallback(() => {
    void lab.save().then((result) => {
      if (result.status === 'saved') {
        notify.success('Engine JSON saved');
      } else if (result.status === 'noop') {
        notify.info('Engine JSON is already saved');
      } else if (result.status === 'failed') {
        notify.danger(result.error.message);
      } else {
        notify.warning(`Save is blocked: ${result.reason}`);
      }
    });
  }, [lab]);

  const openSelected = useCallback(() => {
    if (!selectedPath) {
      return;
    }
    void lab.requestOpen(selectedPath).catch((error: unknown) => notify.danger(errorMessage(error)));
  }, [lab, selectedPath]);

  const showCreateDialog = useCallback(
    (kind: Exclude<CreateDialog, null>) => {
      setFileName(
        kind === 'new'
          ? selectedPreset.id
          : `${summary?.id ?? vehicleEngineDocumentNameFromPath(labSnapshot.activePath ?? 'engine')}-copy`
      );
      setCreateDialog(kind);
    }, [labSnapshot.activePath, selectedPreset.id, summary?.id]
  );

  const createOrSaveAs = useCallback(() => {
    if (!createDialog) {
      return;
    }
    setCreating(true);
    const operation =
      createDialog === 'new'
        ? lab.createFromSource(fileName, selectedPreset.sourceJson)
        : lab.saveAs(fileName);
    void operation.then(
      (path) => {
        notify.success(createDialog === 'new' ? 'Engine created' : 'Engine copy saved');
        setSelectedPath(path);
        setCreateDialog(null);
        setCreating(false);
      },
      (error: unknown) => {
        notify.danger(errorMessage(error));
        setCreating(false);
      }
    );
  }, [createDialog, fileName, lab, selectedPreset.sourceJson]);

  const applySelectedPreset = useCallback(() => {
    lab.updateSource(selectedPreset.sourceJson);
    setConfirmPreset(false);
  }, [lab, selectedPreset.sourceJson]);

  const requestPreset = useCallback(() => {
    if (working?.dirty) {
      setConfirmPreset(true);
    } else {
      applySelectedPreset();
    }
  }, [applySelectedPreset, working?.dirty]);

  const formatSource = useCallback(() => {
    try {
      lab.updateSource(formatEngineSource(source));
    } catch (error) {
      notify.danger(errorMessage(error));
    }
  }, [lab, source]);

  const sourcePane = (
    <div className={styles.sourcePane}>
      <div className={styles.presetBar}>
        <Select
          ariaLabel="Engine preset"
          size="sm"
          value={presetId}
          searchable={false}
          options={ENGINE_PRESETS.map((preset) => ({ value: preset.id, label: preset.label }))}
          onChange={(next) => setPresetId(next)}
        />
        <Button size="sm" fill="outline" disabled={busy || !working} onClick={requestPreset}>
          Apply preset
        </Button>
        <span className={styles.provenance} title={selectedPreset.sourcePath}>
          {selectedPreset.sourcePath}
        </span>
      </div>

      <div>
        {conflict && (
          <div className={styles.conflict}>
            <span>This engine changed on disk while local edits were open.</span>
            <div className={styles.conflictActions}>
              <Button size="xs" fill="outline" onClick={() => lab.keepLocalAfterExternalModification()}>
                Keep local
              </Button>
              <Button size="xs" fill="outline" onClick={() => lab.acceptExternalModification()}>
                Load disk version
              </Button>
            </div>
          </div>
        )}
        <div className={styles.sourceBar}>
          <span
            className={styles.sourceStatus}
            data-invalid={snapshot?.diagnostic ? 'true' : undefined}
          >
            {snapshot?.diagnostic?.message ??
              `${summary?.topLevelSections.length ?? 0} complete engine sections · source text is the save authority`}
          </span>
          <div className={styles.sourceActions}>
            <Button size="xs" fill="outline" disabled={busy || !working?.dirty} onClick={() => lab.revert()}>
              Revert
            </Button>
            <Button
              size="xs"
              fill="outline"
              disabled={busy || !working || snapshot?.diagnostic !== null}
              onClick={formatSource}
            >
              Format JSON
            </Button>
          </div>
        </div>
      </div>

      <div className={styles.editor}>
        <Textarea
          ariaLabel="Complete Engine Sim WASM JSON source"
          value={source}
          onChange={(next) => lab.updateSource(next)}
          rows={30}
          disabled={!working || busy}
          invalid={snapshot?.diagnostic != null}
        />
      </div>
    </div>
  );

  const workflowContent = (() => {
    switch (workflowView) {
      case 'live':
        return <VehicleEngineLiveBench source={source} sourceValid={sourceReady} />;
      case 'bake':
        return <VehicleEngineBakePanel controller={bakeController} source={source} sourceValid={sourceReady} />;
      case 'vehicle':
        return (
          <div className={styles.gate}>
            <strong>Not available yet</strong>
            <span>Vehicle propulsion and audio runtime</span>
          </div>
        );
      default:
        return sourcePane;
    }
  })();

  return (
    <div className={styles.root}>
      <header className={styles.header}>
        <div className={styles.identity}>
          <h2>Vehicle Engine Lab</h2>
          <p>{phaseLabel(labSnapshot.phase, labSnapshot.activePath)}</p>
        </div>
      </header>

      <div className={styles.fileBar}>
        <Select
          ariaLabel="Project vehicle engine"
          size="sm"
          value={selectedPath}
          searchable
          options={labSnapshot.projectPaths.map((path) => ({
            value: path,
            label: vehicleEngineDocumentNameFromPath(path),
          }))}
          onChange={setSelectedPath}
        />
        <Button size="sm" fill="outline" disabled={!selectedPath || busy} onClick={openSelected}>
          Open
        </Button>
        <Button size="sm" fill="outline" disabled={busy} onClick={() => showCreateDialog('new')}>
          New
        </Button>
        <Button size="sm" fill="outline" disabled={!working || busy} onClick={() => showCreateDialog('save-as')}>
          Save As
        </Button>
        <Button
          size="sm"
          fill="primary"
          loading={working?.status === 'saving'}
          disabled={busy || !working?.dirty || snapshot?.diagnostic !== null || conflict}
          onClick={save}
        >
          Save
        </Button>
      </div>

      <div className={styles.summary}>
        <div className={styles.metric}><span>Engine ID</span><strong>{metric(summary?.id ?? null)}</strong></div>
        <div className={styles.metric}><span>Layout</span><strong>{metric(summary?.layout ?? null)}</strong></div>
        <div className={styles.metric}><span>Cylinders</span><strong>{metric(summary?.cylinders ?? null)}</strong></div>
        <div className={styles.metric}><span>Banks</span><strong>{metric(summary?.banks ?? null)}</strong></div>
        <div className={styles.metric}><span>Redline</span><strong>{summary?.redlineRpm ? `${summary.redlineRpm} rpm` : '—'}</strong></div>
        <div className={styles.metric}><span>Torque / power</span><strong>Simulation-derived</strong></div>
      </div>

      {(snapshot?.error || labSnapshot.error) && (
        <p className={styles.notice}>{(snapshot?.error ?? labSnapshot.error)?.message}</p>
      )}
      {snapshot?.externalSourceError && <p className={styles.notice}>{snapshot.externalSourceError}</p>}

      <main className={styles.workspace}>
        <nav className={styles.workflowTabs} aria-label="Vehicle Engine Lab workflow">
          {WORKFLOW_VIEWS.map((view) => (
            <Button
              key={view.value}
              size="sm"
              tone="primary"
              active={workflowView === view.value}
              ariaPressed={workflowView === view.value}
              disabled={view.value !== 'source' && (!working || view.value === 'vehicle')}
              onClick={() => setWorkflowView(view.value)}
            >
              {view.label}
            </Button>
          ))}
        </nav>
        <div className={styles.workflowContent}>{workflowContent}</div>
      </main>

      <Modal
        open={labSnapshot.pendingOpenPath !== null}
        title="Open another engine?"
        onClose={() => lab.cancelPendingOpen()}
        footer={
          <div className={styles.presetActions}>
            <Button size="sm" onClick={() => lab.cancelPendingOpen()}>Cancel</Button>
            <Button size="sm" fill="danger" onClick={() => void lab.discardAndOpenPending()}>
              Discard and open
            </Button>
          </div>
        }
      >
        The active engine has unsaved changes. Discard them before opening another engine.
      </Modal>

      <Modal
        open={createDialog !== null}
        title={createDialog === 'new' ? 'New vehicle engine' : 'Save vehicle engine as'}
        onClose={() => !creating && setCreateDialog(null)}
        footer={
          <div className={styles.presetActions}>
            <Button size="sm" disabled={creating} onClick={() => setCreateDialog(null)}>Cancel</Button>
            <Button size="sm" fill="primary" loading={creating} disabled={!fileName.trim()} onClick={createOrSaveAs}>
              {createDialog === 'new' ? 'Create engine' : 'Save copy'}
            </Button>
          </div>
        }
      >
        <div className={styles.createForm}>
          <label htmlFor="vehicle-engine-file-name">File name</label>
          <Field
            inputId="vehicle-engine-file-name"
            inputAriaLabel="Vehicle engine file name"
            size="sm"
            value={fileName}
            onChange={setFileName}
            autoFocus
            disabled={creating}
          />
          <span>
            {createDialog === 'new'
              ? `Starts from the complete ${selectedPreset.label} preset.`
              : 'The current complete JSON source is copied into a new project file.'}
            {working?.dirty ? ' The current unsaved working copy will be replaced.' : ''}
          </span>
        </div>
      </Modal>

      <Modal
        open={confirmPreset}
        title="Replace the working engine?"
        onClose={() => setConfirmPreset(false)}
        footer={
          <div className={styles.presetActions}>
            <Button size="sm" onClick={() => setConfirmPreset(false)}>Cancel</Button>
            <Button size="sm" fill="danger" onClick={applySelectedPreset}>Replace with preset</Button>
          </div>
        }
      >
        Unsaved changes will be replaced with the complete {selectedPreset.label} source. The
        project file is not changed until you save.
      </Modal>
    </div>
  );
}
