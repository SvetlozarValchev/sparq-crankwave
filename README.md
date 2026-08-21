# `@svalchev/vehicle-engine-lab`

A third-party SPARQ editor package for authoring physical vehicle engines,
running live Engine Sim WASM benches, baking runtime assets, and testing the
result in a driven vehicle. Engine audio is an output of the same mechanical
simulation rather than a separate authored approximation.

The source boundary is deliberately lossless. Project-local sources are full
`*.vehicle-engine.json` documents under `vehicle-engines/`; the editor does not
project them into a reduced semantic format. Package presets copy complete
source documents into the project.

The JSON describes geometry, airflow, combustion, ignition, losses, rotating
inertia, starter hardware, RPM limits, and evaluation rigs. Net shaft torque
and power remain simulation results rather than independently authored headline
values.

The package is organized around four independent workflows:

1. Edit and save/load project-local vehicle-engine JSON in the SPARQ editor.
2. Run dyno, free-rev/geared tests, and audio audition through live
   `engine-sim-wasm` in the editor.
3. Bake a project-local `*.vehicleengine` runtime asset.
4. Drive a SPARQ vehicle using its mechanical output and audio runtime.

`*.vehicleengine` outputs are stored as ordinary project files.

## Local development

Declare this repository as an external `file:` dependency from a SPARQ project:

```json
{
  "dependencies": {
    "@svalchev/vehicle-engine-lab": "file:../../../sparq-vehicle-engine-lab"
  }
}
```

Run `sparq-cli package install`, then activate the package from the project's
`sparq.editor` entry by calling `activateVehicleEngineLab()` from
`@svalchev/vehicle-engine-lab/editor` before the workbench mounts.

The package declares host-provided SPARQ APIs through `workspace:^` so SPM uses
the APIs supplied by the active SPARQ installation.

This project is derived from the capabilities and behavior of Ange Yaghi's
MIT-licensed `engine-sim`. See `THIRD_PARTY_NOTICES.md` for attribution.
