import { FC, MutableRefObject, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSocket } from "./hooks/useSocket";
import { SocketContext } from "./SocketContext";
import { ServerAudio } from "./components/ServerAudio/ServerAudio";
import { UserAudio } from "./components/UserAudio/UserAudio";
import { ServerAudioStats } from "./components/ServerAudio/ServerAudioStats";
import { AudioStats } from "./hooks/useServerAudio";
import { TextDisplay } from "./components/TextDisplay/TextDisplay";
import { MediaContext } from "./MediaContext";
import { ModelParamsValues, useModelParams } from "./hooks/useModelParams";
import fixWebmDuration from "webm-duration-fix";
import { getMimeType, getExtension } from "./getMimeType";
import { type ThemeType } from "./hooks/useSystemTheme";
import { uploadTextPrompt } from "./api/uploadPrompt";
import { countPromptTokens } from "./api/countPromptTokens";
import { WSMessage } from "../../protocol/types";

type ConversationProps = {
  workerAddr: string;
  workerAuthId?: string;
  sessionAuthId?: string;
  sessionId?: number;
  email?: string;
  theme: ThemeType;
  audioContext: MutableRefObject<AudioContext | null>;
  worklet: MutableRefObject<AudioWorkletNode | null>;
  onConversationEnd?: () => void;
  isBypass?: boolean;
  startConnection: () => Promise<void>;
} & Partial<ModelParamsValues>;


const buildURL = ({
  workerAddr,
  params,
  workerAuthId,
  email,
  textSeed,
  audioSeed,
  promptId,
}: {
  workerAddr: string;
  params: ModelParamsValues;
  workerAuthId?: string;
  email?: string;
  textSeed: number;
  audioSeed: number;
  promptId?: string | null;
}) => {
  const resolvedWorkerAddr =
    workerAddr === "same" || workerAddr === ""
      ? `${window.location.hostname}:${window.location.port}`
      : workerAddr;
  const wsProtocol = window.location.protocol === "https:" ? "wss" : "ws";
  const url = new URL(`${wsProtocol}://${resolvedWorkerAddr}/api/chat`);
  if (workerAuthId) url.searchParams.append("worker_auth_id", workerAuthId);
  if (email) url.searchParams.append("email", email);
  url.searchParams.append("text_temperature", params.textTemperature.toString());
  url.searchParams.append("text_topk", params.textTopk.toString());
  url.searchParams.append("audio_temperature", params.audioTemperature.toString());
  url.searchParams.append("audio_topk", params.audioTopk.toString());
  url.searchParams.append("pad_mult", params.padMult.toString());
  url.searchParams.append("text_seed", textSeed.toString());
  url.searchParams.append("audio_seed", audioSeed.toString());
  url.searchParams.append("repetition_penalty_context", params.repetitionPenaltyContext.toString());
  url.searchParams.append("repetition_penalty", params.repetitionPenalty.toString());
  // Always use prompt_id (POST) — never put the raw prompt in the URL to avoid HTTP 400 LineTooLong
  if (promptId) {
    url.searchParams.append("prompt_id", promptId);
  }
  // text_prompt intentionally omitted from URL; empty string signals "no prompt" to the server
  url.searchParams.append("text_prompt", "");
  url.searchParams.append("voice_prompt", params.voicePrompt.toString());
  console.log("WS URL length:", url.toString().length);
  return url.toString();
};

const PhoneOffIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 8l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M5 3a2 2 0 00-2 2v1c0 8.284 6.716 15 15 15h1a2 2 0 002-2v-3.28a1 1 0 00-.684-.948l-4.493-1.498a1 1 0 00-1.21.502l-1.13 2.257a11.042 11.042 0 01-5.516-5.517l2.257-1.128a1 1 0 00.502-1.21L9.228 3.683A1 1 0 008.279 3H5z" />
  </svg>
);

const RefreshIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
  </svg>
);

const ArrowLeftIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
  </svg>
);

const DownloadIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
  </svg>
);

export const Conversation: FC<ConversationProps> = ({
  workerAddr,
  workerAuthId,
  audioContext,
  worklet,
  sessionAuthId,
  sessionId,
  onConversationEnd,
  startConnection,
  isBypass = false,
  email,
  theme,
  ...params
}) => {
  const getAudioStats = useRef<() => AudioStats>(() => ({
    playedAudioDuration: 0,
    missedAudioDuration: 0,
    totalAudioMessages: 0,
    delay: 0,
    minPlaybackDelay: 0,
    maxPlaybackDelay: 0,
  }));
  const isRecording = useRef<boolean>(false);
  const audioChunks = useRef<Blob[]>([]);
  const audioStreamDestination = useRef<MediaStreamAudioDestinationNode>(
    audioContext.current!.createMediaStreamDestination()
  );
  const stereoMerger = useRef<ChannelMergerNode>(
    audioContext.current!.createChannelMerger(2)
  );
  const audioRecorder = useRef<MediaRecorder>(
    new MediaRecorder(audioStreamDestination.current.stream, {
      mimeType: getMimeType("audio"),
      audioBitsPerSecond: 128000,
    })
  );
  const [audioURL, setAudioURL] = useState<string>("");
  const [isOver, setIsOver] = useState(false);
  const modelParams = useModelParams(params);
  const micDuration = useRef<number>(0);
  const actualAudioPlayed = useRef<number>(0);
  const textContainerRef = useRef<HTMLDivElement>(null);
  const textSeed = useMemo(() => Math.round(1000000 * Math.random()), []);
  const audioSeed = useMemo(() => Math.round(1000000 * Math.random()), []);
  const [wsUrl, setWsUrl] = useState<string | null>(null);
  const [showStats, setShowStats] = useState(false);
  const [promptProgress, setPromptProgress] = useState<{ done: number; total: number } | null>(null);
  const [expectedTokens, setExpectedTokens] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!modelParams.textPrompt.trim()) {
      setExpectedTokens(null);
      return;
    }
    countPromptTokens(modelParams.textPrompt)
      .then((result) => {
        if (!cancelled) setExpectedTokens(result.tokens);
      })
      .catch(() => {
        if (!cancelled) setExpectedTokens(null);
      });
    return () => { cancelled = true; };
  }, [modelParams.textPrompt]);

  useEffect(() => {
    let cancelled = false;
    async function prepareConnection() {
      try {
        const promptId = await uploadTextPrompt(modelParams.textPrompt);
        if (cancelled) return;
        setWsUrl(
          buildURL({ workerAddr, params: modelParams, workerAuthId, email, textSeed, audioSeed, promptId })
        );
      } catch (error) {
        console.error("Failed to upload text prompt, falling back to URL param", error);
        if (cancelled) return;
        setWsUrl(
          buildURL({ workerAddr, params: modelParams, workerAuthId, email, textSeed, audioSeed })
        );
      }
    }
    prepareConnection();
    return () => { cancelled = true; };
  }, [
    workerAddr, workerAuthId, email, textSeed, audioSeed,
    modelParams.textPrompt, modelParams.textTemperature, modelParams.textTopk,
    modelParams.audioTemperature, modelParams.audioTopk, modelParams.padMult,
    modelParams.repetitionPenaltyContext, modelParams.repetitionPenalty, modelParams.voicePrompt,
  ]);

  const onDisconnect = useCallback(() => {
    setIsOver(true);
    console.log("on disconnect!");
    stopRecording();
  }, [setIsOver]);

  const onSocketMessage = useCallback((message: WSMessage) => {
    if (message.type !== "metadata" || typeof message.data !== "object" || message.data === null) {
      return;
    }
    const data = message.data as { type?: string; done?: number; total?: number };
    if (data.type === "prompt_progress" && typeof data.done === "number" && typeof data.total === "number") {
      setPromptProgress({ done: data.done, total: data.total });
    }
  }, []);

  const { socketStatus, sendMessage, socket, start, stop } = useSocket({
    uri: wsUrl ?? "",
    onDisconnect,
    onMessage: onSocketMessage,
  });

  const loadingPercent = useMemo(() => {
    if (socketStatus === "connected") return 100;
    if (promptProgress && promptProgress.total > 0) {
      return Math.min(99, Math.round(10 + (promptProgress.done / promptProgress.total) * 90));
    }
    if (wsUrl) return 8;
    return 3;
  }, [socketStatus, promptProgress, wsUrl]);

  const loadingLabel = useMemo(() => {
    if (socketStatus === "connected") return "AI is ready";
    if (!wsUrl) return "Uploading prompt to server…";
    if (promptProgress && promptProgress.total > 0) {
      return `Loading prompt into AI… ${promptProgress.done.toLocaleString()} / ${promptProgress.total.toLocaleString()} tokens`;
    }
    return "Initializing voice and preparing AI…";
  }, [socketStatus, wsUrl, promptProgress]);

  useEffect(() => {
    if (socketStatus === "connected") {
      setPromptProgress(null);
    }
  }, [socketStatus]);

  useEffect(() => {
    audioRecorder.current.ondataavailable = (e) => {
      audioChunks.current.push(e.data);
    };
    audioRecorder.current.onstop = async () => {
      let blob: Blob;
      const mimeType = getMimeType("audio");
      if (mimeType.includes("webm")) {
        blob = await fixWebmDuration(new Blob(audioChunks.current, { type: mimeType }));
      } else {
        blob = new Blob(audioChunks.current, { type: mimeType });
      }
      setAudioURL(URL.createObjectURL(blob));
      audioChunks.current = [];
    };
  }, [audioRecorder, setAudioURL, audioChunks]);

  useEffect(() => {
    if (!wsUrl) return;
    start();
    return () => { stop(); };
  }, [wsUrl, start, stop]);

  const startRecording = useCallback(() => {
    if (isRecording.current) return;
    try { stereoMerger.current.disconnect(); } catch {}
    try { worklet.current?.disconnect(audioStreamDestination.current); } catch {}
    worklet.current?.connect(stereoMerger.current, 0, 0);
    stereoMerger.current.connect(audioStreamDestination.current);
    setAudioURL("");
    audioRecorder.current.start();
    isRecording.current = true;
  }, [isRecording, worklet, audioStreamDestination, audioRecorder, stereoMerger]);

  const stopRecording = useCallback(() => {
    if (!isRecording.current) return;
    try { worklet.current?.disconnect(stereoMerger.current); } catch {}
    try { stereoMerger.current.disconnect(audioStreamDestination.current); } catch {}
    audioRecorder.current.stop();
    isRecording.current = false;
  }, [isRecording, worklet, audioStreamDestination, audioRecorder, stereoMerger]);

  const onPressDisconnect = useCallback(async () => {
    audioContext.current?.resume();
    stop();
  }, [stop]);

  const onPressNewConversation = useCallback(() => {
    window.location.reload();
  }, []);

  const statusDot = useMemo(() => {
    if (socketStatus === "connected") return "bg-green-400";
    if (socketStatus === "connecting") return "bg-yellow-400 animate-pulse";
    return "bg-red-400";
  }, [socketStatus]);

  const statusLabel = useMemo(() => {
    if (isOver) return "Call ended";
    if (socketStatus === "connected") return "Live";
    if (socketStatus === "connecting") return "Connecting…";
    return "Disconnected";
  }, [socketStatus, isOver]);

  return (
    <SocketContext.Provider value={{ socketStatus, sendMessage, socket }}>
      <div className="min-h-screen bg-gray-50 flex flex-col">

        {/* Top Nav */}
        <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-3">
            <img src="/assets/logo-cadre-crew.svg" alt="Cadre Crew" className="h-7" />
            <span className="text-[#060A39] text-sm font-medium border-l border-gray-200 pl-3">
              AI Voice Caller
            </span>
          </div>
          <div className="flex items-center gap-3">
            {/* Status badge */}
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-gray-100 text-xs font-medium text-gray-600">
              <span className={`h-2 w-2 rounded-full ${statusDot} inline-block`} />
              {statusLabel}
            </div>
            {/* Back button */}
            <button
              onClick={onPressNewConversation}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#3551F2] hover:text-white hover:bg-[#3551F2] border border-[#3551F2] rounded-lg transition-all"
            >
              <ArrowLeftIcon />
              New Conversation
            </button>
          </div>
        </header>

        {!isOver && socketStatus !== "connected" && (
          <div className="mx-4 mt-4 max-w-screen-xl md:mx-auto w-auto">
            <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-4">
              <div className="flex items-center justify-between gap-4 mb-2">
                <div>
                  <p className="text-sm font-semibold text-[#060A39]">{loadingLabel}</p>
                  {expectedTokens !== null && expectedTokens > 0 && (
                    <p className="text-xs text-gray-400 mt-0.5">
                      Total prompt size: {expectedTokens.toLocaleString()} tokens
                    </p>
                  )}
                </div>
                <span className="text-sm font-semibold text-[#3551F2]">{loadingPercent}%</span>
              </div>
              <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-[#3551F2] rounded-full transition-all duration-500 ease-out"
                  style={{ width: `${loadingPercent}%` }}
                />
              </div>
              <p className="text-xs text-gray-400 mt-2">
                Please keep this tab open. Large prompts can take several minutes to load.
              </p>
            </div>
          </div>
        )}

        {/* Main content */}
        {audioContext.current && worklet.current ? (
          <MediaContext.Provider value={{
            startRecording, stopRecording,
            audioContext: audioContext as MutableRefObject<AudioContext>,
            worklet: worklet as MutableRefObject<AudioWorkletNode>,
            audioStreamDestination, stereoMerger, micDuration, actualAudioPlayed,
          }}>
            <main className="flex-1 flex flex-col md:flex-row gap-4 p-4 max-w-screen-xl mx-auto w-full">

              {/* Left panel — visualizers + controls */}
              <div className="flex flex-col gap-4 md:w-80 lg:w-96 flex-shrink-0">

                {/* AI audio card */}
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 flex flex-col items-center">
                  <div className="flex items-center justify-between w-full mb-3">
                    <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">AI Voice</span>
                    {socketStatus === "connected" && (
                      <span className="text-xs text-green-600 font-medium flex items-center gap-1">
                        <span className="h-1.5 w-1.5 rounded-full bg-green-500 inline-block animate-pulse" />
                        Speaking
                      </span>
                    )}
                  </div>
                  <div className="w-full flex justify-center">
                    <ServerAudio
                      setGetAudioStats={(cb: () => AudioStats) => (getAudioStats.current = cb)}
                      theme={theme}
                    />
                  </div>

                  <div className="border-t border-gray-100 w-full my-4" />

                  <div className="flex items-center justify-between w-full mb-3">
                    <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Your Mic</span>
                    {socketStatus === "connected" && (
                      <span className="text-xs text-[#3551F2] font-medium flex items-center gap-1">
                        <span className="h-1.5 w-1.5 rounded-full bg-[#3551F2] inline-block animate-pulse" />
                        Listening
                      </span>
                    )}
                  </div>
                  <div className="w-full flex justify-center">
                    <UserAudio theme={theme} />
                  </div>
                </div>

                {/* Action buttons */}
                <div className="flex flex-col gap-2">
                  {!isOver ? (
                    <button
                      onClick={onPressDisconnect}
                      disabled={socketStatus !== "connected"}
                      className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-red-500 hover:bg-red-600 disabled:bg-gray-200 disabled:text-gray-400 text-white font-semibold rounded-xl transition-all shadow-sm text-sm"
                    >
                      <PhoneOffIcon />
                      End Call
                    </button>
                  ) : (
                    <button
                      onClick={onPressNewConversation}
                      className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-[#3551F2] hover:bg-[#1a35d4] text-white font-semibold rounded-xl transition-all shadow-sm text-sm"
                    >
                      <RefreshIcon />
                      New Conversation
                    </button>
                  )}
                  {audioURL && (
                    <a
                      href={audioURL}
                      download={`cadrecrew_call.${getExtension("audio")}`}
                      className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-white hover:bg-gray-50 text-[#060A39] border border-gray-200 font-medium rounded-xl transition-all shadow-sm text-sm"
                    >
                      <DownloadIcon />
                      Download Recording
                    </a>
                  )}
                </div>

                {/* Stats collapsible */}
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                  <button
                    onClick={() => setShowStats(s => !s)}
                    className="w-full px-5 py-3 flex items-center justify-between text-xs font-semibold text-gray-500 uppercase tracking-wider hover:bg-gray-50 transition-colors"
                  >
                    Audio Stats
                    <svg className={`h-3.5 w-3.5 transition-transform ${showStats ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  {showStats && (
                    <div className="px-5 pb-4">
                      <ServerAudioStats getAudioStats={getAudioStats} />
                    </div>
                  )}
                </div>
              </div>

              {/* Right panel — transcript */}
              <div className="flex-1 flex flex-col min-h-0">
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 flex flex-col overflow-hidden" style={{ minHeight: "420px" }}>
                  <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                    <div>
                      <h2 className="text-sm font-semibold text-[#060A39]">Live Transcript</h2>
                      <p className="text-xs text-gray-400 mt-0.5">Real-time conversation text</p>
                    </div>
                    {socketStatus === "connected" && (
                      <span className="flex items-center gap-1.5 text-xs font-medium text-green-600 bg-green-50 px-2.5 py-1 rounded-full">
                        <span className="h-1.5 w-1.5 rounded-full bg-green-500 inline-block animate-pulse" />
                        Live
                      </span>
                    )}
                    {isOver && (
                      <span className="text-xs font-medium text-gray-400 bg-gray-100 px-2.5 py-1 rounded-full">
                        Ended
                      </span>
                    )}
                  </div>
                  <div ref={textContainerRef} className="flex-1 overflow-y-auto p-5 scrollbar text-sm text-[#060A39] leading-relaxed">
                    <TextDisplay containerRef={textContainerRef} />
                    {socketStatus !== "connected" && (
                      <div className="flex items-center justify-center text-gray-400 py-16">
                        <div className="text-center max-w-sm">
                          <p className="text-sm text-[#060A39] font-medium">{loadingLabel}</p>
                          <p className="text-xs text-gray-400 mt-2">
                            The live transcript will appear here once the AI is ready.
                          </p>
                        </div>
                      </div>
                    )}
                    {isOver && (
                      <div className="mt-4 p-4 bg-gray-50 rounded-xl text-center text-sm text-gray-500">
                        Call ended. Click <strong>New Conversation</strong> to start again.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </main>
          </MediaContext.Provider>
        ) : (
          <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
            <div className="text-center">
              <div className="animate-spin h-8 w-8 border-2 border-[#3551F2] border-t-transparent rounded-full mx-auto mb-4" />
              Initializing audio…
            </div>
          </div>
        )}

        {/* Footer */}
        <footer className="text-center py-4 text-xs text-gray-400">
          Powered by <span className="text-[#3551F2] font-medium">Cadre Crew</span> — AI Voice Technology
        </footer>
      </div>
    </SocketContext.Provider>
  );
};
