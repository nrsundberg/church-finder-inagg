import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";

interface Props {
  open: boolean;
  onClose: () => void;
  siteKey: string;
}

declare global {
  interface Window {
    turnstile?: {
      render: (container: HTMLElement, options: Record<string, unknown>) => string;
      remove: (widgetId: string) => void;
      reset: (widgetId: string) => void;
    };
  }
}

export function SuggestionModal({ open, onClose, siteKey }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const turnstileContainerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [body, setBody] = useState("");
  const [status, setStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [turnstileToken, setTurnstileToken] = useState("");

  const wordCount = body.trim() === "" ? 0 : body.trim().split(/\s+/).filter(Boolean).length;
  const overLimit = wordCount > 500;

  // Open/close dialog
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open) {
      dialog.showModal();
    } else {
      dialog.close();
    }
  }, [open]);

  // Wire native close event (Escape key) back to onClose
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const handler = () => onClose();
    dialog.addEventListener("close", handler);
    return () => dialog.removeEventListener("close", handler);
  }, [onClose]);

  // Reset state when modal closes
  useEffect(() => {
    if (!open) {
      setName("");
      setEmail("");
      setBody("");
      setStatus("idle");
      setErrorMsg("");
      setTurnstileToken("");
    }
  }, [open]);

  // Lazy-load Turnstile script and render widget when modal opens
  useEffect(() => {
    if (!open) {
      if (widgetIdRef.current && window.turnstile) {
        window.turnstile.remove(widgetIdRef.current);
        widgetIdRef.current = null;
      }
      return;
    }

    const renderWidget = () => {
      if (!window.turnstile || !turnstileContainerRef.current) return;
      if (widgetIdRef.current) return; // already rendered
      widgetIdRef.current = window.turnstile.render(turnstileContainerRef.current, {
        sitekey: siteKey,
        callback: (token: string) => setTurnstileToken(token),
        "expired-callback": () => setTurnstileToken(""),
        theme: "dark",
      });
    };

    if (window.turnstile) {
      renderWidget();
      return;
    }

    if (!document.getElementById("turnstile-script")) {
      const script = document.createElement("script");
      script.id = "turnstile-script";
      script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);
    }

    const poll = setInterval(() => {
      if (window.turnstile) {
        clearInterval(poll);
        renderWidget();
      }
    }, 100);

    return () => clearInterval(poll);
  }, [open, siteKey]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (overLimit || !turnstileToken) return;
    setStatus("submitting");
    setErrorMsg("");
    try {
      const res = await fetch("/api/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, body, turnstileToken }),
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        setErrorMsg(data.error ?? "Submission failed. Please try again.");
        setStatus("error");
        // Reset Turnstile so user can retry
        if (widgetIdRef.current && window.turnstile) {
          window.turnstile.reset(widgetIdRef.current);
          setTurnstileToken("");
        }
      } else {
        setStatus("success");
      }
    } catch {
      setErrorMsg("Network error. Please try again.");
      setStatus("error");
    }
  }

  const inputCls =
    "bg-zinc-800 border border-zinc-700 rounded-md px-3 py-2 text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500 w-full text-sm";

  return (
    <dialog
      ref={dialogRef}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      className="bg-zinc-900 text-zinc-100 rounded-xl border border-zinc-700 p-6 w-full max-w-lg mx-auto shadow-2xl backdrop:bg-black/60 open:flex open:flex-col"
      style={{ margin: "auto" }}
    >
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-semibold">Suggest a Church Directory</h2>
        <button
          type="button"
          onClick={onClose}
          className="text-zinc-400 hover:text-zinc-100 transition-colors"
          aria-label="Close"
        >
          <X size={18} />
        </button>
      </div>

      {status === "success" ? (
        <p className="text-green-400 text-sm py-4 text-center">
          Thanks! Your suggestion was submitted successfully.
        </p>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="sg-name" className="block text-xs text-zinc-400 mb-1">
              Name
            </label>
            <input
              id="sg-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
              className={inputCls}
              required
            />
          </div>

          <div>
            <label htmlFor="sg-email" className="block text-xs text-zinc-400 mb-1">
              Email
            </label>
            <input
              id="sg-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className={inputCls}
              required
            />
          </div>

          <div>
            <label htmlFor="sg-body" className="block text-xs text-zinc-400 mb-1">
              Message
            </label>
            <textarea
              id="sg-body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Which church directory or network would you like to see added? Any other feedback?"
              rows={5}
              className={`${inputCls} resize-y`}
              required
            />
            <p className={`text-xs mt-1 ${overLimit ? "text-red-400" : "text-zinc-500"}`}>
              {wordCount}/500 words
            </p>
          </div>

          <div ref={turnstileContainerRef} />

          {errorMsg && <p className="text-red-400 text-sm">{errorMsg}</p>}

          <button
            type="submit"
            disabled={overLimit || !turnstileToken || status === "submitting"}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg px-4 py-2 transition-colors"
          >
            {status === "submitting" ? "Submitting…" : "Submit"}
          </button>
        </form>
      )}
    </dialog>
  );
}
