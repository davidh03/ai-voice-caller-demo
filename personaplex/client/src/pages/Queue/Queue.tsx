import moshiProcessorUrl from "../../audio-processor.ts?worker&url";
import { FC, useEffect, useState, useCallback, useRef, MutableRefObject, ChangeEvent, DragEvent } from "react";
import eruda from "eruda";
import { useSearchParams } from "react-router-dom";
import { Conversation } from "../Conversation/Conversation";
import { useModelParams } from "../Conversation/hooks/useModelParams";
import { env } from "../../env";
import { prewarmDecoderWorker } from "../../decoder/decoderWorker";
import { countPromptTokens, PromptTokenCount, SUGGESTED_MAX_PROMPT_TOKENS } from "../Conversation/api/countPromptTokens";

const VOICE_OPTIONS = [
  "NATF0.pt", "NATF1.pt", "NATF2.pt", "NATF3.pt",
  "NATM0.pt", "NATM1.pt", "NATM2.pt", "NATM3.pt",
  "VARF0.pt", "VARF1.pt", "VARF2.pt", "VARF3.pt", "VARF4.pt",
  "VARM0.pt", "VARM1.pt", "VARM2.pt", "VARM3.pt", "VARM4.pt",
];

const VOICE_LABELS: Record<string, string> = {
  "NATF0.pt": "Natural Female 1", "NATF1.pt": "Natural Female 2",
  "NATF2.pt": "Natural Female 3", "NATF3.pt": "Natural Female 4",
  "NATM0.pt": "Natural Male 1",   "NATM1.pt": "Natural Male 2",
  "NATM2.pt": "Natural Male 3",   "NATM3.pt": "Natural Male 4",
  "VARF0.pt": "Variety Female 1", "VARF1.pt": "Variety Female 2",
  "VARF2.pt": "Variety Female 3", "VARF3.pt": "Variety Female 4",
  "VARF4.pt": "Variety Female 5", "VARM0.pt": "Variety Male 1",
  "VARM1.pt": "Variety Male 2",   "VARM2.pt": "Variety Male 3",
  "VARM3.pt": "Variety Male 4",   "VARM4.pt": "Variety Male 5",
};

interface HomepageProps {
  showMicrophoneAccessMessage: boolean;
  startConnection: () => Promise<void>;
  textPrompt: string;
  setTextPrompt: (value: string) => void;
  voicePrompt: string;
  setVoicePrompt: (value: string) => void;
}

const MicIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
  </svg>
);

const UploadIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
  </svg>
);

const FileIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
  </svg>
);

const WarningIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
  </svg>
);

interface LoadedFile {
  name: string;
  content: string;
}

const readFileAsText = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target?.result as string ?? "");
    reader.onerror = reject;
    reader.readAsText(file);
  });

const Homepage = ({
  startConnection,
  showMicrophoneAccessMessage,
  textPrompt,
  setTextPrompt,
  voicePrompt,
  setVoicePrompt,
}: HomepageProps) => {
  const [loadedFiles, setLoadedFiles] = useState<LoadedFile[]>([]);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [tokenCount, setTokenCount] = useState<PromptTokenCount | null>(null);
  const [tokenCountLoading, setTokenCountLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!textPrompt.trim()) {
      setTokenCount(null);
      setTokenCountLoading(false);
      return;
    }
    setTokenCountLoading(true);
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      const result = await countPromptTokens(textPrompt, controller.signal);
      if (!controller.signal.aborted) {
        setTokenCount(result);
        setTokenCountLoading(false);
      }
    }, 400);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [textPrompt]);

  const addFiles = useCallback(async (files: FileList | File[]) => {
    const txtFiles = Array.from(files).filter(
      (f) => f.type === "text/plain" || f.name.endsWith(".txt"),
    );
    if (!txtFiles.length) return;

    const newLoaded: LoadedFile[] = await Promise.all(
      txtFiles.map(async (f) => ({ name: f.name, content: await readFileAsText(f) })),
    );

    setLoadedFiles((prev) => {
      // Deduplicate by name
      const existing = new Set(prev.map((f) => f.name));
      const merged = [...prev, ...newLoaded.filter((f) => !existing.has(f.name))];
      // Update combined prompt
      const combined = merged.map((f) => f.content.trim()).join("\n\n");
      setTextPrompt(combined);
      return merged;
    });

    if (fileInputRef.current) fileInputRef.current.value = "";
  }, [setTextPrompt]);

  const removeFile = (name: string) => {
    setLoadedFiles((prev) => {
      const next = prev.filter((f) => f.name !== name);
      const combined = next.map((f) => f.content.trim()).join("\n\n");
      setTextPrompt(combined);
      return next;
    });
  };

  const clearAllFiles = () => {
    setLoadedFiles([]);
    setTextPrompt("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleFileInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) addFiles(e.target.files);
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };
  const handleDragLeave = () => setIsDragging(false);
  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files) addFiles(e.dataTransfer.files);
  };

  const handleConnect = async () => {
    setIsConnecting(true);
    await startConnection();
    setIsConnecting(false);
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Top Nav */}
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-3">
          <img src="/assets/logo-cadre-crew.svg" alt="Cadre Crew" className="h-7" />
          <span className="text-[#060A39] text-sm font-medium border-l border-gray-200 pl-3">
            AI Voice Caller
          </span>
        </div>
        <div className="flex items-center gap-2 text-gray-500 text-xs">
          <span className="h-2 w-2 rounded-full bg-green-500 inline-block" />
          Ready
        </div>
      </header>

      {/* Hero */}
      <div className="bg-[#060A39] px-6 pb-10 pt-8 text-center">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-[#3551F2]/20 mb-4">
          <MicIcon />
        </div>
        <h1 className="text-2xl font-bold text-white mb-2">Configure Your AI Caller</h1>
        <p className="text-white/50 text-sm max-w-md mx-auto">
          Define your assistant's behavior and select a voice before starting the call.
        </p>
      </div>

      {/* Card */}
      <main className="flex-1 flex justify-center px-4 -mt-4 pb-10">
        <div className="w-full max-w-2xl">
          <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-6 space-y-6">

            {/* System Prompt */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label htmlFor="text-prompt" className="text-sm font-semibold text-[#060A39]">
                  System Prompt
                </label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="flex items-center gap-1.5 text-xs text-[#3551F2] hover:text-[#1a35d4] font-medium transition-colors"
                  >
                    <UploadIcon />
                    Upload .txt files
                  </button>
                  {loadedFiles.length > 0 && (
                    <button
                      type="button"
                      onClick={clearAllFiles}
                      className="text-xs text-red-400 hover:text-red-600 font-medium transition-colors"
                    >
                      Clear all
                    </button>
                  )}
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".txt,text/plain"
                  multiple
                  onChange={handleFileInputChange}
                  className="hidden"
                />
              </div>

              {/* Drag & drop zone */}
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`mb-3 border-2 border-dashed rounded-xl px-4 py-3 text-center cursor-pointer transition-all ${
                  isDragging
                    ? "border-[#3551F2] bg-blue-50"
                    : "border-gray-200 hover:border-[#3551F2]/50 hover:bg-gray-50"
                }`}
              >
                <p className="text-xs text-gray-400">
                  <span className="text-[#3551F2] font-medium">Click to browse</span> or drag &amp; drop multiple .txt files here
                </p>
              </div>

              {/* Loaded file chips */}
              {loadedFiles.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-3">
                  {loadedFiles.map((f) => (
                    <div
                      key={f.name}
                      className="flex items-center gap-1.5 px-2.5 py-1.5 bg-blue-50 border border-blue-100 rounded-lg text-xs text-[#3551F2]"
                    >
                      <FileIcon />
                      <span className="max-w-[160px] truncate font-medium">{f.name}</span>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); removeFile(f.name); }}
                        className="text-gray-400 hover:text-red-400 transition-colors leading-none ml-0.5"
                        aria-label={`Remove ${f.name}`}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <textarea
                id="text-prompt"
                name="text-prompt"
                value={textPrompt}
                onChange={(e) => setTextPrompt(e.target.value)}
                className="w-full h-52 min-h-[120px] p-3.5 bg-white text-[#060A39] border border-gray-200 rounded-xl resize-y focus:outline-none focus:ring-2 focus:ring-[#3551F2]/40 focus:border-[#3551F2] text-sm leading-relaxed placeholder:text-gray-400 transition-all"
                placeholder="Define how your AI caller should behave. For example:&#10;&#10;'You are a professional virtual assistant for Cadre Crew. Help clients with scheduling, inquiries, and support. Be friendly, concise, and solution-focused.'"
              />
              <div className="mt-2 space-y-2">
                <div className="flex items-start justify-between gap-3 text-xs">
                  <p className="text-gray-500">
                    Suggested max: <strong className="text-[#060A39]">{SUGGESTED_MAX_PROMPT_TOKENS.toLocaleString()} tokens</strong> for fastest loading.
                    Larger prompts work but take longer before the call starts.
                  </p>
                  <span className="text-gray-600 whitespace-nowrap text-right">
                    {tokenCountLoading ? (
                      "Counting tokens…"
                    ) : tokenCount ? (
                      <>
                        <strong className={tokenCount.tokens > SUGGESTED_MAX_PROMPT_TOKENS ? "text-amber-600" : "text-[#3551F2]"}>
                          {tokenCount.tokens.toLocaleString()}
                        </strong>
                        {" "}tokens{tokenCount.estimated ? " (est.)" : ""} · {tokenCount.chars.toLocaleString()} chars
                      </>
                    ) : null}
                  </span>
                </div>
                {tokenCount && tokenCount.tokens > 0 && (
                  <div>
                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-300 ${
                          tokenCount.tokens > SUGGESTED_MAX_PROMPT_TOKENS ? "bg-amber-500" : "bg-[#3551F2]"
                        }`}
                        style={{ width: `${Math.min(100, (tokenCount.tokens / SUGGESTED_MAX_PROMPT_TOKENS) * 100)}%` }}
                      />
                    </div>
                    {tokenCount.tokens > SUGGESTED_MAX_PROMPT_TOKENS && (
                      <p className="text-xs text-amber-600 mt-1">
                        Over the suggested {SUGGESTED_MAX_PROMPT_TOKENS.toLocaleString()} tokens — expect a longer wait when connecting.
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Divider */}
            <div className="border-t border-gray-100" />

            {/* Voice */}
            <div>
              <label htmlFor="voice-prompt" className="block text-sm font-semibold text-[#060A39] mb-2">
                Voice
              </label>
              <select
                id="voice-prompt"
                name="voice-prompt"
                value={voicePrompt}
                onChange={(e) => setVoicePrompt(e.target.value)}
                className="w-full p-3 bg-white text-[#060A39] border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#3551F2]/40 focus:border-[#3551F2] text-sm transition-all"
              >
                {VOICE_OPTIONS.map((voice) => (
                  <option key={voice} value={voice}>
                    {VOICE_LABELS[voice] ?? voice.replace('.pt', '')}
                  </option>
                ))}
              </select>
            </div>

            {/* Mic error */}
            {showMicrophoneAccessMessage && (
              <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-red-600 text-sm">
                <WarningIcon />
                Please enable microphone access to proceed.
              </div>
            )}

            {/* CTA */}
            <button
              onClick={handleConnect}
              disabled={isConnecting}
              className="w-full py-3.5 px-6 bg-[#3551F2] hover:bg-[#1a35d4] active:bg-[#0f25b0] disabled:bg-[#3551F2]/60 text-white font-semibold rounded-xl transition-all shadow-sm text-sm flex items-center justify-center gap-2"
            >
              {isConnecting ? (
                <>
                  <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                  </svg>
                  Requesting microphone access...
                </>
              ) : (
                <>
                  <MicIcon />
                  Connect &amp; Start Call
                </>
              )}
            </button>
          </div>

          <p className="text-center text-xs text-gray-400 mt-5">
            Powered by <span className="text-[#3551F2] font-medium">Cadre Crew</span> — AI Voice Technology
          </p>
        </div>
      </main>
    </div>
  );
};

export const Queue: FC = () => {
  const theme = "light" as const;
  const [searchParams] = useSearchParams();
  const overrideWorkerAddr = searchParams.get("worker_addr");
  const [hasMicrophoneAccess, setHasMicrophoneAccess] = useState<boolean>(false);
  const [showMicrophoneAccessMessage, setShowMicrophoneAccessMessage] = useState<boolean>(false);
  const modelParams = useModelParams();

  const audioContext = useRef<AudioContext | null>(null);
  const worklet = useRef<AudioWorkletNode | null>(null);

  useEffect(() => {
    if (env.VITE_ENV === "development") {
      eruda.init();
    }
    () => {
      if (env.VITE_ENV === "development") {
        eruda.destroy();
      }
    };
  }, []);

  const getMicrophoneAccess = useCallback(async () => {
    try {
      await window.navigator.mediaDevices.getUserMedia({ audio: true });
      setHasMicrophoneAccess(true);
      return true;
    } catch (e) {
      console.error(e);
      setShowMicrophoneAccessMessage(true);
      setHasMicrophoneAccess(false);
    }
    return false;
  }, [setHasMicrophoneAccess, setShowMicrophoneAccessMessage]);

  const startProcessor = useCallback(async () => {
    if (!audioContext.current) {
      audioContext.current = new AudioContext();
      prewarmDecoderWorker(audioContext.current.sampleRate);
    }
    if (worklet.current) {
      return;
    }
    let ctx = audioContext.current;
    ctx.resume();
    try {
      worklet.current = new AudioWorkletNode(ctx, 'moshi-processor');
    } catch (err) {
      await ctx.audioWorklet.addModule(moshiProcessorUrl);
      worklet.current = new AudioWorkletNode(ctx, 'moshi-processor');
    }
    worklet.current.connect(ctx.destination);
  }, [audioContext, worklet]);

  const startConnection = useCallback(async () => {
    await startProcessor();
    await getMicrophoneAccess();
  }, [startProcessor, getMicrophoneAccess]);

  return (
    <>
      {(hasMicrophoneAccess && audioContext.current && worklet.current) ? (
        <Conversation
          workerAddr={overrideWorkerAddr ?? ""}
          audioContext={audioContext as MutableRefObject<AudioContext | null>}
          worklet={worklet as MutableRefObject<AudioWorkletNode | null>}
          theme={theme}
          startConnection={startConnection}
          {...modelParams}
        />
      ) : (
        <Homepage
          startConnection={startConnection}
          showMicrophoneAccessMessage={showMicrophoneAccessMessage}
          textPrompt={modelParams.textPrompt}
          setTextPrompt={modelParams.setTextPrompt}
          voicePrompt={modelParams.voicePrompt}
          setVoicePrompt={modelParams.setVoicePrompt}
        />
      )}
    </>
  );
};
