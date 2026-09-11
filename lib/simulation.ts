export type SimulationConfig = {
  population: number;
  rounds: number;
  trust: number;
  reciprocity: number;
  transitivity: number;
  seed: number;
};

export type InteractionEvent = {
  round: number;
  first: number;
  second: number;
  closenessBefore: number;
  closenessAfter: number;
  interacted: boolean;
  firstCooperated?: boolean;
  secondCooperated?: boolean;
  transitiveUpdates: number;
};

export type Snapshot = {
  round: number;
  clustering: number;
  cohesion: number;
  cooperationRate: number;
  interactionRate: number;
  averagePayoff: number;
  groups: number[][];
  isolates: number;
  groupThreshold: number;
};

export type SimulationState = {
  config: SimulationConfig;
  closeness: number[][];
  payoffs: number[];
  round: number;
  interactions: number;
  cooperativeChoices: number;
  random: () => number;
  lastEvent: InteractionEvent | null;
};

export const DEFAULT_CONFIG: SimulationConfig = {
  population: 12,
  rounds: 10_000,
  trust: 0,
  reciprocity: 3,
  transitivity: 2,
  seed: 2014,
};

export const DEFAULT_GROUP_THRESHOLD = 0.7;

export function seededRandom(seed: number) {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let t = value;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

export function createSimulation(config: SimulationConfig): SimulationState {
  const population = Math.max(2, Math.floor(config.population));
  const normalized = { ...config, population };
  const closeness = Array.from({ length: population }, (_, row) =>
    Array.from({ length: population }, (_, column) =>
      row === column ? 0 : 0.5,
    ),
  );

  return {
    config: normalized,
    closeness,
    payoffs: Array(population).fill(0),
    round: 0,
    interactions: 0,
    cooperativeChoices: 0,
    random: seededRandom(config.seed),
    lastEvent: null,
  };
}

export function stepSimulation(state: SimulationState): InteractionEvent {
  const { population, trust, reciprocity, transitivity } = state.config;
  const first = Math.floor(state.random() * population);
  let second = Math.floor(state.random() * (population - 1));
  if (second >= first) second += 1;

  const closenessBefore = state.closeness[first][second];
  const event: InteractionEvent = {
    round: state.round + 1,
    first,
    second,
    closenessBefore,
    closenessAfter: closenessBefore,
    interacted: false,
    transitiveUpdates: 0,
  };
  state.round += 1;

  if (closenessBefore <= state.random()) {
    state.lastEvent = event;
    return event;
  }

  event.interacted = true;
  state.interactions += 1;
  const firstCooperated = closenessBefore > state.random() - trust;
  const secondCooperated = closenessBefore > state.random() - trust;
  event.firstCooperated = firstCooperated;
  event.secondCooperated = secondCooperated;
  state.cooperativeChoices += Number(firstCooperated) + Number(secondCooperated);

  if (firstCooperated && secondCooperated) {
    state.payoffs[first] += 1;
    state.payoffs[second] += 1;
    const updated = 1 - (1 - closenessBefore) / reciprocity;
    setSymmetric(state.closeness, first, second, updated);

    for (let other = 0; other < population; other += 1) {
      if (other === first || other === second) continue;
      const firstOpinion = state.closeness[first][other];
      const secondOpinion = state.closeness[second][other];
      const firstStrength = Math.abs(firstOpinion - 0.5);
      const secondStrength = Math.abs(secondOpinion - 0.5);

      if (firstStrength > secondStrength) {
        if (firstOpinion > 0.5) {
          setSymmetric(
            state.closeness,
            second,
            other,
            1 - (1 - secondOpinion) / transitivity,
          );
          event.transitiveUpdates += Number(transitivity > 1);
        } else if (firstOpinion < 0.5) {
          setSymmetric(
            state.closeness,
            second,
            other,
            secondOpinion / transitivity,
          );
          event.transitiveUpdates += Number(transitivity > 1);
        }
      } else if (secondStrength > firstStrength) {
        if (secondOpinion > 0.5) {
          setSymmetric(
            state.closeness,
            first,
            other,
            1 - (1 - firstOpinion) / transitivity,
          );
          event.transitiveUpdates += Number(transitivity > 1);
        } else if (secondOpinion < 0.5) {
          setSymmetric(
            state.closeness,
            first,
            other,
            firstOpinion / transitivity,
          );
          event.transitiveUpdates += Number(transitivity > 1);
        }
      }
    }
  } else if (!firstCooperated && !secondCooperated) {
    state.payoffs[first] -= 1;
    state.payoffs[second] -= 1;
    setSymmetric(
      state.closeness,
      first,
      second,
      closenessBefore / reciprocity,
    );
  } else if (firstCooperated) {
    state.payoffs[first] -= 3;
    state.payoffs[second] += 3;
  } else {
    state.payoffs[first] += 3;
    state.payoffs[second] -= 3;
  }

  event.closenessAfter = state.closeness[first][second];
  state.lastEvent = event;
  return event;
}

function setSymmetric(matrix: number[][], first: number, second: number, value: number) {
  matrix[first][second] = value;
  matrix[second][first] = value;
}

function publishedTie(value: number, first: number, second: number, seed: number) {
  if (value > 0.5) return 1;
  if (value < 0.5) return 0;
  let hash = (seed ^ Math.imul(first + 1, 73_856_093) ^ Math.imul(second + 1, 19_349_663)) >>> 0;
  hash ^= hash >>> 13;
  hash = Math.imul(hash, 1_274_126_177) >>> 0;
  return (hash & 1) === 1 ? 1 : 0;
}

export function publishedClustering(matrix: number[][], seed = 0) {
  const size = matrix.length;
  const adjacency = Array.from({ length: size }, () => Array(size).fill(0));
  for (let row = 0; row < size; row += 1) {
    for (let column = row + 1; column < size; column += 1) {
      const tie = publishedTie(matrix[row][column], row, column, seed);
      adjacency[row][column] = tie;
      adjacency[column][row] = tie;
    }
  }

  let closedTriplets = 0;
  let triplets = 0;
  for (let center = 0; center < size; center += 1) {
    const neighbors = adjacency[center]
      .map((tie, index) => (tie ? index : -1))
      .filter((index) => index >= 0);
    triplets += neighbors.length * (neighbors.length - 1);
    for (const first of neighbors) {
      for (const second of neighbors) {
        if (first !== second) closedTriplets += adjacency[first][second];
      }
    }
  }
  return triplets === 0 ? 0 : closedTriplets / triplets;
}

export function weightedCohesion(matrix: number[][]) {
  const size = matrix.length;
  const weights = matrix.map((row, first) =>
    row.map((value, second) =>
      first === second ? 0 : Math.max(0, (value - 0.5) * 2),
    ),
  );
  let closedStrength = 0;
  let triplets = 0;

  for (let center = 0; center < size; center += 1) {
    const neighbors = weights[center]
      .map((weight, index) => (weight > 0 ? index : -1))
      .filter((index) => index >= 0);
    triplets += neighbors.length * (neighbors.length - 1);
    for (const first of neighbors) {
      for (const second of neighbors) {
        if (first === second) continue;
        closedStrength += Math.cbrt(
          weights[center][first] *
            weights[first][second] *
            weights[second][center],
        );
      }
    }
  }
  return triplets === 0 ? 0 : closedStrength / triplets;
}

export function findGroups(
  matrix: number[][],
  threshold = DEFAULT_GROUP_THRESHOLD,
) {
  const visited = Array(matrix.length).fill(false);
  const groups: number[][] = [];
  for (let start = 0; start < matrix.length; start += 1) {
    if (visited[start]) continue;
    const queue = [start];
    const group: number[] = [];
    visited[start] = true;
    while (queue.length) {
      const current = queue.shift()!;
      group.push(current);
      for (let other = 0; other < matrix.length; other += 1) {
        if (!visited[other] && matrix[current][other] >= threshold) {
          visited[other] = true;
          queue.push(other);
        }
      }
    }
    groups.push(group);
  }
  return groups.sort((first, second) => second.length - first.length);
}

export function summarize(
  state: SimulationState,
  groupThreshold = DEFAULT_GROUP_THRESHOLD,
): Snapshot {
  const groups = findGroups(state.closeness, groupThreshold);
  return {
    round: state.round,
    clustering: publishedClustering(state.closeness, state.config.seed),
    cohesion: weightedCohesion(state.closeness),
    cooperationRate:
      state.interactions === 0
        ? 0
        : state.cooperativeChoices / (state.interactions * 2),
    interactionRate: state.round === 0 ? 0 : state.interactions / state.round,
    averagePayoff:
      state.round === 0
        ? 0
        : state.payoffs.reduce((sum, value) => sum + value, 0) /
          (state.round * 2),
    groups,
    isolates: groups.filter((group) => group.length === 1).length,
    groupThreshold,
  };
}

export function shouldSampleSnapshot(
  round: number,
  totalRounds: number,
  sampleCount = 100,
) {
  if (round <= 0) return false;
  const interval = Math.max(1, Math.floor(totalRounds / sampleCount));
  return round % interval === 0 || round >= totalRounds;
}

export function runSimulation(
  config: SimulationConfig,
  sampleCount = 100,
  groupThreshold = DEFAULT_GROUP_THRESHOLD,
) {
  const state = createSimulation(config);
  const history: Snapshot[] = [summarize(state, groupThreshold)];
  while (state.round < config.rounds) {
    stepSimulation(state);
    if (shouldSampleSnapshot(state.round, config.rounds, sampleCount)) {
      history.push(summarize(state, groupThreshold));
    }
  }
  return { state, history, snapshot: summarize(state, groupThreshold) };
}
