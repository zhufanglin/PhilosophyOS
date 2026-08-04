import { Mic } from "lucide-react";
import { type CSSProperties, useEffect, useMemo, useRef, useState } from "react";

type SpeechRecognitionAlternativeLike = {
  transcript: string;
};

type SpeechRecognitionResultLike = {
  isFinal: boolean;
  readonly length: number;
  item(index: number): SpeechRecognitionAlternativeLike;
  [index: number]: SpeechRecognitionAlternativeLike;
};

type SpeechRecognitionResultListLike = {
  readonly length: number;
  item(index: number): SpeechRecognitionResultLike;
  [index: number]: SpeechRecognitionResultLike;
};

type SpeechRecognitionEventLike = Event & {
  resultIndex: number;
  results: SpeechRecognitionResultListLike;
};

type SpeechRecognitionErrorEventLike = Event & {
  error?: string;
};

type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onend: (() => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  }
}

type VoiceInputButtonProps = {
  className?: string;
  disabled?: boolean;
  lang?: string;
  onTranscript: (text: string) => void;
};

const waveformBars = [7, 13, 18, 10, 24, 31, 19, 12, 27, 34, 16, 22, 11, 29, 20, 14, 25, 9, 17, 32, 21, 12, 26, 15];

export function VoiceInputButton({
  className = "",
  disabled = false,
  lang = "zh-CN",
  onTranscript,
}: VoiceInputButtonProps) {
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const [listening, setListening] = useState(false);
  const [status, setStatus] = useState<"idle" | "unsupported" | "error">("idle");

  const Recognition = useMemo(
    () => (typeof window === "undefined" ? undefined : window.SpeechRecognition ?? window.webkitSpeechRecognition),
    [],
  );
  const unsupported = !Recognition;

  useEffect(() => {
    return () => {
      recognitionRef.current?.abort();
      recognitionRef.current = null;
    };
  }, []);

  useEffect(() => {
    function stopOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape" && recognitionRef.current) {
        recognitionRef.current.stop();
      }
    }

    window.addEventListener("keydown", stopOnEscape);
    return () => window.removeEventListener("keydown", stopOnEscape);
  }, []);

  function stopListening() {
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    setListening(false);
  }

  function startListening() {
    if (!Recognition) {
      setStatus("unsupported");
      return;
    }

    const recognition = new Recognition();
    recognitionRef.current = recognition;
    recognition.lang = lang;
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.onresult = (event) => {
      const finalTexts: string[] = [];
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index] ?? event.results.item(index);
        if (result?.isFinal) {
          finalTexts.push((result[0] ?? result.item(0))?.transcript ?? "");
        }
      }
      const text = finalTexts.join("").trim();
      if (text) onTranscript(text);
    };
    recognition.onerror = () => {
      setStatus("error");
      setListening(false);
      recognitionRef.current = null;
    };
    recognition.onend = () => {
      setListening(false);
      recognitionRef.current = null;
    };

    try {
      recognition.start();
      setStatus("idle");
      setListening(true);
    } catch {
      setStatus("error");
      setListening(false);
      recognitionRef.current = null;
    }
  }

  const disabledReason = unsupported ? "当前浏览器不支持语音输入" : "当前无法语音输入";
  const title = unsupported
    ? disabledReason
    : listening
      ? "停止语音输入（Esc）"
      : status === "error"
        ? "语音输入暂时不可用，点击重试"
        : "语音输入";

  return (
    <button
      className={`voice-input-button${listening ? " is-listening" : ""}${status === "error" ? " has-error" : ""}${className ? ` ${className}` : ""}`}
      type="button"
      aria-label={listening ? "停止语音输入" : "开始语音输入"}
      aria-pressed={listening}
      disabled={disabled || unsupported}
      title={disabled && !unsupported ? disabledReason : title}
      onClick={listening ? stopListening : startListening}
    >
      {listening ? (
        <>
          <span className="voice-waveform" aria-hidden="true">
            {waveformBars.map((height, index) => (
              <i
                key={`${height}-${index}`}
                style={
                  {
                    "--voice-bar-height": `${height}px`,
                    "--voice-bar-delay": `${index * 42}ms`,
                  } as CSSProperties
                }
              />
            ))}
          </span>
          <span className="voice-stop-icon" aria-hidden="true" />
        </>
      ) : (
        <>
          <Mic size={16} />
          <span className="voice-input-idle-pulse" aria-hidden="true" />
        </>
      )}
    </button>
  );
}
