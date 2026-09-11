/**
 * Master Intelligence Graph — AETHERIS v2
 *
 * Implements the unified graph connecting:
 * MISSIONS, CORES, AGENTS, MODELS, TOOLS, ASSETS, SENSORS, MEMORIES, SIMULATIONS, EVIDENCE, DECISIONS.
 *
 * Every relationship is a strictly typed SemanticEdge:
 * DEPENDS_ON | USES | GENERATED_BY | VERIFIED_BY | SUPPORTED_BY | CONTRADICTED_BY |
 * PREDICTS | OBSERVES | CONTROLS | CONNECTED_TO | DERIVED_FROM | REQUIRES |
 * BLOCKED_BY | TRIGGERS | LEARNED_FROM
 */
import type { NetworkEdge, NetworkNode, SemanticEdgeType } from "./types";

export class MasterIntelligenceGraph {
  private nodes: Map<string, NetworkNode> = new Map();
  private edges: Map<string, NetworkEdge> = new Map();

  constructor() {
    this.seedCanonicalGraph();
  }

  /**
   * Seed the complete canonical Aetheris Master Graph
   */
  private seedCanonicalGraph(): void {
    // 1. Mission Node
    this.addNode({
      id: "mission-root",
      type: "MISSION",
      label: "Mission: WTG-04 Gearbox Diagnosis",
      sublabel: "Autonomous Anomaly Investigation",
      status: "active",
      cluster: "control",
      x: 600,
      y: 60,
      metadata: { priority: "high", asset: "WTG-04" },
    });

    // 2. The 10 Cores (names & roles preserved exactly)
    const coresData: Array<{ id: string; label: string; role: string; x: number; y: number }> = [
      { id: "core-ravana", label: "RAVANA", role: "Reasoning & Orchestration", x: 600, y: 180 },
      { id: "core-pravaah", label: "PRAVAAH", role: "Telemetry / SCADA Ingestion", x: 380, y: 280 },
      { id: "core-nirikshan", label: "NIRIKSHAN", role: "Diagnostics & FFT Analytics", x: 490, y: 350 },
      { id: "core-yantra", label: "YANTRA", role: "Digital Twin & Asset Model", x: 260, y: 360 },
      { id: "core-vayu", label: "VAYU-1", role: "Wind & Aero Intelligence", x: 380, y: 440 },
      { id: "core-smriti", label: "SMRITI", role: "Memory Fabric", x: 720, y: 280 },
      { id: "core-setu", label: "SETU", role: "Tools / MCP / Terminals", x: 840, y: 280 },
      { id: "core-drishti", label: "DRISHTI", role: "Vision & Multimodal Core", x: 960, y: 360 },
      { id: "core-chakra", label: "CHAKRA", role: "Optimization & Recommendation", x: 720, y: 440 },
      { id: "core-nirnaya", label: "NIRNAYA", role: "Verification & Decision Gate", x: 600, y: 520 },
    ];

    for (const c of coresData) {
      this.addNode({
        id: c.id,
        type: "CORE",
        label: c.label,
        sublabel: c.role,
        status: "active",
        cluster: "cores",
        x: c.x,
        y: c.y,
        metadata: { role: c.role },
      });
    }

    // 3. Physical Asset Hierarchy (Digital Reality)
    this.addNode({
      id: "asset-wtg04",
      type: "ASSET",
      label: "WTG-04 (2 MW WTG)",
      sublabel: "Active Turbine Asset",
      status: "warning",
      cluster: "assets",
      x: 160,
      y: 280,
      metadata: { ratedPowerKW: 2000, model: "Canonical 2 MW WTG" },
    });

    this.addNode({
      id: "comp-gearbox",
      type: "ASSET",
      label: "WTG-04.Gearbox",
      sublabel: "Planetary + 2-Stage Parallel",
      status: "critical",
      cluster: "assets",
      x: 160,
      y: 380,
      metadata: { ratio: 104.2, tempK: 338.2, vibMms: 8.4 },
    });

    this.addNode({
      id: "sensor-vib-acc3",
      type: "SENSOR",
      label: "Acc-03 Bearing Sensor",
      sublabel: "High-Freq Vibration (256 Hz)",
      status: "warning",
      cluster: "sensors",
      x: 160,
      y: 480,
      metadata: { channel: "vib_bearing_mms", currentVal: 8.4, thresholdVal: 7.1 },
    });

    // 4. Agents
    this.addNode({
      id: "agent-vib-alpha",
      type: "AGENT",
      label: "Agent: VIB-ALPHA",
      sublabel: "Spectral Harmonic Evaluator",
      status: "active",
      cluster: "agents",
      x: 500,
      y: 260,
      metadata: { core: "NIRIKSHAN", tier: "specialist" },
    });

    this.addNode({
      id: "agent-critic-omega",
      type: "AGENT",
      label: "Critic: OMEGA",
      sublabel: "Adversarial Policy Auditor",
      status: "active",
      cluster: "agents",
      x: 600,
      y: 430,
      metadata: { core: "NIRNAYA", tier: "critic" },
    });

    // 5. Models & Tools
    this.addNode({
      id: "model-llama70b",
      type: "MODEL",
      label: "Llama-3.3-70B",
      sublabel: "Fast Analytical Tier (Groq)",
      status: "verified",
      cluster: "infrastructure",
      x: 880,
      y: 180,
      metadata: { latencyMs: 240, provider: "groq" },
    });

    this.addNode({
      id: "tool-fft",
      type: "TOOL",
      label: "FFT Radix-2 Analyzer",
      sublabel: "Cooley-Tukey Engine",
      status: "verified",
      cluster: "tools",
      x: 880,
      y: 380,
      metadata: { sampleRateHz: 256, window: "hanning" },
    });

    // 6. Memory & Evidence
    this.addNode({
      id: "mem-iso10816",
      type: "MEMORY",
      label: "ISO-10816-3 Standard",
      sublabel: "Vibration Severity Rules",
      status: "verified",
      cluster: "memory",
      x: 760,
      y: 380,
      metadata: { warningLimit: 7.1, tripLimit: 11.2 },
    });

    this.addNode({
      id: "ev-bpfo-peak",
      type: "EVIDENCE",
      label: "89.3 Hz BPFO Peak",
      sublabel: "Outer Race Fault Signature",
      status: "verified",
      cluster: "evidence",
      x: 420,
      y: 540,
      metadata: { magnitudeMms: 8.4, rpm: 1500 },
    });

    // 7. Simulation & Decision
    this.addNode({
      id: "sim-scenario-b",
      type: "SIMULATION",
      label: "Scenario B: 15% Derate",
      sublabel: "PBNN Trajectory Forecast",
      status: "verified",
      cluster: "simulation",
      x: 480,
      y: 620,
      metadata: { projectedVib: 6.3, projectedTempK: 323.7 },
    });

    this.addNode({
      id: "decision-final",
      type: "DECISION",
      label: "Decision: 15% Guarded Derate",
      sublabel: "Human Approval Required",
      status: "active",
      cluster: "decision",
      x: 600,
      y: 640,
      metadata: { action: "set_operating_mode", deratePct: 15 },
    });

    // ==========================================
    // SEMANTIC TYPED EDGES
    // ==========================================
    this.addEdge("mission-root", "core-ravana", "CONTROLS", "Supervises orchestration");
    this.addEdge("core-ravana", "core-pravaah", "DEPENDS_ON", "Streams telemetry");
    this.addEdge("core-ravana", "core-nirikshan", "DEPENDS_ON", "Dispatches FFT analytics");
    this.addEdge("core-ravana", "core-smriti", "USES", "Memory retrieval");
    this.addEdge("core-ravana", "core-setu", "USES", "Tool execution");
    this.addEdge("core-ravana", "agent-vib-alpha", "GENERATED_BY", "Spawns agent");

    // Physical Reality to Cores
    this.addEdge("asset-wtg04", "comp-gearbox", "CONNECTED_TO", "Contains subsystem");
    this.addEdge("comp-gearbox", "sensor-vib-acc3", "CONNECTED_TO", "Monitored by");
    this.addEdge("core-pravaah", "sensor-vib-acc3", "OBSERVES", "Ingests 256Hz signal");
    this.addEdge("core-yantra", "comp-gearbox", "OBSERVES", "Wireframe twin mapping");

    // Telemetry Triggers & Diagnostics
    this.addEdge("sensor-vib-acc3", "core-nirikshan", "TRIGGERS", "8.4 mm/s threshold breach");
    this.addEdge("core-nirikshan", "tool-fft", "USES", "Cooley-Tukey spectral pass");
    this.addEdge("core-nirikshan", "ev-bpfo-peak", "GENERATED_BY", "Identifies 89.3 Hz harmonic");
    this.addEdge("ev-bpfo-peak", "mem-iso10816", "SUPPORTED_BY", "Exceeds 7.1 mm/s warning threshold");

    // World Model Simulation & Verification
    this.addEdge("core-yantra", "sim-scenario-b", "PREDICTS", "Future thermal & vib trajectory");
    this.addEdge("core-vayu", "sim-scenario-b", "SUPPORTED_BY", "Aerodynamic power curve derate");
    this.addEdge("agent-critic-omega", "ev-bpfo-peak", "VERIFIED_BY", "Audited against 3P harmonics");
    this.addEdge("core-nirnaya", "sim-scenario-b", "VERIFIED_BY", "Physical invariant checks passed");
    this.addEdge("core-nirnaya", "decision-final", "GENERATED_BY", "Synthesizes final recommendation");
    this.addEdge("decision-final", "asset-wtg04", "CONTROLS", "Guarded 15% derate actuation");
  }

  public addNode(node: NetworkNode): void {
    this.nodes.set(node.id, node);
  }

  public getNode(id: string): NetworkNode | null {
    return this.nodes.get(id) ?? null;
  }

  public getAllNodes(): NetworkNode[] {
    return Array.from(this.nodes.values());
  }

  public addEdge(source: string, target: string, type: SemanticEdgeType, label?: string): NetworkEdge {
    const edgeId = `edge_${source}_${target}_${type}`;
    const edge: NetworkEdge = {
      id: edgeId,
      source,
      target,
      type,
      label,
      weight: 1.0,
      active: true,
      status: "normal",
    };
    this.edges.set(edgeId, edge);
    return edge;
  }

  public getAllEdges(): NetworkEdge[] {
    return Array.from(this.edges.values());
  }

  /**
   * Graph Intelligence: "Show me everything connected to this"
   * Returns all directly and second-degree connected nodes and typed edges.
   */
  public getFocusedView(nodeId: string): {
    focusedNode: NetworkNode | null;
    connectedNodes: NetworkNode[];
    connectedEdges: NetworkEdge[];
    diagnostics: {
      sensors: NetworkNode[];
      cores: NetworkNode[];
      agents: NetworkNode[];
      evidence: NetworkNode[];
      simulations: NetworkNode[];
      decisions: NetworkNode[];
    };
  } {
    const focused = this.nodes.get(nodeId) ?? null;
    if (!focused) {
      return {
        focusedNode: null,
        connectedNodes: [],
        connectedEdges: [],
        diagnostics: { sensors: [], cores: [], agents: [], evidence: [], simulations: [], decisions: [] },
      };
    }

    const connectedNodeIds = new Set<string>();
    connectedNodeIds.add(nodeId);
    const connectedEdges: NetworkEdge[] = [];

    // Degree 1 traversal
    for (const edge of this.edges.values()) {
      if (edge.source === nodeId) {
        connectedNodeIds.add(edge.target);
        connectedEdges.push(edge);
      } else if (edge.target === nodeId) {
        connectedNodeIds.add(edge.source);
        connectedEdges.push(edge);
      }
    }

    // Degree 2 traversal for high-relevance nodes
    const degree1 = Array.from(connectedNodeIds);
    for (const d1 of degree1) {
      for (const edge of this.edges.values()) {
        if (edge.source === d1 && !connectedNodeIds.has(edge.target)) {
          connectedNodeIds.add(edge.target);
          connectedEdges.push(edge);
        } else if (edge.target === d1 && !connectedNodeIds.has(edge.source)) {
          connectedNodeIds.add(edge.source);
          connectedEdges.push(edge);
        }
      }
    }

    const connectedNodes = Array.from(connectedNodeIds)
      .map((id) => this.nodes.get(id))
      .filter((n): n is NetworkNode => n !== undefined);

    const diagnostics = {
      sensors: connectedNodes.filter((n) => n.type === "SENSOR"),
      cores: connectedNodes.filter((n) => n.type === "CORE"),
      agents: connectedNodes.filter((n) => n.type === "AGENT"),
      evidence: connectedNodes.filter((n) => n.type === "EVIDENCE"),
      simulations: connectedNodes.filter((n) => n.type === "SIMULATION"),
      decisions: connectedNodes.filter((n) => n.type === "DECISION"),
    };

    return {
      focusedNode: focused,
      connectedNodes,
      connectedEdges,
      diagnostics,
    };
  }

  /**
   * Pulse an edge for real-time visual motion (e.g. data particle or signal wave)
   */
  public pulseEdge(edgeId: string, status: NetworkEdge["status"] = "pulsing"): void {
    const e = this.edges.get(edgeId);
    if (e) {
      e.status = status;
    }
  }

  /**
   * Update node status (e.g. verified, critical, warning)
   */
  public updateNodeStatus(nodeId: string, status: NetworkNode["status"]): void {
    const n = this.nodes.get(nodeId);
    if (n) {
      n.status = status;
    }
  }
}

// Global master graph singleton
export const masterGraph = new MasterIntelligenceGraph();
