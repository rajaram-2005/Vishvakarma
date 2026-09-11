/**
 * Canonical Single Source of Truth — AETHERIS v2 State Fabric
 *
 * Implements one unified application state covering:
 * - mission
 * - phase
 * - assets
 * - telemetry
 * - agents
 * - cores
 * - models
 * - tools
 * - memory
 * - simulations
 * - evidence
 * - decisions
 * - policies
 * - approvals
 * - uncertainty
 * - audit
 */
import type { AetherisState } from "./types";
import { WorldModelEngine } from "./worldmodel";

class CanonicalStateFabric {
  private state: AetherisState;

  constructor() {
    this.state = this.createInitialState();
  }

  private createInitialState(): AetherisState {
    const scenarios = WorldModelEngine.getCanonicalScenarios();
    const causalTimeline = WorldModelEngine.getCausalTimeline();

    return {
      mission: {
        id: "msn-wtg04-001",
        title: "Investigate WTG-04 Gearbox Anomaly",
        objective: "Perform autonomous vibration diagnosis, simulation, and guarded mitigation for WTG-04",
        status: "verified",
        progressPct: 88,
        activeContextTab: "MISSION",
      },
      phase: {
        current: 7,
        name: "Adversarial Critique",
        state: "ACTIVE",
        gateVerdict: "PASS",
        gateReason: "Adversarial critique verified 89.3 Hz BPFO harmonic; 2 alternative explanations audited.",
        history: [
          { phaseId: 0, name: "Intake", verdict: "PASS", durationMs: 4 },
          { phaseId: 1, name: "Understand", verdict: "PASS", durationMs: 12 },
          { phaseId: 2, name: "Decompose", verdict: "PASS", durationMs: 18 },
          { phaseId: 3, name: "Retrieve", verdict: "PASS", durationMs: 32 },
          { phaseId: 4, name: "Route", verdict: "PASS", durationMs: 14 },
          { phaseId: 5, name: "Execute", verdict: "PASS", durationMs: 145 },
          { phaseId: 6, name: "Simulate", verdict: "PASS", durationMs: 65 },
          { phaseId: 7, name: "Critique", verdict: "PASS", durationMs: 24 },
        ],
      },
      assets: {
        selectedAssetId: "WTG-04",
        focusedComponent: "gearbox",
        components: [
          { id: "tower", name: "Tower Structural Base", category: "tower", health: 0.98, status: "nominal", temperature_K: 295.2, vibration_mms: 0.8, sensors: ["strain_gauge_01"] },
          { id: "nacelle", name: "Nacelle Housing", category: "nacelle", health: 0.95, status: "nominal", temperature_K: 302.1, vibration_mms: 1.4, sensors: ["temp_ambient"] },
          { id: "rotor", name: "Rotor & Blade Assembly", category: "rotor", health: 0.92, status: "nominal", temperature_K: 298.0, vibration_mms: 2.1, sensors: ["rotor_speed_rpm"] },
          { id: "gearbox", name: "Planetary Gearbox", category: "gearbox", health: 0.68, status: "warning", temperature_K: 338.2, vibration_mms: 8.4, sensors: ["acc_03_vib", "oil_temp_probe"] },
          { id: "bearings", name: "High-Speed Shaft Bearing", category: "bearings", health: 0.62, status: "critical", temperature_K: 341.5, vibration_mms: 8.4, sensors: ["acc_03_vib"] },
          { id: "generator", name: "Doubly-Fed Induction Gen", category: "generator", health: 0.94, status: "nominal", temperature_K: 315.4, vibration_mms: 1.8, sensors: ["gen_power_kW"] },
          { id: "inverter", name: "Grid Power Converter", category: "inverter", health: 0.97, status: "nominal", temperature_K: 308.6, vibration_mms: 0.4, sensors: ["grid_freq_hz"] },
        ],
      },
      telemetry: {
        timestamp: Date.now(),
        streamActive: true,
        channels: {
          rotor_rpm: { value: 1500, unit: "RPM", min: 0, max: 1800, status: "ok" },
          vib_bearing_mms: { value: 8.4, unit: "mm/s", min: 0, max: 11.2, status: "warn" },
          gearbox_temp_K: { value: 338.2, unit: "K", min: 273, max: 353.15, status: "warn" },
          active_power_kW: { value: 1850, unit: "kW", min: 0, max: 2000, status: "ok" },
          pitch_angle_deg: { value: 2.4, unit: "deg", min: 0, max: 90, status: "ok" },
          oil_pressure_bar: { value: 3.8, unit: "bar", min: 2.0, max: 6.0, status: "ok" },
        },
        historySparkline: [4.2, 4.4, 5.1, 6.2, 7.0, 7.8, 8.4],
      },
      agents: [
        { id: "ag-vib-alpha", name: "VIB-ALPHA", core: "NIRIKSHAN", role: "Spectral Harmonic Evaluator", status: "WORKING", permissions: ["fft:read", "scada:read"], confidence: 0.94, runtimeMs: 340 },
        { id: "ag-rotor-beta", name: "ROTOR-BETA", core: "YANTRA", role: "Rotor Kinematics Simulator", status: "COMPLETED", permissions: ["twin:simulate"], confidence: 0.96, runtimeMs: 280 },
        { id: "ag-critic-omega", name: "CRITIC-OMEGA", core: "NIRNAYA", role: "Adversarial Policy Auditor", status: "VERIFYING", permissions: ["policy:audit"], confidence: 0.92, runtimeMs: 190 },
      ],
      cores: {
        RAVANA: { id: "RAVANA", role: "Reasoning & Orchestration", status: "active", loadPct: 42 },
        PRAVAAH: { id: "PRAVAAH", role: "Telemetry / SCADA Ingestion", status: "active", loadPct: 65 },
        NIRIKSHAN: { id: "NIRIKSHAN", role: "Diagnostics & FFT Analytics", status: "active", loadPct: 78 },
        YANTRA: { id: "YANTRA", role: "Digital Twin & Asset Model", status: "active", loadPct: 55 },
        "VAYU-1": { id: "VAYU-1", role: "Wind & Aero Intelligence", status: "active", loadPct: 30 },
        SMRITI: { id: "SMRITI", role: "Memory Fabric", status: "active", loadPct: 22 },
        SETU: { id: "SETU", role: "Tools / MCP / Terminals", status: "active", loadPct: 15 },
        DRISHTI: { id: "DRISHTI", role: "Vision & Multimodal Core", status: "idle", loadPct: 0 },
        CHAKRA: { id: "CHAKRA", role: "Optimization & Recommendation", status: "active", loadPct: 35 },
        NIRNAYA: { id: "NIRNAYA", role: "Verification & Decision Gate", status: "active", loadPct: 50 },
      },
      models: [
        { name: "llama-3.3-70b-versatile", provider: "groq", tier: "fast_analytical", active: true, latencyMs: 240, errorRate: 0.0 },
        { name: "gemini-2.5-flash", provider: "google", tier: "multimodal_verifier", active: true, latencyMs: 380, errorRate: 0.0 },
      ],
      tools: [
        { id: "fft-radix2", name: "Cooley-Tukey Radix-2 FFT", sandbox: "safe_read", status: "completed" },
        { id: "pbnn-surrogate", name: "PBNN Linear-Gaussian Surrogate", sandbox: "safe_read", status: "completed" },
        { id: "ephemeral-terminal", name: "Sandboxed Terminal", sandbox: "isolated", status: "idle" },
      ],
      memory: [
        { id: "mem-001", type: "procedural", title: "ISO 10816-3 Class III Vibration Standard", content: "Vibration threshold > 7.1 mm/s is Warning, > 11.2 mm/s is Critical trip.", source: "ISO Technical Committee 108", verified: true, confidence: 1.0, assetScope: "WTG", createdAt: Date.now() - 86400_000 * 30 },
        { id: "mem-002", type: "episodic", title: "WTG-04 Bearing Inspection Report", content: "Inner-race micro-pitting observed during maintenance cycle 7 days ago.", source: "SMRITI Maintenance Ledger", verified: true, confidence: 0.95, assetScope: "WTG-04", createdAt: Date.now() - 86400_000 * 7 },
      ],
      simulations: {
        activeScenario: "B",
        scenarios,
        causalTimeline,
        timelineScrubIndex: 3,
      },
      evidence: [
        { id: "ev-001", claim: "High vibration amplitude 8.4 mm/s exceeds ISO 10816 Warning threshold", source: "PRAVAAH:scada:WTG-04", category: "telemetry", quality: 0.95, verified: true, provenance: "Acc-03 Accelerometer" },
        { id: "ev-002", claim: "89.3 Hz peak matches outer race ball pass frequency (BPFO)", source: "NIRIKSHAN:fft", category: "spectral", quality: 0.92, verified: true, provenance: "256 Hz Cooley-Tukey Spectral Pass" },
        { id: "ev-003", claim: "15% speed derate stabilizes temperature drop by -14.5 K", source: "YANTRA:world_model", category: "simulation", quality: 0.94, verified: true, provenance: "PBNN Kinematic Surrogate Model" },
      ],
      decisions: {
        state: "RECOMMEND",
        summary: "Diagnostic reasoning and simulation indicate optimal mitigation is 15% speed/power derating on WTG-04.",
        reasoning: [
          "89.3 Hz spectral harmonic matches outer-race ball pass frequency (BPFO) under 1500 RPM shaft rotation.",
          "World model counterfactual simulation demonstrates that a 15% derate drops vibration to 6.3 mm/s and temperature by -14.5 K.",
          "Controlled adversarial critique evaluated 3P blade-pass aerodynamic excitation and confirmed bearing defect predominance.",
        ],
        proposedActions: [
          { target: "WTG-04", action: "guarded_derate", risk: "medium", parameters: { deratePct: 15, targetRpm: 1275 } },
        ],
        approvalRequired: true,
        approvalToken: "appr_wtg04_derate_15pct",
      },
      policies: {
        autonomyLevel: "L2",
        safetyInterlocksIntact: true,
        prohibitedActions: ["override_e_stop", "bypass_thermal_cutoff", "force_unbounded_pitch"],
      },
      approvals: {
        pendingToken: "appr_wtg04_derate_15pct",
        actionPending: "Derate WTG-04 by 15% to 1275 RPM",
      },
      uncertainty: {
        confidence: 94,
        epistemicUncertainty: "low",
        dataQuality: 92,
        oodRisk: "low",
        modelAgreementPct: 96,
        evidenceCoveragePct: 91,
      },
      audit: {
        totalEvents: 42,
        lastCheckedAt: Date.now(),
        systemHealth: "READY",
      },
    };
  }

  public getState(): AetherisState {
    return this.state;
  }

  public setFocusedComponent(compId: string | null): AetherisState {
    this.state.assets.focusedComponent = compId;
    return this.state;
  }

  public selectScenario(scenarioId: "A" | "B" | "C" | "D"): AetherisState {
    this.state.simulations.activeScenario = scenarioId;
    return this.state;
  }

  public scrubTimeline(index: number): AetherisState {
    this.state.simulations.timelineScrubIndex = index;
    return this.state;
  }

  public approveAction(token: string, approver = "operator"): { ok: boolean; state: AetherisState } {
    if (this.state.approvals.pendingToken === token) {
      this.state.approvals.approvedAt = Date.now();
      this.state.approvals.approvedBy = approver;
      this.state.approvals.pendingToken = undefined;
      this.state.decisions.state = "EXECUTE";
      this.state.decisions.summary = `Action [${this.state.approvals.actionPending}] approved by ${approver} and dispatched.`;
      return { ok: true, state: this.state };
    }
    return { ok: false, state: this.state };
  }
}

export const canonicalState = new CanonicalStateFabric();
