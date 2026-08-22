import type { ReactNode } from '@sparq/react';
import { Button, Checkbox, Field, NumberField, Select, Textarea } from '@sparq/ui-kit';
import type { Quantity, QuantityDimension } from './authoring-contract';
import { QUANTITY_UNITS } from './authoring-semantics';
import styles from './VehicleEngineLabDocument.module.css';

export type EditorPath = readonly (string | number)[];
export type EditorUpdate = (path: EditorPath, value: unknown) => void;

export interface EditorSectionProps {
  readonly document: import('./authoring-contract').VehicleEngineDocument;
  readonly disabled: boolean;
  readonly update: EditorUpdate;
}

function humanize(value: string): string {
  return value
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function unitOptions(quantity: Quantity): readonly string[] {
  for (const units of Object.values(QUANTITY_UNITS)) {
    if ((units as readonly string[]).includes(quantity.unit)) {
      return units as readonly string[];
    }
  }
  return [quantity.unit];
}

export function textOptions(values: readonly string[]) {
  return values.map((value) => ({ value, label: humanize(value) }));
}

export function TextControl({ label, value, path, update, disabled, multiline = false }: {
  readonly label: string;
  readonly value: string;
  readonly path: EditorPath;
  readonly update: EditorUpdate;
  readonly disabled: boolean;
  readonly multiline?: boolean;
}) {
  return <label className={styles.compactField}><span>{label}</span>{multiline
    ? <Textarea size="sm" rows={3} value={value} disabled={disabled} ariaLabel={label} onChange={(next) => update(path, next)} />
    : <Field size="sm" value={value} disabled={disabled} inputAriaLabel={label} onChange={(next) => update(path, next)} />}</label>;
}

export function NumberControl({ label, value, path, update, disabled, min, max, step = 0.01 }: {
  readonly label: string;
  readonly value: number;
  readonly path: EditorPath;
  readonly update: EditorUpdate;
  readonly disabled: boolean;
  readonly min?: number;
  readonly max?: number;
  readonly step?: number;
}) {
  return <label className={styles.compactField}><span>{label}</span><NumberField size="sm" dense value={value} min={min} max={max} step={step} disabled={disabled} ariaLabel={label} onChange={(next) => update(path, next)} /></label>;
}

export function SelectControl({ label, value, options, path, update, disabled, searchable }: {
  readonly label: string;
  readonly value: string;
  readonly options: readonly string[];
  readonly path: EditorPath;
  readonly update: EditorUpdate;
  readonly disabled: boolean;
  readonly searchable?: boolean;
}) {
  return <label className={styles.compactField}><span>{label}</span><Select size="sm" value={value} options={textOptions(options)} searchable={searchable} disabled={disabled} ariaLabel={label} onChange={(next) => update(path, next)} /></label>;
}

export function QuantityControl<D extends QuantityDimension>({ label, quantity, path, update, disabled }: {
  readonly label: string;
  readonly quantity: Quantity<D>;
  readonly path: EditorPath;
  readonly update: EditorUpdate;
  readonly disabled: boolean;
}) {
  const options = unitOptions(quantity as Quantity);
  return <label className={styles.compactField}><span>{label}</span><span className={styles.quantityControl}><NumberField size="sm" dense value={quantity.value} step={0.01} disabled={disabled} ariaLabel={`${label} value`} onChange={(next) => update([...path, 'value'], next)} /><Select size="sm" value={quantity.unit} options={textOptions(options)} disabled={disabled} ariaLabel={`${label} unit`} onChange={(next) => update([...path, 'unit'], next)} /></span></label>;
}

export function BooleanControl({ label, value, path, update, disabled }: {
  readonly label: string;
  readonly value: boolean;
  readonly path: EditorPath;
  readonly update: EditorUpdate;
  readonly disabled: boolean;
}) {
  return <label className={styles.checkboxField}><span>{label}</span><Checkbox label={value ? 'Published' : 'Not published'} checked={value} disabled={disabled} onChange={(next) => update(path, next)} /></label>;
}

export function OptionalControl({ label, purpose, actionLabel = 'Set value…', disabled, onAdd }: {
  readonly label: string;
  readonly purpose: string;
  readonly actionLabel?: string;
  readonly disabled: boolean;
  readonly onAdd: () => void;
}) {
  return <div className={styles.optionalControl}><span>{label}</span><Button size="sm" fill="outline" disabled={disabled} onClick={onAdd}>{actionLabel}</Button><small>{purpose}</small></div>;
}

export function SectionGroup({ title, meta, children, action }: {
  readonly title: string;
  readonly meta?: string;
  readonly children: ReactNode;
  readonly action?: ReactNode;
}) {
  return <section className={styles.semanticGroup}><header className={styles.semanticGroupHeader}><strong>{title}</strong>{meta ? <span>{meta}</span> : null}</header>{children}{action ? <footer className={styles.groupAction}>{action}</footer> : null}</section>;
}

export function FieldGrid({ children, columns = 3 }: { readonly children: ReactNode; readonly columns?: 2 | 3 | 4 }) {
  return <div className={styles.semanticFields} data-columns={columns}>{children}</div>;
}

export function SemanticCard({ title, children }: { readonly title: string; readonly children: ReactNode }) {
  return <article className={styles.semanticCard}><strong>{title}</strong>{children}</article>;
}

export function CardGrid({ children }: { readonly children: ReactNode }) {
  return <div className={styles.semanticSplit}>{children}</div>;
}

export function TableWrap({ children }: { readonly children: ReactNode }) {
  return <div className={styles.semanticTableWrap}>{children}</div>;
}

export function StrategyNote({ title, children }: { readonly title: string; readonly children: ReactNode }) {
  return <p className={styles.strategyNote}><strong>{title}</strong> {children}</p>;
}

export function ResourceNote({ title, children }: { readonly title: string; readonly children: ReactNode }) {
  return <p className={styles.resourcePurpose}><strong>{title}</strong> · {children}</p>;
}

export function MechanismFlow({ nodes }: { readonly nodes: readonly { readonly title: string; readonly detail: string }[] }) {
  return <div className={styles.mechanismFlow}>{nodes.map((node, index) => <span className={styles.mechanismStep} key={`${node.title}-${index}`}><span className={styles.flowNode}><strong>{node.title}</strong><small>{node.detail}</small></span>{index < nodes.length - 1 ? <i>→</i> : null}</span>)}</div>;
}

export function GroupButton({ children, disabled, onClick }: { readonly children: ReactNode; readonly disabled: boolean; readonly onClick: () => void }) {
  return <Button size="xs" fill="tertiary" disabled={disabled} onClick={onClick}>{children}</Button>;
}
