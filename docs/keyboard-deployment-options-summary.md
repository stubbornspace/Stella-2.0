# Stella App and Keyboard Deployment Options

Status: high-level decision summary, 2026-10-10.

This comparison assumes that the React app owns the exercise sequence, metronome, scoring, and reporting. The keyboard controller scans the physical keys and reports each press with a monotonic hardware timestamp. The effect of transport delay is minimized by synchronizing the app and device clocks.

## Options

| Option | Main advantages | Main disadvantages | Best fit |
|---|---|---|---|
| **1. App hosted on the Pi** | Can operate locally without internet; app and device API share one origin; no browser-to-device discovery after opening the device address | App updates must reach every device; local HTTP and cloud sign-in are harder to secure; the device must serve files while handling hardware; more storage and maintenance on each keyboard | A dedicated offline appliance, preferably using a Pi Zero rather than a microcontroller |
| **2. Cloud app with a local-IP API on the Pi** | One central app deployment; the browser connects directly to the keyboard at an address such as `stella-AB12.local`; low latency; React can run the metronome while the Pi timestamps keys; completed sessions can be uploaded by the browser | Browser and keyboard must be on the same LAN; local discovery and changing IP addresses must be handled; the local API needs pairing, CORS, and preferably HTTPS; browser Local Network Access support must be validated | Controlled clinics using managed Chrome or Edge devices |
| **3. Cloud app with Bluetooth** | Direct local connection without clinic Wi-Fi; low latency; no public device endpoint; exercises can continue during an internet interruption | Custom timestamped events require BLE GATT rather than basic keyboard HID; Web Bluetooth support is inconsistent, especially on Safari/iPad; pairing and reconnect behavior add support work | Controlled hardware where the supported browser has reliable Web Bluetooth |
| **4. Cloud app with MQTT** | No local browser networking or discovery; works across isolated clinic networks; strong fleet visibility, remote diagnostics, and device management; app updates remain centralized | Requires internet to start new sessions; highest cloud and firmware complexity; every device needs Wi-Fi provisioning and credentials; cloud latency makes browser/device clock synchronization harder | Large or remote fleets, especially when cross-browser access and central device management are priorities |

## Recommendation

Use **Option 2: React hosted on AWS with a local-IP API on the Pi** for the first integrated keyboard. The AWS service does not connect to the Pi: the React app running in the clinic browser connects directly to the Pi over the clinic LAN.

It provides the best balance for the current Stella design:

- React remains centrally deployed and easy to update.
- React continues to own the metronome and exercise calculations.
- The Pi provides accurate hardware timestamps for physical key presses.
- Key events travel directly over the local network instead of through AWS.
- AWS is used for authentication, patient data, session storage, and reporting.

The clinic device should run a managed version of Chrome or Edge. The Pi should advertise a stable local name such as `stella-AB12.local`, require a one-time pairing step, and expose an authenticated local API. Production deployments should use HTTPS/WSS where practical; a Chrome Local Network Access permission can support an HTTP device API during the pilot.

Choose **Option 4: MQTT** instead if iPad/Safari support, operation across networks that block local device traffic, or centralized fleet management is a firm requirement. MQTT is operationally stronger at scale but adds substantially more provisioning and infrastructure work.

Do not select Option 1 merely to gain offline operation. A cloud-hosted Progressive Web App can cache its assets and queue finished sessions while keeping deployment centralized. Select Option 1 only when the product is intentionally a self-contained offline appliance.

Option 3 is attractive for direct wireless communication, but it should only be chosen after confirming the exact tablet and browser support required by clinics.

## Recommended flow

```text
AWS CloudFront                    Local clinic network
----------------                 --------------------
React app in browser  <-------->  Pi keyboard API
  - metronome                      - key scanning
  - exercise sequence              - hardware timestamps
  - scoring                         - event buffering
  - reporting                       - device identity
          |
          +----------------------> AWS API and session storage
```

## Clock synchronization for Option 2

Use an NTP-style exchange over the same WebSocket that carries the key events. Both sides must use monotonic clocks: `performance.now()` in the browser and a 64-bit microsecond timer on the Pi. Wall-clock time such as `Date.now()` is not suitable for scoring because it can be adjusted while an exercise is running.

At connection time, the app should run 15-20 synchronization exchanges:

```text
Browser sends request       B1
Pi receives request         P2
Pi sends response           P3
Browser receives response   B4
```

The app calculates the Pi-to-browser clock offset and the network round-trip time from these four timestamps. It should favor the samples with the lowest round-trip times, then repeat the exchange every 5-10 seconds to account for clock drift. Synchronization must restart after a reconnect, device sleep, or network change.

The metronome should be scheduled with Web Audio rather than JavaScript timers. `AudioContext.getOutputTimestamp()` maps each scheduled beat from the audio clock into the browser's `performance.now()` clock. The app then converts each Pi key timestamp into that same clock and calculates:

```text
timing error = converted key time - audible beat time
```

Each key event should contain at least the key, a sequence number, and the original device timestamp:

```json
{
  "sequence": 142,
  "key": "A",
  "deviceTimeUs": 18452743
}
```

The Pi should timestamp the initial electrical key transition and confirm it after debouncing, rather than assigning the timestamp after the debounce delay. The implementation should retain raw timestamps, monitor synchronization quality, and separately test fixed keyboard-scanning and audio-output latency. Built-in or wired audio is preferred because Bluetooth audio can add variable latency.

Detailed message contracts and prior option analysis remain in:

- [keyboard-integration-architecture.md](./keyboard-integration-architecture.md)
- [keyboard-integration-options.md](./keyboard-integration-options.md)
- [exercise-integration-data-model.md](./exercise-integration-data-model.md)
