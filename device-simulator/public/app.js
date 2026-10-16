const elements = {
  activity: document.querySelector("#activity"),
  configSummary: document.querySelector("#configSummary"),
  connection: document.querySelector("#connection"),
  connectionLabel: document.querySelector("#connectionLabel"),
  keyboard: document.querySelector("#keyboard"),
  latestEvent: document.querySelector("#latestEvent"),
  phase: document.querySelector("#phase"),
  progress: document.querySelector("#progress"),
  prompt: document.querySelector("#prompt"),
  session: document.querySelector("#session"),
};

const activityNames = {
  eye_pong: "Eye Pong",
  inhibition_challenge: "Inhibition Challenge",
  letter_find: "Letter Find",
  letter_target: "Letter Target",
};

let currentConfig = null;
let currentSession = null;
let keyLabel = "letters";
let keys = Array.from({ length: 30 }, (_, index) => ({
  id: index + 1,
  letter: "",
  color: "off",
}));

function setConnected(connected) {
  elements.connection.dataset.connected = String(connected);
  elements.connectionLabel.textContent = connected
    ? "API connected"
    : "Reconnecting";
}

function renderKeys() {
  elements.keyboard.replaceChildren(
    ...keys.map((key) => {
      const button = document.createElement("button");
      button.className = "key";
      button.dataset.color = key.color;
      button.dataset.reserved = String(!key.letter);
      button.disabled = key.color === "off" && !key.letter;
      button.textContent =
        key.letter && keyLabel === "blank" ? "" : key.letter || "·";
      button.setAttribute(
        "aria-label",
        key.letter
          ? keyLabel === "blank"
            ? `Key ${key.id}`
            : `${key.letter}, key ${key.id}`
          : `Reserved key ${key.id}`,
      );
      button.addEventListener("click", () => pressKey(key.id));
      return button;
    }),
  );
}

function renderConfig(config) {
  currentConfig = config;
  keyLabel = config.key_label;
  elements.activity.textContent =
    activityNames[config.activity] ?? config.activity;
  const beat =
    config.beat === "none"
      ? "no beat"
      : `${config.beat}, ${config.tempo_bpm} BPM`;
  elements.configSummary.textContent = `${config.layout.toUpperCase()} · ${config.side} keyboard · ${config.items} items · ${beat}`;
}

function renderState(state) {
  renderConfig(state.config);
  currentSession = state.session;
  const status = state.presentation?.status;
  elements.phase.textContent = status?.state ?? state.session?.phase ?? "Idle";
  elements.progress.textContent = status
    ? `${status.item} of ${status.items}`
    : state.session
      ? `${state.session.item} of ${state.session.items}`
      : "0 of 0";
  elements.session.textContent = state.session?.session_id ?? "None";
  elements.prompt.textContent =
    status?.prompt_text ||
    (state.session
      ? "Exercise running."
      : "Waiting for Stella to start an exercise.");

  const functioning = new Map(
    state.capabilities.functioning_keys.map((key) => [key.id, key.letter]),
  );
  keys = state.presentation?.board?.keys
    ? state.presentation.board.keys.sort((left, right) => left.id - right.id)
    : keys.map((key) => ({
        ...key,
        letter: functioning.get(key.id) ?? "",
        color: state.session && functioning.has(key.id) ? "idle" : "off",
      }));
  renderKeys();
}

async function pressKey(keyId) {
  try {
    const response = await fetch("/api/press", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key_id: keyId }),
    });
    if (!response.ok) throw new Error(`Device returned ${response.status}`);
    elements.latestEvent.textContent = `Key ${keyId} pressed`;
  } catch (error) {
    elements.latestEvent.textContent = error.message;
  }
}

function playClip(clip) {
  const audio = new Audio(`/sounds/${clip}.wav`);
  audio.volume = 0.7;
  void audio.play().catch(() => {});
}

async function loadState() {
  const response = await fetch("/api/state", { cache: "no-store" });
  if (!response.ok) throw new Error(`Device returned ${response.status}`);
  renderState(await response.json());
}

function connectEvents() {
  const events = new EventSource("/api/events");
  events.onopen = () => setConnected(true);
  events.onerror = () => setConnected(false);
  events.addEventListener("board", (event) => {
    const board = JSON.parse(event.data);
    keyLabel = board.key_label ?? keyLabel;
    keys = board.keys.sort((left, right) => left.id - right.id);
    renderKeys();
    elements.latestEvent.textContent = `Board updated: ${board.reason ?? "state change"}`;
  });
  events.addEventListener("status", (event) => {
    const status = JSON.parse(event.data);
    currentSession = status.session_id
      ? { session_id: status.session_id, phase: status.state }
      : null;
    elements.activity.textContent =
      activityNames[status.activity] ?? status.activity;
    elements.phase.textContent = status.state;
    elements.progress.textContent = `${status.item} of ${status.items}`;
    elements.session.textContent = status.session_id ?? "None";
    elements.prompt.textContent =
      status.prompt_text ||
      (status.state === "idle"
        ? "Waiting for Stella to start an exercise."
        : "Exercise running.");
    elements.latestEvent.textContent = `Status changed to ${status.state}`;
  });
  events.addEventListener("audio", (event) => {
    const { clip } = JSON.parse(event.data);
    elements.latestEvent.textContent = `Playing ${clip}`;
    playClip(clip);
  });
  events.addEventListener("results_ready", (event) => {
    const result = JSON.parse(event.data);
    elements.latestEvent.textContent = `Results ready for ${result.session_id}`;
    elements.prompt.textContent =
      "Session complete. Results were returned to Stella.";
  });
}

renderKeys();
connectEvents();
loadState()
  .then(() => setConnected(true))
  .catch((error) => {
    setConnected(false);
    elements.latestEvent.textContent = error.message;
  });
