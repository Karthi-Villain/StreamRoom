import { useState, useRef, useEffect, useCallback } from "react";
import { WSMessage } from "../types/websocket";

const RTC_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ],
};

interface UseVoiceMeshProps {
  clientId: string;
  sendMessage: (msg: WSMessage) => void;
  onSpeakingChange?: (isSpeaking: boolean) => void;
}

export function useVoiceMesh({ clientId, sendMessage, onSpeakingChange }: UseVoiceMeshProps) {
  const [isVoiceActive, setIsVoiceActive] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);

  const localStreamRef = useRef<MediaStream | null>(null);
  const peerConnections = useRef<Map<string, RTCPeerConnection>>(new Map());
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number | null>(null);

  // Monitor voice volume
  const startVolumeDetection = (stream: MediaStream) => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      const audioCtx = new AudioCtx();
      audioContextRef.current = audioCtx;

      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 512;
      analyserRef.current = analyser;

      source.connect(analyser);

      const buffer = new Uint8Array(analyser.frequencyBinCount);
      const checkVolume = () => {
        analyser.getByteFrequencyData(buffer);
        let sum = 0;
        for (let i = 0; i < buffer.length; i++) {
          sum += buffer[i];
        }
        const avg = sum / buffer.length;
        const speaking = avg > 18; // Threshold

        setIsSpeaking((prev) => {
          if (prev !== speaking && onSpeakingChange) {
            onSpeakingChange(speaking);
          }
          return speaking;
        });

        animFrameRef.current = requestAnimationFrame(checkVolume);
      };
      checkVolume();
    } catch (err) {
      console.error("Failed to start voice analysis", err);
    }
  };

  const createPeerConnection = (targetPeerId: string): RTCPeerConnection => {
    const pc = new RTCPeerConnection(RTC_CONFIG);

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => {
        pc.addTrack(track, localStreamRef.current!);
      });
    } else {
      try {
        pc.addTransceiver("audio", { direction: "recvonly" });
      } catch {
        // Fallback for browsers that don't support addTransceiver
      }
    }

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        sendMessage({
          event: "webrtc:ice_candidate",
          payload: { target_peer_id: targetPeerId, candidate: event.candidate },
          timestamp: Date.now() / 1000,
        });
      }
    };

    pc.ontrack = (event) => {
      const remoteAudio = new Audio();
      remoteAudio.srcObject = event.streams[0];
      remoteAudio.autoplay = true;
    };

    peerConnections.current.set(targetPeerId, pc);
    return pc;
  };

  const joinVoice = async (startMuted: boolean = false) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      localStreamRef.current = stream;
      if (startMuted) {
        const audioTrack = stream.getAudioTracks()[0];
        if (audioTrack) audioTrack.enabled = false;
        setIsMuted(true);
      } else {
        setIsMuted(false);
      }
      startVolumeDetection(stream);

      setIsVoiceActive(true);

      sendMessage({
        event: "webrtc:join_voice",
        payload: {},
        timestamp: Date.now() / 1000,
      });
    } catch (err) {
      console.warn("Microphone access unavailable or denied, joining in listen-only mode", err);
      setIsVoiceActive(true);
      setIsMuted(true);
      sendMessage({
        event: "webrtc:join_voice",
        payload: {},
        timestamp: Date.now() / 1000,
      });
    }
  };

  const leaveVoice = () => {
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    if (audioContextRef.current) audioContextRef.current.close().catch(() => {});

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
    }

    peerConnections.current.forEach((pc) => pc.close());
    peerConnections.current.clear();

    setIsVoiceActive(false);
    setIsMuted(false);
    setIsSpeaking(false);

    sendMessage({
      event: "webrtc:leave_voice",
      payload: {},
      timestamp: Date.now() / 1000,
    });
  };

  const toggleMute = () => {
    if (!localStreamRef.current) return;
    const audioTrack = localStreamRef.current.getAudioTracks()[0];
    if (audioTrack) {
      audioTrack.enabled = !audioTrack.enabled;
      setIsMuted(!audioTrack.enabled);
    }
  };

  const handleActiveVoicePeers = async (peers: string[]) => {
    for (const peerId of peers) {
      const pc = createPeerConnection(peerId);
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      sendMessage({
        event: "webrtc:offer",
        payload: { target_peer_id: peerId, sdp: offer.sdp },
        timestamp: Date.now() / 1000,
      });
    }
  };

  const handleOffer = async (payload: { source_peer_id: string; sdp: string }) => {
    const pc = createPeerConnection(payload.source_peer_id);
    await pc.setRemoteDescription(new RTCSessionDescription({ type: "offer", sdp: payload.sdp }));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    sendMessage({
      event: "webrtc:answer",
      payload: { target_peer_id: payload.source_peer_id, sdp: answer.sdp },
      timestamp: Date.now() / 1000,
    });
  };

  const handleAnswer = async (payload: { source_peer_id: string; sdp: string }) => {
    const pc = peerConnections.current.get(payload.source_peer_id);
    if (pc) {
      await pc.setRemoteDescription(new RTCSessionDescription({ type: "answer", sdp: payload.sdp }));
    }
  };

  const handleIceCandidate = async (payload: { source_peer_id: string; candidate: RTCIceCandidateInit }) => {
    const pc = peerConnections.current.get(payload.source_peer_id);
    if (pc && payload.candidate) {
      await pc.addIceCandidate(new RTCIceCandidate(payload.candidate));
    }
  };

  const handlePeerLeft = (peerId: string) => {
    const pc = peerConnections.current.get(peerId);
    if (pc) {
      pc.close();
      peerConnections.current.delete(peerId);
    }
  };

  useEffect(() => {
    return () => {
      leaveVoice();
    };
  }, []);

  return {
    isVoiceActive,
    isMuted,
    isSpeaking,
    joinVoice,
    leaveVoice,
    toggleMute,
    handleActiveVoicePeers,
    handleOffer,
    handleAnswer,
    handleIceCandidate,
    handlePeerLeft,
  };
}
