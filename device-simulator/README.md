# Stella device simulator

This app simulates the Raspberry Pi, its exercise API, and the physical Stella keyboard. Its exercise engine, content catalog, word list, and audio assets are contained in this directory, and it has no third-party runtime dependencies.

## Start

```sh
npm start
```

Open `http://localhost:4175` to see and press the simulated keyboard. Configure and start exercises from Stella; the simulator page is the patient-facing device surface.

Set a different port when needed:

```sh
PORT=4180 npm start
```

## Test

```sh
npm test
```

The tests start the API on ephemeral ports and cover Letter Target, Inhibition Challenge, result exports, and configuration validation.

See `../docs/api-reference.md` for the complete device contract and `../stella/public/runtime-config.device.example.json` for Stella's device-mode configuration.
