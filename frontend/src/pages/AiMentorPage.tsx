import { useState, useEffect, useRef } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { Bot, Sparkles, ArrowUp, AlertCircle, Clock, Zap } from 'lucide-react';
import { getAiMentorStatus, sendAiMentorMessage, type AiMentorMessage } from '../lib/api';
import './AiMentorPage.css';

// ─── Inline Markdown Parser & Component ───────────────────────────────────────

function parseInlineFormatting(text: string): ReactNode[] {
  const elements: ReactNode[] = [];
  let remaining = text;
  let keyIndex = 0;

  // Regex to match **bold**, *italic*, or `code`
  const regex = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/;

  while (remaining) {
    const match = remaining.match(regex);
    if (!match || match.index === undefined) {
      elements.push(remaining);
      break;
    }

    if (match.index > 0) {
      elements.push(remaining.slice(0, match.index));
    }

    const token = match[0];
    if (token.startsWith('**') && token.endsWith('**')) {
      elements.push(<strong key={keyIndex++}>{token.slice(2, -2)}</strong>);
    } else if (token.startsWith('*') && token.endsWith('*')) {
      elements.push(<em key={keyIndex++}>{token.slice(1, -1)}</em>);
    } else if (token.startsWith('`') && token.endsWith('`')) {
      elements.push(<code key={keyIndex++} className="ai-markdown-code">{token.slice(1, -1)}</code>);
    } else {
      elements.push(token);
    }

    remaining = remaining.slice(match.index + token.length);
  }

  return elements;
}

function normalizeRawText(raw: string): string {
  return raw
    // Split headers squashed into a single line
    .replace(/([^\n])\s*(#{1,4}\s+)/g, '$1\n\n$2')
    // Split numbered list items squashed together (e.g. "1. **Math**: ... 2. **Science**:")
    .replace(/([^\n])\s*(\b\d+\.\s+\*\*)/g, '$1\n$2')
    // Split bullet items squashed together
    .replace(/([^\n])\s*([-*•]\s+)/g, '$1\n$2')
    .trim();
}

function AiMarkdownRenderer({ content }: { content: string }) {
  const normalized = normalizeRawText(content);
  const lines = normalized.split('\n');
  const renderedBlocks: ReactNode[] = [];

  let currentList: { type: 'ul' | 'ol'; items: string[] } | null = null;
  let blockIndex = 0;

  const flushList = () => {
    if (!currentList) return;
    const ListTag = currentList.type;
    renderedBlocks.push(
      <ListTag key={`list-${blockIndex++}`} className="ai-markdown-list">
        {currentList.items.map((item, idx) => (
          <li key={idx} className="ai-markdown-item">
            {parseInlineFormatting(item)}
          </li>
        ))}
      </ListTag>
    );
    currentList = null;
  };

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i].trim();
    if (!rawLine) {
      flushList();
      continue;
    }

    // Check for Heading (### or ##)
    const headingMatch = rawLine.match(/^(#{1,4})\s+(.+)$/);
    if (headingMatch) {
      flushList();
      renderedBlocks.push(
        <h4 key={`h-${blockIndex++}`}>
          {parseInlineFormatting(headingMatch[2])}
        </h4>
      );
      continue;
    }

    // Check for Bullet item (- , * , • )
    const bulletMatch = rawLine.match(/^[-*•]\s+(.+)$/);
    if (bulletMatch) {
      if (currentList && currentList.type !== 'ul') {
        flushList();
      }
      if (!currentList) {
        currentList = { type: 'ul', items: [] };
      }
      currentList.items.push(bulletMatch[1]);
      continue;
    }

    // Check for Numbered item (1. , 2. )
    const numMatch = rawLine.match(/^\d+\.\s+(.+)$/);
    if (numMatch) {
      if (currentList && currentList.type !== 'ol') {
        flushList();
      }
      if (!currentList) {
        currentList = { type: 'ol', items: [] };
      }
      currentList.items.push(numMatch[1]);
      continue;
    }

    // Plain text / paragraph
    flushList();
    renderedBlocks.push(
      <p key={`p-${blockIndex++}`}>
        {parseInlineFormatting(rawLine)}
      </p>
    );
  }

  flushList();

  return <div className="ai-markdown-content">{renderedBlocks}</div>;
}

// ─── Main Page Component ──────────────────────────────────────────────────────

const STARTER_PROMPTS = [
  '📅 Create a focused study schedule for today',
  '⏱️ How to balance homework and revision time?',
  '🤝 Questions I should ask my human mentor this week',
];

export function AiMentorPage() {
  const token = localStorage.getItem('anfaal-token') ?? '';
  const [sessionId, setSessionId] = useState('');
  const [messages, setMessages] = useState<AiMentorMessage[]>([
    {
      role: 'assistant',
      content: 'Assalamu alaikum! I am your AI study planning assistant.\n\n- Ask me for a short, focused daily study plan.\n- Get help preparing discussion points for your human mentor.\n- Remember you have **3 questions per day** to encourage focused learning.',
    },
  ]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  // Daily quota states (default 3)
  const [dailyLimit, setDailyLimit] = useState(3);
  const [promptsUsedToday, setPromptsUsedToday] = useState(0);
  const [promptsRemaining, setPromptsRemaining] = useState(3);
  const [loadingStatus, setLoadingStatus] = useState(true);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll on new message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, sending]);

  // Fetch initial daily limit status
  useEffect(() => {
    if (!token) {
      setLoadingStatus(false);
      return;
    }

    getAiMentorStatus(token)
      .then((status) => {
        if (status && typeof status.dailyLimit === 'number') {
          setDailyLimit(status.dailyLimit);
          setPromptsUsedToday(status.promptsUsedToday ?? 0);
          setPromptsRemaining(status.promptsRemaining ?? 0);
        }
      })
      .catch((err) => {
        console.warn('Failed to load AI Mentor status:', err);
      })
      .finally(() => {
        setLoadingStatus(false);
      });
  }, [token]);

  const handleSend = async (messageToSend?: string) => {
    const content = (messageToSend || text).trim();
    if (!content || sending || promptsRemaining <= 0) return;

    setSending(true);
    setError('');
    setText('');
    setMessages((current) => [...current, { role: 'user', content }]);

    try {
      const result = await sendAiMentorMessage(token, content, sessionId || undefined);
      setSessionId(result.sessionId || sessionId);
      setMessages((current) => [...current, result.message]);

      if (typeof result.promptsRemaining === 'number') {
        setPromptsRemaining(result.promptsRemaining);
        setPromptsUsedToday(result.promptsUsedToday ?? promptsUsedToday + 1);
        if (result.dailyLimit) setDailyLimit(result.dailyLimit);
      } else {
        setPromptsRemaining((prev) => Math.max(0, prev - 1));
        setPromptsUsedToday((prev) => prev + 1);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unable to contact AI Mentor.';
      setError(msg);
      // Re-fetch status if error occurred (e.g., hit 429 quota)
      getAiMentorStatus(token)
        .then((s) => {
          if (s) {
            setPromptsRemaining(s.promptsRemaining);
            setPromptsUsedToday(s.promptsUsedToday);
          }
        })
        .catch(() => {});
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    void handleSend();
  };

  const isLimitReached = !loadingStatus && promptsRemaining <= 0;

  return (
    <div className="ai-chatgpt-wrapper">
      {/* Header with Title and Quota Badge */}
      <div className="ai-chatgpt-header">
        <div>
          <div className="eyebrow">
            <Sparkles size={15} /> Student Guidance
          </div>
          <h2 className="page-title" style={{ margin: '4px 0 2px 0' }}>AI Mentor</h2>
          <p className="page-subtitle" style={{ margin: 0 }}>
            Quick, structured study-planning tips while keeping your human mentor informed.
          </p>
        </div>

        {/* Quota Badge */}
        {!loadingStatus && (
          <div
            className={`ai-quota-badge ${isLimitReached ? 'exhausted' : 'available'}`}
            title={`${promptsUsedToday} of ${dailyLimit} prompts used today`}
          >
            {isLimitReached ? <Clock size={14} /> : <Zap size={14} />}
            <span>
              {isLimitReached
                ? `0 / ${dailyLimit} daily prompts left`
                : `${promptsRemaining} of ${dailyLimit} daily prompts left`}
            </span>
          </div>
        )}
      </div>

      {/* Main ChatGPT-style Panel */}
      <section className="ai-chatgpt-panel">
        {/* Messages Feed */}
        <div className="ai-chatgpt-feed">
          {messages.map((message, index) => {
            const isUser = message.role === 'user';
            return (
              <div
                key={`${message.role}-${index}`}
                className={`ai-msg-row ${isUser ? 'user' : 'assistant'}`}
              >
                {!isUser && (
                  <div className="ai-avatar" aria-hidden="true">
                    <Bot size={18} />
                  </div>
                )}

                {isUser ? (
                  <div className="ai-user-bubble">{message.content}</div>
                ) : (
                  <div className="ai-msg-body">
                    <div className="ai-msg-sender">
                      <Sparkles size={13} style={{ color: 'var(--primary)' }} /> AI Mentor
                    </div>
                    <AiMarkdownRenderer content={message.content} />
                  </div>
                )}
              </div>
            );
          })}

          {/* Thinking animation */}
          {sending && (
            <div className="ai-msg-row assistant">
              <div className="ai-avatar" aria-hidden="true">
                <Bot size={18} />
              </div>
              <div className="ai-msg-body">
                <div className="ai-msg-sender">AI Mentor</div>
                <div className="ai-typing-indicator" aria-label="AI Mentor is thinking">
                  <span className="ai-typing-dot" />
                  <span className="ai-typing-dot" />
                  <span className="ai-typing-dot" />
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Starter Suggestion Chips (when only initial greeting is shown) */}
        {messages.length === 1 && !isLimitReached && (
          <div className="ai-starter-chips">
            {STARTER_PROMPTS.map((promptText, idx) => (
              <button
                key={idx}
                type="button"
                className="ai-starter-chip"
                onClick={() => void handleSend(promptText)}
                disabled={sending}
              >
                {promptText}
              </button>
            ))}
          </div>
        )}

        {/* Quota Exhausted Warning Banner */}
        {isLimitReached && (
          <div className="ai-limit-alert" role="status">
            <AlertCircle size={16} style={{ flexShrink: 0 }} />
            <span>
              You have used your <strong>{dailyLimit} daily prompts</strong>. AI Mentor will be available again tomorrow. For any questions right now, please reach out directly to your assigned human mentor!
            </span>
          </div>
        )}

        {/* Inline Error Message */}
        {error && (
          <div className="ai-limit-alert" style={{ color: 'var(--danger)' }} role="alert">
            <AlertCircle size={16} style={{ flexShrink: 0 }} />
            <span>{error}</span>
          </div>
        )}

        {/* Bottom Composer Capsule */}
        <footer className="ai-chatgpt-footer">
          <form
            className={`ai-composer-capsule ${isLimitReached ? 'locked' : ''}`}
            onSubmit={submit}
          >
            <input
              ref={inputRef}
              className="ai-composer-input"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={
                isLimitReached
                  ? 'Daily limit reached (3/3). Consult your human mentor.'
                  : 'Ask about your study plan or daily tasks…'
              }
              aria-label="Ask AI Mentor"
              maxLength={2000}
              disabled={sending || isLimitReached}
            />

            <button
              className="ai-send-btn"
              type="submit"
              disabled={!text.trim() || sending || isLimitReached}
              aria-label="Send prompt"
            >
              <ArrowUp size={18} strokeWidth={2.4} />
            </button>
          </form>

          <p className="ai-composer-disclaimer">
            AI Mentor provides educational guidance and does not replace your human mentor. Limit 3 prompts/day.
          </p>
        </footer>
      </section>
    </div>
  );
}
