# sparq-crankwave

A third-party package that integrates
[Crankwave](https://github.com/SvetlozarValchev/crankwave) into
[SPARQ](https://playsparq.com), with engine editing, baking, and vehicle runtime
playback.

Install it through SPM as `@svalchev/crankwave`. Engine audio is an output of
the same mechanical simulation rather than a separate authored approximation.

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

## Install from a local checkout

Declare this repository as an external `file:` dependency from a SPARQ project:

```json
{
  "dependencies": {
    "@svalchev/crankwave": "file:../../../sparq-crankwave"
  }
}
```

Run `spm install` in the project, then activate the editor contribution from the
project's `sparq.editor` entry:

```ts
import { activateCrankwave } from '@svalchev/crankwave/editor';

export function activate() {
  return activateCrankwave();
}
```

The returned lease removes the package's editor contributions when disposed.

Open the lab from **Window → Project Tools → Crankwave**. The lab owns
one editor tab per project; New, Open, Save As, and project engine selection all
happen inside that tab. Opening a `*.crankwave.json` file from Content
focuses the same tab and loads the selected engine there.

The package declares host-provided SPARQ APIs through `workspace:^`, so SPM uses
the APIs supplied by the active SPARQ installation.

This project is derived from the capabilities and behavior of Ange Yaghi's
MIT-licensed `engine-sim`. See `THIRD_PARTY_NOTICES.md` for attribution.
