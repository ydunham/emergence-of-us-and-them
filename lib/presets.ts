import {
  DEFAULT_CONFIG,
  PUBLISHED_CONFIG,
  type SimulationConfig,
} from "./simulation.ts";

export type PresetKey =
  | "classroom"
  | "published"
  | "no-reciprocity"
  | "no-transitivity"
  | "suspicious"
  | "trusting";

export type PresetSelection = PresetKey | "custom";
export type ComparisonPresetKey = Exclude<PresetKey, "classroom" | "published">;

type Preset = {
  label: string;
  changes: Partial<SimulationConfig>;
  comparisonChanges: Partial<SimulationConfig>;
};

export const PRESETS: Record<PresetKey, Preset> = {
  classroom: {
    label: "Classroom default",
    changes: { ...DEFAULT_CONFIG },
    comparisonChanges: {},
  },
  published: {
    label: "Published defaults",
    changes: { ...PUBLISHED_CONFIG },
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

export const COMPARISON_PRESET_KEYS: ComparisonPresetKey[] = [
  "no-reciprocity",
  "no-transitivity",
  "suspicious",
  "trusting",
];

export function createComparisonConfig(
  current: SimulationConfig,
  preset: ComparisonPresetKey,
): SimulationConfig {
  return { ...current, ...PRESETS[preset].comparisonChanges };
}
