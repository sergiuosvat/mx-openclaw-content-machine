'use client';

/**
 * useChat — Hook for managing chat sessions with the OpenClaw backend.
 *
 * Handles: session creation, message sending, SSE streaming, payment gating.
 */

import { useState, useCallback, useRef } from 'react';

export interface ChatMessage {
    role: 'user' | 'assistant' | 'system';
    content: string;
    timestamp: number;
}

export interface PaymentRequest {
    amount: string;
    token: string;
    receiver: string;
    message: string;
}

interface UseChatReturn {
    messages: ChatMessage[];
    sessionId: string | null;
    isLoading: boolean;
    isStreaming: boolean;
    paymentRequired: PaymentRequest | null;
    error: string | null;
    sendMessage: (message: string) => Promise<void>;
    confirmPayment: (txHash: string) => Promise<void>;
    reset: () => void;
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

export function useChat(): UseChatReturn {
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [sessionId, setSessionId] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [isStreaming, setIsStreaming] = useState(false);
    const [paymentRequired, setPaymentRequired] = useState<PaymentRequest | null>(null);
    const [error, setError] = useState<string | null>(null);
    const abortRef = useRef<AbortController | null>(null);

    const sendMessage = useCallback(async (message: string) => {
        setIsLoading(true);
        setError(null);
        setPaymentRequired(null);

        // Add user message immediately
        const userMsg: ChatMessage = { role: 'user', content: message, timestamp: Date.now() };
        setMessages(prev => [...prev, userMsg]);

        try {
            const response = await fetch(`${API_BASE}/api/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message, sessionId }),
            });

            // Payment required
            if (response.status === 402) {
                const data = await response.json();
                setSessionId(data.sessionId);
                setPaymentRequired(data.payment);
                setIsLoading(false);
                return;
            }

            if (!response.ok) {
                throw new Error(`API error: ${response.status}`);
            }

            // SSE streaming response
            setIsStreaming(true);
            setIsLoading(false);

            const reader = response.body?.getReader();
            if (!reader) throw new Error('No response body');

            const decoder = new TextDecoder();
            let assistantContent = '';
            let buffer = '';

            // Add placeholder assistant message
            setMessages(prev => [...prev, { role: 'assistant', content: '', timestamp: Date.now() }]);

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';

                for (const line of lines) {
                    if (!line.startsWith('data: ')) continue;
                    try {
                        const event = JSON.parse(line.slice(6));
                        if (event.type === 'text') {
                            assistantContent += event.content;
                            setMessages(prev => {
                                const updated = [...prev];
                                updated[updated.length - 1] = {
                                    role: 'assistant',
                                    content: assistantContent,
                                    timestamp: Date.now(),
                                };
                                return updated;
                            });
                        } else if (event.type === 'error') {
                            setError(event.content);
                        }
                    } catch {
                        // Skip malformed SSE lines
                    }
                }
            }

            setIsStreaming(false);
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Unknown error');
            setIsLoading(false);
            setIsStreaming(false);
        }
    }, [sessionId]);

    const confirmPayment = useCallback(async (txHash: string) => {
        if (!sessionId) return;
        setIsLoading(true);
        setError(null);

        try {
            const response = await fetch(`${API_BASE}/api/chat/confirm-payment`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sessionId, txHash }),
            });

            if (!response.ok) {
                throw new Error('Payment confirmation failed');
            }

            setPaymentRequired(null);
            // Resend the last user message now that payment is confirmed
            const lastUserMsg = messages.filter(m => m.role === 'user').pop();
            if (lastUserMsg) {
                setIsLoading(false);
                await sendMessage(lastUserMsg.content);
            }
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Payment error');
            setIsLoading(false);
        }
    }, [sessionId, messages, sendMessage]);

    const reset = useCallback(() => {
        abortRef.current?.abort();
        setMessages([]);
        setSessionId(null);
        setIsLoading(false);
        setIsStreaming(false);
        setPaymentRequired(null);
        setError(null);
    }, []);

    return {
        messages,
        sessionId,
        isLoading,
        isStreaming,
        paymentRequired,
        error,
        sendMessage,
        confirmPayment,
        reset,
    };
}
