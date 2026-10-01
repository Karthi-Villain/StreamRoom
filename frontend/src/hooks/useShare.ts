import { useState } from "react";

export function useShare() {
  const [copied, setCopied] = useState(false);

  const shareRoom = async (roomId: string, title?: string) => {
    const url = `${window.location.origin}?room=${roomId}`;
    const shareData = {
      title: title || "Live Stream Room",
      text: `Join my live stream room with synchronized playback and voice! Room ID: ${roomId}`,
      url,
    };

    if (navigator.share && navigator.canShare && navigator.canShare(shareData)) {
      try {
        await navigator.share(shareData);
        return true;
      } catch {
        return false;
      }
    } else {
      try {
        await navigator.clipboard.writeText(url);
        setCopied(true);
        setTimeout(() => setCopied(false), 2500);
        return true;
      } catch {
        return false;
      }
    }
  };

  return { shareRoom, copied };
}
