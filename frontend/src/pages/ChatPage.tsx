import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MessageCircle, RefreshCw, Send, UserPlus } from 'lucide-react';
import { createConversation, getChatContacts, getConversationMessages, getConversations, sendConversationMessage } from '../lib/api';
import { connectChatSocket, disconnectChatSocket } from '../lib/chatSocket';

type Contact = { id: string; name: string; email?: string; role: string };
type Conversation = { id: string; participantIds: string[]; lastMessage?: string; updatedAt?: string };
type Message = { id: string; conversationId?: string; senderId: string; text: string; createdAt?: string };

function currentUser() {
  try { return JSON.parse(localStorage.getItem('anfaal-user') ?? '{}') as { id?: string }; } catch { return {}; }
}
function formatTime(value?: string) { return value ? new Date(value).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' }) : ''; }

export function ChatPage() {
  const token = localStorage.getItem('anfaal-token') ?? '';
  const userId = currentUser().id ?? '';
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [items, setItems] = useState<Conversation[]>([]);
  const [active, setActive] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState('');
  const [contactId, setContactId] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [socketOnline, setSocketOnline] = useState(false);
  const socketRef = useRef<ReturnType<typeof connectChatSocket> | null>(null);
  const activeIdRef = useRef('');

  const contactMap = useMemo(() => new Map(contacts.map((contact) => [contact.id, contact])), [contacts]);
  const conversationName = (conversation: Conversation) => conversation.participantIds.filter((id) => id !== userId).map((id) => contactMap.get(id)?.name ?? id).join(', ') || 'Conversation';

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [contactResult, conversationResult] = await Promise.all([getChatContacts(token), getConversations(token)]);
      setContacts(contactResult.contacts ?? []);
      setItems(conversationResult.conversations ?? []);
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to load chat.'); }
    finally { setLoading(false); }
  }, [token]);

  // This effect intentionally synchronizes conversations and contacts with the API.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);
  // Loading a selected conversation is an intentional external synchronization.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const socket = connectChatSocket(token);
    socketRef.current = socket;
    const onConnect = () => {
      setSocketOnline(true);
      if (activeIdRef.current) socket.emit('chat:join', { conversationId: activeIdRef.current });
    };
    const onDisconnect = () => { setSocketOnline(false); };
    const onConnectError = () => { setSocketOnline(false); setError('Real-time chat is reconnecting.'); };
    const onMessage = (message: Message) => {
      if (message.conversationId === activeIdRef.current || !message.conversationId) {
        setMessages((current) => current.some((item) => item.id === message.id) ? current : [...current, message]);
      }
      setItems((current) => current.map((item) => item.id === message.conversationId ? { ...item, lastMessage: message.text, updatedAt: message.createdAt } : item));
    };
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('connect_error', onConnectError);
    socket.on('chat:message', onMessage);
    if (socket.connected) setSocketOnline(true);
    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('connect_error', onConnectError);
      socket.off('chat:message', onMessage);
      disconnectChatSocket();
      socketRef.current = null;
    };
  }, [token]);
  useEffect(() => {
    activeIdRef.current = active?.id ?? '';
    if (!active) { setMessages([]); return; }
    let cancelled = false;
    setMessagesLoading(true);
    getConversationMessages(token, active.id)
      .then((result) => { if (!cancelled) setMessages(result.messages ?? []); })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : 'Unable to load messages.'); })
      .finally(() => { if (!cancelled) setMessagesLoading(false); });
    socketRef.current?.emit('chat:join', { conversationId: active.id });
    return () => { cancelled = true; };
  }, [active, token]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const start = async () => {
    if (!contactId) return;
    setError('');
    try {
      const result = await createConversation(token, [contactId]);
      const conversation = result.conversation as Conversation;
      setItems((current) => [conversation, ...current.filter((item) => item.id !== conversation.id)]);
      setActive(conversation);
      setContactId('');
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to create chat.'); }
  };

  const send = async () => {
    if (!active || !text.trim() || sending) return;
    setSending(true); setError('');
    try {
      const messageText = text.trim();
      if (socketRef.current?.connected) {
        await new Promise<void>((resolve, reject) => {
          socketRef.current?.timeout(10000).emit('chat:send', { conversationId: active.id, text: messageText }, (timeoutError: Error | null, result: { ok: boolean; message?: string }) => {
            if (timeoutError) { reject(new Error('Real-time chat timed out. Please try again.')); return; }
            if (!result?.ok) reject(new Error(result?.message || 'Unable to send message.'));
            else resolve();
          });
        });
      } else {
        const result = await sendConversationMessage(token, active.id, messageText);
        setMessages((current) => current.some((item) => item.id === result.message.id) ? current : [...current, result.message as Message]);
      }
      setItems((current) => current.map((item) => item.id === active.id ? { ...item, lastMessage: messageText, updatedAt: new Date().toISOString() } : item));
      setText('');
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to send message.'); }
    finally { setSending(false); }
  };

  return (
    <div className="chat-page">
      <div className="page-header">
        <div><div className="eyebrow">Mentor–mentee communication</div><h2 className="page-title">In-app chat</h2><p className="page-subtitle">Private conversations with your assigned mentorship contacts.</p></div>
        <button className="btn-secondary chat-refresh" type="button" onClick={() => void load()}><RefreshCw size={16} /> Refresh</button>
      </div>
      {error && <div className="alert-banner alert-error" role="alert">{error}</div>}
      <div className="chat-layout">
        <section className="summary-card chat-conversations">
          <div className="chat-section-heading"><h3>Conversations</h3><MessageCircle size={20} /></div>
          <div className="chat-new-row"><select className="input" value={contactId} onChange={(event) => setContactId(event.target.value)} aria-label="Choose a contact"><option value="">Choose contact</option>{contacts.map((contact) => <option key={contact.id} value={contact.id}>{contact.name} · {contact.role.toLowerCase()}</option>)}</select><button className="btn-primary" type="button" onClick={() => void start()} disabled={!contactId}><UserPlus size={16} /> New</button></div>
          {loading ? <div className="empty-state compact">Loading conversations…</div> : items.length === 0 ? <div className="empty-state compact"><MessageCircle size={28} /><strong>No conversations yet</strong><span>Choose an assigned contact to start.</span></div> : <div className="conversation-list">{items.map((item) => <button key={item.id} type="button" className={`conversation-item ${active?.id === item.id ? 'active' : ''}`} onClick={() => setActive(item)}><strong>{conversationName(item)}</strong><span>{item.lastMessage || 'No messages yet'}</span></button>)}</div>}
        </section>
        <section className="summary-card chat-thread">
          <div className="chat-section-heading"><h3>{active ? conversationName(active) : 'Select a conversation'}</h3>{active && <span className={`chat-connection ${socketOnline ? 'online' : ''}`}><span className="chat-connection-dot" />{socketOnline ? 'Live' : 'Reconnecting'}</span>}</div>
          {!active ? <div className="empty-state chat-empty"><MessageCircle size={42} /><strong>Select a conversation</strong><span>Your messages will appear here.</span></div> : <><div className="chat-messages">{messagesLoading ? <div className="empty-state compact">Loading messages…</div> : messages.length === 0 ? <div className="empty-state compact">No messages yet. Start the conversation.</div> : messages.map((message) => <div key={message.id} className={`chat-message ${message.senderId === userId ? 'mine' : ''}`}><span>{message.text}</span><small>{formatTime(message.createdAt)}</small></div>)}</div><div className="chat-composer"><input className="input" value={text} onChange={(event) => setText(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void send(); }} placeholder="Write a message…" aria-label="Message" /><button className="btn-primary" type="button" onClick={() => void send()} disabled={!text.trim() || sending}><Send size={16} /> {sending ? 'Sending…' : 'Send'}</button></div></>}
        </section>
      </div>
    </div>
  );
}
