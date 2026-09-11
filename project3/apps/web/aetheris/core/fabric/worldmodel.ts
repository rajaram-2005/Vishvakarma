/**
 * World Model & Counterfactual Lab Engine — AETHERIS v2
 *
 * Implements:
 * - Scenarios A, B, C, D with future state trajectory scrubbing
 * - Clear distinction between OBSERVED, PREDICTED, SIMULATED, and VERIFIED
 * - Causal Replay Engine (Cause → Effect sequence)
 */
import type { CausalEvent, CounterfactualScenario } from "./types";

export class WorldModelEngine {
  /**
   * Generates the 4 canonical scenarios for WTG-04 Gearbox Mitigation
   */
  public static getCanonicalScenarios(): CounterfactualScenario[] {
    const timeSteps = [0, 5, 10, 15, 20, 30, 45, 60];

    // Scenario A: Do Nothing (Full Load 1500 RPM)
    const trajA = timeSteps.map((t) => ({
      tMin: t,
      vib: Number((8.4 + (t / 60) * 2.8).toFixed(2)),
      tempK: Number((338.2 + (t / 60) * 7.5).toFixed(1)),
      powerKW: 1850,
    }));

    // Scenario B: 15% Derate (1275 RPM)
    const trajB = timeSteps.map((t) => ({
      tMin: t,
      vib: Number((8.4 - (t / 60) * 2.1).toFixed(2)),
      tempK: Number((338.2 - (t / 60) * 14.5).toFixed(1)),
      powerKW: 1572,
    }));

    // Scenario C: Controlled Shutdown (0 RPM)
    const trajC = timeSteps.map((t) => ({
      tMin: t,
      vib: Number((8.4 * Math.exp(-t / 8) + 0.2).toFixed(2)),
      tempK: Number((338.2 * Math.exp(-t / 30) + (1 - Math.exp(-t / 30)) * 295.0).toFixed(1)),
      powerKW: Number((1850 * Math.exp(-t / 4)).toFixed(0)),
    }));

    // Scenario D: Cooling Boost (+15% Oil Flow)
    const trajD = timeSteps.map((t) => ({
      tMin: t,
      vib: 8.4,
      tempK: Number((338.2 - (t / 60) * 9.2).toFixed(1)),
      powerKW: 1850,
    }));

    return [
      {
        id: "A",
        name: "Scenario A: Do Nothing (Maintain 1500 RPM)",
        action: "Maintain current unmitigated operational state",
        deratePct: 0,
        prediction: {
          vibration_mms: 11.2,
          temperature_K: 345.7,
          power_kW: 1850,
          health_score: 0.52,
          risk_level: "high",
        },
        confidence: 88,
        uncertainty: "low",
        operationalRisk: "high",
        energyImpactPct: 0.0,
        equipmentLifeImpactYears: -2.4,
        validationState: "PREDICTED",
        trajectory: trajA,
      },
      {
        id: "B",
        name: "Scenario B: 15% Speed Derate (1275 RPM)",
        action: "Reduce aerodynamic rotor torque and rotational speed by 15%",
        deratePct: 15,
        prediction: {
          vibration_mms: 6.3,
          temperature_K: 323.7,
          power_kW: 1572,
          health_score: 0.89,
          risk_level: "low",
        },
        confidence: 94,
        uncertainty: "low",
        operationalRisk: "low",
        energyImpactPct: -15.0,
        equipmentLifeImpactYears: +1.8,
        validationState: "SIMULATED",
        trajectory: trajB,
      },
      {
        id: "C",
        name: "Scenario C: Controlled Emergency Shutdown",
        action: "Full aerodynamic blade pitch to feather and mechanical brake trip",
        deratePct: 100,
        prediction: {
          vibration_mms: 0.2,
          temperature_K: 295.0,
          power_kW: 0,
          health_score: 0.98,
          risk_level: "low",
        },
        confidence: 98,
        uncertainty: "low",
        operationalRisk: "low",
        energyImpactPct: -100.0,
        equipmentLifeImpactYears: +3.0,
        validationState: "SIMULATED",
        trajectory: trajC,
      },
      {
        id: "D",
        name: "Scenario D: Active Cooling Boost (+15% Oil Flow)",
        action: "Increase lubrication pump duty cycle by 15% without derating speed",
        deratePct: 0,
        prediction: {
          vibration_mms: 8.4,
          temperature_K: 329.0,
          power_kW: 1850,
          health_score: 0.71,
          risk_level: "medium",
        },
        confidence: 82,
        uncertainty: "medium",
        operationalRisk: "medium",
        energyImpactPct: -0.8,
        equipmentLifeImpactYears: +0.4,
        validationState: "SIMULATED",
        trajectory: trajD,
      },
    ];
  }

  /**
   * Generates the Causal Replay Timeline (Cause → Effect)
   */
  public static getCausalTimeline(): CausalEvent[] {
    return [
      {
        step: 1,
        title: "Wind Inflow Surge",
        cause: "Atmospheric wind gradient speed increased from 8.5 m/s to 12.4 m/s",
        effect: "Rotor thrust and aerodynamic torque increased by 38%",
        severity: "info",
        assetComponent: "WTG-04.Rotor",
        metric: "wind_speed_ms",
        observedValue: "12.4 m/s",
      },
      {
        step: 2,
        title: "Drivetrain Mechanical Stress",
        cause: "High shaft torque transmission into 2-stage planetary gearbox",
        effect: "Radial loading on main high-speed bearing increased beyond 45 kN",
        severity: "info",
        assetComponent: "WTG-04.Drivetrain",
        metric: "shaft_torque_kNm",
        observedValue: "840 kNm",
      },
      {
        step: 3,
        title: "Vibration Amplitude Rise",
        cause: "High mechanical stress over micro-pitted outer raceway",
        effect: "Accelerometers recorded RMS vibration surge from 4.2 to 8.4 mm/s",
        severity: "warn",
        assetComponent: "WTG-04.Gearbox",
        metric: "vib_bearing_mms",
        observedValue: "8.4 mm/s (>7.1 Warning)",
      },
      {
        step: 4,
        title: "Bearing Fault Harmonic (BPFO)",
        cause: "Ball elements impacting damaged outer race at 1500 RPM shaft speed",
        effect: "NIRIKSHAN FFT resolved sharp harmonic signature at 89.3 Hz",
        severity: "critical",
        assetComponent: "WTG-04.Bearings",
        metric: "dominant_freq_hz",
        observedValue: "89.3 Hz (BPFO)",
      },
      {
        step: 5,
        title: "Thermal Dissipation Lag",
        cause: "Increased friction in damaged bearing raceway",
        effect: "Gearbox oil sump temperature rose to 338.2 K (65.05 °C)",
        severity: "warn",
        assetComponent: "WTG-04.Gearbox",
        metric: "gearbox_temp_K",
        observedValue: "338.2 K",
      },
      {
        step: 6,
        title: "Anomaly Trigger & Incident Command",
        cause: "Dual threshold breach (vibration > 7.1 mm/s and BPFO match)",
        effect: "Aetheris Outer Control Plane initiated Phase-Gated incident investigation",
        severity: "critical",
        assetComponent: "WTG-04",
        metric: "anomaly_score",
        observedValue: "0.88",
      },
    ];
  }
}
