import assert from "node:assert/strict";
import test from "node:test";
import {
  createSimulation,
  DEFAULT_CONFIG,
  findGroups,
  runSimulation,
  stepSimulation,
} from "../lib/simulation.ts";
import {
  calculatePcaPositions,
  closenessMatricesEqual,
} from "../lib/layout.ts";

test("starts as a homogeneous symmetric population", () => {
  const state = createSimulation(DEFAULT_CONFIG);
  assert.equal(state.closeness.length, 12);
  for (let first = 0; first < 12; first += 1) {
    assert.equal(state.closeness[first][first], 0);
    for (let second = 0; second < 12; second += 1) {
      assert.equal(state.closeness[first][second], state.closeness[second][first]);
      if (first !== second) assert.equal(state.closeness[first][second], 0.5);
    }
  }
});

test("places a neutral homogeneous population evenly around a circle", () => {
  const state = createSimulation(DEFAULT_CONFIG);
  const positions = calculatePcaPositions(state.closeness);
  const radii = positions.map(({ x, y }) => Math.hypot(x, y));
  const center = positions.reduce(
    (sum, position) => ({
      x: sum.x + position.x / positions.length,
      y: sum.y + position.y / positions.length,
    }),
    { x: 0, y: 0 },
  );

  for (const radius of radii) assert.ok(Math.abs(radius - 0.64) < 1e-10);
  assert.ok(Math.abs(center.x) < 1e-10);
  assert.ok(Math.abs(center.y) < 1e-10);
});

test("detects whether spatially relevant closeness values changed", () => {
  const state = createSimulation(DEFAULT_CONFIG);
  const copy = state.closeness.map((row) => [...row]);
  assert.equal(closenessMatricesEqual(copy, state.closeness), true);

  copy[0][1] = 0.75;
  copy[1][0] = 0.75;
  assert.equal(closenessMatricesEqual(copy, state.closeness), false);
});

test("a fixed seed reproduces the exact same run", () => {
  const first = runSimulation({ ...DEFAULT_CONFIG, rounds: 2_000 });
  const second = runSimulation({ ...DEFAULT_CONFIG, rounds: 2_000 });
  assert.deepEqual(first.state.closeness, second.state.closeness);
  assert.deepEqual(first.snapshot, second.snapshot);
});

test("no reciprocity and no transitivity leave closeness unchanged", () => {
  const state = createSimulation({ ...DEFAULT_CONFIG, rounds: 2_000, reciprocity: 1, transitivity: 1 });
  for (let round = 0; round < 2_000; round += 1) stepSimulation(state);
  for (let first = 0; first < state.config.population; first += 1) {
    for (let second = 0; second < state.config.population; second += 1) {
      if (first !== second) assert.equal(state.closeness[first][second], 0.5);
    }
  }
});

test("published defaults generate nontrivial group structure", () => {
  const result = runSimulation({ ...DEFAULT_CONFIG, rounds: 10_000 });
  const groups = findGroups(result.state.closeness);
  assert.ok(groups.some((group) => group.length > 1));
  assert.ok(result.snapshot.clustering >= 0 && result.snapshot.clustering <= 1);
  assert.ok(result.snapshot.cohesion >= 0 && result.snapshot.cohesion <= 1);
});
