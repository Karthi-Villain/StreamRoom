import React, { useEffect, useRef, useState } from "react";
import Hls from "hls.js";
import * as dashjs from "dashjs";
import { Play, Pause, Volume2, VolumeX, Subtitles, Check, X, Lock } from "lucide-react";
import { VideoPlaybackState, ControlPolicy, MediaTrackOption } from "../../types/room";
import { useVideoSync } from "../../hooks/useVideoSync";
import styles from "./Player.module.css";

interface UniversalMediaPlayerProps {
  streamUrl?: string;
  playbackState: VideoPlaybackState;
  clockOffset: number;
  isHost: boolean;
  controlPolicy: ControlPolicy;
  onSendAction: (event: string, payload: any) => void;
  onMetricsUpdate?: (metrics: { downloadSpeedMbps: number; bufferSec: number; droppedFrames: number }) => void;
  onOpenSettings?: () => void;
  isFullscreen?: boolean;
  isUserActive?: boolean;
}

export const UniversalMediaPlayer: React.FC<UniversalMediaPlayerProps> = ({
  streamUrl,
  playbackState,
  clockOffset,
  isHost,
  controlPolicy,
  onSendAction,
  onMetricsUpdate,
  onOpenSettings,
  isFullscreen = false,
  isUserActive = true,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);
  const dashPlayerRef = useRef<dashjs.MediaPlayerClass | null>(null);

  // Tracks State
  const [audioTracks, setAudioTracks] = useState<MediaTrackOption[]>([]);
  const [subtitleTracks, setSubtitleTracks] = useState<MediaTrackOption[]>([]);
  const [activeAudioTrackId, setActiveAudioTrackId] = useState<string | number | null>(null);
  const [activeSubtitleTrackId, setActiveSubtitleTrackId] = useState<string | number | null>(-1);

  // Netflix Audio & Subtitles Menu State
  const [showTrackMenu, setShowTrackMenu] = useState(false);
  const trackMenuRef = useRef<HTMLDivElement | null>(null);

  // Close Netflix menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (trackMenuRef.current && !trackMenuRef.current.contains(e.target as Node)) {
        setShowTrackMenu(false);
      }
    };
    if (showTrackMenu) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showTrackMenu]);

  // Playback & UI State
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [downloadSpeedMbps, setDownloadSpeedMbps] = useState(0);

  // Apply track changes received from server or local selection
  const applyTrackChange = (trackType: "audio" | "subtitle", trackId: string | number | null) => {
    if (trackType === "audio" && trackId !== null && trackId !== undefined) {
      setActiveAudioTrackId(trackId);
      if (hlsRef.current) {
        hlsRef.current.audioTrack = Number(trackId);
      } else if (dashPlayerRef.current) {
        const tracks = dashPlayerRef.current.getTracksFor("audio");
        const found = tracks.find((t: any) => t.id === trackId || t.index === trackId);
        if (found) dashPlayerRef.current.setCurrentTrack(found);
      } else if (videoRef.current && (videoRef.current as any).audioTracks) {
        const natAudio = (videoRef.current as any).audioTracks;
        for (let i = 0; i < natAudio.length; i++) {
          natAudio[i].enabled = (i === Number(trackId) || String(natAudio[i].id) === String(trackId));
        }
      }
    } else if (trackType === "subtitle") {
      setActiveSubtitleTrackId(trackId);
      if (hlsRef.current) {
        hlsRef.current.subtitleTrack = Number(trackId);
      } else if (dashPlayerRef.current) {
        dashPlayerRef.current.setTextTrack(Number(trackId));
      } else if (videoRef.current && videoRef.current.textTracks) {
        for (let i = 0; i < videoRef.current.textTracks.length; i++) {
          const t = videoRef.current.textTracks[i];
          t.mode = (String(i) === String(trackId) || t.label === String(trackId)) ? "showing" : "disabled";
        }
      }
    }
  };

  const {
    canControl,
    handleUserPlay,
    handleUserPause,
    handleUserSeek,
    handleUserTrackChange,
  } = useVideoSync({
    videoRef,
    playbackState,
    clockOffset,
    isHost,
    controlPolicy,
    onSendAction,
    onApplyTrackChange: applyTrackChange,
  });

  // Attach Stream Engine with Ultra-Low Latency Buffering
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !streamUrl) return;

    setAudioTracks([]);
    setSubtitleTracks([]);
    setActiveAudioTrackId(null);
    setActiveSubtitleTrackId(-1);

    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }
    if (dashPlayerRef.current) {
      dashPlayerRef.current.destroy();
      dashPlayerRef.current = null;
    }

    const isHls = streamUrl.includes(".m3u8");
    const isDash = streamUrl.includes(".mpd");

    if (isHls && Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: true,
        backBufferLength: 15,
        maxBufferLength: 4,              // Ultra-tight buffer to eliminate 15-20s sync latency
        maxMaxBufferLength: 8,
        liveSyncDurationCount: 1,         // Immediate live edge synchronization
        liveMaxLatencyDurationCount: 2,
      });
      hlsRef.current = hls;
      hls.loadSource(streamUrl);
      hls.attachMedia(video);

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        // Enumerate audio tracks
        const aTracks = (hls.audioTracks || []).map((t) => ({
          id: t.id,
          label: t.name || t.lang || `Audio Track ${t.id + 1}`,
          language: t.lang,
          isDefault: t.default,
        }));
        setAudioTracks(aTracks);
        if (aTracks.length > 0 && hls.audioTrack !== undefined) {
          setActiveAudioTrackId(hls.audioTrack);
        }

        // Enumerate subtitle tracks
        const sTracks = (hls.subtitleTracks || []).map((t) => ({
          id: t.id,
          label: t.name || t.lang || `Subtitle ${t.id + 1}`,
          language: t.lang,
        }));
        setSubtitleTracks(sTracks);
        setActiveSubtitleTrackId(hls.subtitleTrack);
      });

      hls.on(Hls.Events.AUDIO_TRACKS_UPDATED, (_e, data) => {
        const aTracks = (data.audioTracks || []).map((t) => ({
          id: t.id,
          label: t.name || t.lang || `Audio Track ${t.id + 1}`,
          language: t.lang,
          isDefault: t.default,
        }));
        setAudioTracks(aTracks);
      });

      hls.on(Hls.Events.AUDIO_TRACK_SWITCHED, (_e, data) => {
        setActiveAudioTrackId(data.id);
      });

      hls.on(Hls.Events.SUBTITLE_TRACKS_UPDATED, (_e, data) => {
        const sTracks = (data.subtitleTracks || []).map((t) => ({
          id: t.id,
          label: t.name || t.lang || `Subtitle ${t.id + 1}`,
          language: t.lang,
        }));
        setSubtitleTracks(sTracks);
      });

      hls.on(Hls.Events.SUBTITLE_TRACK_SWITCH, (_e, data) => {
        setActiveSubtitleTrackId(data.id);
      });

      hls.on(Hls.Events.LEVEL_LOADED, () => {
        if (hls.audioTracks && hls.audioTracks.length > 0 && audioTracks.length === 0) {
          const aTracks = hls.audioTracks.map((t) => ({
            id: t.id,
            label: t.name || t.lang || `Audio Track ${t.id + 1}`,
            language: t.lang,
            isDefault: t.default,
          }));
          setAudioTracks(aTracks);
        }
        if (hls.subtitleTracks && hls.subtitleTracks.length > 0 && subtitleTracks.length === 0) {
          const sTracks = hls.subtitleTracks.map((t) => ({
            id: t.id,
            label: t.name || t.lang || `Subtitle ${t.id + 1}`,
            language: t.lang,
          }));
          setSubtitleTracks(sTracks);
        }
      });

      hls.on(Hls.Events.FRAG_LOADED, (_event, data) => {
        const stats = data.frag.stats;
        const durationSec = (stats.loading.end - stats.loading.start) / 1000;
        if (durationSec > 0 && stats.total > 0) {
          const speedMbps = (stats.total * 8) / (durationSec * 1000000);
          setDownloadSpeedMbps(speedMbps);
        }
      });
    } else if (isDash && dashjs.supportsMediaSource()) {
      const dash = dashjs.MediaPlayer().create();
      dashPlayerRef.current = dash;
      dash.initialize(video, streamUrl, false);

      dash.on(dashjs.MediaPlayer.events.STREAM_INITIALIZED, () => {
        const aTracks = (dash.getTracksFor("audio") || []).map((t: any, i: number) => ({
          id: t.id || i,
          label: t.lang || `Audio ${i + 1}`,
          language: t.lang,
        }));
        setAudioTracks(aTracks);

        const sTracks = (dash.getTracksFor("text") || []).map((t: any, i: number) => ({
          id: t.id || i,
          label: t.lang || `Subtitle ${i + 1}`,
          language: t.lang,
        }));
        setSubtitleTracks(sTracks);
      });
    } else {
      video.src = streamUrl;
    }

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
      if (dashPlayerRef.current) {
        dashPlayerRef.current.destroy();
        dashPlayerRef.current = null;
      }
    };
  }, [streamUrl, audioTracks.length, subtitleTracks.length]);

  // Track native HTML5 text and audio tracks
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleLoadedMetadata = () => {
      setDuration(video.duration || 0);

      if (video.textTracks && video.textTracks.length > 0 && subtitleTracks.length === 0) {
        const tracks: MediaTrackOption[] = [];
        for (let i = 0; i < video.textTracks.length; i++) {
          const t = video.textTracks[i];
          tracks.push({
            id: i,
            label: t.label || t.language || `Track ${i + 1}`,
            language: t.language,
          });
        }
        setSubtitleTracks(tracks);
      }

      if ((video as any).audioTracks && (video as any).audioTracks.length > 0 && audioTracks.length === 0) {
        const aTracks: MediaTrackOption[] = [];
        const natAudio = (video as any).audioTracks;
        for (let i = 0; i < natAudio.length; i++) {
          const t = natAudio[i];
          aTracks.push({
            id: i,
            label: t.label || t.language || `Audio ${i + 1}`,
            language: t.language,
          });
        }
        setAudioTracks(aTracks);
      }
    };

    const handleTimeUpdate = () => {
      setCurrentTime(video.currentTime || 0);
    };

    video.addEventListener("loadedmetadata", handleLoadedMetadata);
    video.addEventListener("timeupdate", handleTimeUpdate);

    return () => {
      video.removeEventListener("loadedmetadata", handleLoadedMetadata);
      video.removeEventListener("timeupdate", handleTimeUpdate);
    };
  }, [subtitleTracks.length, audioTracks.length]);

  // Periodic diagnostics reporting
  useEffect(() => {
    const interval = setInterval(() => {
      const video = videoRef.current;
      if (!video) return;

      let bufferSec = 0;
      if (video.buffered.length > 0) {
        for (let i = 0; i < video.buffered.length; i++) {
          if (video.currentTime >= video.buffered.start(i) && video.currentTime <= video.buffered.end(i)) {
            bufferSec = video.buffered.end(i) - video.currentTime;
            break;
          }
        }
      }

      let droppedFrames = 0;
      if ("getVideoPlaybackQuality" in video) {
        const quality = (video as any).getVideoPlaybackQuality();
        droppedFrames = quality.droppedVideoFrames || 0;
      }

      if (onMetricsUpdate) {
        onMetricsUpdate({
          downloadSpeedMbps,
          bufferSec,
          droppedFrames,
        });
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [downloadSpeedMbps, onMetricsUpdate]);

  const togglePlayPause = () => {
    if (!canControl) return;
    const video = videoRef.current;
    if (!video) return;

    if (video.paused) {
      handleUserPlay();
      video.play().catch(() => {});
    } else {
      handleUserPause();
      video.pause();
    }
  };

  const handleSeekChange = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!canControl || !duration || duration <= 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const pct = Math.max(0, Math.min(1, clickX / rect.width));
    const target = pct * duration;
    handleUserSeek(target);
  };

  const toggleMute = () => {
    if (videoRef.current) {
      videoRef.current.muted = !videoRef.current.muted;
      setIsMuted(videoRef.current.muted);
    }
  };

  const formatTime = (seconds: number) => {
    if (!isFinite(seconds) || seconds <= 0) return "00:00";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  const isLive = !isFinite(duration) || duration <= 0;
  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  if (!streamUrl) {
    return (
      <div className={styles.playerWrapper}>
        <div className={styles.emptyStreamState}>
          <div className={styles.emptyTitle}>No Stream Source Configured</div>
          <div className={styles.emptySubtitle}>
            {isHost
              ? "Provide a direct video link, HLS (.m3u8), or MPEG-DASH (.mpd) stream in the room settings to begin broadcasting."
              : "Waiting for the room host to set the media stream URL."}
          </div>
          {isHost && (
            <button className={styles.configureButton} onClick={onOpenSettings}>
              Configure Stream
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={`${styles.playerWrapper} ${isFullscreen && !isUserActive ? styles.hideCursor : ""}`}>
      {!canControl && (
        <div className={styles.lockedBadge}>
          <Lock size={12} />
          <span>Controls Managed by Host</span>
        </div>
      )}

      <video
        ref={videoRef}
        className={styles.videoElement}
        playsInline
        onClick={togglePlayPause}
      />

      {/* Netflix Style Audio & Subtitles Selection Panel */}
      {showTrackMenu && (
        <div
          ref={trackMenuRef}
          className={styles.netflixTrackPanel}
          onClick={(e) => e.stopPropagation()}
        >
          <div className={styles.netflixTrackHeader}>
            <div className={styles.netflixTrackTitle}>
              <Subtitles size={16} />
              <span>Audio & Subtitles</span>
            </div>
            <button
              className={styles.netflixCloseBtn}
              onClick={() => setShowTrackMenu(false)}
              title="Close Menu"
            >
              <X size={15} />
            </button>
          </div>

          <div className={styles.netflixTrackColumns}>
            {/* Audio Column */}
            <div className={styles.netflixTrackCol}>
              <div className={styles.netflixColTitle}>Audio</div>
              <div className={styles.netflixTrackList}>
                {audioTracks.length > 0 ? (
                  audioTracks.map((track) => {
                    const isSelected = String(activeAudioTrackId) === String(track.id);
                    return (
                      <div
                        key={track.id}
                        className={`${styles.netflixTrackItem} ${isSelected ? styles.selectedTrack : ""}`}
                        onClick={() => handleUserTrackChange("audio", track.id)}
                      >
                        <span>{track.label}</span>
                        {isSelected && <Check size={16} className={styles.netflixCheckIcon} />}
                      </div>
                    );
                  })
                ) : (
                  <div className={`${styles.netflixTrackItem} ${styles.selectedTrack}`}>
                    <span>Default Stream Audio</span>
                    <Check size={16} className={styles.netflixCheckIcon} />
                  </div>
                )}
              </div>
            </div>

            {/* Subtitles Column */}
            <div className={styles.netflixTrackCol}>
              <div className={styles.netflixColTitle}>Subtitles</div>
              <div className={styles.netflixTrackList}>
                <div
                  className={`${styles.netflixTrackItem} ${
                    Number(activeSubtitleTrackId) === -1 || activeSubtitleTrackId === null
                      ? styles.selectedTrack
                      : ""
                  }`}
                  onClick={() => handleUserTrackChange("subtitle", -1)}
                >
                  <span>Off</span>
                  {(Number(activeSubtitleTrackId) === -1 || activeSubtitleTrackId === null) && (
                    <Check size={16} className={styles.netflixCheckIcon} />
                  )}
                </div>

                {subtitleTracks.length > 0 ? (
                  subtitleTracks.map((track) => {
                    const isSelected = String(activeSubtitleTrackId) === String(track.id);
                    return (
                      <div
                        key={track.id}
                        className={`${styles.netflixTrackItem} ${isSelected ? styles.selectedTrack : ""}`}
                        onClick={() => handleUserTrackChange("subtitle", track.id)}
                      >
                        <span>{track.label}</span>
                        {isSelected && <Check size={16} className={styles.netflixCheckIcon} />}
                      </div>
                    );
                  })
                ) : (
                  <div className={styles.netflixEmptyMessage}>No subtitles in stream</div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Custom Responsive Controls Overlay */}
      <div className={`${styles.controlsOverlay} ${isFullscreen && !isUserActive ? styles.fadedOut : ""}`}>
        {/* Seek Progress Bar */}
        {!isLive && (
          <div className={styles.progressBarContainer} onClick={handleSeekChange}>
            <div className={styles.progressBarFill} style={{ width: `${progressPercent}%` }}>
              <div className={styles.progressBarThumb} />
            </div>
          </div>
        )}

        <div className={styles.controlsRow}>
          <div className={styles.controlsGroupLeft}>
            {canControl ? (
              <button
                className={styles.controlButton}
                onClick={togglePlayPause}
                title={playbackState.status === "playing" ? "Pause" : "Play"}
              >
                {playbackState.status === "playing" ? <Pause size={18} /> : <Play size={18} />}
              </button>
            ) : null}

            <button
              className={styles.controlButton}
              onClick={toggleMute}
              title={isMuted ? "Unmute" : "Mute"}
            >
              {isMuted ? <VolumeX size={18} /> : <Volume2 size={18} />}
            </button>

            <div className={styles.timeDisplay}>
              {isLive ? (
                <span className={styles.liveIndicator}>
                  <span className={styles.liveDot} />
                  LIVE
                </span>
              ) : (
                `${formatTime(currentTime)} / ${formatTime(duration)}`
              )}
            </div>
          </div>

          <div className={styles.controlsGroupRight}>
            {/* Netflix Unified Audio & Subtitles Selector Button */}
            <button
              className={`${styles.controlButton} ${showTrackMenu ? styles.activeTrack : ""}`}
              onClick={(e) => {
                e.stopPropagation();
                setShowTrackMenu(!showTrackMenu);
              }}
              title="Audio & Subtitles"
            >
              <Subtitles size={17} />
              <span>Audio & Subtitles</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
