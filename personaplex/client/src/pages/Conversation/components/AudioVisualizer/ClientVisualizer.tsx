import { FC, RefObject, useCallback, useEffect, useRef, useState } from "react";
import { type ThemeType } from "../../hooks/useSystemTheme";

type AudioVisualizerProps = {
  analyser: AnalyserNode | null;
  parent: RefObject<HTMLElement>;
  theme: ThemeType;
};

const BAR_COUNT = 28;
const MIC_COLOR = "#6B7280"; // gray when quiet
const MIC_COLOR_ACTIVE = "#060A39"; // navy when speaking

export const ClientVisualizer: FC<AudioVisualizerProps> = ({ analyser, parent }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const requestRef = useRef<number | null>(null);
  const smoothedBars = useRef<number[]>(new Array(BAR_COUNT).fill(0));
  const [isActive, setIsActive] = useState(false);
  const activeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const W = canvas.width;
    const H = canvas.height;
    ctx.clearRect(0, 0, W, H);

    const freqData = new Uint8Array(analyser ? analyser.frequencyBinCount : 0);
    if (analyser) {
      analyser.smoothingTimeConstant = 0.8;
      analyser.getByteFrequencyData(freqData);
    }

    const gap = Math.max(2, Math.floor(W / (BAR_COUNT * 5)));
    const barW = Math.floor((W - gap * (BAR_COUNT + 1)) / BAR_COUNT);
    const maxH = H - 8;

    let totalEnergy = 0;

    for (let i = 0; i < BAR_COUNT; i++) {
      const binIndex = Math.floor((i / BAR_COUNT) * (freqData.length * 0.6));
      const raw = freqData[binIndex] ?? 0;
      const normalized = raw / 255;

      smoothedBars.current[i] = smoothedBars.current[i] * 0.75 + normalized * 0.25;
      totalEnergy += smoothedBars.current[i];

      const barH = Math.max(3, smoothedBars.current[i] * maxH);
      const x = gap + i * (barW + gap);
      const y = (H - barH) / 2;

      const isLoud = smoothedBars.current[i] > 0.15;
      const color = isLoud ? MIC_COLOR_ACTIVE : MIC_COLOR;
      const alpha = 0.2 + smoothedBars.current[i] * 0.8;

      const radius = Math.min(barW / 2, 4);
      ctx.beginPath();
      ctx.moveTo(x + radius, y);
      ctx.lineTo(x + barW - radius, y);
      ctx.quadraticCurveTo(x + barW, y, x + barW, y + radius);
      ctx.lineTo(x + barW, y + barH - radius);
      ctx.quadraticCurveTo(x + barW, y + barH, x + barW - radius, y + barH);
      ctx.lineTo(x + radius, y + barH);
      ctx.quadraticCurveTo(x, y + barH, x, y + barH - radius);
      ctx.lineTo(x, y + radius);
      ctx.quadraticCurveTo(x, y, x + radius, y);
      ctx.closePath();

      ctx.fillStyle = color + Math.round(alpha * 255).toString(16).padStart(2, "0");
      ctx.fill();
    }

    const avgEnergy = totalEnergy / BAR_COUNT;
    if (avgEnergy > 0.04 && analyser) {
      if (activeTimer.current) clearTimeout(activeTimer.current);
      setIsActive(true);
      activeTimer.current = setTimeout(() => setIsActive(false), 500);
    }

    requestRef.current = requestAnimationFrame(draw);
  }, [analyser]);

  useEffect(() => {
    requestRef.current = requestAnimationFrame(draw);
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
      if (activeTimer.current) clearTimeout(activeTimer.current);
    };
  }, [draw]);

  const [size, setSize] = useState({ w: 280, h: 72 });
  useEffect(() => {
    const update = () => {
      if (parent.current) {
        setSize({ w: parent.current.clientWidth || 280, h: 72 });
      }
    };
    update();
    const ro = new ResizeObserver(update);
    if (parent.current) ro.observe(parent.current);
    return () => ro.disconnect();
  }, [parent]);

  return (
    <div className="w-full flex flex-col items-center gap-2">
      <div className="flex items-center gap-2 h-5">
        {isActive ? (
          <span className="flex items-center gap-1.5 text-xs font-semibold text-[#060A39]">
            <span className="flex gap-0.5 items-end h-3">
              {[0, 1, 2].map(i => (
                <span
                  key={i}
                  className="w-0.5 bg-[#060A39] rounded-full animate-bounce"
                  style={{
                    height: `${8 + i * 3}px`,
                    animationDelay: `${i * 0.12}s`,
                    animationDuration: "0.55s",
                  }}
                />
              ))}
            </span>
            You are speaking
          </span>
        ) : (
          <span className="text-xs text-gray-400">Your microphone</span>
        )}
      </div>
      <canvas
        ref={canvasRef}
        width={size.w}
        height={size.h}
        className="w-full rounded-xl bg-gray-50"
        style={{ height: "72px" }}
      />
    </div>
  );
};
