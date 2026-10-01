const STORAGE_KEY = "streamroom_persistent_guid_v1";

export async function getPersistentBrowserId(): Promise<string> {
  // 1. Check LocalStorage
  try {
    const existing = localStorage.getItem(STORAGE_KEY);
    if (existing && existing.length === 32) {
      return existing;
    }
  } catch {}

  // 2. Synthesize multi-factor entropy from browser environment
  const canvasHash = getCanvasFingerprint();
  const webglHash = getWebGLFingerprint();
  const audioHash = await getAudioFingerprint();
  const screenMetrics = `${window.screen.colorDepth}_${window.screen.width}x${window.screen.height}`;
  const hardwareConcurrency = navigator.hardwareConcurrency || 4;
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

  const rawEntropy = `${canvasHash}::${webglHash}::${audioHash}::${screenMetrics}::${hardwareConcurrency}::${timeZone}`;
  
  // Hash to 32 hex chars
  const hashBuffer = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(rawEntropy));
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const deterministicGuid = hashArray.map(b => b.toString(16).padStart(2, "0")).join("").substring(0, 32);

  try {
    localStorage.setItem(STORAGE_KEY, deterministicGuid);
  } catch {}

  return deterministicGuid;
}

function getCanvasFingerprint(): string {
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 240;
    canvas.height = 60;
    const ctx = canvas.getContext("2d");
    if (!ctx) return "nocanvas";

    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = "#f60";
    ctx.fillRect(125, 1, 62, 20);

    ctx.fillStyle = "#069";
    ctx.font = "14px 'Arial', sans-serif";
    ctx.fillText("StreamSyncBrowser, id=9981!", 2, 15);

    ctx.fillStyle = "rgba(102, 204, 0, 0.7)";
    ctx.font = "16px 'Times New Roman', serif";
    ctx.fillText("DeterministicDeviceCheck", 4, 35);

    return canvas.toDataURL().slice(-60);
  } catch {
    return "canvas_err";
  }
}

function getWebGLFingerprint(): string {
  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl") || (canvas.getContext("experimental-webgl") as WebGLRenderingContext | null);
    if (!gl) return "nowebgl";

    const debugInfo = gl.getExtension("WEBGL_debug_renderer_info");
    if (!debugInfo) return "nodebug";

    const vendor = gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) || "";
    const renderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) || "";
    return `${vendor}~${renderer}`;
  } catch {
    return "webgl_err";
  }
}

async function getAudioFingerprint(): Promise<string> {
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return "noaudio";

    const audioCtx = new AudioContextClass();
    const oscillator = audioCtx.createOscillator();
    const compressor = audioCtx.createDynamicsCompressor();

    oscillator.type = "triangle";
    oscillator.frequency.setValueAtTime(10000, audioCtx.currentTime);

    compressor.threshold.setValueAtTime(-50, audioCtx.currentTime);
    compressor.knee.setValueAtTime(40, audioCtx.currentTime);
    compressor.ratio.setValueAtTime(12, audioCtx.currentTime);
    compressor.attack.setValueAtTime(0, audioCtx.currentTime);
    compressor.release.setValueAtTime(0.25, audioCtx.currentTime);

    oscillator.connect(compressor);
    compressor.connect(audioCtx.destination);
    oscillator.start(0);

    const reductionVal = typeof compressor.reduction === "number" ? compressor.reduction : ((compressor.reduction as any)?.value ?? 0);
    const val = Number(reductionVal).toFixed(4);
    oscillator.stop(0.1);
    await audioCtx.close();
    return val;
  } catch {
    return "audio_err";
  }
}
