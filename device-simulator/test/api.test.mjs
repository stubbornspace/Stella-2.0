import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";

import { createDeviceSimulator } from "../server.mjs";

async function waitFor(check, timeoutMs = 2000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await check();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("Timed out waiting for the device simulator.");
}

test("runs a configured Letter Target session through the HTTP API", async () => {
  const simulator = createDeviceSimulator({
    audioDelayMs: 5,
    tickIntervalMs: 5,
  });
  simulator.server.listen(0, "127.0.0.1");
  await once(simulator.server, "listening");
  const address = simulator.server.address();
  assert(address && typeof address === "object");
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    const configResponse = await fetch(`${baseUrl}/api/config`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        activity: "letter_target",
        content: "letters",
        items: 1,
        word_length: "3",
        participant: "P-TEST",
      }),
    });
    assert.equal(configResponse.status, 200);
    const configured = await configResponse.json();
    assert.equal(configured.config.items, 1);
    assert.equal(configured.config.word_length, "3");

    const startResponse = await fetch(`${baseUrl}/api/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    assert.equal(startResponse.status, 200);

    const activeState = await waitFor(async () => {
      const state = await fetch(`${baseUrl}/api/state`).then((response) =>
        response.json(),
      );
      return state.session?.phase === "response" ? state : null;
    });
    assert.equal(activeState.presentation.status.state, "response");
    assert.match(
      activeState.presentation.status.prompt_text,
      /green key \(A\)/,
    );
    assert.equal(
      activeState.presentation.board.keys.find((key) => key.id === 11).color,
      "waiting",
    );

    const pressResponse = await fetch(`${baseUrl}/api/press`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key_id: 11 }),
    });
    assert.equal(pressResponse.status, 200);

    const result = await waitFor(async () => {
      const response = await fetch(`${baseUrl}/api/results`);
      return response.status === 200 ? response.json() : null;
    });
    assert.equal(result.end_reason, "completed");
    assert.equal(result.participant, "P-TEST");
    assert.equal(result.counts.items_completed, 1);
    assert.equal(result.targeting_metrics.accuracy_pct, 100);

    const exportResponse = await fetch(`${baseUrl}/api/export.jsonl`);
    const events = (await exportResponse.text())
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    assert.equal(events[0].type, "session_start");
    assert.equal(events.at(-1).type, "session_end");
  } finally {
    await simulator.close();
  }
});

test("rejects unknown configuration fields", async () => {
  const simulator = createDeviceSimulator({
    audioDelayMs: 5,
    tickIntervalMs: 5,
  });
  simulator.server.listen(0, "127.0.0.1");
  await once(simulator.server, "listening");
  const address = simulator.server.address();
  assert(address && typeof address === "object");
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    const response = await fetch(`${baseUrl}/api/config`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ unknown_setting: true }),
    });
    assert.equal(response.status, 400);
    assert.match(
      (await response.json()).message,
      /unknown configuration field/i,
    );
  } finally {
    await simulator.close();
  }
});

test("accepts the Stella inhibition trial range and builds the exact preset mix", async () => {
  const simulator = createDeviceSimulator({
    audioDelayMs: 5,
    tickIntervalMs: 5,
  });
  simulator.server.listen(0, "127.0.0.1");
  await once(simulator.server, "listening");
  const address = simulator.server.address();
  assert(address && typeof address === "object");
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    const response = await fetch(`${baseUrl}/api/config`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        activity: "inhibition_challenge",
        items: 20,
        nogo_percent: 40,
        wait_percent: 10,
      }),
    });
    assert.equal(response.status, 200);
    const configured = await response.json();
    assert.equal(configured.config.items, 20);

    const cueCounts = simulator.engine
      ._icCueSequence()
      .reduce((counts, cue) => {
        counts[cue] = (counts[cue] ?? 0) + 1;
        return counts;
      }, {});
    assert.deepEqual(cueCounts, { go: 10, nogo: 8, wait: 2 });

    await fetch(`${baseUrl}/api/config`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: 1, nogo_percent: 0, wait_percent: 0 }),
    });
    await fetch(`${baseUrl}/api/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    await waitFor(() => (simulator.engine.phase === "response" ? true : null));
    await fetch(`${baseUrl}/api/press`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key_id: simulator.engine.expectedTargetId }),
    });
    const result = await waitFor(async () => {
      const resultResponse = await fetch(`${baseUrl}/api/results`);
      return resultResponse.status === 200 ? resultResponse.json() : null;
    });
    assert.equal(result.ic_metrics.go_trial_accuracy, 100);

    const events = (
      await fetch(`${baseUrl}/api/export.jsonl`).then((eventResponse) =>
        eventResponse.text(),
      )
    )
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    const prompt = events.find((event) => event.type === "prompt_start");
    const press = events.find((event) => event.type === "keypress");
    assert.match(prompt.expected_target_letter, /^[A-Z]$/);
    assert.equal(press.expected_target_letter, prompt.expected_target_letter);
    assert.match(press.pressed_key_letter, /^[A-Z]$/);
  } finally {
    await simulator.close();
  }
});

test("runs Motor Sequence Builder through demonstration and reproduction", async () => {
  const simulator = createDeviceSimulator({
    audioDelayMs: 5,
    tickIntervalMs: 5,
  });
  simulator.server.listen(0, "127.0.0.1");
  await once(simulator.server, "listening");
  const address = simulator.server.address();
  assert(address && typeof address === "object");
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    const configResponse = await fetch(`${baseUrl}/api/config`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        activity: "motor_sequence_builder",
        content: "letters",
        key_label: "blank",
        items: 1,
        sequence_start_length: 2,
        sequence_progression: false,
        sequence_max_length: 2,
      }),
    });
    assert.equal(configResponse.status, 200);

    const startResponse = await fetch(`${baseUrl}/api/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    assert.equal(startResponse.status, 200);

    const responseState = await waitFor(async () => {
      const state = await fetch(`${baseUrl}/api/state`).then((response) =>
        response.json(),
      );
      return state.session?.phase === "response" ? state : null;
    });
    assert.equal(responseState.presentation.board.key_label, "blank");

    const letters = [...simulator.engine.item.trials];
    assert.equal(letters.length, 2);
    for (const letter of letters) {
      const pressResponse = await fetch(`${baseUrl}/api/press`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key_id: simulator.engine.letterToId[letter] }),
      });
      assert.equal(pressResponse.status, 200);
      await waitFor(() =>
        simulator.engine.phase === "response" ||
        simulator.engine.phase === "idle"
          ? true
          : null,
      );
    }

    const result = await waitFor(async () => {
      const response = await fetch(`${baseUrl}/api/results`);
      return response.status === 200 ? response.json() : null;
    });
    assert.equal(result.end_reason, "completed");
    assert.equal(result.counts.items_completed, 1);
    assert.equal(result.msb_metrics.longest_completed_sequence, 2);
    assert.equal(result.msb_metrics.first_attempt_sequence_accuracy, 100);

    const events = (
      await fetch(`${baseUrl}/api/export.jsonl`).then((response) =>
        response.text(),
      )
    )
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    assert.equal(
      events.filter(
        (event) => event.type === "prompt_start" && event.clip === "msb_watch",
      ).length,
      1,
    );
    assert.deepEqual(
      events
        .filter((event) => event.type === "target_display")
        .map((event) => event.expected_target_letter),
      letters,
    );
  } finally {
    await simulator.close();
  }
});
