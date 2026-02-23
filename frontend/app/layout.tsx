import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
    title: 'OpenClaw Agent — Powered by MultiversX',
    description: 'AI agent with on-chain identity, reputation, and micropayments. Chat, pay, and get results instantly.',
    keywords: ['AI agent', 'MultiversX', 'OpenClaw', 'x402', 'crypto payments'],
};

export default function RootLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <html lang="en">
            <head>
                <meta name="color-scheme" content="light dark" />
                <meta name="viewport" content="width=device-width, initial-scale=1" />
            </head>
            <body>
                {children}
            </body>
        </html>
    );
}
