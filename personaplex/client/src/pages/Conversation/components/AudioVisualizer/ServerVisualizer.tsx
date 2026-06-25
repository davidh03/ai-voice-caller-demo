import { FC, RefObject, useCallback, useEffect, useRef, useState } from "react";
import { useSocketContext } from "../../SocketContext";
import { type ThemeType } from "../../hooks/useSystemTheme";

type AudioVisualizerProps = {
  analyser: AnalyserNode | null;
  parent: RefObject<HTMLElement>;
  theme: ThemeType;
};

const BAR_COUNT = 28;
const BAR_COLORS = ["#3551F2", "#4a63f5", "#6079f7", "#7a90f9", "#3551F2"];

export const ServerVisualizer: FC<AudioVisualizerProps> = ({ analyser, parent }) => {
  const { socketStatus } = useSocketContext();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const requestRef = useRef<number | null>(null);
  const [isTalking, setIsTalking] = useState(false);
  const talkingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const smoothedBars = useRef<number[]>(new Array(BAR_COUNT).fill(0));

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
      // Map bar index to frequency bin with slight curve (more interesting mid-range)
      const binIndex = Math.floor((i / BAR_COUNT) * (freqData.length * 0.6));
      const raw = freqData[binIndex] ?? 0;
      const normalized = raw / 255;

      // Smooth out
      smoothedBars.current[i] = smoothedBars.current[i] * 0.75 + normalized * 0.25;
      totalEnergy += smoothedBars.current[i];

      const barH = socketStatus === "connected"
        ? Math.max(4, smoothedBars.current[i] * maxH)
        : 4;

      const x = gap + i * (barW + gap);
      const y = (H - barH) / 2;

      const colorIndex = Math.floor((smoothedBars.current[i] * (BAR_COLORS.length - 1)));
      const color = BAR_COLORS[Math.min(colorIndex, BAR_COLORS.length - 1)];

      // Glow effect when active
      if (smoothedBars.current[i] > 0.15) {
        ctx.shadowBlur = 8;
        ctx.shadowColor = "#3551F2";
      } else {
        ctx.shadowBlur = 0;
      }

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

      const alpha = socketStatus === "connected" ? 0.25 + smoothedBars.current[i] * 0.75 : 0.2;
      ctx.fillStyle = color + Math.round(alpha * 255).toString(16).padStart(2, "0");
      ctx.fill();
    }

    ctx.shadowBlur = 0;

    // Detect talking
    const avgEnergy = totalEnergy / BAR_COUNT;
    if (avgEnergy > 0.05 && socketStatus === "connected") {
      if (talkingTimer.current) clearTimeout(talkingTimer.current);
      setIsTalking(true);
      talkingTimer.current = setTimeout(() => setIsTalking(false), 600);
    }

    requestRef.current = requestAnimationFrame(draw);
  }, [analyser, socketStatus]);

  useEffect(() => {
    requestRef.current = requestAnimationFrame(draw);
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
      if (talkingTimer.current) clearTimeout(talkingTimer.current);
    };
  }, [draw]);

  // Resize canvas to fill parent
  const [size, setSize] = useState({ w: 280, h: 100 });
  useEffect(() => {
    const update = () => {
      if (parent.current) {
        setSize({
          w: parent.current.clientWidth || 280,
          h: 100,
        });
      }
    };
    update();
    const ro = new ResizeObserver(update);
    if (parent.current) ro.observe(parent.current);
    return () => ro.disconnect();
  }, [parent]);

  return (
    <div className="w-full flex flex-col items-center gap-2">
      {/* Talking label */}
      <div className="flex items-center gap-2 h-5">
        {socketStatus === "connected" && isTalking ? (
          <span className="flex items-center gap-1.5 text-xs font-semibold text-[#3551F2]">
            <span className="flex gap-0.5 items-end h-3">
              {[0, 1, 2].map(i => (
                <span
                  key={i}
                  className="w-0.5 bg-[#3551F2] rounded-full animate-bounce"
                  style={{
                    height: `${8 + i * 3}px`,
                    animationDelay: `${i * 0.1}s`,
                    animationDuration: "0.6s",
                  }}
                />
              ))}
            </span>
            AI is speaking
          </span>
        ) : socketStatus === "connected" ? (
          <span className="text-xs text-gray-400">AI is listening…</span>
        ) : (
          <span className="text-xs text-gray-300">Waiting for connection</span>
        )}
      </div>

      {/* Waveform canvas */}
      <canvas
        ref={canvasRef}
        width={size.w}
        height={size.h}
        className="w-full rounded-xl bg-[#f5f7ff]"
        style={{ height: "100px" }}
      />
    </div>
  );
};
