"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createSimulation,
  DEFAULT_CONFIG,
  DEFAULT_GROUP_THRESHOLD,
  findGroups,
  runSimulation,
  SimulationConfig,
  SimulationState,
  Snapshot,
  shouldSampleSnapshot,
  stepSimulation,
  summarize,
} from "../lib/simulation";
import {
  calculateClosenessPositions,
  closenessMatricesEqual,
} from "../lib/layout";
import {
  createComparisonConfig,
  PRESETS,
  PresetKey,
  PresetSelection,
} from "../lib/presets";

const SPEEDS = [1, 10, 100, 1_000];

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function formatPercent(value: number) {
  return `${Math.round(value * 100)}%`;
}

function formatNumber(value: number, digits = 2) {
  return Number.isFinite(value) ? value.toFixed(digits) : "0.00";
}

function NetworkCanvas({ state, showLinks, groupThreshold }: { state: SimulationState; showLinks: boolean; groupThreshold: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const previousPositions = useRef<Array<{ x: number; y: number }>>([]);
  const previousCloseness = useRef<number[][] | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    const ratio = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.max(1, Math.round(rect.width * ratio));
    canvas.height = Math.max(1, Math.round(rect.height * ratio));
    context.scale(ratio, ratio);
    context.clearRect(0, 0, rect.width, rect.height);

    const styles = getComputedStyle(document.documentElement);
    const foreground = styles.getPropertyValue("--ink").trim() || "#13231f";
    const friend = styles.getPropertyValue("--friend").trim() || "#167c65";
    const enemy = styles.getPropertyValue("--enemy").trim() || "#c75a4a";
    const paper = styles.getPropertyValue("--paper").trim() || "#f7f4ec";
    const translucent = (hex: string, alpha: number) => {
      const normalized = hex.replace("#", "");
      const value = Number.parseInt(normalized.length === 3 ? normalized.split("").map((character) => character + character).join("") : normalized, 16);
      return `rgba(${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255}, ${alpha})`;
    };
    const closenessChanged = !closenessMatricesEqual(
      previousCloseness.current,
      state.closeness,
    );
    if (state.round === 0) {
      previousPositions.current = [];
      previousCloseness.current = null;
    }
    const prior = previousPositions.current;
    const shouldUpdatePositions = state.round === 0 || closenessChanged;
    const positions = shouldUpdatePositions
      ? calculateClosenessPositions(state.closeness, prior)
      : prior;
    if (shouldUpdatePositions) {
      previousPositions.current = positions;
      previousCloseness.current = state.closeness.map((row) => [...row]);
    }
    const padding = 46;
    const plotSize = Math.max(1, Math.min(
      rect.width - padding * 2,
      rect.height - padding * 2,
    ));
    const point = (position: { x: number; y: number }) => ({
      x: rect.width / 2 + position.x * plotSize / 2,
      y: rect.height / 2 + position.y * plotSize / 2,
    });

    const groups = findGroups(state.closeness, groupThreshold).filter((group) => group.length > 1);
    for (const group of groups) {
      const groupPoints = group.map((index) => point(positions[index]));
      const center = groupPoints.reduce((sum, item) => ({ x: sum.x + item.x / group.length, y: sum.y + item.y / group.length }), { x: 0, y: 0 });
      const radius = Math.max(26, ...groupPoints.map((item) => Math.hypot(item.x - center.x, item.y - center.y) + 24));
      const internal = group.flatMap((first) => group.filter((second) => second > first).map((second) => state.closeness[first][second]));
      const strength = internal.length ? internal.reduce((sum, value) => sum + value, 0) / internal.length : 0.5;
      context.beginPath();
      context.arc(center.x, center.y, radius, 0, Math.PI * 2);
      context.fillStyle = translucent(friend, clamp((strength - 0.5) * 0.34, 0.05, 0.18));
      context.strokeStyle = translucent(friend, clamp((strength - 0.5) * 1.2, 0.2, 0.74));
      context.lineWidth = 1.5;
      context.fill();
      context.stroke();
    }

    if (showLinks && state.config.population <= 60) {
      for (let first = 0; first < state.config.population; first += 1) {
        for (let second = first + 1; second < state.config.population; second += 1) {
          const closeness = state.closeness[first][second];
          if (Math.abs(closeness - 0.5) < 0.08) continue;
          const start = point(positions[first]);
          const end = point(positions[second]);
          context.beginPath();
          context.moveTo(start.x, start.y);
          context.lineTo(end.x, end.y);
          context.strokeStyle = closeness > 0.5 ? friend : enemy;
          context.globalAlpha = clamp(Math.abs(closeness - 0.5) * 1.25, 0.08, 0.58);
          context.lineWidth = closeness > 0.5 ? 1.3 : 0.8;
          context.setLineDash(closeness > 0.5 ? [] : [3, 4]);
          context.stroke();
        }
      }
      context.globalAlpha = 1;
      context.setLineDash([]);
    }

    positions.forEach((position, index) => {
      const location = point(position);
      const active = state.lastEvent && (state.lastEvent.first === index || state.lastEvent.second === index);
      context.beginPath();
      context.arc(location.x, location.y, active ? 10 : 8, 0, Math.PI * 2);
      context.fillStyle = active ? enemy : friend;
      context.strokeStyle = paper;
      context.lineWidth = 3;
      context.fill();
      context.stroke();
      if (state.config.population <= 30) {
        context.fillStyle = foreground;
        context.font = "500 11px system-ui";
        context.textAlign = "center";
        context.fillText(String(index + 1), location.x, location.y - 14);
      }
    });
  }, [state, showLinks, groupThreshold]);

  return <canvas ref={canvasRef} className="network-canvas" aria-label="Spatial map of agents; agents with closer direct relationships are generally positioned nearer each other" />;
}

function Sparkline({ histories, labels }: { histories: Snapshot[][]; labels: string[] }) {
  const colors = ["var(--friend)", "var(--comparison)"];
  return (
    <div className="chart-wrap">
      <svg className="sparkline" viewBox="0 0 640 180" role="img" aria-label="Published clustering coefficient over rounds">
        {[0, 0.5, 1].map((value) => (
          <g key={value}>
            <line x1="46" x2="626" y1={160 - value * 132} y2={160 - value * 132} className="chart-grid" />
            <text x="38" y={164 - value * 132} textAnchor="end" className="chart-label">{value.toFixed(1)}</text>
          </g>
        ))}
        {histories.map((history, historyIndex) => {
          if (history.length < 2) return null;
          const maxRound = Math.max(1, history.at(-1)?.round || 1);
          const points = history.map((snapshot) => `${46 + (snapshot.round / maxRound) * 580},${160 - snapshot.clustering * 132}`).join(" ");
          return <polyline key={labels[historyIndex]} points={points} fill="none" stroke={colors[historyIndex]} strokeWidth="3" />;
        })}
        <text x="336" y="178" textAnchor="middle" className="chart-label">Round</text>
      </svg>
      <div className="chart-legend">
        {labels.map((label, index) => <span key={label}><i style={{ background: colors[index] }} />{label}</span>)}
      </div>
    </div>
  );
}

function GroupBubbles({ snapshot }: { snapshot: Snapshot }) {
  return (
    <div className="group-bubbles" aria-label="Emergent group membership">
      {snapshot.groups.map((group, index) => (
        <div key={group.join("-")} className={group.length === 1 ? "group-bubble isolate" : "group-bubble"} style={{ "--bubble-size": `${clamp(34 + group.length * 8, 42, 104)}px` } as React.CSSProperties}>
          <span>{group.map((member) => member + 1).join(", ")}</span>
          <small>{group.length === 1 ? "isolated" : `group ${index + 1}`}</small>
        </div>
      ))}
    </div>
  );
}

function eventDescription(state: SimulationState) {
  const event = state.lastEvent;
  if (!event) return "Ready. Step once or start the run to select the first pair.";
  const pair = `Agents ${event.first + 1} and ${event.second + 1}`;
  if (!event.interacted) return `${pair} were selected but did not meet (closeness ${event.closenessBefore.toFixed(2)}).`;
  const firstAction = event.firstCooperated ? "cooperated" : "defected";
  const secondAction = event.secondCooperated ? "cooperated" : "defected";
  const change = Math.abs(event.closenessAfter - event.closenessBefore) < 0.0001
    ? "Their closeness did not change."
    : `Closeness moved from ${event.closenessBefore.toFixed(2)} to ${event.closenessAfter.toFixed(2)}.`;
  const gossip = event.transitiveUpdates ? ` ${event.transitiveUpdates} third-party relationship${event.transitiveUpdates === 1 ? "" : "s"} also shifted through transitivity.` : "";
  return `${pair} met: Agent ${event.first + 1} ${firstAction}; Agent ${event.second + 1} ${secondAction}. ${change}${gossip}`;
}

export default function Home() {
  const [config, setConfig] = useState(DEFAULT_CONFIG);
  const [state, setState] = useState(() => createSimulation(DEFAULT_CONFIG));
  const [snapshot, setSnapshot] = useState(() => summarize(createSimulation(DEFAULT_CONFIG)));
  const [history, setHistory] = useState<Snapshot[]>([snapshot]);
  const [running, setRunning] = useState(false);
  const [speed, setSpeed] = useState(100);
  const [showLinks, setShowLinks] = useState(true);
  const [groupThreshold, setGroupThreshold] = useState(DEFAULT_GROUP_THRESHOLD);
  const [preserveSeed, setPreserveSeed] = useState(false);
  const [activePreset, setActivePreset] = useState<PresetSelection>("published");
  const [showDetails, setShowDetails] = useState(false);
  const [comparePreset, setComparePreset] = useState<PresetKey>("no-transitivity");
  const [comparison, setComparison] = useState<ReturnType<typeof runSimulation> | null>(null);
  const [comparisonBaseline, setComparisonBaseline] = useState<ReturnType<typeof runSimulation> | null>(null);
  const stateRef = useRef(state);
  const historyRef = useRef(history);
  const groupThresholdRef = useRef(groupThreshold);

  const publish = useCallback((next: SimulationState, historySnapshots: Snapshot[] = []) => {
    const latestHistorySnapshot = historySnapshots.at(-1);
    const nextSnapshot = latestHistorySnapshot?.round === next.round
      ? latestHistorySnapshot
      : summarize(next, groupThresholdRef.current);
    stateRef.current = next;
    setState({ ...next, closeness: next.closeness.map((row) => [...row]), payoffs: [...next.payoffs] });
    setSnapshot(nextSnapshot);
    if (historySnapshots.length) {
      const updated = [...historyRef.current, ...historySnapshots].slice(-121);
      historyRef.current = updated;
      setHistory(updated);
    }
  }, []);

  const reset = useCallback((nextConfig = config, preserveOverride?: boolean) => {
    setRunning(false);
    const shouldPreserveSeed = preserveOverride ?? preserveSeed;
    const seedValues = new Uint32Array(1);
    if (!shouldPreserveSeed) window.crypto.getRandomValues(seedValues);
    const resolvedConfig = shouldPreserveSeed
      ? nextConfig
      : { ...nextConfig, seed: (seedValues[0] % 2_147_483_646) + 1 };
    const next = createSimulation(resolvedConfig);
    const firstSnapshot = summarize(next, groupThresholdRef.current);
    setConfig(resolvedConfig);
    stateRef.current = next;
    historyRef.current = [firstSnapshot];
    setState(next);
    setSnapshot(firstSnapshot);
    setHistory([firstSnapshot]);
    setComparison(null);
    setComparisonBaseline(null);
  }, [config, preserveSeed]);

  const changeConfig = <K extends keyof SimulationConfig>(key: K, value: SimulationConfig[K]) => {
    const next = { ...config, [key]: value };
    if (key !== "seed") setActivePreset("custom");
    reset(next);
  };

  const applyPreset = (preset: PresetKey) => {
    const next = {
      ...DEFAULT_CONFIG,
      ...PRESETS[preset].changes,
      seed: config.seed,
    };
    setActivePreset(preset);
    reset(next);
  };

  const step = useCallback(() => {
    if (stateRef.current.round >= stateRef.current.config.rounds) return;
    stepSimulation(stateRef.current);
    publish(stateRef.current, [summarize(stateRef.current, groupThresholdRef.current)]);
  }, [publish]);

  useEffect(() => {
    if (!running) return;
    let frame = 0;
    const tick = () => {
      const current = stateRef.current;
      const batch = Math.min(speed, current.config.rounds - current.round);
      const sampledSnapshots: Snapshot[] = [];
      for (let index = 0; index < batch; index += 1) {
        stepSimulation(current);
        if (shouldSampleSnapshot(current.round, current.config.rounds)) {
          sampledSnapshots.push(summarize(current, groupThresholdRef.current));
        }
      }
      publish(current, sampledSnapshots);
      if (current.round >= current.config.rounds) setRunning(false);
      else frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [running, speed, publish]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (!params.size) return;
    const next = {
      ...DEFAULT_CONFIG,
      population: clamp(Number(params.get("n")) || DEFAULT_CONFIG.population, 4, 100),
      rounds: clamp(Number(params.get("rounds")) || DEFAULT_CONFIG.rounds, 100, 1_000_000),
      trust: clamp(Number(params.get("a")) || 0, -0.5, 0.5),
      reciprocity: clamp(Number(params.get("r")) || DEFAULT_CONFIG.reciprocity, 1, 10),
      transitivity: clamp(Number(params.get("t")) || DEFAULT_CONFIG.transitivity, 1, 10),
      seed: Number(params.get("seed")) || DEFAULT_CONFIG.seed,
    };
    const timer = window.setTimeout(() => {
      setPreserveSeed(true);
      setActivePreset("custom");
      reset(next, true);
    }, 0);
    return () => window.clearTimeout(timer);
    // Read the initial URL once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const runComparison = () => {
    setRunning(false);
    const baseline = runSimulation(config, 100, groupThreshold);
    const variantConfig = createComparisonConfig(config, comparePreset);
    setComparisonBaseline(baseline);
    setComparison(runSimulation(variantConfig, 100, groupThreshold));
  };

  const changeGroupThreshold = (value: number) => {
    groupThresholdRef.current = value;
    setGroupThreshold(value);
    const nextSnapshot = summarize(stateRef.current, value);
    setSnapshot(nextSnapshot);
    const updatedHistory = historyRef.current.map((item, index, items) =>
      index === items.length - 1 && item.round === nextSnapshot.round
        ? nextSnapshot
        : item,
    );
    historyRef.current = updatedHistory;
    setHistory(updatedHistory);
    setComparison(null);
    setComparisonBaseline(null);
  };

  const shareConfiguration = async () => {
    const params = new URLSearchParams({
      n: String(config.population), rounds: String(config.rounds), a: String(config.trust),
      r: String(config.reciprocity), t: String(config.transitivity), seed: String(config.seed),
    });
    const url = `${window.location.origin}${window.location.pathname}?${params}`;
    await navigator.clipboard.writeText(url);
  };

  const download = (filename: string, contents: string) => {
    const blob = new Blob([contents], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  };

  const exportSummary = () => {
    const rows = ["round,clustering,cohesion,cooperation_rate,interaction_rate,average_payoff,groups,isolates,group_threshold"];
    for (const item of history) rows.push([item.round, item.clustering, item.cohesion, item.cooperationRate, item.interactionRate, item.averagePayoff, item.groups.filter((group) => group.length > 1).length, item.isolates, item.groupThreshold].join(","));
    download(`group-genesis-seed-${config.seed}.csv`, rows.join("\n"));
  };

  const exportMatrix = () => {
    const header = ["agent", ...state.closeness.map((_, index) => `agent_${index + 1}`)].join(",");
    const rows = state.closeness.map((row, index) => [`agent_${index + 1}`, ...row.map((value) => value.toFixed(6))].join(","));
    download(`closeness-matrix-seed-${config.seed}.csv`, [header, ...rows].join("\n"));
  };

  const groupCount = snapshot.groups.filter((group) => group.length > 1).length;
  const progress = config.rounds ? snapshot.round / config.rounds : 0;
  const canRun = snapshot.round < config.rounds;
  const groupSizes = useMemo(() => snapshot.groups.filter((group) => group.length > 1).map((group) => group.length), [snapshot.groups]);

  return (
    <main>
      <header className="site-header">
        <div>
          <p className="eyebrow">Interactive model · Gray et al. (2014)</p>
          <h1>The Emergence of <em>Us and Them</em></h1>
          <p className="subtitle">Watch reciprocity and transitivity turn identical strangers into social groups.</p>
        </div>
        <a className="paper-link" href="https://doi.org/10.1177/0956797614521816" target="_blank" rel="noreferrer">Read the paper ↗</a>
      </header>

      <section className="lab-shell" aria-label="Group genesis simulation">
        <div className="visual-column">
          <div className="visual-heading">
            <div>
              <p className="section-kicker">Relationship space</p>
              <h2>Who is close to whom?</h2>
            </div>
            <label className="toggle"><input type="checkbox" checked={showLinks} onChange={(event) => setShowLinks(event.target.checked)} /> Show ties</label>
          </div>
          <div className="network-stage">
            <NetworkCanvas state={state} showLinks={showLinks} groupThreshold={groupThreshold} />
            <div className="round-chip">Round {snapshot.round.toLocaleString()} / {config.rounds.toLocaleString()}</div>
            <div className="stage-legend"><span><i className="friend-dot" /> cooperative tie</span><span><i className="enemy-line" /> antagonistic tie</span></div>
          </div>
          <div className="progress-track" aria-label={`${Math.round(progress * 100)} percent complete`}><span style={{ width: `${progress * 100}%` }} /></div>
          <div className="event-strip" aria-live="polite"><span>Latest attempt</span><p>{eventDescription(state)}</p></div>
          <GroupBubbles snapshot={snapshot} />
        </div>

        <aside className="control-column">
          <div className="control-topline"><div><p className="section-kicker">Model controls</p><h2>Shape the population</h2></div></div>
          <label className="select-label">Classroom preset<select value={activePreset} onChange={(event) => applyPreset(event.target.value as PresetKey)}>{activePreset === "custom" && <option value="custom" disabled>Custom settings</option>}{Object.entries(PRESETS).map(([key, preset]) => <option key={key} value={key}>{preset.label}</option>)}</select></label>
          <div className="slider-list">
            <Slider label="Number of people" value={config.population} minimum={4} maximum={100} step={1} low="4" high="100" onChange={(value) => changeConfig("population", value)} />
            <Slider label="Trusting or suspicious" value={config.trust} minimum={-0.5} maximum={0.5} step={0.1} low="Suspicious" high="Trusting" onChange={(value) => changeConfig("trust", value)} />
            <Slider label="Reciprocity" value={config.reciprocity} minimum={1} maximum={10} step={1} low="None" high="Strong" onChange={(value) => changeConfig("reciprocity", value)} />
            <Slider label="Transitivity" value={config.transitivity} minimum={1} maximum={10} step={1} low="None" high="Strong" onChange={(value) => changeConfig("transitivity", value)} />
            <Slider label="Group threshold" value={groupThreshold} minimum={0.55} maximum={0.95} step={0.05} low="Looser" high="Tighter" onChange={changeGroupThreshold} />
          </div>
          <div className="seed-row"><label>Random seed<input type="number" value={config.seed} disabled={!preserveSeed} onChange={(event) => changeConfig("seed", Number(event.target.value) || 1)} /></label><label>Rounds<select value={config.rounds} onChange={(event) => changeConfig("rounds", Number(event.target.value))}><option value={100}>100</option><option value={1000}>1,000</option><option value={10000}>10,000</option><option value={100000}>100,000</option><option value={1000000}>1,000,000</option></select></label><label className="seed-preserve"><input type="checkbox" checked={preserveSeed} onChange={(event) => setPreserveSeed(event.target.checked)} /> Preserve random seed on reset</label></div>
          <div className="run-controls">
            <button className="primary-button" disabled={!canRun} onClick={() => setRunning((value) => !value)}>{running ? "Pause" : snapshot.round ? "Resume" : "Start"}</button>
            <button className="secondary-button" disabled={running || !canRun} onClick={step}>Step once</button>
            <button className="secondary-button reset-button" onClick={() => reset()}>Reset</button>
            <label>Speed<select value={speed} onChange={(event) => setSpeed(Number(event.target.value))}>{SPEEDS.map((value) => <option key={value} value={value}>{value.toLocaleString()}×</option>)}</select></label>
          </div>
        </aside>
      </section>

      <section className="results-section">
        <div className="results-heading"><div><p className="section-kicker">Live outcomes</p><h2>How group-like is this population?</h2></div><p>Published clustering preserves the paper’s binary measure. Displayed groups are connected by chains of relationships at or above {groupThreshold.toFixed(2)}.</p></div>
        <div className="metric-grid">
          <Metric label="Published clustering" value={formatNumber(snapshot.clustering)} note="0 = none · 1 = complete" />
          <Metric label="Group cohesion" value={formatNumber(snapshot.cohesion)} note="graded tie strength" />
          <Metric label="Groups" value={String(groupCount)} note={groupSizes.length ? `sizes ${groupSizes.join(", ")}` : `${snapshot.isolates} isolated`} />
          <Metric label="Cooperation" value={formatPercent(snapshot.cooperationRate)} note={`${formatPercent(snapshot.interactionRate)} of pairs met`} />
          <Metric label="Average payoff" value={formatNumber(snapshot.averagePayoff)} note="paper’s per-round measure" />
        </div>
        <Sparkline histories={[history]} labels={["Current run"]} />
      </section>

      <section className="compare-section">
        <div className="compare-copy"><p className="section-kicker">Matched comparison</p><h2>Change one condition. Start with the same luck.</h2><p>Both runs begin from seed {config.seed}. Their random paths can diverge as the changed condition alters which interactions occur.</p></div>
        <div className="compare-controls"><label>Compare current settings with<select value={comparePreset} onChange={(event) => setComparePreset(event.target.value as PresetKey)}>{Object.entries(PRESETS).filter(([key]) => key !== "published").map(([key, preset]) => <option key={key} value={key}>{preset.label}</option>)}</select></label><button className="primary-button" onClick={runComparison}>Run matched comparison</button></div>
        {comparison && comparisonBaseline && (
          <div className="comparison-results">
            <div className="comparison-cards"><ComparisonCard title="Current settings" snapshot={comparisonBaseline.snapshot} /><ComparisonCard title={PRESETS[comparePreset].label} snapshot={comparison.snapshot} /></div>
            <Sparkline histories={[comparisonBaseline.history, comparison.history]} labels={["Current settings", PRESETS[comparePreset].label]} />
          </div>
        )}
      </section>

      <section className="explain-section">
        <div className="explain-heading"><p className="section-kicker">The model in four steps</p><h2>Simple rules, emergent structure</h2></div>
        <ol className="steps-grid">
          <li><span>01</span><h3>Meet</h3><p>A random pair is selected. Closer agents are more likely to interact.</p></li>
          <li><span>02</span><h3>Choose</h3><p>Each agent cooperates or defects. Closeness, adjusted by trust, sets the odds.</p></li>
          <li><span>03</span><h3>Reciprocate</h3><p>Mutual cooperation draws the pair closer; mutual defection pushes them apart.</p></li>
          <li><span>04</span><h3>Generalize</h3><p>Cooperators align their views of other agents through transitivity.</p></li>
        </ol>
        <details className="teaching-notes"><summary>Teaching notes and suggested demonstrations</summary><div><h3>Three quick demonstrations</h3><ul><li>Start with the published default and ask students to predict whether one group or several will emerge.</li><li>Compare the default with “No transitivity” to isolate the mechanism that closes social triangles.</li><li>Contrast suspicious and trusting populations, then discuss why both extreme isolation and one inclusive group can reduce visible between-group structure.</li></ul><h3>Questions for discussion</h3><ul><li>When does the model’s definition of closeness match real social relationships—and when does it not?</li><li>What psychological information is lost by making every agent identical?</li><li>How would asymmetric relationships, memory, or a negativity bias change the dynamics?</li></ul></div></details>
      </section>

      <section className="data-section">
        <div><p className="section-kicker">Reproduce and inspect</p><h2>Take the run with you</h2><p>Share the exact settings or export the sampled outcomes and final closeness matrix.</p></div>
        <div className="data-actions"><button className="secondary-button" onClick={shareConfiguration}>Copy configuration link</button><button className="secondary-button" onClick={exportSummary}>Export outcomes CSV</button><button className="secondary-button" onClick={exportMatrix}>Export matrix CSV</button><button className="text-button" onClick={() => setShowDetails((value) => !value)}>{showDetails ? "Hide" : "Inspect"} matrix</button></div>
        {showDetails && <MatrixTable state={state} />}
      </section>

      <footer><p>Faithful browser adaptation of the published MATLAB model in Gray, Rand, Ert, Lewis, Hershman, & Norton (2014), <em>Psychological Science</em>.</p><p>All computation stays in this browser.</p></footer>
    </main>
  );
}

function Slider({ label, value, minimum, maximum, step, low, high, onChange }: { label: string; value: number; minimum: number; maximum: number; step: number; low: string; high: string; onChange: (value: number) => void }) {
  return <label className="slider-control"><span><b>{label}</b><strong>{value}</strong></span><input type="range" min={minimum} max={maximum} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} /><small><span>{low}</span><span>{high}</span></small></label>;
}

function Metric({ label, value, note }: { label: string; value: string; note: string }) {
  return <div className="metric"><span>{label}</span><strong>{value}</strong><small>{note}</small></div>;
}

function ComparisonCard({ title, snapshot }: { title: string; snapshot: Snapshot }) {
  return <div className="comparison-card"><h3>{title}</h3><dl><div><dt>Clustering</dt><dd>{formatNumber(snapshot.clustering)}</dd></div><div><dt>Cohesion</dt><dd>{formatNumber(snapshot.cohesion)}</dd></div><div><dt>Groups</dt><dd>{snapshot.groups.filter((group) => group.length > 1).length}</dd></div><div><dt>Payoff</dt><dd>{formatNumber(snapshot.averagePayoff)}</dd></div></dl></div>;
}

function MatrixTable({ state }: { state: SimulationState }) {
  const visible = Math.min(state.config.population, 20);
  return <div className="matrix-wrap"><table><caption>Final closeness matrix{state.config.population > visible ? ` (first ${visible} agents shown)` : ""}</caption><thead><tr><th>Agent</th>{state.closeness.slice(0, visible).map((_, index) => <th key={index}>{index + 1}</th>)}</tr></thead><tbody>{state.closeness.slice(0, visible).map((row, index) => <tr key={index}><th>{index + 1}</th>{row.slice(0, visible).map((value, column) => <td key={column} style={{ backgroundColor: index === column ? "var(--paper-deep)" : `rgba(23, 116, 95, ${0.04 + value * 0.26})` }}>{index === column ? "—" : value.toFixed(2)}</td>)}</tr>)}</tbody></table></div>;
}
