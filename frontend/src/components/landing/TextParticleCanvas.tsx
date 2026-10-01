import React, { useRef, useEffect, useCallback } from "react";

interface Particle {
  x: number;
  y: number;
  originX: number;
  originY: number;
  vx: number;
  vy: number;
  radius: number;
  color: string;
  isRed: boolean;
}

export const TextParticleCanvas: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationFrameId = useRef<number | null>(null);
  const particlesRef = useRef<Particle[]>([]);
  const mouseRef = useRef<{ x: number; y: number; radius: number; isInteracting: boolean }>({
    x: -9999,
    y: -9999,
    radius: 120,
    isInteracting: false,
  });

  const initParticles = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;
    if (width === 0 || height === 0) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = width * dpr;
    canvas.height = height * dpr;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.scale(dpr, dpr);

    // Responsive font calculation
    let fontSize = Math.floor(width / 9.5);
    if (fontSize > 84) fontSize = 84;
    if (fontSize < 32) fontSize = 32;

    mouseRef.current.radius = Math.max(80, Math.min(130, width / 6));

    // Clear canvas
    ctx.clearRect(0, 0, width, height);

    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    const fontString = `900 ${fontSize}px "Outfit", "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
    ctx.font = fontString;

    // Render text to canvas to sample pixel data
    const isNarrow = width < 460;

    if (isNarrow) {
      // 2 lines on small mobile screens
      ctx.fillStyle = "#E50914";
      ctx.fillText("STREAM", width / 2, height / 2 - fontSize * 0.55);
      ctx.fillStyle = "#FFFFFF";
      ctx.fillText("ROOM", width / 2, height / 2 + fontSize * 0.55);
    } else {
      // Single line on larger screens: STREAM in Red, ROOM in White
      const streamText = "STREAM ";
      const roomText = "ROOM";
      const totalWidth = ctx.measureText("STREAM ROOM").width;
      const startX = (width - totalWidth) / 2;

      ctx.textAlign = "left";
      ctx.fillStyle = "#E50914";
      ctx.fillText(streamText, startX, height / 2);

      const streamWidth = ctx.measureText(streamText).width;
      ctx.fillStyle = "#FFFFFF";
      ctx.fillText(roomText, startX + streamWidth, height / 2);
    }

    // Read pixel data
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imgData.data;

    // Clear again for particle rendering
    ctx.clearRect(0, 0, width, height);

    const step = isNarrow ? 3 * dpr : 4 * dpr;
    const particles: Particle[] = [];

    for (let y = 0; y < canvas.height; y += step) {
      for (let x = 0; x < canvas.width; x += step) {
        const index = (y * canvas.width + x) * 4;
        const alpha = data[index + 3];

        if (alpha > 130) {
          const r = data[index];
          const g = data[index + 1];
          const b = data[index + 2];
          const isRed = r > 180 && g < 80 && b < 80;

          const targetX = x / dpr;
          const targetY = y / dpr;

          // Initial burst dispersion
          const angle = Math.random() * Math.PI * 2;
          const dist = Math.random() * 250 + 60;

          particles.push({
            x: targetX + Math.cos(angle) * dist,
            y: targetY + Math.sin(angle) * dist,
            originX: targetX,
            originY: targetY,
            vx: (Math.random() - 0.5) * 4,
            vy: (Math.random() - 0.5) * 4,
            radius: (Math.random() * 1.2 + 1.3),
            color: isRed
              ? (Math.random() > 0.3 ? "#E50914" : "#ff3b47")
              : (Math.random() > 0.4 ? "#ffffff" : "#dedede"),
            isRed,
          });
        }
      }
    }

    particlesRef.current = particles;
  }, []);

  useEffect(() => {
    initParticles();

    const handleResize = () => {
      initParticles();
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [initParticles]);

  // Main animation loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let time = 0;

    const render = () => {
      time += 0.02;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const width = canvas.width / dpr;
      const height = canvas.height / dpr;

      ctx.clearRect(0, 0, width, height);

      const particles = particlesRef.current;
      const mouse = mouseRef.current;

      const friction = 0.88;
      const ease = 0.09;

      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];

        // Ambient micro-wave
        const waveX = Math.sin(time + p.originY * 0.02) * 0.3;
        const waveY = Math.cos(time + p.originX * 0.02) * 0.3;

        // Mouse repulsion
        const dx = mouse.x - p.x;
        const dy = mouse.y - p.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < mouse.radius && dist > 0) {
          const force = (mouse.radius - dist) / mouse.radius;
          const angle = Math.atan2(dy, dx);
          const push = force * 24;

          p.vx -= Math.cos(angle) * push;
          p.vy -= Math.sin(angle) * push;
        }

        // Spring return to origin
        const homeDx = p.originX + waveX - p.x;
        const homeDy = p.originY + waveY - p.y;

        p.vx += homeDx * ease;
        p.vy += homeDy * ease;

        p.vx *= friction;
        p.vy *= friction;

        p.x += p.vx;
        p.y += p.vy;

        // Render particle
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.fill();
      }

      animationFrameId.current = requestAnimationFrame(render);
    };

    animationFrameId.current = requestAnimationFrame(render);

    return () => {
      if (animationFrameId.current) {
        cancelAnimationFrame(animationFrameId.current);
      }
    };
  }, []);

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    mouseRef.current.x = e.clientX - rect.left;
    mouseRef.current.y = e.clientY - rect.top;
    mouseRef.current.isInteracting = true;
  };

  const handleMouseLeave = () => {
    mouseRef.current.x = -9999;
    mouseRef.current.y = -9999;
    mouseRef.current.isInteracting = false;
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || !e.touches[0]) return;
    const rect = canvas.getBoundingClientRect();
    mouseRef.current.x = e.touches[0].clientX - rect.left;
    mouseRef.current.y = e.touches[0].clientY - rect.top;
    mouseRef.current.isInteracting = true;
  };

  const handleTouchEnd = () => {
    mouseRef.current.x = -9999;
    mouseRef.current.y = -9999;
    mouseRef.current.isInteracting = false;
  };

  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        height: "170px",
        maxHeight: "220px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        userSelect: "none",
        cursor: "crosshair",
      }}
    >
      <canvas
        ref={canvasRef}
        style={{
          width: "100%",
          height: "100%",
          display: "block",
        }}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      />
    </div>
  );
};
