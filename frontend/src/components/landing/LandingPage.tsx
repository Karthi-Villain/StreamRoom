import React, { useState } from "react";
import {
  Play,
  Users,
  Radio,
  Tv,
  Zap,
  Globe,
  Activity,
  Layers,
  HelpCircle,
  ArrowRight,
  ShieldCheck,
  Headphones,
  Subtitles,
  Sparkles,
  MessageSquare,
} from "lucide-react";
import { TextParticleCanvas } from "./TextParticleCanvas";
import styles from "./LandingPage.module.css";

interface LandingPageProps {
  onOpenCreate: () => void;
  onOpenJoin: (roomId?: string) => void;
}

export const LandingPage: React.FC<LandingPageProps> = ({ onOpenCreate, onOpenJoin }) => {
  const [quickCode, setQuickCode] = useState("");

  const handleQuickJoinSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = quickCode.trim();
    if (!clean) return;
    onOpenJoin(clean);
  };

  const scrollToSection = (id: string) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: "smooth" });
    }
  };

  return (
    <div className={styles.landingWrapper}>
      <div className={styles.ambientGlow} />

      {/* Top Navigation Bar */}
      <header className={styles.landingNav}>
        <div className={styles.brandLogo} onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}>
          <div className={styles.brandIcon}>N</div>
          <span className={styles.brandTitle}>
            STREAM<span className={styles.brandTitleHighlight}>ROOM</span>
          </span>
        </div>

        <nav className={styles.navLinks}>
          <span className={styles.navLinkItem} onClick={() => scrollToSection("features")}>
            Features & Capabilities
          </span>
          <span className={styles.navLinkItem} onClick={() => scrollToSection("faq")}>
            Audio Tracks & FAQ
          </span>
        </nav>

        <div className={styles.navActions}>
          <button className={styles.joinNavBtn} onClick={() => onOpenJoin()}>
            Join Room
          </button>
          <button className={styles.createNavBtn} onClick={onOpenCreate}>
            <Play size={13} fill="#ffffff" />
            <span>Create Room</span>
          </button>
        </div>
      </header>

      {/* Hero Section */}
      <section className={styles.heroSection}>
        <div className={styles.heroBadge}>
          <Sparkles size={13} color="#E50914" />
          <span>Next-Generation Synchronized Streaming & Voice Mesh</span>
        </div>

        {/* Interactive Mouse-Repulsion Text Particle Animation */}
        <div className={styles.particleContainer}>
          <TextParticleCanvas />
        </div>
        <div className={styles.particleHint}>
          ✦ Move mouse or swipe over text to disperse particles ✦
        </div>

        <p className={styles.heroSubtitle}>
          Watch movies, stream HLS and MPEG-DASH broadcasts, and co-browse the web in perfect
          real-time synchronization. Connect with friends over crystal-clear WebRTC voice channels and
          YouTube Live-style chat with zero lag and zero drift.
        </p>

        {/* Attractive Hero Action Buttons */}
        <div className={styles.ctaContainer}>
          <div className={styles.ctaButtonsRow}>
            <button className={styles.primaryCreateBtn} onClick={onOpenCreate}>
              <Play size={18} fill="#ffffff" />
              <span>Create Room</span>
            </button>

            <button className={styles.secondaryJoinBtn} onClick={() => onOpenJoin()}>
              <Users size={18} />
              <span>Join Existing Room</span>
            </button>
          </div>

          {/* Quick Room Code Input */}
          <form onSubmit={handleQuickJoinSubmit} className={styles.quickJoinBox}>
            <input
              type="text"
              className={styles.quickCodeInput}
              value={quickCode}
              onChange={(e) => setQuickCode(e.target.value.toUpperCase())}
              placeholder="Enter 12-char Room ID (e.g. QT8z5ZFCeBi7)..."
              maxLength={12}
            />
            <button type="submit" className={styles.quickJoinSubmit} disabled={quickCode.trim().length === 0}>
              <span>Join</span>
              <ArrowRight size={13} />
            </button>
          </form>

          {/* Technology Badges */}
          <div className={styles.techPillsGroup}>
            <span className={styles.techPill}>HLS / DASH (MSE)</span>
            <span className={styles.techPill}>NTP Clock Sync (±25ms)</span>
            <span className={styles.techPill}>WebRTC Audio Mesh</span>
            <span className={styles.techPill}>Multi-Audio Tracks</span>
            <span className={styles.techPill}>Host Knock Approvals</span>
          </div>
        </div>
      </section>

      {/* Complete Overview & Feature Grid */}
      <section id="features" className={styles.featuresSection}>
        <div className={styles.sectionHeader}>
          <div className={styles.sectionTag}>Platform Capabilities</div>
          <h2 className={styles.sectionTitle}>Engineered for Flawless Watch Parties</h2>
          <p className={styles.sectionDesc}>
            Built from the ground up for high-performance streaming, synchronized controls, and
            private audience participation.
          </p>
        </div>

        <div className={styles.featuresGrid}>
          {/* Card 1 */}
          <div className={styles.featureCard}>
            <div className={styles.featureIconWrap}>
              <Zap size={22} />
            </div>
            <h3 className={styles.featureTitle}>Sub-Second Clock Sync</h3>
            <p className={styles.featureDesc}>
              Proprietary NTP-style round-trip time calculations actively measure network latency and
              eliminate clock skew. All peers playback video within 25ms of each other without jerky
              re-buffering.
            </p>
          </div>

          {/* Card 2 */}
          <div className={styles.featureCard}>
            <div className={styles.featureIconWrap}>
              <Subtitles size={22} />
            </div>
            <h3 className={styles.featureTitle}>Multi-Track Audio & Subtitles</h3>
            <p className={styles.featureDesc}>
              Media Source Extensions (MSE) pipeline for HLS (.m3u8) and MPEG-DASH (.mpd) manifests.
              Switch between audio languages (5.1 Surround, Stereo, Commentary) and toggle subtitles
              instantly from our Netflix player menu.
            </p>
          </div>

          {/* Card 3 */}
          <div className={styles.featureCard}>
            <div className={styles.featureIconWrap}>
              <Headphones size={22} />
            </div>
            <h3 className={styles.featureTitle}>WebRTC Voice Mesh</h3>
            <p className={styles.featureDesc}>
              Full-duplex peer-to-peer audio mesh with Voice Activity Detection (VAD) and speaking
              waves. Join with a microphone or enter "Listen Only" mode without needing audio hardware.
            </p>
          </div>

          {/* Card 4 */}
          <div className={styles.featureCard}>
            <div className={styles.featureIconWrap}>
              <MessageSquare size={22} />
            </div>
            <h3 className={styles.featureTitle}>YouTube Live-Style Chat</h3>
            <p className={styles.featureDesc}>
              Real-time messaging with deterministic user avatars, Host and You badges, and smooth
              auto-scroll. Supports fullscreen frosted glass overlay with auto-fade on 7s inactivity.
            </p>
          </div>

          {/* Card 5 */}
          <div className={styles.featureCard}>
            <div className={styles.featureIconWrap}>
              <Globe size={22} />
            </div>
            <h3 className={styles.featureTitle}>Synchronized Co-Browsing</h3>
            <p className={styles.featureDesc}>
              Switch from video mode to interactive web co-browsing. Browse documentation, wikis, and
              web pages together with real-time scroll sync and live remote mouse cursor tracking.
            </p>
          </div>

          {/* Card 6 */}
          <div className={styles.featureCard}>
            <div className={styles.featureIconWrap}>
              <Activity size={22} />
            </div>
            <h3 className={styles.featureTitle}>Real-time Diagnostics HUD</h3>
            <p className={styles.featureDesc}>
              Live telemetry tracking download throughput (Mbps), buffer health seconds, dropped video
              frames, signaling RTT, and clock drift to ensure optimal playback conditions.
            </p>
          </div>
        </div>
      </section>

      {/* Technical FAQ & Audio Track Explanation Section */}
      <section id="faq" className={styles.faqSection}>
        <div className={styles.sectionHeader}>
          <div className={styles.sectionTag}>Technical Deep-Dive</div>
          <h2 className={styles.sectionTitle}>Frequently Asked Questions</h2>
          <p className={styles.sectionDesc}>
            Under-the-hood architecture explanations and streaming best practices.
          </p>
        </div>

        <div className={styles.faqList}>
          {/* Question 1: The MP4 / MKV Audio Track Explanation */}
          <div className={styles.faqItem}>
            <div className={styles.faqQuestion}>
              <HelpCircle size={18} className={styles.faqQuestionHighlight} />
              <span>Why are .mp4 or .mkv files unable to show or switch audio tracks in the browser?</span>
            </div>
            <div className={styles.faqAnswer}>
              <p>
                This is a fundamental browser architecture limitation resulting from three factors:
              </p>
              <br />
              <p>
                <strong>1. Disabled Browser Audio Track API:</strong> While the W3C specification
                included <code>HTMLMediaElement.audioTracks</code>, <strong>Google Chrome, Microsoft Edge,
                and Mozilla Firefox have intentionally disabled multi-audio track selection for standard
                video files by default</strong> (it returns <code>undefined</code>). Chrome locks playback
                to the first audio track in the MP4 file and ignores secondary audio streams.
              </p>
              <br />
              <p>
                <strong>2. Lack of Native .mkv (Matroska) Support:</strong> Standard HTML5 video elements
                in web browsers do not support the Matroska (<code>.mkv</code>) container. Browsers will
                refuse to play or demux multi-track MKV files natively without server-side transcoding or
                remuxing into MP4/WebM.
              </p>
              <br />
              <p>
                <strong>3. How Streaming Platforms (Netflix, YouTube, Prime) Solve It:</strong> Modern
                streaming services do not deliver raw multi-track MP4 files. Instead, they use adaptive
                bitrate manifests: <strong>HLS (<code>.m3u8</code>)</strong> and <strong>MPEG-DASH
                (<code>.mpd</code>)</strong>. In HLS/DASH, video and each audio track are segmented into
                distinct files. Media Source Extensions (MSE) libraries like <code>Hls.js</code> and
                <code>Dash.js</code> dynamically fetch and buffer the selected audio track chunks into the
                browser audio buffer.
              </p>
              <div className={styles.codeSnippet}>
                {`# Example HLS Master Playlist with switchable multi-audio tracks:
#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",NAME="English 5.1",DEFAULT=YES,URI="audio_en.m3u8"
#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",NAME="Spanish Stereo",DEFAULT=NO,URI="audio_es.m3u8"
#EXT-X-STREAM-INF:BANDWIDTH=5000000,AUDIO="audio"
video_1080p.m3u8`}
              </div>
              <br />
              <p>
                <strong>StreamRoom Solution:</strong> StreamRoom has full native integration with
                <code>Hls.js</code> and <code>Dash.js</code>. Whenever you stream an HLS or DASH link, all
                audio tracks and subtitles automatically appear in our Netflix Audio & Subtitles menu,
                and can be switched in real-time!
              </p>
            </div>
          </div>

          {/* Question 2 */}
          <div className={styles.faqItem}>
            <div className={styles.faqQuestion}>
              <HelpCircle size={18} className={styles.faqQuestionHighlight} />
              <span>How does StreamRoom keep all viewers synchronized across the globe?</span>
            </div>
            <div className={styles.faqAnswer}>
              When a user plays, pauses, or seeks, the action is dispatched to the room signaling server
              along with a high-resolution server timestamp. Connected clients periodically measure
              round-trip network latency using NTP-style ping/pong exchanges to calculate their exact clock
              offset. If a client drifts ahead or behind by more than 25ms, an adaptive ±0.05x playback rate
              nudge imperceptibly pulls the viewer back into lockstep without audio skips.
            </div>
          </div>

          {/* Question 3 */}
          <div className={styles.faqItem}>
            <div className={styles.faqQuestion}>
              <HelpCircle size={18} className={styles.faqQuestionHighlight} />
              <span>Can I join the voice channel in "Listen Only" mode?</span>
            </div>
            <div className={styles.faqAnswer}>
              Yes! You can click the <strong>"Listen Only"</strong> button to join the voice mesh as a
              receive-only participant. You will hear all connected room members in spatial audio without
              requiring microphone hardware or mic permissions.
            </div>
          </div>

          {/* Question 4 */}
          <div className={styles.faqItem}>
            <div className={styles.faqQuestion}>
              <HelpCircle size={18} className={styles.faqQuestionHighlight} />
              <span>What access control protections are supported for private rooms?</span>
            </div>
            <div className={styles.faqAnswer}>
              StreamRoom supports three access protection levels: <strong>Public</strong> (instant open link),
              <strong>PIN Protected</strong> (numeric code required), and <strong>Host Approval Required</strong>
              (incoming participants enter a knock queue, and a floating approval prompt appears on the host's
              screen and over the video player).
            </div>
          </div>
        </div>
      </section>

      {/* Bottom Call to Action Card */}
      <section className={styles.bottomCtaSection}>
        <div className={styles.bottomCtaCard}>
          <div className={styles.heroBadge}>
            <Sparkles size={13} color="#E50914" />
            <span>Ready for your next watch party?</span>
          </div>
          <h2 className={styles.bottomCtaTitle}>Launch a Synchronized Room in Seconds</h2>
          <p className={styles.bottomCtaSubtitle}>
            No account required. Instant private room creation with HLS/DASH streaming, WebRTC voice,
            and synchronized chat.
          </p>
          <div className={styles.bottomCtaButtons}>
            <button className={styles.primaryCreateBtn} onClick={onOpenCreate}>
              <Play size={16} fill="#ffffff" />
              <span>Create Streaming Room</span>
            </button>
            <button className={styles.secondaryJoinBtn} onClick={() => onOpenJoin()}>
              <Users size={16} />
              <span>Join with Code</span>
            </button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className={styles.landingFooter}>
        <div className={styles.footerBrand}>
          <div className={styles.brandIcon} style={{ width: 26, height: 26, fontSize: 14 }}>
            N
          </div>
          <span className={styles.brandTitle} style={{ fontSize: 16 }}>
            STREAM<span className={styles.brandTitleHighlight}>ROOM</span>
          </span>
          <span className={styles.footerCopy}>© 2026 StreamRoom. Ultra-Low Latency Synchronized Streaming.</span>
        </div>

        <div className={styles.systemStatusPills}>
          <div className={styles.statusPillItem}>
            <span className={styles.statusDot} />
            <span>NTP Clock: Synced</span>
          </div>
          <div className={styles.statusPillItem}>
            <span className={styles.statusDot} />
            <span>Signaling: WebSocket Secure</span>
          </div>
          <div className={styles.statusPillItem}>
            <span className={styles.statusDot} />
            <span>Voice Mesh: WebRTC</span>
          </div>
        </div>
      </footer>
    </div>
  );
};
