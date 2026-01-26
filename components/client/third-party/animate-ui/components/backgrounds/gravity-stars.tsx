import React, { useEffect, useRef } from "react";
import { cn } from "@/lib/core/utils";
import {
  getColorVariable,
  type DigitalGardenColor,
  type ColorVariant,
} from "@/lib/third-party/colors";

interface Star {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
}

interface GravityStarsBackgroundProps extends React.ComponentProps<"div"> {
  starsCount?: number;
  starsSize?: number;
  starsOpacity?: number;
  glowIntensity?: number;
  glowAnimation?: "instant" | "ease" | "spring";
  movementSpeed?: number;
  mouseInfluence?: number;
  mouseGravity?: "attract" | "repel";
  gravityStrength?: number;
  starsInteraction?: boolean;
  starsInteractionType?: "bounce" | "merge";
  color?: DigitalGardenColor;
  colorVariant?: ColorVariant;
}

// Helper function to convert CSS variable to RGB
const cssVarToRgb = (cssVar: string): { r: number; g: number; b: number } => {
  if (typeof window === "undefined" || !document.body) {
    // Fallback to gold color during SSR
    return { r: 201, g: 168, b: 108 };
  }

  try {
    // Create a temporary element to get computed color
    const tempEl = document.createElement("div");
    tempEl.style.color = cssVar;
    tempEl.style.position = "absolute";
    tempEl.style.visibility = "hidden";
    tempEl.style.top = "-9999px";
    document.body.appendChild(tempEl);

    const computedColor = window.getComputedStyle(tempEl).color;
    document.body.removeChild(tempEl);

    // Parse rgb(r, g, b) or rgba(r, g, b, a)
    const match = computedColor.match(/\d+/g);
    if (match && match.length >= 3) {
      return {
        r: parseInt(match[0], 10),
        g: parseInt(match[1], 10),
        b: parseInt(match[2], 10),
      };
    }
  } catch (e) {
    // If anything fails, fallback to gold
    console.warn("Failed to parse color variable:", e);
  }

  // Fallback to gold color
  return { r: 201, g: 168, b: 108 };
};

export const GravityStarsBackground: React.FC<GravityStarsBackgroundProps> = ({
  starsCount = 75,
  starsSize = 2,
  starsOpacity = 0.75,
  glowIntensity = 15,
  glowAnimation = "ease",
  movementSpeed = 0.3,
  mouseInfluence = 100,
  mouseGravity = "attract",
  gravityStrength = 75,
  starsInteraction = false,
  starsInteractionType = "bounce",
  color = "gold",
  colorVariant = "primary",
  className = "",
  ...props
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const starsRef = useRef<Star[]>([]);
  const mouseRef = useRef({ x: 0, y: 0 });
  const animationRef = useRef<number | undefined>(undefined);
  const starColorRef = useRef<{ r: number; g: number; b: number }>({
    r: 201,
    g: 168,
    b: 108,
  });

  // Update star color when color prop changes
  useEffect(() => {
    if (typeof window !== "undefined") {
      const colorVar = getColorVariable(color, colorVariant);
      starColorRef.current = cssVarToRgb(colorVar);
    }
  }, [color, colorVariant]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resizeCanvas = () => {
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
      initStars();
    };

    const initStars = () => {
      starsRef.current = [];
      for (let i = 0; i < starsCount; i++) {
        starsRef.current.push({
          x: Math.random() * canvas.width,
          y: Math.random() * canvas.height,
          vx: (Math.random() - 0.5) * movementSpeed,
          vy: (Math.random() - 0.5) * movementSpeed,
          size: Math.random() * starsSize + 1,
        });
      }
    };

    const handleMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      mouseRef.current = {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      };
    };

    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      starsRef.current.forEach((star, i) => {
        // Apply gravity towards/away from mouse
        const dx = mouseRef.current.x - star.x;
        const dy = mouseRef.current.y - star.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance < mouseInfluence && distance > 0) {
          const force = (mouseInfluence - distance) / mouseInfluence;
          const strength = gravityStrength / 10000;
          const direction = mouseGravity === "attract" ? 1 : -1;

          star.vx += (dx / distance) * force * strength * direction;
          star.vy += (dy / distance) * force * strength * direction;
        }

        // Apply velocity damping
        star.vx *= 0.99;
        star.vy *= 0.99;

        // Update position
        star.x += star.vx;
        star.y += star.vy;

        // Bounce off walls
        if (star.x < 0 || star.x > canvas.width) {
          star.vx *= -0.8;
          star.x = Math.max(0, Math.min(canvas.width, star.x));
        }
        if (star.y < 0 || star.y > canvas.height) {
          star.vy *= -0.8;
          star.y = Math.max(0, Math.min(canvas.height, star.y));
        }

        // Star interaction
        if (starsInteraction) {
          for (let j = i + 1; j < starsRef.current.length; j++) {
            const other = starsRef.current[j];
            const dx = other.x - star.x;
            const dy = other.y - star.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist < star.size + other.size + 5) {
              if (starsInteractionType === "bounce") {
                const angle = Math.atan2(dy, dx);
                const sin = Math.sin(angle);
                const cos = Math.cos(angle);

                const vx1 = star.vx * cos + star.vy * sin;
                const vy1 = star.vy * cos - star.vx * sin;
                const vx2 = other.vx * cos + other.vy * sin;
                const vy2 = other.vy * cos - other.vx * sin;

                star.vx = vx2 * cos - vy1 * sin;
                star.vy = vy1 * cos + vx2 * sin;
                other.vx = vx1 * cos - vy2 * sin;
                other.vy = vy2 * cos + vx1 * sin;
              }
            }
          }
        }

        // Draw star using Digital Garden colors
        const starColor = starColorRef.current;
        const gradient = ctx.createRadialGradient(
          star.x,
          star.y,
          0,
          star.x,
          star.y,
          star.size * glowIntensity
        );
        gradient.addColorStop(
          0,
          `rgba(${starColor.r}, ${starColor.g}, ${starColor.b}, ${starsOpacity})`
        );
        gradient.addColorStop(
          0.2,
          `rgba(${starColor.r}, ${starColor.g}, ${starColor.b}, ${starsOpacity * 0.5})`
        );
        gradient.addColorStop(
          1,
          `rgba(${starColor.r}, ${starColor.g}, ${starColor.b}, 0)`
        );

        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(star.x, star.y, star.size * glowIntensity, 0, Math.PI * 2);
        ctx.fill();

        // Draw bright center
        ctx.fillStyle = `rgba(${starColor.r}, ${starColor.g}, ${starColor.b}, ${starsOpacity})`;
        ctx.beginPath();
        ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
        ctx.fill();
      });

      animationRef.current = requestAnimationFrame(animate);
    };

    // Initial resize with a small delay to ensure layout is complete
    resizeCanvas();
    const timeoutId = setTimeout(() => {
      resizeCanvas();
    }, 0);

    // Use ResizeObserver to watch for container size changes
    const resizeObserver = new ResizeObserver(() => {
      resizeCanvas();
    });

    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }

    window.addEventListener("resize", resizeCanvas);
    canvas.addEventListener("mousemove", handleMouseMove);
    animate();

    return () => {
      clearTimeout(timeoutId);
      resizeObserver.disconnect();
      window.removeEventListener("resize", resizeCanvas);
      canvas.removeEventListener("mousemove", handleMouseMove);
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [
    starsCount,
    starsSize,
    starsOpacity,
    glowIntensity,
    movementSpeed,
    mouseInfluence,
    mouseGravity,
    gravityStrength,
    starsInteraction,
    starsInteractionType,
    color,
    colorVariant,
  ]);

  // Only add 'relative' if className doesn't already have a positioning class
  const hasPositioning = /(absolute|fixed|sticky|relative)/.test(
    className || ""
  );
  const containerClassName = hasPositioning
    ? className
    : cn("relative", className);

  return (
    <div
      ref={containerRef}
      className={cn(containerClassName, "w-full h-full min-h-full")}
      style={{ minHeight: "100%" }}
      {...props}
    >
      <canvas
        ref={canvasRef}
        className="w-full h-full"
        style={{ background: "transparent", minHeight: "100%" }}
      />
    </div>
  );
};

// Demo component
export default function GravityStarsBackgroundDemo() {
  return (
    <div className="relative w-full h-screen bg-black">
      <GravityStarsBackground
        className="absolute inset-0"
        starsCount={100}
        mouseGravity="attract"
        glowIntensity={12}
        movementSpeed={0.5}
        starsInteraction={true}
      />
      <div className="relative z-10 flex items-center justify-center h-full">
        <div className="text-center text-white">
          <h1 className="text-5xl font-bold mb-4">Gravity Stars</h1>
          <p className="text-xl opacity-75">Move your mouse to interact</p>
        </div>
      </div>
    </div>
  );
}
