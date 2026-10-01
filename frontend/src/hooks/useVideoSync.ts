import { useEffect, useRef } from "react";
import { VideoPlaybackState, ControlPolicy } from "../types/room";

interface UseVideoSyncProps {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  playbackState: VideoPlaybackState;
  clockOffset: number;
  isHost: boolean;
  controlPolicy: ControlPolicy;
  onSendAction: (event: string, payload: any) => void;
  onApplyTrackChange?: (trackType: "audio" | "subtitle", trackId: string | number | null) => void;
}

export function useVideoSync({
  videoRef,
  playbackState,
  clockOffset,
  isHost,
  controlPolicy,
  onSendAction,
  onApplyTrackChange,
}: UseVideoSyncProps) {
  const isRemoteApplying = useRef(false);
  const lastSyncedPosition = useRef<number>(-1);

  // Apply authoritative server state
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const nowServerTime = Date.now() / 1000 + clockOffset;
    let targetPosition = playbackState.reference_position;

    if (playbackState.status === "playing") {
      const elapsed = Math.max(0, nowServerTime - playbackState.reference_timestamp);
      targetPosition += elapsed * (playbackState.playback_rate || 1.0);
    }

    const currentPosition = video.currentTime;
    const drift = Math.abs(currentPosition - targetPosition);

    isRemoteApplying.current = true;

    // Synchronize play / pause states
    if (playbackState.status === "playing" && video.paused) {
      video.play().catch(() => {});
    } else if (playbackState.status === "paused" && !video.paused) {
      video.pause();
    }

    // Drift correction logic
    // If drift is significant (> 1.2s), hard seek to target
    if (drift > 1.2) {
      // Avoid repetitive seeks to the same position
      if (Math.abs(lastSyncedPosition.current - targetPosition) > 0.5) {
        lastSyncedPosition.current = targetPosition;
        video.currentTime = targetPosition;
      }
    } else if (drift > 0.15) {
      // Soft drift nudge: speed up or slow down slightly to eliminate drift smoothly
      if (currentPosition < targetPosition) {
        video.playbackRate = 1.04;
      } else {
        video.playbackRate = 0.96;
      }
    } else {
      video.playbackRate = playbackState.playback_rate || 1.0;
    }

    const timer = setTimeout(() => {
      isRemoteApplying.current = false;
    }, 400);

    return () => clearTimeout(timer);
  }, [playbackState.status, playbackState.reference_position, playbackState.reference_timestamp, playbackState.playback_rate, clockOffset]);

  // Synchronize remote track changes
  useEffect(() => {
    if (onApplyTrackChange) {
      if (playbackState.active_audio_track !== undefined) {
        onApplyTrackChange("audio", playbackState.active_audio_track);
      }
      if (playbackState.active_subtitle_track !== undefined) {
        onApplyTrackChange("subtitle", playbackState.active_subtitle_track);
      }
    }
  }, [playbackState.active_audio_track, playbackState.active_subtitle_track, onApplyTrackChange]);

  const canControl = isHost || controlPolicy === "collaborative";

  const handleUserPlay = () => {
    if (isRemoteApplying.current || !canControl) return;
    const pos = videoRef.current?.currentTime || 0;
    onSendAction("sync:play", {
      position: pos,
      playback_rate: 1.0,
    });
  };

  const handleUserPause = () => {
    if (isRemoteApplying.current || !canControl) return;
    const pos = videoRef.current?.currentTime || 0;
    onSendAction("sync:pause", {
      position: pos,
    });
  };

  const handleUserSeek = (targetTime: number) => {
    if (!canControl) return;
    isRemoteApplying.current = true;
    lastSyncedPosition.current = targetTime;
    if (videoRef.current) {
      videoRef.current.currentTime = targetTime;
    }
    onSendAction("sync:seek", {
      target_position: targetTime,
    });
    setTimeout(() => {
      isRemoteApplying.current = false;
    }, 400);
  };

  const handleUserTrackChange = (trackType: "audio" | "subtitle", trackId: string | number | null) => {
    if (!canControl) return;
    if (onApplyTrackChange) {
      onApplyTrackChange(trackType, trackId);
    }
    onSendAction("sync:track_change", {
      track_type: trackType,
      track_id: trackId,
    });
  };

  return {
    canControl,
    handleUserPlay,
    handleUserPause,
    handleUserSeek,
    handleUserTrackChange,
    isRemoteApplying,
  };
}
