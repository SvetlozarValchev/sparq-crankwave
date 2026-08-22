<p align="center">
  <a href="https://playsparq.com">
    <img src="docs/assets/sparq-logo.png" alt="SPARQ logo" width="112">
  </a>
</p>

<h1 align="center">SPARQ × Crankwave</h1>

<p align="center">
  <strong>Vehicle-engine authoring, live simulation, deterministic baking, and
  runtime playback for SPARQ.</strong>
</p>

<p align="center">
  <a href="https://playsparq.com">SPARQ</a> ·
  <a href="https://github.com/SvetlozarValchev/crankwave">Crankwave</a>
</p>

<p align="center">
  <a href="https://packages.playsparq.com/package/@svalchev/crankwave">
    <img src="docs/assets/spm-package.svg" alt="SPM package: @svalchev/crankwave" height="28">
  </a>
</p>

**sparq-crankwave** is a third-party package that brings
[Crankwave](https://github.com/SvetlozarValchev/crankwave) into the
[SPARQ native game engine](https://playsparq.com), with a complete editor-to-
vehicle workflow. Engine audio is an output of the same mechanical simulation
rather than a separate authored approximation.

The source boundary is deliberately lossless. Project-local sources are full
`*.crankwave.json` documents under `crankwave-engines/`; the editor does not
project them into a reduced semantic format. Package presets copy complete
source documents into the project.

The JSON describes geometry, airflow, combustion, ignition, losses, rotating
inertia, starter hardware, RPM limits, and evaluation rigs. Net shaft torque
and power remain simulation results rather than independently authored headline
values.

## What it provides

- A semantic editor for complete project-local engine definitions.
- A live, geared vehicle bench driven by the Crankwave WASM simulation.
- Deterministic baking into a project-local `*.crankwave` runtime asset.
- Runtime playback controlled by a SPARQ vehicle's real operating point.

`*.crankwave` outputs are stored as ordinary project files.

The current baked carrier contains the responsive audio runtime. The live WASM
bench also reports simulation-derived shaft torque and power, but those
mechanical curves are not yet serialized into the carrier. Until that contract
is added, the vehicle test treats the authored clutch capacity as a drivetrain
ceiling; it is not presented as an engine torque curve.

## Install in SPARQ

With SPARQ and SPM installed, add Crankwave directly to a project:

```sh
spm install @svalchev/crankwave
```

Activate the editor contribution from the project's `sparq.editor` entry:

```ts
import { activateCrankwave } from '@svalchev/crankwave/editor';

export function activate() {
  return activateCrankwave();
}
```

The returned lease removes the package's editor contributions when disposed.

Open **Window → Project Tools → Crankwave**. The package uses one editor tab per
project; New, Open, Save As, engine selection, live audition, and baking all
happen inside that tab. Opening a `*.crankwave.json` file from Content focuses
the same tab and loads the selected engine there.

## Local package development

Declare this repository as an external `file:` dependency from a SPARQ project:

```json
{
  "dependencies": {
    "@svalchev/crankwave": "file:../../../sparq-crankwave"
  }
}
```

Run `spm install` in the project to create a live development link to the local
checkout. The activation and editor workflow are otherwise identical to the
registry-installed package.

The package declares host-provided SPARQ APIs through `workspace:^`, so SPM uses
the APIs supplied by the active SPARQ installation.

This project is derived from the capabilities and behavior of Ange Yaghi's
MIT-licensed `engine-sim`. See `THIRD_PARTY_NOTICES.md` for attribution.
