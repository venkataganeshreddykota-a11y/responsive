import React, { useEffect, useRef } from "react";

export default function PeacockBanner() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    let animationFrameId;

    // Resize canvas to match container
    const resize = () => {
      canvas.width = canvas.parentElement.clientWidth;
      canvas.height = canvas.parentElement.clientHeight || 200; // default height if not set
    };
    window.addEventListener("resize", resize);
    resize();

    // Particle system
    const particles = [];
    const numParticles = 150;
    const colors = ["#ffffff", "#f97316", "#ffed4a", "#ff9800"]; // white and shades of orange/yellow

    for (let i = 0; i < numParticles; i++) {
      particles.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        vx: (Math.random() - 0.5) * 1,
        vy: (Math.random() - 0.5) * 1,
        size: Math.random() * 3 + 1,
        color: colors[Math.floor(Math.random() * colors.length)],
        angle: Math.random() * Math.PI * 2,
        speed: Math.random() * 0.02 + 0.01,
        dist: Math.random() * 50 + 20, // distance from center of "feather"
        type: Math.random() > 0.5 ? "pixel" : "line",
      });
    }

    const drawPeacockFeather = (time) => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const centerX = canvas.width / 2;
      const centerY = canvas.height / 2;

      // Draw the main animated elements
      particles.forEach((p, index) => {
        // Move particles
        p.angle += p.speed;

        // Base coordinate with a bit of organic floating
        let x = p.x + Math.cos(time * 0.001 + p.angle) * 10;
        let y = p.y + Math.sin(time * 0.001 + p.angle) * 10;

        // Wrap around
        if (x > canvas.width) p.x = 0;
        if (x < 0) p.x = canvas.width;
        if (y > canvas.height) p.y = 0;
        if (y < 0) p.y = canvas.height;

        ctx.fillStyle = p.color;
        ctx.strokeStyle = p.color;

        // Pixel tech style - draw small squares
        ctx.fillRect(x, y, p.size, p.size);

        // Tech lines connecting nearby particles
        for (let j = index + 1; j < particles.length; j++) {
          const p2 = particles[j];
          let x2 = p2.x + Math.cos(time * 0.001 + p2.angle) * 10;
          let y2 = p2.y + Math.sin(time * 0.001 + p2.angle) * 10;

          const dx = x - x2;
          const dy = y - y2;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist < 40) {
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(x2, y2);
            ctx.lineWidth = 0.5;
            ctx.globalAlpha = 1 - dist / 40;
            ctx.stroke();
            ctx.globalAlpha = 1;
          }
        }
      });

      // Draw an abstract glowing "feather eye" in the center right (to not cover text on left)
      const eyeX = canvas.width * 0.75;
      const eyeY = canvas.height / 2;

      // Outer tech ring
      ctx.strokeStyle = "#f97316";
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      ctx.arc(eyeX, eyeY, 40 + Math.sin(time * 0.002) * 5, 0, Math.PI * 2);
      ctx.stroke();

      // Inner tech ring
      ctx.strokeStyle = "#ffffff";
      ctx.setLineDash([2, 4]);
      ctx.beginPath();
      ctx.arc(eyeX, eyeY, 20 + Math.cos(time * 0.003) * 3, 0, Math.PI * 2);
      ctx.stroke();

      // Core pixel eye
      ctx.fillStyle = "#ffffff";
      const coreSize = 10 + Math.sin(time * 0.005) * 2;
      ctx.fillRect(eyeX - coreSize/2, eyeY - coreSize/2, coreSize, coreSize);
      ctx.setLineDash([]);

      // Floating pixels around the eye
      for(let i=0; i<8; i++) {
         const angle = time * 0.001 + (i * Math.PI / 4);
         const dist = 60 + Math.sin(time * 0.002 + i) * 10;
         const px = eyeX + Math.cos(angle) * dist;
         const py = eyeY + Math.sin(angle) * dist;
         ctx.fillStyle = "#f97316";
         ctx.fillRect(px, py, 4, 4);
      }
    };

    const animate = (time) => {
      drawPeacockFeather(time);
      animationFrameId = requestAnimationFrame(animate);
    };

    animate(0);

    return () => {
      window.removeEventListener("resize", resize);
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  return (
    <div className="relative w-full overflow-hidden rounded-xl bg-orange-50" style={{ height: "200px" }}>
      <canvas ref={canvasRef} className="absolute inset-0 z-0 h-full w-full" />
      <div className="relative z-10 flex h-full flex-col justify-center px-8">
        <h1 className="text-3xl font-bold text-orange-900 mb-2">Dashboard</h1>
        <p className="text-sm font-medium text-orange-700 bg-white/70 inline-block px-3 py-1 rounded-full backdrop-blur-sm self-start">
          Overview of your responsiveness scans
        </p>
      </div>
    </div>
  );
}
