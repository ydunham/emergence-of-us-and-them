export type LayoutPosition = { x: number; y: number };

const NEUTRAL_CLOSENESS = 0.5;
const MINIMUM_DISTANCE = 0.14;
const MAXIMUM_DISTANCE = 1.56;
const MAXIMUM_RADIUS = 0.92;

export function closenessMatricesEqual(
  first: number[][] | null,
  second: number[][],
) {
  if (!first || first.length !== second.length) return false;
  for (let row = 0; row < second.length; row += 1) {
    if (first[row].length !== second[row].length) return false;
    for (let column = 0; column < second[row].length; column += 1) {
      if (first[row][column] !== second[row][column]) return false;
    }
  }
  return true;
}

function circularPositions(size: number): LayoutPosition[] {
  const radius = 0.64;
  return Array.from({ length: size }, (_, index) => {
    const angle = -Math.PI / 2 + (index / size) * Math.PI * 2;
    return {
      x: Math.cos(angle) * radius,
      y: Math.sin(angle) * radius,
    };
  });
}

function isNeutralPopulation(matrix: number[][]) {
  for (let row = 0; row < matrix.length; row += 1) {
    for (let column = row + 1; column < matrix.length; column += 1) {
      if (Math.abs(matrix[row][column] - NEUTRAL_CLOSENESS) > 1e-10) {
        return false;
      }
    }
  }
  return true;
}

function desiredDistance(closeness: number) {
  const bounded = Math.min(1, Math.max(0, closeness));
  return MINIMUM_DISTANCE + (1 - bounded) * (MAXIMUM_DISTANCE - MINIMUM_DISTANCE);
}

function normalizePositions(positions: LayoutPosition[]) {
  const center = positions.reduce(
    (sum, position) => ({
      x: sum.x + position.x / positions.length,
      y: sum.y + position.y / positions.length,
    }),
    { x: 0, y: 0 },
  );
  for (const position of positions) {
    position.x -= center.x;
    position.y -= center.y;
  }

  const radius = Math.max(
    ...positions.map((position) => Math.hypot(position.x, position.y)),
    0.001,
  );
  if (radius > MAXIMUM_RADIUS) {
    const scale = MAXIMUM_RADIUS / radius;
    for (const position of positions) {
      position.x *= scale;
      position.y *= scale;
    }
  }
}

function separateOverlappingNodes(positions: LayoutPosition[]) {
  const minimumSeparation = positions.length <= 30 ? 0.16 : 0.09;
  for (let iteration = 0; iteration < 12; iteration += 1) {
    for (let first = 0; first < positions.length; first += 1) {
      for (let second = first + 1; second < positions.length; second += 1) {
        let dx = positions[first].x - positions[second].x;
        let dy = positions[first].y - positions[second].y;
        let distance = Math.hypot(dx, dy);
        if (distance >= minimumSeparation) continue;
        if (distance < 1e-6) {
          const angle = ((first + 1) * 2.399 + (second + 1) * 0.917) % (Math.PI * 2);
          dx = Math.cos(angle);
          dy = Math.sin(angle);
          distance = 1;
        }
        const offset = (minimumSeparation - distance) / 2;
        const unitX = dx / distance;
        const unitY = dy / distance;
        positions[first].x += unitX * offset;
        positions[first].y += unitY * offset;
        positions[second].x -= unitX * offset;
        positions[second].y -= unitY * offset;
      }
    }
  }

  const center = positions.reduce(
    (sum, position) => ({
      x: sum.x + position.x / positions.length,
      y: sum.y + position.y / positions.length,
    }),
    { x: 0, y: 0 },
  );
  for (const position of positions) {
    position.x -= center.x;
    position.y -= center.y;
  }
}

/**
 * Minimizes the mismatch between displayed distance and 1 - direct pairwise
 * closeness. Previous positions anchor the map against arbitrary rotation.
 */
export function calculateClosenessPositions(
  matrix: number[][],
  previous: LayoutPosition[] = [],
): LayoutPosition[] {
  const size = matrix.length;
  if (size === 0) return [];
  if (isNeutralPopulation(matrix)) return circularPositions(size);

  const hasPrior = previous.length === size;
  const anchors = (hasPrior ? previous : circularPositions(size)).map(
    (position) => ({ ...position }),
  );
  const positions = anchors.map((position) => ({ ...position }));

  for (let iteration = 0; iteration < 140; iteration += 1) {
    const gradients = Array.from({ length: size }, () => ({ x: 0, y: 0 }));

    for (let first = 0; first < size; first += 1) {
      for (let second = first + 1; second < size; second += 1) {
        let dx = positions[first].x - positions[second].x;
        let dy = positions[first].y - positions[second].y;
        let distance = Math.hypot(dx, dy);
        if (distance < 1e-6) {
          const angle = ((first + 1) * 2.399 + (second + 1) * 0.917) % (Math.PI * 2);
          dx = Math.cos(angle) * 1e-3;
          dy = Math.sin(angle) * 1e-3;
          distance = 1e-3;
        }

        const closeness = matrix[first][second];
        const target = desiredDistance(closeness);
        const weight = 0.35 + Math.abs(closeness - NEUTRAL_CLOSENESS) * 1.3;
        const magnitude = weight * (distance - target) / distance;
        const gradientX = magnitude * dx;
        const gradientY = magnitude * dy;
        gradients[first].x += gradientX;
        gradients[first].y += gradientY;
        gradients[second].x -= gradientX;
        gradients[second].y -= gradientY;
      }
    }

    const progress = iteration / 139;
    const learningRate = 0.18 * (1 - progress) + 0.025 * progress;
    const anchorWeight = hasPrior ? 0.035 : 0.008;
    for (let index = 0; index < size; index += 1) {
      positions[index].x -= learningRate * (
        gradients[index].x / size +
        anchorWeight * (positions[index].x - anchors[index].x)
      );
      positions[index].y -= learningRate * (
        gradients[index].y / size +
        anchorWeight * (positions[index].y - anchors[index].y)
      );
    }
    normalizePositions(positions);
  }

  separateOverlappingNodes(positions);

  return positions;
}
