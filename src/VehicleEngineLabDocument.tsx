import { useCallback, useState, useSyncExternalStore } from '@sparq/react';
import { Button, Modal, Select, Tabs, Textarea, notify } from '@sparq/ui-kit';
import type { VehicleEngineDocumentService } from './document-service';
import { formatEngineSource } from './model';
import { ENGINE_PRESETS, getEnginePreset } from './presets';
import styles from './VehicleEngineLabDocument.module.css';

export interface VehicleEngineLabDocumentBinding {
  readonly service: VehicleEngineDocumentService;
}

export interface VehicleEngineLabDocumentProps {
  readonly binding: VehicleEngineLabDocumentBinding;
}

function metric(value: string | number | null): string {
  return value === null ? '—' : String(value);
}

function phaseLabel(phase: 'loading' | 'ready' | 'failed'): string {
  switch (phase) {
    case 'loading':
      return 'Loading engine source…';
    case 'failed':
      return 'Engine source failed to load';
    default:
      return 'Full Engine Sim WASM source';
  }
}

export function VehicleEngineLabDocument({ binding }: VehicleEngineLabDocumentProps) {
  const snapshot = useSyncExternalStore(
    binding.service.subscribe,
    binding.service.getSnapshot,
    binding.service.getSnapshot
  );
  const [presetId, setPresetId] = useState(ENGINE_PRESETS[0]!.id);
  const [confirmPreset, setConfirmPreset] = useState(false);
  const working = snapshot.workingCopy;
  const summary = snapshot.summary;
  const selectedPreset = getEnginePreset(presetId);
  const source = working?.content ?? '';
  const busy = working?.status === 'saving' || snapshot.phase === 'loading';
  const conflict = working?.external.kind === 'modified-conflict';

  const save = useCallback(() => {
    void binding.service.save().then((result) => {
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
  }, [binding.service]);

  const applySelectedPreset = useCallback(() => {
    binding.service.updateSource(selectedPreset.sourceJson);
    setConfirmPreset(false);
  }, [binding.service, selectedPreset.sourceJson]);

  const requestPreset = useCallback(() => {
    if (working?.dirty) {
      setConfirmPreset(true);
    } else {
      applySelectedPreset();
    }
  }, [applySelectedPreset, working?.dirty]);

  const formatSource = useCallback(() => {
    try {
      binding.service.updateSource(formatEngineSource(source));
    } catch (error) {
      notify.danger(error instanceof Error ? error.message : String(error));
    }
  }, [binding.service, source]);

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
        <Button size="sm" fill="outline" disabled={busy} onClick={requestPreset}>
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
              <Button
                size="xs"
                fill="outline"
                onClick={() => binding.service.keepLocalAfterExternalModification()}
              >
                Keep local
              </Button>
              <Button
                size="xs"
                fill="outline"
                onClick={() => binding.service.acceptExternalModification()}
              >
                Load disk version
              </Button>
            </div>
          </div>
        )}
        <div className={styles.sourceBar}>
          <span
            className={styles.sourceStatus}
            data-invalid={snapshot.diagnostic ? 'true' : undefined}
          >
            {snapshot.diagnostic?.message ??
              `${summary?.topLevelSections.length ?? 0} complete engine sections · source text is the save authority`}
          </span>
          <div className={styles.sourceActions}>
            <Button
              size="xs"
              fill="outline"
              disabled={busy || !working?.dirty}
              onClick={() => binding.service.revert()}
            >
              Revert
            </Button>
            <Button
              size="xs"
              fill="outline"
              disabled={busy || snapshot.diagnostic !== null}
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
          onChange={(next) => binding.service.updateSource(next)}
          rows={30}
          disabled={!working || busy}
          invalid={snapshot.diagnostic !== null}
        />
      </div>
    </div>
  );

  return (
    <div className={styles.root}>
      <header className={styles.header}>
        <div className={styles.identity}>
          <h2>{summary?.displayName ?? 'Vehicle Engine Lab'}</h2>
          <p>{phaseLabel(snapshot.phase)}</p>
        </div>
        <div className={styles.actions}>
          <Button
            size="sm"
            fill="primary"
            loading={working?.status === 'saving'}
            disabled={busy || !working?.dirty || snapshot.diagnostic !== null || conflict}
            onClick={save}
          >
            Save engine
          </Button>
        </div>
      </header>

      <div className={styles.summary}>
        <div className={styles.metric}>
          <span>Engine ID</span>
          <strong>{metric(summary?.id ?? null)}</strong>
        </div>
        <div className={styles.metric}>
          <span>Layout</span>
          <strong>{metric(summary?.layout ?? null)}</strong>
        </div>
        <div className={styles.metric}>
          <span>Cylinders</span>
          <strong>{metric(summary?.cylinders ?? null)}</strong>
        </div>
        <div className={styles.metric}>
          <span>Banks</span>
          <strong>{metric(summary?.banks ?? null)}</strong>
        </div>
        <div className={styles.metric}>
          <span>Redline</span>
          <strong>{summary?.redlineRpm ? `${summary.redlineRpm} rpm` : '—'}</strong>
        </div>
        <div className={styles.metric}>
          <span>Torque / power</span>
          <strong>Simulation-derived</strong>
        </div>
      </div>

      {snapshot.error && <p className={styles.notice}>{snapshot.error.message}</p>}
      {snapshot.externalSourceError && (
        <p className={styles.notice}>{snapshot.externalSourceError}</p>
      )}

      <main className={styles.workspace}>
        <Tabs
          size="sm"
          items={[
            { value: 'source', label: 'Vehicle Engine JSON', content: sourcePane },
            {
              value: 'live',
              label: 'Dyno + Live',
              disabled: true,
              content: (
                <div className={styles.gate}>
                  <strong>Not available yet</strong>
                  <span>Torque, power, free-rev, gearing, and live audio</span>
                </div>
              ),
            },
            {
              value: 'bake',
              label: 'Bake Audio',
              disabled: true,
              content: (
                <div className={styles.gate}>
                  <strong>Not available yet</strong>
                  <span>Project-local .vehicleengine runtime carrier</span>
                </div>
              ),
            },
            {
              value: 'vehicle',
              label: 'Vehicle Test',
              disabled: true,
              content: (
                <div className={styles.gate}>
                  <strong>Not available yet</strong>
                  <span>Vehicle propulsion and audio runtime</span>
                </div>
              ),
            },
          ]}
        />
      </main>

      <Modal
        open={confirmPreset}
        title="Replace the working engine?"
        onClose={() => setConfirmPreset(false)}
        footer={
          <div className={styles.presetActions}>
            <Button size="sm" onClick={() => setConfirmPreset(false)}>
              Cancel
            </Button>
            <Button size="sm" fill="danger" onClick={applySelectedPreset}>
              Replace with preset
            </Button>
          </div>
        }
      >
        Unsaved changes will be replaced with the complete {selectedPreset.label} source. The
        project file is not changed until you save.
      </Modal>
    </div>
  );
}
