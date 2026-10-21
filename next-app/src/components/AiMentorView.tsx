'use client';

import { useState } from 'react';
import type { FormEvent } from 'react';
import { Bot, Send, Sparkles } from 'lucide-react';
import { sendAiMentorMessage, getToken } from '@/lib/api';

type ChatMessage = { role: 'user' | 'assistant'; content: string; createdAt?: string };

export function AiMentorView() {
  const [sessionId, setSessionId] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: 'assistant',
      content:
        'Assalamu alaikum! I can help you plan your study time, reflect on progress, and prepare questions for your human mentor.',
    },
  ]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const content = text.trim();
    if (!content || sending) return;
    setSending(true);
    setError('');
    setText('');
    setMessages((current) => [...current, { role: 'user', content }]);
    try {
      const token = getToken();
      const result = await sendAiMentorMessage(token, content, sessionId || undefined);
      setSessionId(result.sessionId || sessionId);
      setMessages((current) => [...current, result.message as ChatMessage]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to contact AI Mentor.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="chat-page ai-mentor-page">
      <div className="page-header">
        <div>
          <div className="eyebrow">
            <Sparkles size={15} /> Student support
          </div>
          <h2 className="page-title">AI Mentor</h2>
          <p className="page-subtitle">
            Get study-planning guidance while keeping your assigned human mentor in the loop.
          </p>
        </div>
      </div>
      <div className="alert-banner" role="note">
        <Bot size={17} /> AI Mentor provides educational guidance and does not replace your assigned mentor.
      </div>
      {error && (
        <div className="alert-banner alert-error" role="alert">
          {error}
        </div>
      )}
      <section className="summary-card ai-mentor-card">
        <div className="chat-messages ai-mentor-messages">
          {messages.map((message, index) => (
            <div
              key={`${message.role}-${index}`}
              className={`chat-message ${message.role === 'user' ? 'mine' : ''}`}
            >
              <span>{message.content}</span>
            </div>
          ))}
          {sending && <div className="empty-state compact">AI Mentor is thinking…</div>}
        </div>
        <form className="chat-composer" onSubmit={submit}>
          <input
            className="input"
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder="Ask about your study plan…"
            aria-label="Ask AI Mentor"
            maxLength={2000}
            disabled={sending}
          />
          <button className="btn-primary" type="submit" disabled={!text.trim() || sending}>
            <Send size={16} /> Send
          </button>
        </form>
      </section>
    </div>
  );
}
