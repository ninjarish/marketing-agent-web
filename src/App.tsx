import { type ChangeEvent, type FormEvent, useRef, useState } from "react";
import { Activity, type Attachment } from "@microsoft/agents-activity";
import { CopilotStudioClient } from "@microsoft/agents-copilotstudio-client";

import { acquirePowerPlatformToken } from "./auth";
import { config, getConfigurationError } from "./config";

type Status = "idle" | "connecting" | "connected" | "error";

type ChatMessage = {
  id: string;
  role: "agent" | "user";
  text: string;
  attachments?: string[];
};

const maxFiles = 5;
const maxFileSize = 4 * 1024 * 1024;

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "The agent connection failed.";
}

function getAgentMessages(activities: Activity[]): ChatMessage[] {
  return activities.flatMap((activity, index) => {
    if (activity.type !== "message" || !activity.text?.trim()) {
      return [];
    }

    return [{
      id: activity.id ?? `agent-${Date.now()}-${index}`,
      role: "agent" as const,
      text: activity.text.trim(),
    }];
  });
}

export default function App() {
  const [client, setClient] = useState<CopilotStudioClient | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(getConfigurationError());
  const transcriptEnd = useRef<HTMLDivElement>(null);

  function selectFiles(event: ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(event.target.files ?? []);
    event.target.value = "";

    const oversized = selected.find((file) => file.size > maxFileSize);
    if (oversized) {
      setError(`${oversized.name} exceeds the 4 MB file limit.`);
      return;
    }

    setError(null);
    setFiles((current) => [...current, ...selected].slice(0, maxFiles));
  }

  function removeFile(index: number) {
    setFiles((current) => current.filter((_, fileIndex) => fileIndex !== index));
  }

  async function toAttachment(file: File): Promise<Attachment> {
    const contentUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error ?? new Error(`Could not read ${file.name}.`));
      reader.readAsDataURL(file);
    });

    return {
      contentType: file.type || "application/octet-stream",
      contentUrl,
      name: file.name,
    };
  }

  async function connect() {
    const configurationError = getConfigurationError();
    if (configurationError) {
      setError(configurationError);
      return;
    }

    setClient(null);
    setConversationId(null);
    setMessages([]);
    setError(null);
    setStatus("connecting");

    try {
      const authentication = await acquirePowerPlatformToken();
      const nextClient = new CopilotStudioClient(
        { directConnectUrl: config.agentUrl },
        authentication.accessToken,
      );
      const response = await nextClient.startConversationWithResponse({
        emitStartConversationEvent: true,
        locale: navigator.language,
      });

      if (!response.conversationId) {
        throw new Error("The agent connected but did not return a conversation ID.");
      }

      setClient(nextClient);
      setConversationId(response.conversationId);
      setMessages(getAgentMessages(response.activities));
      setStatus("connected");
    } catch (connectError) {
      setError(getErrorMessage(connectError));
      setStatus("error");
    }
  }

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const text = draft.trim();
    const selectedFiles = files;
    if ((!text && selectedFiles.length === 0) || !client || !conversationId || isSending) {
      return;
    }

    setDraft("");
    setFiles([]);
    setError(null);
    setIsSending(true);
    setMessages((current) => [
      ...current,
      {
        id: `user-${crypto.randomUUID()}`,
        role: "user",
        text,
        attachments: selectedFiles.map((file) => file.name),
      },
    ]);

    try {
      const attachments = await Promise.all(selectedFiles.map(toAttachment));
      const activity = Activity.fromObject({
        type: "message",
        text: text || `Attached ${selectedFiles.map((file) => file.name).join(", ")}`,
        attachments,
        from: { id: "web-user", name: "You" },
        conversation: { id: conversationId },
      });
      const response = await client.executeWithResponse(activity, conversationId);

      setMessages((current) => [...current, ...getAgentMessages(response.activities)]);
      requestAnimationFrame(() => transcriptEnd.current?.scrollIntoView({ behavior: "smooth" }));
    } catch (sendError) {
      setError(getErrorMessage(sendError));
    } finally {
      setIsSending(false);
    }
  }

  return (
    <main className="shell">
      <section className="agent-card" aria-labelledby="agent-title">
        <header className="agent-header">
          <div className="agent-mark" aria-hidden="true">
            CM
          </div>
          <div>
            <p className="eyebrow">Copilot Studio</p>
            <h1 id="agent-title">Marketing Agent</h1>
          </div>
          <span className={`status status-${status}`}>
            <span className="status-dot" aria-hidden="true" />
            {status === "connected" ? "Connected" : status === "connecting" ? "Connecting" : "Offline"}
          </span>
        </header>

        <div className="chat-region">
          {client && conversationId ? (
            <div className="chat-interface">
              <div className="transcript" aria-live="polite">
                {messages.length === 0 && (
                  <div className="empty-transcript">
                    <h2>Connected successfully</h2>
                    <p>Send a message below to test the agent.</p>
                  </div>
                )}
                {messages.map((message) => (
                  <div className={`message-row message-row-${message.role}`} key={message.id}>
                    <div className={`message message-${message.role}`}>
                      {message.text && <div>{message.text}</div>}
                      {message.attachments?.map((name) => (
                        <div className="message-attachment" key={name}>
                          <span aria-hidden="true">📎</span>
                          {name}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
                {isSending && (
                  <div className="message-row message-row-agent">
                    <div className="message message-agent message-typing">Agent is responding…</div>
                  </div>
                )}
                <div ref={transcriptEnd} />
              </div>

              {error && (
                <p className="chat-error" role="alert">
                  {error}
                </p>
              )}

              <form className="composer" onSubmit={sendMessage}>
                {files.length > 0 && (
                  <div className="selected-files" aria-label="Selected attachments">
                    {files.map((file, index) => (
                      <span className="selected-file" key={`${file.name}-${file.lastModified}`}>
                        <span aria-hidden="true">📎</span>
                        <span className="selected-file-name">{file.name}</span>
                        <button
                          aria-label={`Remove ${file.name}`}
                          onClick={() => removeFile(index)}
                          type="button"
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                )}
                <div className="composer-controls">
                  <input
                    className="sr-only"
                    disabled={files.length >= maxFiles || isSending}
                    id="chat-file-input"
                    multiple
                    onChange={selectFiles}
                    type="file"
                  />
                  <label
                    aria-label="Attach files"
                    className={`attach-button ${
                      files.length >= maxFiles || isSending ? "attach-button-disabled" : ""
                    }`}
                    htmlFor="chat-file-input"
                    title="Attach files (up to 5 files, 4 MB each)"
                  >
                    <span aria-hidden="true">📎</span>
                  </label>
                  <label className="sr-only" htmlFor="chat-message">
                    Message the Marketing Agent
                  </label>
                  <textarea
                    id="chat-message"
                    onChange={(event) => setDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && !event.shiftKey) {
                        event.preventDefault();
                        event.currentTarget.form?.requestSubmit();
                      }
                    }}
                    placeholder="Message the Marketing Agent"
                    rows={1}
                    value={draft}
                  />
                  <button
                    className="send-button"
                    type="submit"
                    disabled={(!draft.trim() && files.length === 0) || isSending}
                  >
                    Send
                  </button>
                </div>
              </form>
            </div>
          ) : (
            <div className="welcome">
              <div className="welcome-icon" aria-hidden="true">
                ✦
              </div>
              <h2>Start a conversation</h2>
              <p>
                Sign in with your Microsoft work account to connect securely to the Marketing
                Agent.
              </p>
              <button type="button" onClick={connect} disabled={status === "connecting" || !!getConfigurationError()}>
                {status === "connecting" ? "Connecting…" : "Sign in and connect"}
              </button>
              {error && (
                <p className="error" role="alert">
                  {error}
                </p>
              )}
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
