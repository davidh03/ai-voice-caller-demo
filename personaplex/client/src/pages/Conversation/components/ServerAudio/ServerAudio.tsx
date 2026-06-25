import { FC, useRef } from "react";
import { AudioStats, useServerAudio } from "../../hooks/useServerAudio";
import { ServerVisualizer } from "../AudioVisualizer/ServerVisualizer";
import { type ThemeType } from "../../hooks/useSystemTheme";

type ServerAudioProps = {
  setGetAudioStats: (getAudioStats: () => AudioStats) => void;
  theme: ThemeType;
};
export const ServerAudio: FC<ServerAudioProps> = ({ setGetAudioStats, theme }) => {
  const { analyser, hasCriticalDelay, setHasCriticalDelay } = useServerAudio({
    setGetAudioStats,
  });
  const containerRef = useRef<HTMLDivElement>(null);
  return (
    <>
      {hasCriticalDelay && (
        <div className="fixed left-0 top-0 z-50 flex w-screen justify-between bg-red-500 p-2 text-center text-white text-sm">
          <p>A connection issue has been detected, you've been reconnected</p>
          <button
            onClick={async () => { setHasCriticalDelay(false); }}
            className="bg-white px-2 py-0.5 text-red-600 rounded font-medium"
          >
            Dismiss
          </button>
        </div>
      )}
      <div className="w-full" ref={containerRef}>
        <ServerVisualizer analyser={analyser.current} parent={containerRef} theme={theme} />
      </div>
    </>
  );
};
