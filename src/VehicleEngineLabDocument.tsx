import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from '@sparq/react';
import { Button, Field, Modal, Select, notify } from '@sparq/ui-kit';
import type { VehicleEngineDocument } from './authoring-contract';
import { VEHICLE_ENGINE_SECTIONS, type VehicleEngineSectionId } from './authoring-semantics';
import { VehicleEngineBakeController } from './bake-controller';
import type { VehicleEngineLabService } from './lab-service';
import { parseEngineSource, crankwaveDocumentNameFromPath } from './model';
import { ENGINE_PRESETS, getEnginePreset } from './presets';
import { VehicleEngineLiveBench } from './VehicleEngineLiveBench';
import { VehicleEngineSemanticEditor } from './VehicleEngineSemanticEditor';
import styles from './VehicleEngineLabDocument.module.css';

export interface VehicleEngineLabDocumentBinding { readonly service: VehicleEngineLabService; }
export interface VehicleEngineLabDocumentProps { readonly binding: VehicleEngineLabDocumentBinding; }
type CreateDialog = 'new' | 'save-as' | null;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function parsedDocument(source: string): VehicleEngineDocument | undefined {
  try { return parseEngineSource(source).document as VehicleEngineDocument; }
  catch { return undefined; }
}

export function VehicleEngineLabDocument({ binding }: VehicleEngineLabDocumentProps) {
  const lab = binding.service;
  const labSnapshot = useSyncExternalStore(lab.subscribe, lab.getSnapshot, lab.getSnapshot);
  const snapshot = labSnapshot.document;
  const working = snapshot?.workingCopy ?? null;
  const source = working?.content ?? '';
  const document = source ? parsedDocument(source) : undefined;
  const sourceReady = !!document && snapshot?.diagnostic === null && snapshot.phase === 'ready';
  const busy = working?.status === 'saving' || labSnapshot.phase === 'opening';
  const conflict = working?.external.kind === 'modified-conflict';
  const [section, setSection] = useState<VehicleEngineSectionId>('overview');
  const [presetId, setPresetId] = useState(ENGINE_PRESETS[0]!.id);
  const [confirmPreset, setConfirmPreset] = useState(false);
  const [createDialog, setCreateDialog] = useState<CreateDialog>(null);
  const [fileName, setFileName] = useState('');
  const [creating, setCreating] = useState(false);
  const [bakeController] = useState(() => new VehicleEngineBakeController());
  const bakeSnapshot = useSyncExternalStore(bakeController.subscribe, bakeController.getSnapshot, bakeController.getSnapshot);
  const reportedBakePhase = useRef(bakeSnapshot.phase);
  const selectedPreset = getEnginePreset(presetId);

  useEffect(() => () => bakeController.dispose(), [bakeController]);
  useEffect(() => {
    const previous = reportedBakePhase.current;
    reportedBakePhase.current = bakeSnapshot.phase;
    if (bakeSnapshot.phase === previous) return;
    if (bakeSnapshot.phase === 'failed') {
      notify.danger(bakeSnapshot.error ?? 'Vehicle engine bake failed');
    } else if (bakeSnapshot.phase === 'ready' && previous !== 'saving') {
      notify.success('Runtime vehicle engine baked and verified in memory');
    }
  }, [bakeSnapshot.error, bakeSnapshot.phase]);

  const save = useCallback(() => {
    void lab.save().then((result) => {
      if (result.status === 'saved') notify.success('Vehicle engine saved');
      else if (result.status === 'noop') notify.info('Vehicle engine is already saved');
      else if (result.status === 'failed') notify.danger(result.error.message);
      else notify.warning(`Save is blocked: ${result.reason}`);
    });
  }, [lab]);

  const open = useCallback((path: string) => {
    if (path && path !== labSnapshot.activePath) void lab.requestOpen(path).catch((error: unknown) => notify.danger(errorMessage(error)));
  }, [lab, labSnapshot.activePath]);

  const showCreateDialog = useCallback((kind: Exclude<CreateDialog, null>) => {
    setFileName(kind === 'new' ? selectedPreset.id : `${snapshot?.summary?.id ?? 'engine'}-copy`);
    setCreateDialog(kind);
  }, [selectedPreset.id, snapshot?.summary?.id]);

  const createOrSaveAs = useCallback(() => {
    if (!createDialog) return;
    setCreating(true);
    const operation = createDialog === 'new' ? lab.createFromSource(fileName, selectedPreset.sourceJson) : lab.saveAs(fileName);
    void operation.then(() => {
      notify.success(createDialog === 'new' ? 'Vehicle engine created' : 'Vehicle engine copy saved');
      setCreateDialog(null); setCreating(false);
    }, (error: unknown) => { notify.danger(errorMessage(error)); setCreating(false); });
  }, [createDialog, fileName, lab, selectedPreset.sourceJson]);

  const applyPreset = useCallback(() => {
    lab.updateSource(selectedPreset.sourceJson); setConfirmPreset(false); setSection('overview');
  }, [lab, selectedPreset.sourceJson]);

  const bake = useCallback(() => { void bakeController.bake(source); }, [bakeController, source]);
  const saveBake = useCallback(() => {
    void bakeController.save().then((path) => notify.success(`Saved ${path}`)).catch((error: unknown) => notify.danger(errorMessage(error)));
  }, [bakeController]);

  const updateDocument = useCallback((next: VehicleEngineDocument) => {
    lab.updateSource(`${JSON.stringify(next, null, 2)}\n`);
  }, [lab]);

  const bakeActive = bakeSnapshot.phase === 'loading' || bakeSnapshot.phase === 'baking' || bakeSnapshot.phase === 'verifying';
  const bakedCurrent = bakeController.isCurrentSource(source) && (bakeSnapshot.phase === 'ready' || bakeSnapshot.phase === 'saving');

  return <div className={styles.root}>
    <header className={styles.compactHeader}>
      <div className={styles.identity}><h2>Crankwave</h2><p>{snapshot?.summary?.displayName ?? 'Create or open a vehicle engine'}</p></div>
      <div className={styles.headerActions}>
        <Select ariaLabel="Project vehicle engine" size="sm" searchable value={labSnapshot.activePath ?? ''} options={labSnapshot.projectPaths.map((path) => ({ value: path, label: crankwaveDocumentNameFromPath(path) }))} onChange={open} />
        <Button size="sm" fill="outline" disabled={busy} onClick={() => showCreateDialog('new')}>New</Button>
        <Button size="sm" fill="outline" disabled={!working || busy} onClick={() => showCreateDialog('save-as')}>Save as</Button>
        <Button size="sm" fill="outline" loading={working?.status === 'saving'} disabled={busy || !working?.dirty || !sourceReady || conflict} onClick={save}>Save</Button>
        <Button size="sm" fill="primary" loading={bakeActive} disabled={!sourceReady || bakeActive} onClick={bake}>{bakedCurrent ? 'Bake again' : 'Bake'}</Button>
        {bakedCurrent && <Button size="sm" fill="outline" loading={bakeSnapshot.phase === 'saving'} disabled={bakeSnapshot.phase === 'saving'} onClick={saveBake}>Save runtime</Button>}
      </div>
    </header>

    {(snapshot?.error || labSnapshot.error || snapshot?.externalSourceError || snapshot?.diagnostic) && <div className={styles.notice}>{snapshot?.diagnostic?.message ?? snapshot?.externalSourceError ?? snapshot?.error?.message ?? labSnapshot.error?.message}</div>}
    {conflict && <div className={styles.conflict}><span>This vehicle engine changed on disk.</span><div className={styles.conflictActions}><Button size="xs" fill="outline" onClick={() => lab.keepLocalAfterExternalModification()}>Keep local</Button><Button size="xs" fill="outline" onClick={() => lab.acceptExternalModification()}>Load disk version</Button></div></div>}

    <main className={styles.compactWorkspace}>
      <nav className={styles.sectionNav} aria-label="Vehicle engine sections">
        <div className={styles.navScroll}>{VEHICLE_ENGINE_SECTIONS.map((entry) => <button type="button" key={entry.id} data-active={section === entry.id ? 'true' : undefined} onClick={() => setSection(entry.id)}><span>{entry.label}</span>{entry.id === 'cylinders' && document ? <small>{document.engine.cylinders.length}</small> : null}</button>)}</div>
        <div className={styles.presetFooter}><span>Start from preset</span><Select ariaLabel="Engine preset" size="sm" value={presetId} options={ENGINE_PRESETS.map((preset) => ({ value: preset.id, label: preset.label }))} onChange={setPresetId} /><Button size="sm" fill="outline" disabled={!working || busy} onClick={() => working?.dirty ? setConfirmPreset(true) : applyPreset()}>Apply preset</Button></div>
      </nav>

      <section className={styles.editorColumn}>{document ? <VehicleEngineSemanticEditor document={document} section={section} disabled={busy} onChange={updateDocument} /> : <div className={styles.emptyState}>Open or create a vehicle engine.</div>}</section>
      <aside className={styles.benchColumn}><VehicleEngineLiveBench source={source} sourceValid={sourceReady} /></aside>
    </main>

    <footer className={styles.statusBar}><span data-good={sourceReady ? 'true' : undefined}>{sourceReady ? 'Source valid' : 'Source unavailable'}</span><span>{working?.dirty ? 'Modified' : 'Saved'}</span><span title={bakeSnapshot.error ?? undefined} data-error={bakeSnapshot.error ? 'true' : undefined}>{bakeSnapshot.error ?? bakeSnapshot.status}</span><span className={styles.statusPath}>{labSnapshot.activePath ?? 'No project file'}</span></footer>

    <Modal open={labSnapshot.pendingOpenPath !== null} title="Open another engine?" onClose={() => lab.cancelPendingOpen()} footer={<div className={styles.modalActions}><Button size="sm" onClick={() => lab.cancelPendingOpen()}>Cancel</Button><Button size="sm" fill="danger" onClick={() => void lab.discardAndOpenPending()}>Discard and open</Button></div>}>The active engine has unsaved changes.</Modal>
    <Modal open={createDialog !== null} title={createDialog === 'new' ? 'New vehicle engine' : 'Save vehicle engine as'} onClose={() => !creating && setCreateDialog(null)} footer={<div className={styles.modalActions}><Button size="sm" disabled={creating} onClick={() => setCreateDialog(null)}>Cancel</Button><Button size="sm" fill="primary" loading={creating} disabled={!fileName.trim()} onClick={createOrSaveAs}>{createDialog === 'new' ? 'Create' : 'Save copy'}</Button></div>}><div className={styles.createForm}><label htmlFor="vehicle-engine-file-name">File name</label><Field inputId="vehicle-engine-file-name" inputAriaLabel="Vehicle engine file name" size="sm" value={fileName} onChange={setFileName} autoFocus disabled={creating} /><span>{createDialog === 'new' ? `Starts from ${selectedPreset.label}.` : 'Copies the current working engine.'}</span></div></Modal>
    <Modal open={confirmPreset} title="Replace the working engine?" onClose={() => setConfirmPreset(false)} footer={<div className={styles.modalActions}><Button size="sm" onClick={() => setConfirmPreset(false)}>Cancel</Button><Button size="sm" fill="danger" onClick={applyPreset}>Replace</Button></div>}>Unsaved changes will be replaced with {selectedPreset.label}.</Modal>
  </div>;
}
