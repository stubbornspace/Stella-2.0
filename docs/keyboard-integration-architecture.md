# Stella Keyboard Integration Architecture

Status: proposed decision, 2026-10-09. Supersedes the "keyboard hosts the clinician app" model in [Stella_Software_Architecture_Overview.md](./Stella_Software_Architecture_Overview.md) and the Raspberry Pi web server described in [POC-brief.md](./POC-brief.md). Defines the transport for the contract in [exercise-integration-data-model.md](./exercise-integration-data-model.md).

## 1. Decision

The clinician app is hosted in AWS (CloudFront) and the keyboard connects to AWS IoT Core over MQTT. The app never talks to the keyboard directly; both talk to the cloud.

## 2. Constraints

- The keyboard controller is a Raspberry Pi Pico W (264 KB RAM, microcontroller network stack, all GPIO assigned).
- The clinician uses Safari on an iPad.
- Session data is stored in the cloud, so internet access is a requirement for running Stella.
- The app must send an exercise configuration, start and stop runs, and receive key presses to record, process, and report.
- Response timing is measured on the keyboard's monotonic clock, so transport latency does not affect metrics.
- Timing-critical sound (voice prompts, metronome, music) plays from a speaker in the keyboard, so beat times and press times share one clock. Rhythm metrics (`onBeatAccuracyPercent`, `timingVariabilityStdDev`) are not valid if beats play on the iPad. See section 6.1.

## 3. Options considered

| Option | Outcome | Reason |
|---|---|---|
| A. App served from the keyboard over the local network | Rejected | The Pico W cannot comfortably serve a web app alongside display, button, and audio work. Plain HTTP limits iPad browser features and Cognito login. App updates require touching every device. |
| B. Cloud app calling an HTTP API on the keyboard | Rejected | Safari blocks an HTTPS page from calling a plain-HTTP local address. Fixing that needs a publicly trusted certificate and DNS name per device, and an HTTPS server on the Pico W. Also depends on mDNS and client-to-client traffic on clinic Wi-Fi. |
| C. Cloud app + AWS IoT Core (MQTT) | **Chosen** | One outbound TLS connection from the keyboard. No browser restrictions, no local discovery, works on networks that isolate clients. Adds device online status and over-the-air update paths. |
| Web Bluetooth / WebSerial | Not viable | Not supported in iPad Safari. |

The Wi-Fi setup page in section 7.3 is not a return to Option A: it exists only in setup mode, serves one static form, and carries no exercise or patient data.

## 4. Data flow

```
 iPad (CloudFront app)                 AWS                                 Keyboard (Pico W)
 ---------------------                 ---                                 -----------------
 POST /runs  ───────────────►  API Gateway + Lambda
                                 - auth (Cognito), validate plan
                                 - store run claim {runId, patientId, deviceId, startRequest}
                                 - publish ──────────► stella/v1/{deviceId}/cmd/start ──► accept, run exercise
 POST /runs/{id}/stop ──────►  Lambda ─── publish ──► stella/v1/{deviceId}/cmd/stop  ──► stop, keep observations
 subscribe (MQTT over WSS) ◄──  IoT Core ◄─────────── stella/v1/{deviceId}/evt/state ◄── progress (retained)
                                IoT Rule ◄─────────── stella/v1/{deviceId}/evt/result ◄─ terminal raw result
                                 - Lambda: validate, project, store raw in S3,
                                   summary in DynamoDB (existing sessions table)
 GET /patients/{id}/sessions ►  existing read routes (unchanged)
```

- Commands go through the API, not straight from the browser to MQTT, so authorization and the run-to-patient link stay on the server. The keyboard never receives a patient name, code, or ID.
- The app subscribes to `evt/state` via MQTT over WebSockets using Cognito Identity Pool credentials. An IoT policy restricts each clinic to its own devices. Polling `GET /runs/{runId}` (updated by an IoT Rule) is an acceptable fallback for the prototype.
- The keyboard publishes the raw result to the cloud itself. The iPad no longer relays results, so the IndexedDB outbox in section 6 of the integration model is not needed.

## 5. Topic map

All messages use QoS 1 and carry `schemaVersion` and `runId`. Repeated delivery is handled by the `runId` idempotency rules in the integration model.

| Contract operation | MQTT mapping | Direction |
|---|---|---|
| `GET /device/capabilities` | Device shadow `reported.capabilities`; IoT lifecycle events for online status | Device to cloud |
| `POST /runs` | `stella/v1/{deviceId}/cmd/start`, payload = start request | Cloud to device |
| `POST /runs/{runId}/stop` | `stella/v1/{deviceId}/cmd/stop`, payload = `{schemaVersion, runId}` | Cloud to device |
| `GET /runs/{runId}` | `stella/v1/{deviceId}/evt/state`, retained, payload = `{runId, state, completedUnits, configuredUnits}` | Device to cloud/app |
| `GET /runs/{runId}/result` | `stella/v1/{deviceId}/evt/result`, payload = terminal raw result | Device to cloud |
| Errors (`409 run-conflict`, `422 unsupported-capability`, ...) | `stella/v1/{deviceId}/evt/state` with `state: "rejected"` and `{code, message}` | Device to cloud/app |

A live per-press topic is deferred; progress in `evt/state` is enough for the clinician UI.

## 6. Firmware guidance (Pico W)

- Core 0 owns button scanning, timestamps, displays, and audio. Core 1 owns Wi-Fi, TLS, and MQTT, so network work never affects timing.
- Connect on port 443 with ALPN `x-amzn-mqtt-ca`, because clinic firewalls often block 8883. Confirm the chosen TLS stack supports ALPN (mbedTLS in the Pico SDK does).
- Keep TLS small: one connection, ECDSA device certificate, reduced record buffer. Budget and measure roughly 40-60 KB of RAM.
- IoT Core payloads are limited to 128 KB. Chunk results that exceed it.

### 6.1 Sound

Sound plays on the keyboard, not the iPad. If the iPad played beats, they would be on a different clock from the presses, separated by a variable cloud round trip (or, on local Wi-Fi, by tens of milliseconds of audio output delay and jitter). The iPad may still play sound that is not timing-critical, such as UI feedback or previewing a track.

- Hardware: an I2S amplifier board (for example MAX98357A) and a speaker, driven by PIO and DMA. This needs 3 GPIO pins (bit clock, word select, data). All GPIO is currently assigned, so the pin map must be revised.
- Files: voice prompts, letter and word clips, and music are converted at build time from the app's MP3s to WAV or IMA ADPCM on microSD. The Pico W does not decode MP3. The metronome click is generated on the device.
- Music speed: changing `musicPlaybackRate` without changing pitch is too costly for the Pico W. Ship each track pre-rendered at a small set of fixed speeds, or accept the pitch change.
- Beat map: each music track has a beat map (beat offsets in ms) stored with the clip. The keyboard schedules beats and records each beat time on the monotonic clock.
- Timing: audio DMA runs on Core 0 next to button scanning and displays. Press-timing jitter must be measured with audio playing. Audio buffers (a few KB) count toward the same RAM budget as TLS.
- microSD: audio streaming and observation writes share the card. Read ahead in large blocks so result writes never stall playback.

## 7. Keyboard setup requirements

Requirements use MUST (required for the pilot) and SHOULD (expected unless a documented reason prevents it). Each has an ID so firmware, cloud, and app work can trace to it.

### 7.1 Roles and lifecycle

| Role | Responsibility |
|---|---|
| Manufacturer (Stella team) | Flashes firmware, provisions device identity, loads audio clips, runs factory test. |
| Clinic admin | Connects the keyboard to clinic Wi-Fi and pairs it to the clinic in the Stella app. |
| Clinician | Selects a paired, ready keyboard and runs exercises. Performs no device setup. |

| Device state | Entered when | Key display cue | Next state |
|---|---|---|---|
| `unprovisioned` | Firmware flashed, no identity | All keys red | `factory-ready` after provisioning |
| `factory-ready` | Identity and audio loaded, factory test passed, no Wi-Fi | All keys off | `setup-mode` on first power-up |
| `setup-mode` | No Wi-Fi saved, Wi-Fi failed 10 minutes, or setup key hold | Keys pulse blue | `connecting` after Wi-Fi saved |
| `connecting` | Wi-Fi saved | One key cycles yellow | `online-unpaired` or `online-ready`; `setup-mode` on failure |
| `online-unpaired` | Connected to IoT Core, no clinic | Claim code shown on keys | `online-ready` after pairing |
| `online-ready` | Connected and paired, no active run | Keys show letters on blue | `running` on accepted `cmd/start` |
| `running` | Run accepted | Exercise-controlled | `online-ready` after result published or queued |
| `offline` | Connection lost after setup | Status key yellow | `connecting` (automatic retry) |

The state cues in this table are proposed and need product sign-off.

### 7.2 Factory provisioning

- **KB-FP-01 (MUST)** Each keyboard has a unique `deviceId` (serial number). The `deviceId` is the AWS IoT thing name and is printed on the housing.
- **KB-FP-02 (MUST)** Each keyboard has its own X.509 client certificate registered in AWS IoT Core. Certificates are never shared between devices.
- **KB-FP-03 (MUST)** The private key is generated on the device and never leaves it; the factory process exports only a certificate signing request.
- **KB-FP-04 (MUST)** Flash stores the certificate, private key, IoT endpoint, and Amazon root CA. Firmware does not contain any of these values.
- **KB-FP-05 (MUST)** The microSD card holds the voice clip set. The device reports the clip set version and fails factory test if clips are missing.
- **KB-FP-06 (MUST)** Factory test lights every display and requires every switch to be pressed once, and records which keys pass. A device with failed letter keys is not shipped as a 30-key unit.
- **KB-FP-07 (SHOULD)** Factory test connects to IoT Core on a test network and completes a loopback `cmd/start` to `evt/result` run before shipping.

### 7.3 Wi-Fi onboarding

- **KB-WF-01 (MUST)** With no saved network, the keyboard enters `setup-mode` and broadcasts a WPA2 access point named `Stella-<last 4 of deviceId>`. The access point password is printed on the housing label.
- **KB-WF-02 (MUST)** In `setup-mode` the keyboard serves one local page at `http://192.168.4.1` that lists visible networks and accepts an SSID and password. The page has no other function.
- **KB-WF-03 (MUST)** The keyboard supports WPA2-Personal and WPA3-Personal networks on 2.4 GHz. WPA2-Enterprise and networks behind a captive portal are not supported; this is a documented clinic network requirement.
- **KB-WF-04 (MUST)** After a network is saved, the keyboard leaves `setup-mode`, joins the network, and reports success or the failure reason (wrong password, network not found, no internet, IoT Core unreachable) on the key displays and by spoken prompt.
- **KB-WF-05 (MUST)** Wi-Fi credentials are stored in flash and survive power loss. They are never sent to the cloud or included in logs.
- **KB-WF-06 (SHOULD)** The keyboard stores up to three networks and tries them in most-recently-successful order.
- **KB-WF-07 (MUST)** Holding the setup key combination for 10 seconds at power-up returns the keyboard to `setup-mode` without erasing the device identity or clinic pairing.
- **KB-WF-08 (MUST)** The keyboard needs outbound access only: DNS, NTP (UDP 123), and HTTPS/MQTT (TCP 443). It accepts no inbound connections outside `setup-mode`.

### 7.4 Clinic pairing

- **KB-PR-01 (MUST)** A keyboard runs exercises only after it is paired to exactly one clinic.
- **KB-PR-02 (MUST)** In `online-unpaired`, the keyboard requests a claim code from the cloud and shows it across its letter displays. A code is 6 characters, single use, and expires after 10 minutes.
- **KB-PR-03 (MUST)** A clinic admin enters the claim code in the Stella app. The backend links the `deviceId` to the admin's clinic and updates the IoT policy so only that clinic's users can command or observe the device.
- **KB-PR-04 (MUST)** Pairing writes the clinic link to the device shadow; the keyboard moves to `online-ready` when it reads the change.
- **KB-PR-05 (MUST)** Only a Stella owner or clinic admin can unpair a device. Unpairing returns the keyboard to `online-unpaired` and invalidates any queued, unaccepted commands.
- **KB-PR-06 (MUST)** The keyboard stores the clinic ID only. It does not store or display clinic names, clinician identities, or patient data.

### 7.5 Connection and readiness

- **KB-CN-01 (MUST)** At boot the keyboard syncs wall-clock time by SNTP before opening TLS, for certificate validation only. Exercise timing uses the monotonic clock.
- **KB-CN-02 (MUST)** The keyboard connects to IoT Core on port 443 using ALPN `x-amzn-mqtt-ca`, with a persistent session and a keepalive of 60 seconds or less.
- **KB-CN-03 (MUST)** On disconnect the keyboard reconnects automatically with exponential backoff (1 s doubling to 60 s, with random jitter).
- **KB-CN-04 (MUST)** After each connect, the keyboard reports to its shadow: `firmwareVersion`, `contractVersion`, `clipSetVersion`, `capabilities` (the capability document from the integration model, including only keys that passed self-test), `state`, `activeRunId`, `wifiRssi`, and `freeHeapBytes`.
- **KB-CN-05 (MUST)** At each power-up the keyboard runs a display and switch self-test without user input. A switch that reads as stuck is removed from `capabilities` and reported as a fault.
- **KB-CN-06 (MUST)** The app shows a keyboard as available only when IoT Core reports it connected and its shadow `state` is `online-ready`.
- **KB-CN-07 (MUST)** From power-on to `online-ready` on a known network takes no more than 30 seconds.

### 7.6 Run handling

- **KB-RN-01 (MUST)** The keyboard runs one exercise at a time. A `cmd/start` received while another run is active is rejected with `run-conflict`, unless it has the same `runId` and identical content (idempotent retry).
- **KB-RN-02 (MUST)** Before accepting, the keyboard validates `schemaVersion`, activity support, key IDs, and setting limits against its own capabilities, and rejects with `invalid-plan` or `unsupported-capability`.
- **KB-RN-03 (MUST)** Once a run is accepted it continues to completion even if the connection drops. Observations are written to microSD as they occur.
- **KB-RN-04 (MUST)** `cmd/stop` ends the active run as `ended-early` and keeps every observation recorded so far. A stop for an unknown or finished run returns the current state.
- **KB-RN-05 (MUST)** The keyboard keeps each terminal result on microSD until IoT Core acknowledges its publish (QoS 1 PUBACK), and retries unsent results after reconnect in run order.
- **KB-RN-06 (MUST)** If power is lost during a run, on reboot the keyboard publishes that run as `failed` with reason `power-loss` and the observations recorded before the loss.
- **KB-RN-07 (MUST)** The keyboard publishes `evt/state` at run start, at each completed unit, and at the end.
- **KB-RN-08 (SHOULD)** The keyboard keeps acknowledged results on microSD for 30 days for support, then deletes them oldest first.

### 7.7 Sound

- **KB-AU-01 (MUST)** The keyboard plays all voice prompts, metronome beats, and music for a run from its own speaker. The app does not play timing-critical sound.
- **KB-AU-02 (MUST)** `cmd/start` carries `audioMode` (`silent`, `metronome`, `music`), `tempoBpm` or `musicPlaybackRate`, and the clip IDs for the run. The keyboard rejects a start with `unsupported-capability` if a clip, track, or speed is missing from its clip set.
- **KB-AU-03 (MUST)** When a beat is active, the result includes the time of every beat played, on the same monotonic clock as the presses, so the cloud can calculate `beatTimestamp`, `onBeatAccuracyPercent`, and `timingVariabilityStdDev`.
- **KB-AU-04 (MUST)** Each beat plays within 5 ms of its scheduled time, and audio playback adds no measurable press-timing jitter. Both are verified in the first spike.
- **KB-AU-05 (MUST)** The shadow `capabilities` lists the audio modes, tracks, and playback speeds the device supports, and the device reports `clipSetVersion`.
- **KB-AU-06 (SHOULD)** The keyboard has a volume control (reserved keys or a setting in `cmd/start`) and a factory test step that plays a test tone.
- **KB-AU-07 (SHOULD)** Clip set updates are delivered over the air via AWS IoT Jobs, under the same rules as firmware updates (section 7.8).

### 7.8 Firmware updates

- **KB-FW-01 (SHOULD)** Firmware updates are delivered over the air via AWS IoT Jobs and verified by signature before install.
- **KB-FW-02 (MUST)** An update never starts while a run is active or unsent results exist.
- **KB-FW-03 (MUST)** A failed update leaves the previous firmware bootable.

### 7.9 Security

- **KB-SC-01 (MUST)** Each device's IoT policy allows it to connect only as its own thing name and to publish and subscribe only under `stella/v1/{deviceId}/` and its own shadow.
- **KB-SC-02 (MUST)** A compromised or retired keyboard is disabled by deactivating its certificate in IoT Core, with no firmware change.
- **KB-SC-03 (MUST)** Device logs and results contain no Wi-Fi credentials, clinic names, or patient data.
- **KB-SC-04 (SHOULD)** The RP2040 has no secure boot or protected key storage, so a device in someone's hands can be read. Accept this risk for the pilot, or move to the Pico 2 W (RP2350 secure boot and OTP) before wider rollout.

### 7.10 Setup acceptance checks

- A factory-new keyboard reaches `online-ready` in under 10 minutes on a WPA2-Personal clinic network, using only an iPad and the Stella app.
- A wrong Wi-Fi password, an unreachable IoT endpoint, and an expired claim code each produce a distinct, understandable message on the keyboard.
- A keyboard paired to clinic A cannot be seen or commanded by users of clinic B.
- Power-cycling a set-up keyboard returns it to `online-ready` with no user action.
- Unplugging the router during a run lets the run finish, and the result reaches DynamoDB after the network returns.
- Cutting power during a run produces one `failed` result with the partial observations after reboot.
- Holding the setup key combination returns the keyboard to `setup-mode` without losing pairing.

## 8. Consequences

- No internet means no new sessions. A run already in progress completes and uploads later.
- Device provisioning and certificate lifecycle become part of manufacturing and support.
- Clinics must provide a 2.4 GHz WPA2/WPA3-Personal network with outbound TCP 443 and UDP 123 and no captive portal.
- New AWS resources: IoT Core thing type, policies, rules, Jobs, a run-claims table (already proposed in the integration model), a claim-code table, and a Cognito Identity Pool for browser subscriptions.
- The local simulator should implement the same topics (or the API boundary) so the app has one integration path.
- The keyboard needs an I2S amplifier and speaker, a revised GPIO map, and a build step that converts app audio to device formats. The app's in-browser audio (`use-metronome`, `use-music`) becomes a simulator and preview feature only.
- New or changed sounds ship as a clip set version to every keyboard, not as an app deploy.

## 9. First spike

On the existing 4-button rig: connect to IoT Core over 443, receive `cmd/start`, run a Letter Target session, publish `evt/state` and `evt/result`. Play a voice prompt and the metronome over I2S during the run, with beat times included in the result. Measure free RAM during a run and confirm press-timing jitter is unchanged with the network and audio active, and that beats meet KB-AU-04. This answers the main risk: whether TLS + MQTT and audio fit alongside display and button work on the Pico W. A second spike should prove the `setup-mode` access point and Wi-Fi form (KB-WF-01 to KB-WF-04).

## 10. Open questions

- Firmware language: MicroPython (faster to build) or C SDK (more RAM headroom, finer control of timing).
- Whether the clinician app subscribes over MQTT/WSS or polls the API in the first release.
- Which key combination is the setup key hold, given that 4 reserved keys are not yet assigned.
- Whether pilot clinics' networks meet KB-WF-03 (no enterprise Wi-Fi, no captive portal); if not, a cellular or travel-router fallback is needed.
- Pico W versus Pico 2 W for production (KB-SC-04).
- Display cues for each device state (section 7.1) need product approval.
- Which GPIO pins are freed for I2S audio, and which amplifier and speaker are loud enough for a clinic room.
- Music speed: a fixed set of pre-rendered speeds, or pitch-shifting playback.
