'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import styles from './chat.module.css';

// Types
interface Message {
    id: string;
    role: 'user' | 'assistant' | 'system';
    content: string;
    type?: 'text' | 'thinking' | 'payment' | 'report' | 'error';
    payment?: { amount: string; token: string; receiver: string; sessionId: string };
    jobId?: string;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

export default function ChatPage() {
    const [messages, setMessages] = useState<Message[]>([
        { id: 'welcome', role: 'assistant', content: 'Hello! I\'m your AI research agent. Type a question or upload a document to get started.', type: 'text' },
    ]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [sessionId, setSessionId] = useState<string | null>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Auto-scroll
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const addMessage = useCallback((msg: Message) => {
        setMessages(prev => [...prev, msg]);
    }, []);

    // Send message
    const handleSend = async () => {
        if (!input.trim() || isLoading) return;
        const userMsg = input.trim();
        setInput('');

        addMessage({ id: `user-${Date.now()}`, role: 'user', content: userMsg, type: 'text' });
        setIsLoading(true);

        try {
            const res = await fetch(`${API_URL}/api/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message: userMsg, sessionId }),
            });

            if (res.status === 402) {
                const data = await res.json();
                setSessionId(data.sessionId);
                addMessage({
                    id: `payment-${Date.now()}`,
                    role: 'system',
                    content: data.payment.message,
                    type: 'payment',
                    payment: { ...data.payment, sessionId: data.sessionId },
                });
            } else if (res.ok && res.headers.get('content-type')?.includes('text/event-stream')) {
                // SSE streaming
                const reader = res.body?.getReader();
                const decoder = new TextDecoder();
                let botMsgId = `bot-${Date.now()}`;
                let botContent = '';

                addMessage({ id: botMsgId, role: 'assistant', content: '', type: 'thinking' });

                if (reader) {
                    while (true) {
                        const { done, value } = await reader.read();
                        if (done) break;

                        const chunk = decoder.decode(value, { stream: true });
                        const lines = chunk.split('\n').filter(l => l.startsWith('data: '));

                        for (const line of lines) {
                            try {
                                const data = JSON.parse(line.slice(6));
                                if (data.type === 'text') {
                                    botContent += data.content;
                                    setMessages(prev =>
                                        prev.map(m => m.id === botMsgId ? { ...m, content: botContent, type: 'text' } : m)
                                    );
                                } else if (data.type === 'complete') {
                                    setMessages(prev =>
                                        prev.map(m => m.id === botMsgId ? { ...m, content: botContent || data.content, type: 'text', jobId: data.jobId } : m)
                                    );
                                }
                            } catch { /* skip malformed lines */ }
                        }
                    }
                }
            } else {
                const data = await res.json().catch(() => ({ error: 'Unknown error' }));
                addMessage({ id: `err-${Date.now()}`, role: 'system', content: data.error || 'Something went wrong', type: 'error' });
            }
        } catch (err) {
            addMessage({ id: `err-${Date.now()}`, role: 'system', content: `Network error: ${(err as Error).message}`, type: 'error' });
        } finally {
            setIsLoading(false);
        }
    };

    // Confirm payment
    const handleConfirmPayment = async (payment: Message['payment']) => {
        if (!payment) return;
        try {
            const res = await fetch(`${API_URL}/api/chat/confirm-payment`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sessionId: payment.sessionId, txHash: `mock-tx-${Date.now()}` }),
            });
            const data = await res.json();
            if (data.status === 'confirmed') {
                addMessage({ id: `confirmed-${Date.now()}`, role: 'system', content: '✅ Payment confirmed! You can now send your query.', type: 'text' });
                setSessionId(payment.sessionId);
            }
        } catch (err) {
            addMessage({ id: `err-${Date.now()}`, role: 'system', content: `Payment confirmation failed: ${(err as Error).message}`, type: 'error' });
        }
    };

    // File upload
    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const formData = new FormData();
        formData.append('file', file);

        try {
            const res = await fetch(`${API_URL}/api/upload`, { method: 'POST', body: formData });
            const data = await res.json();
            if (data.fileId) {
                addMessage({ id: `file-${Date.now()}`, role: 'user', content: `📎 Uploaded: ${file.name} (${(file.size / 1024).toFixed(1)} KB)`, type: 'text' });
            }
        } catch (err) {
            addMessage({ id: `err-${Date.now()}`, role: 'system', content: `Upload failed: ${(err as Error).message}`, type: 'error' });
        }
    };

    return (
        <div className={styles.chatPage}>
            {/* Header */}
            <header className={styles.header}>
                <a href="/" className={styles.backButton}>← Back</a>
                <h1 className="title-medium">AI Research Agent</h1>
                <span className={styles.statusDot} />
            </header>

            {/* Messages */}
            <div className={styles.messagesContainer}>
                {messages.map(msg => (
                    <div key={msg.id} className={`${styles.message} ${styles[msg.role]} ${msg.type === 'payment' ? styles.paymentMessage : ''}`}>
                        {msg.type === 'thinking' ? (
                            <div className={styles.thinking}>
                                <span className={styles.thinkingDot} />
                                <span className={styles.thinkingDot} />
                                <span className={styles.thinkingDot} />
                            </div>
                        ) : msg.type === 'payment' && msg.payment ? (
                            <div className={styles.paymentCard}>
                                <div className={styles.paymentIcon}>💰</div>
                                <p className="title-medium">Payment Required</p>
                                <p className="body-medium">{msg.content}</p>
                                <div className={styles.paymentDetails}>
                                    <span className="label-large">{msg.payment.amount} {msg.payment.token}</span>
                                </div>
                                <button className="btn btn-filled" onClick={() => handleConfirmPayment(msg.payment)}>
                                    🔐 Pay with xPortal
                                </button>
                            </div>
                        ) : msg.type === 'error' ? (
                            <div className={styles.errorMessage}>⚠️ {msg.content}</div>
                        ) : (
                            <div className={styles.messageContent}>
                                {msg.content}
                                {msg.jobId && (
                                    <a
                                        href={`${API_URL}/api/download/${msg.jobId}`}
                                        className="btn btn-tonal"
                                        style={{ marginTop: 'var(--space-sm)', display: 'inline-flex' }}
                                    >
                                        📄 Download Report (PDF)
                                    </a>
                                )}
                            </div>
                        )}
                    </div>
                ))}
                <div ref={messagesEndRef} />
            </div>

            {/* Input Bar */}
            <div className={styles.inputBar}>
                <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileUpload}
                    style={{ display: 'none' }}
                    accept=".pdf,.csv,.txt,.docx,.md"
                />
                <button className={styles.attachButton} onClick={() => fileInputRef.current?.click()} title="Upload file">
                    📎
                </button>
                <input
                    type="text"
                    className={styles.textInput}
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSend()}
                    placeholder="Ask a research question..."
                    disabled={isLoading}
                />
                <button className={`btn btn-filled ${styles.sendButton}`} onClick={handleSend} disabled={isLoading || !input.trim()}>
                    {isLoading ? '⏳' : '↑'}
                </button>
            </div>
        </div>
    );
}
