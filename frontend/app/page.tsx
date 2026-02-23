import Link from 'next/link';
import styles from './page.module.css';

export default function LandingPage() {
    return (
        <main className={styles.main}>
            {/* Hero */}
            <section className={styles.hero}>
                <div className={styles.heroContent}>
                    <span className={`${styles.badge} label-medium`}>⚡ Powered by MultiversX</span>
                    <h1 className="display-medium">Your AI Research Agent</h1>
                    <p className="body-large" style={{ color: 'var(--md-on-surface-variant)', maxWidth: '600px' }}>
                        Ask anything. Upload documents. Get comprehensive research reports.
                        Pay per query with crypto — no subscriptions, no middlemen.
                    </p>
                    <div className={styles.heroActions}>
                        <Link href="/chat" className="btn btn-filled" style={{ fontSize: '16px', padding: '14px 32px' }}>
                            💬 Start Research
                        </Link>
                        <a href="#features" className="btn btn-outlined">
                            Learn More ↓
                        </a>
                    </div>
                </div>
                <div className={styles.heroVisual}>
                    <div className={styles.terminalCard}>
                        <div className={styles.terminalHeader}>
                            <span className={styles.dot} style={{ background: '#FF5F57' }} />
                            <span className={styles.dot} style={{ background: '#FFBD2E' }} />
                            <span className={styles.dot} style={{ background: '#28C840' }} />
                        </div>
                        <div className={styles.terminalBody}>
                            <p><span style={{ color: 'var(--md-primary)' }}>you:</span> Research the latest trends in decentralized AI</p>
                            <p><span style={{ color: 'var(--md-tertiary)' }}>agent:</span> Analyzing 47 sources... ▊</p>
                            <p style={{ opacity: 0.5 }}>⏳ Generating comprehensive report...</p>
                        </div>
                    </div>
                </div>
            </section>

            {/* Features */}
            <section id="features" className={styles.features}>
                <h2 className="headline-large" style={{ textAlign: 'center', marginBottom: 'var(--space-xl)' }}>
                    How It Works
                </h2>
                <div className={styles.featureGrid}>
                    <div className="card card-elevated">
                        <div className={styles.featureIcon}>📝</div>
                        <h3 className="title-large">Upload Documents</h3>
                        <p className="body-medium" style={{ color: 'var(--md-on-surface-variant)' }}>
                            Drop PDFs, CSVs, or text files. The agent reads them as context for your research query.
                        </p>
                    </div>
                    <div className="card card-elevated">
                        <div className={styles.featureIcon}>💰</div>
                        <h3 className="title-large">Pay Per Query</h3>
                        <p className="body-medium" style={{ color: 'var(--md-on-surface-variant)' }}>
                            No subscriptions. Pay only for what you use via MultiversX x402 micropayments.
                        </p>
                    </div>
                    <div className="card card-elevated">
                        <div className={styles.featureIcon}>⚡</div>
                        <h3 className="title-large">Real-Time Streaming</h3>
                        <p className="body-medium" style={{ color: 'var(--md-on-surface-variant)' }}>
                            Watch the agent think and research in real-time. Results stream directly to your chat.
                        </p>
                    </div>
                    <div className="card card-elevated">
                        <div className={styles.featureIcon}>📄</div>
                        <h3 className="title-large">Download Reports</h3>
                        <p className="body-medium" style={{ color: 'var(--md-on-surface-variant)' }}>
                            Get polished research reports as downloadable PDFs, with on-chain proof of authenticity.
                        </p>
                    </div>
                </div>
            </section>

            {/* Footer */}
            <footer className={styles.footer}>
                <p className="body-medium" style={{ color: 'var(--md-on-surface-variant)' }}>
                    Built with ❤️ on MultiversX • On-chain identity • Verifiable results • x402 payments
                </p>
            </footer>
        </main>
    );
}
