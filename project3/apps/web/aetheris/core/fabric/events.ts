/**
 * Event Fabric — AETHERIS v2
 *
 * Central typed event bus and real-time event distribution stream.
 * Everything important produces an auditable event with Motion Priority:
 * P0 (Safety) > P1 (Critical anomaly) > P2 (Agent execution) >
 * P3 (Phase transition) > P4 (Data update) > P5 (Navigation) > P6 (Decorative).
 */
import { randomBytes } from "node:crypto";
import type { AetherisEvent, EventCategory, EventType, MotionPriority } from "./types";

type EventListener = (event: AetherisEvent) => void;

class CentralEventFabric {
  private buffer: AetherisEvent[] = [];
  private maxBufferSize = 5000;
  private listeners: Set<EventListener> = new Set();

  constructor() {
    this.seedInitialEvents();
  }

  private seedInitialEvents(): void {
    this.emit({
      type: "mission.created",
      category: "mission",
      priority: "P3",
      sourceId: "mission-root",
      payload: { title: "WTG-04 Gearbox Diagnosis", objective: "Analyze high vibration anomaly" },
    });

    this.emit({
      type: "telemetry.received",
      category: "telemetry",
      priority: "P4",
      sourceId: "sensor-vib-acc3",
      targetId: "core-pravaah",
      payload: { channel: "vib_bearing_mms", value: 8.4, unit: "mm/s", rpm: 1500 },
      visualAction: { motionType: "data_particle", fromNodeId: "sensor-vib-acc3", toNodeId: "core-pravaah" },
    });

    this.emit({
      type: "anomaly.detected",
      category: "anomaly",
      priority: "P1",
      sourceId: "core-pravaah",
      targetId: "core-nirikshan",
      payload: { channel: "vib_bearing_mms", currentVal: 8.4, thresholdVal: 7.1, severity: "warning" },
      visualAction: { motionType: "signal_wave", fromNodeId: "core-pravaah", toNodeId: "core-nirikshan", color: "#f87171" },
    });

    this.emit({
      type: "agent.spawned",
      category: "agent",
      priority: "P2",
      sourceId: "core-ravana",
      targetId: "agent-vib-alpha",
      payload: { agentId: "agent-vib-alpha", name: "VIB-ALPHA", role: "Spectral Harmonic Evaluator" },
      visualAction: { motionType: "materialize", fromNodeId: "core-ravana", toNodeId: "agent-vib-alpha" },
    });

    this.emit({
      type: "verification.passed",
      category: "verification",
      priority: "P0",
      sourceId: "core-nirnaya",
      payload: { status: "VERIFIED", dimensionsPassed: 8, totalDimensions: 8 },
      visualAction: { motionType: "verification_pulse", color: "#ffffff" },
    });
  }

  public emit(params: {
    type: EventType;
    category: EventCategory;
    priority: MotionPriority;
    sourceId: string;
    targetId?: string;
    payload: Record<string, unknown>;
    visualAction?: AetherisEvent["visualAction"];
  }): AetherisEvent {
    const event: AetherisEvent = {
      id: `evt_${Date.now().toString(36)}_${randomBytes(3).toString("hex")}`,
      type: params.type,
      category: params.category,
      timestamp: Date.now(),
      priority: params.priority,
      sourceId: params.sourceId,
      targetId: params.targetId,
      payload: params.payload,
      visualAction: params.visualAction,
    };

    this.buffer.push(event);
    if (this.buffer.length > this.maxBufferSize) {
      this.buffer.shift();
    }

    // Notify listeners
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (err) {
        console.error("Event listener error:", err);
      }
    }

    return event;
  }

  public subscribe(listener: EventListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  public getRecentEvents(limit = 50, filterCategory?: EventCategory): AetherisEvent[] {
    let list = [...this.buffer].reverse();
    if (filterCategory) {
      list = list.filter((e) => e.category === filterCategory);
    }
    return list.slice(0, limit);
  }

  public getEventCount(): number {
    return this.buffer.length;
  }
}

export const eventFabric = new CentralEventFabric();
