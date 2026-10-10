# Stella Simulator (local copy)

This directory is a standalone local copy of the public Claude artifact:

`https://claude.ai/artifact/UDzqVBdCSDF27GaAJL5JAB`

It is intentionally separate from the React application in `../stella/`.
The simulator is a static HTML/CSS/JavaScript app and does not require an npm
install or build step.

## Run locally

From the repository root:

```sh
python3 -m http.server 4174 --directory stella-simulator-local
```

Then open `http://localhost:4174/`.

Use an HTTP server instead of opening `index.html` directly so ES modules,
the word list, audio clips, and browser persistence work consistently.

## Local data

On a normal static server, patient and session data is stored in the browser's
IndexedDB database named `stella-sd`. Demo-mode runs are not saved. This is a
prototype; use fictitious patient data only.

The `sounds/` directory contains the artifact's narration clips so the local
copy works without a connection to Claude.
