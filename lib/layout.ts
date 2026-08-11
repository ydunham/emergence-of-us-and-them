export type LayoutPosition = { x: number; y: number };

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

function hasUniformOffDiagonalCloseness(matrix: number[][]) {
  if (matrix.length < 2) return true;
  const reference = matrix[0][1];
  for (let row = 0; row < matrix.length; row += 1) {
    for (let column = row + 1; column < matrix.length; column += 1) {
      if (Math.abs(matrix[row][column] - reference) > 1e-10) return false;
    }
  }
  return true;
}

export function calculatePcaPositions(matrix: number[][]): LayoutPosition[] {
  const size = matrix.length;
  if (size === 0) return [];

  // The diagonal is always zero, so PCA otherwise invents apparent differences
  // between agents even when every interpersonal relationship is identical.
  if (hasUniformOffDiagonalCloseness(matrix)) return circularPositions(size);

  const means = Array(size).fill(0);
  for (let column = 0; column < size; column += 1) {
    for (let row = 0; row < size; row += 1) {
      means[column] += matrix[row][column] / size;
    }
  }
  const centered = matrix.map((row) =>
    row.map((value, column) => value - means[column]),
  );

  const multiplyCovariance = (vector: number[]) => {
    const projected = centered.map((row) =>
      row.reduce((sum, value, index) => sum + value * vector[index], 0),
    );
    return Array.from({ length: size }, (_, column) =>
      centered.reduce(
        (sum, row, index) => sum + row[column] * projected[index],
        0,
      ),
    );
  };

  const eigenvectors: number[][] = [];
  for (let component = 0; component < 2; component += 1) {
    let vector = Array.from({ length: size }, (_, index) =>
      Math.sin((index + 1) * (component + 1) * 1.73),
    );
    for (let iteration = 0; iteration < 36; iteration += 1) {
      let next = multiplyCovariance(vector);
      for (const previous of eigenvectors) {
        const projection = next.reduce(
          (sum, value, index) => sum + value * previous[index],
          0,
        );
        next = next.map(
          (value, index) => value - projection * previous[index],
        );
      }
      const length = Math.hypot(...next) || 1;
      vector = next.map((value) => value / length);
    }
    eigenvectors.push(vector);
  }

  const scores = centered.map((row) =>
    eigenvectors.map((vector) =>
      row.reduce((sum, value, index) => sum + value * vector[index], 0),
    ),
  );
  const maxX = Math.max(
    ...scores.map((score) => Math.abs(score[0])),
    0.001,
  );
  const maxY = Math.max(
    ...scores.map((score) => Math.abs(score[1])),
    0.001,
  );
  return scores.map(([x, y]) => ({ x: x / maxX, y: y / maxY }));
}
