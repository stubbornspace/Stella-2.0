import { createServer } from "node:http";
import { readFile, readFileSync } from "node:fs";
import { dirname, extname, join, normalize, sep } from "node:path";
import { fileURLToPath } from "node:url";

import {
  StellaEngine,
  eventsToCsv,
  eventsToJsonl,
} from "./runtime/engine.js";
import { setWords } from "./runtime/content.js";

const currentDirectory = dirname(fileURLToPath(import.meta.url));
const publicDirectory = join(currentDirectory, "public");
const soundDirectory = join(currentDirectory, "sounds");
const wordFile = join(currentDirectory, "runtime/words.txt");

const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".wav": "audio/wav",
};

const allowedConfigFields = new Set([
  "activity",
  "layout",
  "side",
  "key_label",
  "content",
  "items",
  "word_length",
  "beat",
  "tempo_bpm",
  "pong_mode",
  "timeout_enabled",
  "timeout_ms",
  "response_window_ms",
  "nogo_percent",
  "wait_percent",
  "sequence_start_length",
  "sequence_progression",
  "sequence_max_length",
  "participant",
]);

function clamp(value, minimum, maximum) {
  return Math.min(Math.max(value, minimum), maximum);
}

function enumValue(name, value, values) {
  if (!values.includes(value)) {
    throw new Error(`${name} must be one of: ${values.join(", ")}.`);
  }
  return value;
}

function numberValue(name, value, minimum, maximum) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${name} must be a number.`);
  }
  return clamp(Math.round(value), minimum, maximum);
}

function normalizeConfig(partial, current) {
  if (!partial || typeof partial !== "object" || Array.isArray(partial)) {
    throw new Error("Configuration must be a JSON object.");
  }
  for (const key of Object.keys(partial)) {
    if (!allowedConfigFields.has(key)) {
      throw new Error(`Unknown configuration field: ${key}.`);
    }
  }

  const next = {};
  if ("activity" in partial)
    next.activity = enumValue("activity", partial.activity, [
      "letter_target",
      "letter_find",
      "eye_pong",
      "inhibition_challenge",
      "motor_sequence_builder",
    ]);
  if ("layout" in partial)
    next.layout = enumValue("layout", partial.layout, [
      "qwerty",
      "alphabetical",
    ]);
  if ("side" in partial)
    next.side = enumValue("side", partial.side, ["full", "left", "right"]);
  if ("key_label" in partial)
    next.key_label = enumValue("key_label", partial.key_label, [
      "letters",
      "blank",
    ]);
  if ("content" in partial)
    next.content = enumValue("content", partial.content, ["letters", "words"]);
  if ("items" in partial) {
    const activity = next.activity ?? current.activity;
    const maximum =
      activity === "inhibition_challenge"
        ? 100
        : activity === "motor_sequence_builder"
          ? 20
          : 10;
    next.items = numberValue("items", partial.items, 1, maximum);
  }
  if ("word_length" in partial)
    next.word_length = enumValue("word_length", partial.word_length, [
      "3",
      "4",
      "5",
      "6",
      "7",
      "8",
      "0-5",
      "5-10",
      "10+",
    ]);
  if ("beat" in partial)
    next.beat = enumValue("beat", partial.beat, ["none", "metronome", "music"]);
  if ("tempo_bpm" in partial)
    next.tempo_bpm = numberValue("tempo_bpm", partial.tempo_bpm, 30, 120);
  if ("pong_mode" in partial)
    next.pong_mode = enumValue("pong_mode", partial.pong_mode, [
      "left_right",
      "random",
    ]);
  if ("timeout_enabled" in partial) {
    if (typeof partial.timeout_enabled !== "boolean")
      throw new Error("timeout_enabled must be a boolean.");
    next.timeout_enabled = partial.timeout_enabled;
  }
  if ("timeout_ms" in partial)
    next.timeout_ms = numberValue("timeout_ms", partial.timeout_ms, 250, 60000);
  if ("response_window_ms" in partial)
    next.response_window_ms = numberValue(
      "response_window_ms",
      partial.response_window_ms,
      500,
      10000,
    );
  if ("nogo_percent" in partial)
    next.nogo_percent = numberValue(
      "nogo_percent",
      partial.nogo_percent,
      0,
      100,
    );
  if ("wait_percent" in partial)
    next.wait_percent = numberValue(
      "wait_percent",
      partial.wait_percent,
      0,
      100,
    );
  if ("sequence_start_length" in partial)
    next.sequence_start_length = numberValue(
      "sequence_start_length",
      partial.sequence_start_length,
      2,
      5,
    );
  if ("sequence_progression" in partial) {
    if (typeof partial.sequence_progression !== "boolean")
      throw new Error("sequence_progression must be a boolean.");
    next.sequence_progression = partial.sequence_progression;
  }
  if ("sequence_max_length" in partial)
    next.sequence_max_length = numberValue(
      "sequence_max_length",
      partial.sequence_max_length,
      2,
      5,
    );
  if ("participant" in partial) {
    if (typeof partial.participant !== "string")
      throw new Error("participant must be a string.");
    next.participant = partial.participant.trim().slice(0, 32);
  }

  const nogo = next.nogo_percent ?? current.nogo_percent;
  const wait = next.wait_percent ?? current.wait_percent;
  if (nogo + wait > 100) next.wait_percent = 100 - nogo;
  const sequenceStart =
    next.sequence_start_length ?? current.sequence_start_length;
  const sequenceMax = next.sequence_max_length ?? current.sequence_max_length;
  if (sequenceMax < sequenceStart) next.sequence_max_length = sequenceStart;
  return next;
}

function loadWordLibrary() {
  const words = readFileSync(wordFile, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"));
  setWords(words);
}

function json(response, statusCode, body) {
  response.writeHead(statusCode, {
    "Access-Control-Allow-Origin": "*",
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
  });
  response.end(JSON.stringify(body));
}

function text(
  response,
  statusCode,
  body,
  contentType = "text/plain; charset=utf-8",
) {
  response.writeHead(statusCode, {
    "Access-Control-Allow-Origin": "*",
    "Cache-Control": "no-store",
    "Content-Type": contentType,
  });
  response.end(body);
}

async function readJsonBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 1024 * 1024) throw new Error("Request body is too large.");
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error("Request body must be valid JSON.");
  }
}

function safeFile(root, relativePath) {
  const clean = normalize(relativePath).replace(/^([/\\])+/, "");
  const file = join(root, clean);
  return file === root || file.startsWith(`${root}${sep}`) ? file : null;
}

function serveFile(response, root, relativePath) {
  const file = safeFile(root, relativePath);
  if (!file) {
    text(response, 404, "Not found.");
    return;
  }
  readFile(file, (error, contents) => {
    if (error) {
      text(response, 404, "Not found.");
      return;
    }
    response.writeHead(200, {
      "Cache-Control": "no-cache",
      "Content-Type": contentTypes[extname(file)] ?? "application/octet-stream",
    });
    response.end(contents);
  });
}

export function createDeviceSimulator(options = {}) {
  loadWordLibrary();
  const clients = new Set();
  const audioDelayMs = options.audioDelayMs;
  const tickIntervalMs = options.tickIntervalMs ?? 20;
  let audioTimer = null;
  let beatTimer = null;
  let latestAudio = null;
  let latestBoard = null;
  let latestStatus = null;

  const sendEvent = (response, eventName, payload) => {
    response.write(`event: ${eventName}\n`);
    response.write(`data: ${JSON.stringify(payload)}\n\n`);
  };
  const broadcast = (eventName, payload) => {
    for (const client of clients) sendEvent(client, eventName, payload);
  };
  const stopBeat = () => {
    if (beatTimer) clearInterval(beatTimer);
    beatTimer = null;
  };
  const startBeat = () => {
    stopBeat();
    if (engine.config.beat === "none") return;
    beatTimer = setInterval(
      () => engine.beatTick(),
      Math.round(60000 / engine.config.tempo_bpm),
    );
  };

  const engine = new StellaEngine({
    onBoard: (payload) => {
      latestBoard = { ...payload, key_label: engine.config.key_label };
      broadcast("board", latestBoard);
    },
    onStatus: (payload) => {
      if (payload.state === "idle") latestAudio = null;
      latestStatus = payload;
      broadcast("status", payload);
    },
    onAudio: (payload) => {
      latestAudio = payload;
      broadcast("audio", payload);
      if (audioTimer) clearTimeout(audioTimer);
      const completionDelayMs =
        audioDelayMs ??
        (engine.config.activity === "motor_sequence_builder" &&
        engine.phase === "instruction" &&
        payload.clip.startsWith("letter_")
          ? Math.round(60000 / engine.config.tempo_bpm)
          : 500);
      audioTimer = setTimeout(
        () => engine.audioEnded(payload.clip),
        completionDelayMs,
      );
    },
    onResults: (summary) => {
      if (audioTimer) clearTimeout(audioTimer);
      audioTimer = null;
      stopBeat();
      broadcast("results_ready", { session_id: summary.session_id });
    },
  });

  const tickTimer = setInterval(() => engine.tick(), tickIntervalMs);
  const keepAliveTimer = setInterval(() => {
    for (const client of clients) client.write(": keep-alive\n\n");
  }, 15000);

  const server = createServer(async (request, response) => {
    const url = new URL(request.url ?? "/", "http://localhost");

    if (request.method === "OPTIONS") {
      response.writeHead(204, {
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
        "Access-Control-Allow-Origin": "*",
      });
      response.end();
      return;
    }

    try {
      if (request.method === "GET" && url.pathname === "/api/state") {
        json(response, 200, {
          ...engine.getState(),
          device: {
            serial: options.serial ?? "SIM-0001",
            firmware_version: options.firmwareVersion ?? "sim-0.1.0",
          },
          presentation: {
            audio: latestAudio,
            board: latestBoard,
            status: latestStatus,
          },
        });
        return;
      }

      if (request.method === "POST" && url.pathname === "/api/config") {
        if (engine.getState().session) {
          json(response, 409, {
            message: "Cannot configure a running session.",
          });
          return;
        }
        const partial = normalizeConfig(
          await readJsonBody(request),
          engine.config,
        );
        json(response, 200, { config: engine.configure(partial) });
        return;
      }

      if (request.method === "POST" && url.pathname === "/api/start") {
        const sessionId = engine.start();
        if (!sessionId) {
          json(response, 409, { message: "A session is already running." });
          return;
        }
        startBeat();
        json(response, 200, { session_id: sessionId });
        return;
      }

      if (request.method === "POST" && url.pathname === "/api/stop") {
        if (!engine.getState().session) {
          json(response, 409, { message: "There is no running session." });
          return;
        }
        engine.stop("clinician_stopped");
        json(response, 200, { end_reason: "clinician_stopped" });
        return;
      }

      if (request.method === "POST" && url.pathname === "/api/press") {
        const body = await readJsonBody(request);
        const keyId = numberValue("key_id", body.key_id, 1, 30);
        engine.press(keyId);
        json(response, 200, { accepted: true, key_id: keyId });
        return;
      }

      if (request.method === "POST" && url.pathname === "/api/audio-ended") {
        const body = await readJsonBody(request);
        if (typeof body.clip !== "string" || !body.clip) {
          json(response, 400, { message: "clip is required." });
          return;
        }
        engine.audioEnded(body.clip);
        json(response, 200, { accepted: true, clip: body.clip });
        return;
      }

      if (request.method === "GET" && url.pathname === "/api/results") {
        if (!engine.lastSummary) {
          response.writeHead(204, { "Access-Control-Allow-Origin": "*" });
          response.end();
          return;
        }
        json(response, 200, engine.lastSummary);
        return;
      }

      if (request.method === "GET" && url.pathname === "/api/export.jsonl") {
        text(
          response,
          200,
          eventsToJsonl(engine.lastEvents ?? []),
          "application/x-ndjson; charset=utf-8",
        );
        return;
      }

      if (request.method === "GET" && url.pathname === "/api/export.csv") {
        text(
          response,
          200,
          eventsToCsv(engine.lastEvents ?? []),
          "text/csv; charset=utf-8",
        );
        return;
      }

      if (request.method === "GET" && url.pathname === "/api/events") {
        response.writeHead(200, {
          "Access-Control-Allow-Origin": "*",
          "Cache-Control": "no-cache, no-transform",
          Connection: "keep-alive",
          "Content-Type": "text/event-stream",
        });
        response.write("retry: 1000\n\n");
        clients.add(response);
        request.on("close", () => clients.delete(response));
        return;
      }

      if (request.method === "GET" && url.pathname.startsWith("/sounds/")) {
        serveFile(
          response,
          soundDirectory,
          url.pathname.slice("/sounds/".length),
        );
        return;
      }

      if (request.method === "GET") {
        const relativePath =
          url.pathname === "/" ? "index.html" : url.pathname.slice(1);
        serveFile(response, publicDirectory, relativePath);
        return;
      }

      json(response, 404, { message: "Not found." });
    } catch (error) {
      json(response, 400, {
        message: error instanceof Error ? error.message : "Invalid request.",
      });
    }
  });

  return {
    engine,
    server,
    close: () =>
      new Promise((resolve, reject) => {
        clearInterval(tickTimer);
        clearInterval(keepAliveTimer);
        stopBeat();
        if (audioTimer) clearTimeout(audioTimer);
        for (const client of clients) client.end();
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const port = Number(process.env.PORT || 4175);
  const simulator = createDeviceSimulator();
  simulator.server.listen(port, "0.0.0.0", () => {
    process.stdout.write(
      `Stella device simulator listening on http://localhost:${port}\n`,
    );
  });
  const shutdown = () => void simulator.close().then(() => process.exit(0));
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}
