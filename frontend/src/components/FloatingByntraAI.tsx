
import {
  useEffect,
  useRef,
  useState,
  type FormEvent
} from "react";
import {
  Sparkles,
  X,
  Send,
  LoaderCircle,
  RotateCcw,
  AlertCircle
} from "lucide-react";
import { post } from "../api";
import AIResponse from "../AIResponse";
import "./FloatingByntraAI.css";
import "./FloatingByntraAI.layout.css";

type ChatMessage = {
  id: number;
  role: "user" | "assistant";
  content: string;
};

type AIResponse = {
  answer: string;
};

export default function FloatingByntraAI() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [unread, setUnread] = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const nextId = useRef(1);
  const messageScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      setUnread(false);
      inputRef.current?.focus();
    }
  }, [open]);

  useEffect(() => {
    if (open) {
      const panel = messageScrollRef.current;
      if (panel) panel.scrollTop = panel.scrollHeight;
    }
  }, [messages, loading, open]);

  useEffect(() => {
    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    window.addEventListener("keydown", handleEscape);
    return () => {
      window.removeEventListener("keydown", handleEscape);
    };
  }, []);

  async function sendMessage(event: FormEvent) {
    event.preventDefault();

    const question = input.trim();

    if (!question || loading) return;

    setError("");

    const userMessage: ChatMessage = {
      id: nextId.current++,
      role: "user",
      content: question
    };

    setMessages((current) => [
      ...current,
      userMessage
    ]);

    setInput("");
    setLoading(true);

    try {
      // Calls the existing authenticated backend.
      // No fabricated or prewritten AI answers.
      const result = await post<AIResponse>(
        "/api/ai/assist",
        { prompt: question }
      );

      if (
        !result ||
        typeof result.answer !== "string" ||
        !result.answer.trim()
      ) {
        throw new Error(
          "The AI service returned an empty response."
        );
      }

      const assistantMessage: ChatMessage = {
        id: nextId.current++,
        role: "assistant",
        content: result.answer
      };

      setMessages((current) => [
        ...current,
        assistantMessage
      ]);

      if (!open) setUnread(true);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to contact BYNTRA AI."
      );
    } finally {
      setLoading(false);
    }
  }

  function clearConversation() {
    if (loading) return;

    setMessages([]);
    setInput("");
    setError("");
    setUnread(false);
  }

  return (
    <div className="byntra-ai-root">
      {open && (
        <section
          className="byntra-ai-window"
          role="dialog"
          aria-label="BYNTRA AI Assistant"
        >
          <header className="byntra-ai-header">
            <div className="byntra-ai-identity">
              <span className="byntra-ai-logo">
                <Sparkles size={21} />
              </span>

              <div>
                <strong>BYNTRA AI</strong>
                <small>
                  Your cultural discovery companion
                </small>
              </div>
            </div>

            <div className="byntra-ai-header-actions">
              <button
                type="button"
                onClick={clearConversation}
                disabled={loading || messages.length === 0}
                title="Clear conversation"
                aria-label="Clear conversation"
              >
                <RotateCcw size={17} />
              </button>

              <button
                type="button"
                onClick={() => setOpen(false)}
                title="Close assistant"
                aria-label="Close assistant"
              >
                <X size={20} />
              </button>
            </div>
          </header>

          <div
            className="byntra-ai-messages"
            ref={messageScrollRef}
            aria-live="polite"
            aria-relevant="additions"
          >
            {messages.length === 0 && (
              <div className="byntra-ai-intro">
                <div className="byntra-ai-intro-icon">
                  <Sparkles size={27} />
                </div>

                <h3>Discover beyond the ordinary</h3>

                <p>
                  Ask me about films, series, music,
                  dining, travel, fashion, books,
                  art and cultural experiences.
                </p>

                <span className="byntra-ai-intro-note">
                  Recommendations requiring Qloo will
                  become available when the real Qloo
                  integration is connected.
                </span>
              </div>
            )}

            {messages.map((message) => (
              <div
                key={message.id}
                className={
                  "byntra-ai-message " +
                  (message.role === "user"
                    ? "byntra-ai-message-user"
                    : "byntra-ai-message-assistant")
                }
              >
                {message.role === "assistant" && (
                  <span className="byntra-ai-message-icon">
                    <Sparkles size={14} />
                  </span>
                )}

                <div className="byntra-ai-bubble">
                  {message.role === "assistant" ? (
                    <AIResponse content={message.content} />
                  ) : (
                    message.content
                  )}
                </div>
              </div>
            ))}

            {loading && (
              <div
                className="byntra-ai-thinking"
                role="status"
              >
                <LoaderCircle
                  size={16}
                  className="byntra-ai-spin"
                />
                BYNTRA AI is thinking...
              </div>
            )}

            {error && (
              <div
                className="byntra-ai-error"
                role="alert"
              >
                <AlertCircle size={17} />
                <span>{error}</span>
              </div>
            )}

            <div ref={bottomRef} />
          </div>

          <form
            className="byntra-ai-composer"
            onSubmit={sendMessage}
          >
            <textarea
              ref={inputRef}
              value={input}
              onChange={(event) =>
                setInput(event.target.value)
              }
              onKeyDown={(event) => {
                if (
                  event.key === "Enter" &&
                  !event.shiftKey &&
                  !event.nativeEvent.isComposing
                ) {
                  event.preventDefault();
                  event.currentTarget.form?.requestSubmit();
                }
              }}
              placeholder="Ask BYNTRA AI..."
              aria-label="Your message"
              rows={1}
              maxLength={4000}
            />

            <button
              type="submit"
              disabled={loading || !input.trim()}
              aria-label="Send message"
            >
              {loading ? (
                <LoaderCircle
                  size={19}
                  className="byntra-ai-spin"
                />
              ) : (
                <Send size={19} />
              )}
            </button>
          </form>

          <div className="byntra-ai-footer">
            BYNTRA AI · Cultural discovery
          </div>
        </section>
      )}

      <button
        type="button"
        className={
          "byntra-ai-fab " +
          (open ? "byntra-ai-fab-open" : "")
        }
        onClick={() => setOpen((value) => !value)}
        aria-label={
          open ? "Close BYNTRA AI" : "Open BYNTRA AI"
        }
        aria-expanded={open}
      >
        {open ? (
          <X size={24} />
        ) : (
          <>
            <Sparkles size={23} />
            <span>BYNTRA AI</span>
          </>
        )}

        {unread && !open && (
          <span className="byntra-ai-unread" />
        )}
      </button>
    </div>
  );
}
