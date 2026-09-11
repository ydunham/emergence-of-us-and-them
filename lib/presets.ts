import type { SimulationConfig } from "./simulation";

export type PresetKey =
  | "published"
  | "no-reciprocity"
  | "no-transitivity"
  | "suspicious"
  | "trusting";

export type PresetSelection = PresetKey | "custom";

type Preset = {
  label: string;
  changes: Partial<SimulationConfig>;
  comparisonChanges: Partial<SimulationConfig>;
};

export const PRESETS: Record<PresetKey, Preset> = {
  published: {
    label: "Published default",
    changes: {
      population: 12,
      trust: 0,
      reciprocity: 3,
      transitivity: 2,
    },
    comparisonChanges: {},
  },
  "no-reciprocity": {
    label: "No reciprocity",
    changes: { trust: 0, reciprocity: 1, transitivity: 2 },
    comparisonChanges: { reciprocity: 1 },
  },
  "no-transitivity": {
    label: "No transitivity",
    changes: { trust: 0, reciprocity: 3, transitivity: 1 },
    comparisonChanges: { transitivity: 1 },
  },
  suspicious: {
    label: "Suspicious population",
    changes: { trust: -0.3, reciprocity: 3, transitivity: 2 },
    comparisonChanges: { trust: -0.3 },
  },
  trusting: {
    label: "Trusting population",
    changes: { trust: 0.3, reciprocity: 3, transitivity: 2 },
    comparisonChanges: { trust: 0.3 },
  },
};

export function createComparisonConfig(
  current: SimulationConfig,
  preset: PresetKey,
): SimulationConfig {
  return { ...current, ...PRESETS[preset].comparisonChanges };
}
