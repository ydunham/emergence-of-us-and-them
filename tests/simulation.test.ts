import assert from "node:assert/strict";
import test from "node:test";
import {
  createSimulation,
  DEFAULT_CONFIG,
  DEFAULT_GROUP_THRESHOLD,
  findGroups,
  PUBLISHED_CONFIG,
  runSimulation,
  shouldSampleSnapshot,
  stepSimulation,
} from "../lib/simulation.ts";
import {
  calculateClosenessPositions,
  closenessMatricesEqual,
} from "../lib/layout.ts";
import { createComparisonConfig } from "../lib/presets.ts";

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

test("uses a short classroom run without redefining the published defaults", () => {
  assert.equal(DEFAULT_CONFIG.rounds, 100);
  assert.equal(PUBLISHED_CONFIG.rounds, 10_000);
  assert.equal(DEFAULT_CONFIG.population, PUBLISHED_CONFIG.population);
  assert.equal(DEFAULT_CONFIG.trust, PUBLISHED_CONFIG.trust);
  assert.equal(DEFAULT_CONFIG.reciprocity, PUBLISHED_CONFIG.reciprocity);
  assert.equal(DEFAULT_CONFIG.transitivity, PUBLISHED_CONFIG.transitivity);
});

test("places a neutral homogeneous population evenly around a circle", () => {
  const state = createSimulation(DEFAULT_CONFIG);
  const positions = calculateClosenessPositions(state.closeness);
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

test("places cooperative pairs closer than antagonistic pairs", () => {
  const matrix = [
    [0, 0.9, 0.1, 0.5],
    [0.9, 0, 0.1, 0.5],
    [0.1, 0.1, 0, 0.9],
    [0.5, 0.5, 0.9, 0],
  ];
  const positions = calculateClosenessPositions(matrix);
  const distance = (first: number, second: number) => Math.hypot(
    positions[first].x - positions[second].x,
    positions[first].y - positions[second].y,
  );

  assert.ok(distance(0, 1) < distance(0, 2));
  assert.ok(distance(2, 3) < distance(1, 2));
  for (let first = 0; first < positions.length; first += 1) {
    for (let second = first + 1; second < positions.length; second += 1) {
      assert.ok(distance(first, second) >= 0.159);
    }
  }
  assert.deepEqual(
    calculateClosenessPositions(matrix),
    calculateClosenessPositions(matrix),
  );
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

test("group membership uses the selected closeness threshold", () => {
  const matrix = [
    [0, 0.7, 0.2],
    [0.7, 0, 0.69],
    [0.2, 0.69, 0],
  ];

  assert.equal(DEFAULT_GROUP_THRESHOLD, 0.7);
  assert.deepEqual(findGroups(matrix), [[0, 1], [2]]);
  assert.deepEqual(findGroups(matrix, 0.65), [[0, 1, 2]]);
  assert.deepEqual(findGroups(matrix, 0.75), [[0], [1], [2]]);
});

test("comparison presets change only their named condition", () => {
  const current = {
    ...DEFAULT_CONFIG,
    population: 37,
    rounds: 100_000,
    trust: 0.2,
    reciprocity: 7,
    transitivity: 6,
    seed: 98_765,
  };

  assert.deepEqual(createComparisonConfig(current, "no-reciprocity"), {
    ...current,
    reciprocity: 1,
  });
  assert.deepEqual(createComparisonConfig(current, "no-transitivity"), {
    ...current,
    transitivity: 1,
  });
  assert.deepEqual(createComparisonConfig(current, "suspicious"), {
    ...current,
    trust: -0.3,
  });
  assert.deepEqual(createComparisonConfig(current, "trusting"), {
    ...current,
    trust: 0.3,
  });
});

test("snapshot sampling stays aligned after a manual step", () => {
  const sampledRounds: number[] = [];
  const totalRounds = 1_000;
  const batchSize = 100;
  let round = 1;

  while (round < totalRounds) {
    const batch = Math.min(batchSize, totalRounds - round);
    for (let index = 0; index < batch; index += 1) {
      round += 1;
      if (shouldSampleSnapshot(round, totalRounds)) sampledRounds.push(round);
    }
  }

  assert.deepEqual(
    sampledRounds,
    Array.from({ length: 100 }, (_, index) => (index + 1) * 10),
  );
});
