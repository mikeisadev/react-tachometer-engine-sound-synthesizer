import { useState, useEffect, useRef, useCallback } from "react";
import * as Tone from "tone";
import EngineAudio from './classes/EngineAudio'
import { ENGINE_CONFIG, calcCrankFreq, calcFiringFreq } from "./utils/engine";


// ─────────────────────────────────────────────────────
// TACHOMETER SVG
// ─────────────────────────────────────────────────────
function Tachometer({ rpm, maxRPM }) {
  const startAngle = -225;
  const endAngle = 45;
  const totalArc = endAngle - startAngle;
  const angle = startAngle + (rpm / maxRPM) * totalArc;
  const redlineStart = startAngle + (4500 / maxRPM) * totalArc;

  const polar = (cx, cy, r, deg) => {
    const rad = (deg * Math.PI) / 180;
    return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
  };

  const arc = (cx, cy, r, s, e) => {
    const ps = polar(cx, cy, r, s);
    const pe = polar(cx, cy, r, e);
    return `M ${ps.x} ${ps.y} A ${r} ${r} 0 ${e - s > 180 ? 1 : 0} 1 ${pe.x} ${pe.y}`;
  };

  const ticks = [];
  for (let i = 0; i <= maxRPM; i += 500) {
    const a = startAngle + (i / maxRPM) * totalArc;
    const major = i % 1000 === 0;
    const inner = polar(150, 150, major ? 105 : 112, a);
    const outer = polar(150, 150, 125, a);
    ticks.push(
      <line key={`t${i}`}
        x1={inner.x} y1={inner.y} x2={outer.x} y2={outer.y}
        stroke={i >= 4500 ? "#ef4444" : "#94a3b8"}
        strokeWidth={major ? 2.5 : 1} strokeLinecap="round"
      />
    );
    if (major) {
      const lbl = polar(150, 150, 92, a);
      ticks.push(
        <text key={`l${i}`} x={lbl.x} y={lbl.y}
          textAnchor="middle" dominantBaseline="central"
          fill={i >= 5000 ? "#ef4444" : "#cbd5e1"}
          fontSize="11" fontWeight={i >= 5000 ? "700" : "400"}
          style={{ fontFamily: "monospace" }}
        >{i / 1000}</text>
      );
    }
  }

  const tip = polar(150, 150, 108, angle);
  const b1 = polar(150, 150, 6, angle - 90);
  const b2 = polar(150, 150, 6, angle + 90);
  const tail = polar(150, 150, 20, angle + 180);

  return (
    <svg viewBox="0 0 300 300" style={{ width: "100%", maxWidth: 280, display: "block", margin: "0 auto" }}>
      <path d={arc(150, 150, 125, startAngle, endAngle)} fill="none" stroke="#1e293b" strokeWidth="14" strokeLinecap="round" />
      <path d={arc(150, 150, 125, redlineStart, endAngle)} fill="none" stroke="rgba(239,68,68,0.15)" strokeWidth="14" />
      <path d={arc(150, 150, 125, startAngle, Math.min(angle, endAngle))} fill="none"
        stroke={rpm > 4500 ? "#ef4444" : rpm > 3000 ? "#f59e0b" : "#22c55e"}
        strokeWidth="6" strokeLinecap="round"
      />
      {ticks}
      <polygon
        points={`${tip.x},${tip.y} ${b1.x},${b1.y} ${tail.x},${tail.y} ${b2.x},${b2.y}`}
        fill="#ef4444" style={{ filter: "drop-shadow(0 0 6px rgba(239,68,68,0.5))" }}
      />
      <circle cx="150" cy="150" r="8" fill="#334155" stroke="#475569" strokeWidth="2" />
      <text x="150" y="200" textAnchor="middle" fill="#f8fafc" fontSize="28" fontWeight="700"
        style={{ fontFamily: "monospace" }}>{Math.round(rpm)}</text>
      <text x="150" y="218" textAnchor="middle" fill="#64748b" fontSize="10"
        style={{ fontFamily: "monospace", letterSpacing: 2 }}>RPM</text>
    </svg>
  );
}

// ─────────────────────────────────────────────────────
// WAVEFORM VISUALIZER
// ─────────────────────────────────────────────────────
function WaveformVisualizer({ isRunning, rpm }) {
  const canvasRef = useRef(null);
  const animRef = useRef(null);
  const analyserRef = useRef(null);

  useEffect(() => {
    if (!isRunning) {
      if (animRef.current) cancelAnimationFrame(animRef.current);
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext("2d");
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.strokeStyle = "#334155";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, canvas.height / 2);
        ctx.lineTo(canvas.width, canvas.height / 2);
        ctx.stroke();
      }
      return;
    }

    const analyser = new Tone.Analyser("waveform", 512);
    Tone.getDestination().connect(analyser);
    analyserRef.current = analyser;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const w = canvas.width;
    const h = canvas.height;

    const draw = () => {
      animRef.current = requestAnimationFrame(draw);
      const values = analyser.getValue();
      ctx.clearRect(0, 0, w, h);

      const color = rpm > 4500 ? "#ef4444" : rpm > 3000 ? "#f59e0b" : "#22c55e";
      ctx.shadowBlur = 6;
      ctx.shadowColor = color;
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let i = 0; i < values.length; i++) {
        const x = (i / values.length) * w;
        const y = ((1 - values[i]) / 2) * h;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.shadowBlur = 0;
    };
    draw();

    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
      try { analyser.dispose(); } catch (e) {
        throw new Error(e);
      }
    };
  }, [isRunning, rpm]);

  return (
    <canvas ref={canvasRef} width={500} height={100}
      style={{
        width: "100%", height: 80, borderRadius: 8,
        background: "rgba(15,23,42,0.6)", border: "1px solid #1e293b",
      }}
    />
  );
}

// ─────────────────────────────────────────────────────
// FREQUENCY INFO
// ─────────────────────────────────────────────────────
function FrequencyInfo({ rpm }) {
  const f = calcFiringFreq(rpm);
  const c = calcCrankFreq(rpm);
  const items = [
    { label: "Crank", value: `${c.toFixed(1)} Hz`, desc: "Rotazione albero" },
    { label: "Firing", value: `${f.toFixed(1)} Hz`, desc: "1° ordine combustione" },
    { label: "2nd", value: `${(f * 2).toFixed(1)} Hz`, desc: "Scarico dominante" },
    { label: "4th", value: `${(f * 4).toFixed(1)} Hz`, desc: "Meccanica" },
  ];
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
      {items.map((it) => (
        <div key={it.label} style={{
          background: "rgba(15,23,42,0.6)", border: "1px solid #1e293b",
          borderRadius: 8, padding: "10px 12px",
        }}>
          <div style={{ fontSize: 10, color: "#64748b", fontFamily: "monospace", letterSpacing: 1, textTransform: "uppercase", marginBottom: 2 }}>{it.label}</div>
          <div style={{ fontSize: 16, color: "#f8fafc", fontFamily: "monospace", fontWeight: 700 }}>{it.value}</div>
          <div style={{ fontSize: 9, color: "#475569", marginTop: 2 }}>{it.desc}</div>
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────
// MAIN APP
// ─────────────────────────────────────────────────────
export default function EngineSynthApp() {
  const [isRunning, setIsRunning] = useState(false);
  const [rpm, setRpm] = useState(ENGINE_CONFIG.idleRPM);
  const [isLoading, setIsLoading] = useState(false);
  const [status, setStatus] = useState("SPENTO");
  const engineRef = useRef(null);

  const handleStart = useCallback(async () => {
    if (isRunning) {
      engineRef.current?.dispose();
      engineRef.current = null;
      setIsRunning(false);
      setStatus("SPENTO");
      setRpm(ENGINE_CONFIG.idleRPM);
      return;
    }

    setIsLoading(true);
    setStatus("AVVIO...");

    try {
      // Must be called directly in the click handler for Chrome autoplay policy
      await Tone.start();

      const engine = new EngineAudio();
      await engine.init();
      engineRef.current = engine;

      // Startup sequence: cranking → catch → idle
      engine.start();
      await new Promise((r) => setTimeout(r, 50));
      engine.setRPM(ENGINE_CONFIG.minRPM);
      await new Promise((r) => setTimeout(r, 300));
      engine.setRPM(700);
      await new Promise((r) => setTimeout(r, 200));
      engine.setRPM(900);
      await new Promise((r) => setTimeout(r, 200));
      engine.setRPM(1100);
      await new Promise((r) => setTimeout(r, 300));
      engine.setRPM(ENGINE_CONFIG.idleRPM);

      setRpm(ENGINE_CONFIG.idleRPM);
      setIsRunning(true);
      setStatus("IDLE");
    } catch (err) {
      console.error("Engine init error:", err);
      setStatus("ERRORE");
    } finally {
      setIsLoading(false);
    }
  }, [isRunning]);

  const handleRPMChange = useCallback((e) => {
    const v = Number(e.target.value);
    setRpm(v);
    engineRef.current?.setRPM(v);
    setStatus(v > 4500 ? "REDLINE!" : v > 3000 ? "ALTO" : v > 1200 ? "CRUISE" : "IDLE");
  }, []);

  useEffect(() => {
    return () => engineRef.current?.dispose();
  }, []);

  const accentColor = !isRunning ? "#475569" : rpm > 4500 ? "#ef4444" : "#22c55e";

  return (
    <div style={{
      minHeight: "100vh",
      background: "linear-gradient(145deg, #0f172a 0%, #020617 50%, #0f172a 100%)",
      color: "#f8fafc", fontFamily: "monospace",
      display: "flex", flexDirection: "column", alignItems: "center",
      padding: "24px 16px", gap: 20,
    }}>
      <div style={{ textAlign: "center" }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0, letterSpacing: -0.5, color: "#f8fafc" }}>
          ENGINE SYNTH
        </h1>
        <p style={{ fontSize: 10, color: "#475569", margin: "4px 0 0", letterSpacing: 3 }}>
          4 CILINDRI · 4 TEMPI · TONE.JS
        </p>
      </div>

      <div style={{
        display: "flex", alignItems: "center", gap: 8,
        padding: "6px 16px", background: "rgba(15,23,42,0.8)",
        border: `1px solid ${accentColor}`, borderRadius: 20, fontSize: 11, letterSpacing: 2,
      }}>
        <div style={{
          width: 8, height: 8, borderRadius: "50%", background: accentColor,
          boxShadow: isRunning ? `0 0 8px ${accentColor}` : "none",
        }} />
        <span style={{ color: isRunning ? "#f8fafc" : "#64748b" }}>{status}</span>
      </div>

      <Tachometer rpm={rpm} maxRPM={ENGINE_CONFIG.maxRPM} />

      <button onClick={handleStart} disabled={isLoading}
        style={{
          width: 72, height: 72, borderRadius: "50%",
          border: `3px solid ${isRunning ? "#ef4444" : "#22c55e"}`,
          background: isRunning ? "radial-gradient(circle, #1c1917, #0f172a)" : "radial-gradient(circle, #0f2918, #0f172a)",
          color: isRunning ? "#ef4444" : "#22c55e",
          fontSize: 10, fontWeight: 700, fontFamily: "monospace", letterSpacing: 1,
          cursor: isLoading ? "wait" : "pointer",
          boxShadow: `0 0 20px ${isRunning ? "rgba(239,68,68,0.2)" : "rgba(34,197,94,0.2)"}`,
        }}
      >
        {isLoading ? "..." : isRunning ? "STOP" : "START"}
      </button>

      <div style={{ width: "100%", maxWidth: 360, padding: "0 8px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: "#475569", marginBottom: 6, letterSpacing: 1 }}>
          <span>{ENGINE_CONFIG.minRPM}</span>
          <span>ACCELERATORE</span>
          <span>{ENGINE_CONFIG.maxRPM}</span>
        </div>
        <input type="range"
          min={ENGINE_CONFIG.minRPM} max={ENGINE_CONFIG.maxRPM} step={50}
          value={rpm} onChange={handleRPMChange} disabled={!isRunning}
          style={{
            width: "100%", height: 6, appearance: "none",
            background: isRunning ? "linear-gradient(90deg, #22c55e 0%, #f59e0b 60%, #ef4444 100%)" : "#1e293b",
            borderRadius: 3, outline: "none",
            cursor: isRunning ? "pointer" : "not-allowed",
            opacity: isRunning ? 1 : 0.4,
          }}
        />
      </div>

      <div style={{ width: "100%", maxWidth: 360 }}>
        <div style={{ fontSize: 9, color: "#475569", letterSpacing: 1, marginBottom: 6 }}>FORMA D'ONDA</div>
        <WaveformVisualizer isRunning={isRunning} rpm={rpm} />
      </div>

      <div style={{ width: "100%", maxWidth: 360 }}>
        <div style={{ fontSize: 9, color: "#475569", letterSpacing: 1, marginBottom: 6 }}>FREQUENZE ATTIVE</div>
        <FrequencyInfo rpm={rpm} />
      </div>

      <div style={{
        width: "100%", maxWidth: 360, background: "rgba(15,23,42,0.4)",
        border: "1px solid #1e293b", borderRadius: 8, padding: 12,
        fontSize: 10, color: "#64748b", lineHeight: 1.8,
      }}>
        <div style={{ fontWeight: 700, color: "#94a3b8", marginBottom: 4, letterSpacing: 1, fontSize: 9 }}>
          ARCHITETTURA SYNTH
        </div>
        <div><span style={{ color: "#22c55e" }}>■</span> Combustione (sawtooth → LP → distortion)</div>
        <div><span style={{ color: "#3b82f6" }}>■</span> Sub-bass (sine → LP @120Hz)</div>
        <div><span style={{ color: "#f59e0b" }}>■</span> Scarico 2° ordine (sawtooth → BP)</div>
        <div><span style={{ color: "#ef4444" }}>■</span> Meccanica 4° ordine (square → BP)</div>
        <div><span style={{ color: "#a855f7" }}>■</span> Intake noise (pink → BP)</div>
        <div><span style={{ color: "#06b6d4" }}>■</span> Valve train (white → HP → BP)</div>
      </div>

      <style>{`
        input[type="range"]::-webkit-slider-thumb {
          appearance: none; width: 20px; height: 20px; border-radius: 50%;
          background: #f8fafc; border: 2px solid #475569; cursor: pointer;
          box-shadow: 0 0 8px rgba(248,250,252,0.3);
        }
        input[type="range"]::-moz-range-thumb {
          width: 20px; height: 20px; border-radius: 50%;
          background: #f8fafc; border: 2px solid #475569; cursor: pointer;
        }
      `}</style>
    </div>
  );
}