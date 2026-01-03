"use client";

import * as React from "react";
import { motion } from "framer-motion";

import { cn } from "@/lib/utils";

export type HorizontalLine = {
  id: string;
  y: number;
  opacity: number;
  createdAt: number;
  color?: string;
  width?: number;
};

export type DynamicDisc = {
  id: string;
  p: number;
  x: number;
  y: number;
  w: number;
  h: number;
  createdAt: number;
  color?: string;
};

export type HoleBackgroundRef = {
  addHorizontalLine: (options?: {
    y?: number;
    color?: string;
    width?: number;
  }) => void;
  addDisc: (options?: { startFromInside?: boolean; color?: string }) => void;
};

type HoleBackgroundProps = React.ComponentProps<"div"> & {
  strokeColor?: string;
  numberOfLines?: number;
  numberOfDiscs?: number;
  particleRGBColor?: [number, number, number];
  reverse?: boolean;
  onReady?: (ref: HoleBackgroundRef) => void;
  horizontalLineDuration?: number; // Duration in ms before line fades out
  horizontalLineColor?: string;
  horizontalLineWidth?: number;
};

const HoleBackground = React.forwardRef<HoleBackgroundRef, HoleBackgroundProps>(
  function HoleBackground(
    {
      strokeColor = "#737373",
      numberOfLines = 50,
      numberOfDiscs = 50,
      particleRGBColor = [255, 255, 255],
      reverse = true,
      onReady,
      horizontalLineDuration = 2000,
      horizontalLineColor,
      horizontalLineWidth = 2,
      className,
      children,
      ...props
    },
    ref
  ) {
    const canvasRef = React.useRef<HTMLCanvasElement>(null);
    const animationFrameIdRef = React.useRef<number>(0);
    const horizontalLinesRef = React.useRef<HorizontalLine[]>([]);
    const lineIdCounterRef = React.useRef<number>(0);
    const dynamicDiscsRef = React.useRef<DynamicDisc[]>([]);
    const discIdCounterRef = React.useRef<number>(0);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const stateRef = React.useRef<any>({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      discs: [] as any[],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      lines: [] as any[],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      particles: [] as any[],
      clip: {},
      startDisc: {},
      endDisc: {},
      rect: { width: 0, height: 0 },
      render: { width: 0, height: 0, dpi: 1 },
      particleArea: {},
      linesCanvas: null,
    });

    const linear = (p: number) => p;
    const easeInExpo = (p: number) => (p === 0 ? 0 : Math.pow(2, 10 * (p - 1)));

    const tweenValue = React.useCallback(
      (start: number, end: number, p: number, ease: "inExpo" | null = null) => {
        const delta = end - start;
        const easeFn = ease === "inExpo" ? easeInExpo : linear;
        return start + delta * easeFn(p);
      },
      []
    );

    const tweenDisc = React.useCallback(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (disc: any) => {
        const { startDisc, endDisc } = stateRef.current;
        disc.x = tweenValue(startDisc.x, endDisc.x, disc.p);
        disc.y = tweenValue(startDisc.y, endDisc.y, disc.p, "inExpo");
        disc.w = tweenValue(startDisc.w, endDisc.w, disc.p);
        disc.h = tweenValue(startDisc.h, endDisc.h, disc.p);
      },
      [tweenValue]
    );

    const setSize = React.useCallback(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      stateRef.current.rect = { width: rect.width, height: rect.height };
      stateRef.current.render = {
        width: rect.width,
        height: rect.height,
        dpi: window.devicePixelRatio || 1,
      };
      canvas.width =
        stateRef.current.render.width * stateRef.current.render.dpi;
      canvas.height =
        stateRef.current.render.height * stateRef.current.render.dpi;
    }, []);

    const setDiscs = React.useCallback(() => {
      const { width, height } = stateRef.current.rect;
      stateRef.current.discs = [];

      // Always use the same start/end positions - reverse only affects animation direction
      // Start at top (large), end at bottom (small) - this creates the visual structure
      stateRef.current.startDisc = {
        x: width * 0.5,
        y: height * 0.45,
        w: width * 0.75,
        h: height * 0.7,
      };
      stateRef.current.endDisc = {
        x: width * 0.5,
        y: height * 0.95,
        w: 0,
        h: 0,
      };

      // Find the clip disc - the first disc that crosses the threshold going down
      let prevBottom = height;
      stateRef.current.clip = {};

      for (let i = 0; i < numberOfDiscs; i++) {
        // For reverse, invert the progress value so animation goes backwards
        const p = reverse ? 1 - i / numberOfDiscs : i / numberOfDiscs;
        const disc = { p, x: 0, y: 0, w: 0, h: 0 };
        tweenDisc(disc);
        const bottom = disc.y + disc.h;

        // Find first disc where bottom <= prevBottom (moving downward)
        if (bottom <= prevBottom && !stateRef.current.clip.disc) {
          stateRef.current.clip = { disc: { ...disc }, i };
        }
        prevBottom = bottom;

        stateRef.current.discs.push(disc);
      }

      // Ensure we always have a clip disc (fallback)
      if (!stateRef.current.clip.disc) {
        const fallbackIndex = Math.floor(numberOfDiscs * 0.3);
        const p = reverse
          ? 1 - fallbackIndex / numberOfDiscs
          : fallbackIndex / numberOfDiscs;
        const disc = { p, x: 0, y: 0, w: 0, h: 0 };
        tweenDisc(disc);
        stateRef.current.clip = { disc: { ...disc }, i: fallbackIndex };
      }

      // Create clip path - the hole area where lines should be hidden (always at top)
      const clipPath = new Path2D();
      const disc = stateRef.current.clip.disc;
      clipPath.ellipse(disc.x, disc.y, disc.w, disc.h, 0, 0, Math.PI * 2);
      // Rectangle covers from top of canvas down to disc.y (hole is always at top)
      clipPath.rect(disc.x - disc.w, 0, disc.w * 2, disc.y);

      stateRef.current.clip.path = clipPath;
    }, [numberOfDiscs, tweenDisc, reverse]);

    const setLines = React.useCallback(() => {
      const { width, height } = stateRef.current.rect;
      stateRef.current.lines = [];
      const linesAngle = (Math.PI * 2) / numberOfLines;
      for (let i = 0; i < numberOfLines; i++) {
        stateRef.current.lines.push([]);
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      stateRef.current.discs.forEach((disc: any) => {
        for (let i = 0; i < numberOfLines; i++) {
          const angle = i * linesAngle;
          const p = {
            x: disc.x + Math.cos(angle) * disc.w,
            y: disc.y + Math.sin(angle) * disc.h,
          };
          stateRef.current.lines[i].push(p);
        }
      });
      const offCanvas = document.createElement("canvas");
      offCanvas.width = width;
      offCanvas.height = height;
      const ctx = offCanvas.getContext("2d");
      if (!ctx) return;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      stateRef.current.lines.forEach((line: any) => {
        ctx.save();
        let lineIsIn = false;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        line.forEach((p1: any, j: number) => {
          if (j === 0) return;
          const p0 = line[j - 1];
          const isInClip =
            ctx.isPointInPath(stateRef.current.clip.path, p1.x, p1.y) ||
            ctx.isPointInStroke(stateRef.current.clip.path, p1.x, p1.y);

          if (!lineIsIn && isInClip) {
            lineIsIn = true;
          }

          // Apply clipping once line enters the clip area (hole)
          // This hides the line segments inside the hole for both directions
          if (lineIsIn) {
            ctx.clip(stateRef.current.clip.path);
          }
          ctx.beginPath();
          ctx.moveTo(p0.x, p0.y);
          ctx.lineTo(p1.x, p1.y);
          ctx.strokeStyle = strokeColor;
          ctx.lineWidth = 2;
          ctx.stroke();
          ctx.closePath();
        });
        ctx.restore();
      });
      stateRef.current.linesCanvas = offCanvas;
    }, [numberOfLines, strokeColor]);

    const initParticle = React.useCallback(
      (start: boolean = false) => {
        const sx =
          stateRef.current.particleArea.sx +
          stateRef.current.particleArea.sw * Math.random();
        const ex =
          stateRef.current.particleArea.ex +
          stateRef.current.particleArea.ew * Math.random();
        const dx = ex - sx;
        const y = start
          ? stateRef.current.particleArea.h * Math.random()
          : stateRef.current.particleArea.h;
        const r = 0.5 + Math.random() * 4;
        const vy = 0.5 + Math.random();
        return {
          x: sx,
          sx,
          dx,
          y,
          vy,
          p: 0,
          r,
          c: `rgba(${particleRGBColor[0]}, ${particleRGBColor[1]}, ${particleRGBColor[2]}, ${Math.random()})`,
        };
      },
      [particleRGBColor]
    );

    const setParticles = React.useCallback(() => {
      const { width, height } = stateRef.current.rect;
      stateRef.current.particles = [];
      const disc = stateRef.current.clip.disc;
      stateRef.current.particleArea = {
        sw: disc.w * 0.5,
        ew: disc.w * 2,
        h: height * 0.85,
      };
      stateRef.current.particleArea.sx =
        (width - stateRef.current.particleArea.sw) / 2;
      stateRef.current.particleArea.ex =
        (width - stateRef.current.particleArea.ew) / 2;
      const totalParticles = 100;
      for (let i = 0; i < totalParticles; i++) {
        stateRef.current.particles.push(initParticle(true));
      }
    }, [initParticle]);

    const drawDiscs = React.useCallback(
      (ctx: CanvasRenderingContext2D) => {
        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = 2;
        const outerDisc = stateRef.current.startDisc;
        ctx.beginPath();
        ctx.ellipse(
          outerDisc.x,
          outerDisc.y,
          outerDisc.w,
          outerDisc.h,
          0,
          0,
          Math.PI * 2
        );
        ctx.stroke();
        ctx.closePath();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        stateRef.current.discs.forEach((disc: any, i: number) => {
          if (i % 5 !== 0) return;
          if (disc.w < stateRef.current.clip.disc.w - 5) {
            ctx.save();
            ctx.clip(stateRef.current.clip.path);
          }
          ctx.beginPath();
          ctx.ellipse(disc.x, disc.y, disc.w, disc.h, 0, 0, Math.PI * 2);
          ctx.stroke();
          ctx.closePath();
          if (disc.w < stateRef.current.clip.disc.w - 5) {
            ctx.restore();
          }
        });

        // Draw dynamic discs
        dynamicDiscsRef.current.forEach((disc) => {
          const discColor = disc.color || strokeColor;
          ctx.strokeStyle = discColor;
          ctx.lineWidth = 2;

          if (disc.w < stateRef.current.clip.disc.w - 5) {
            ctx.save();
            ctx.clip(stateRef.current.clip.path);
          }
          ctx.beginPath();
          ctx.ellipse(disc.x, disc.y, disc.w, disc.h, 0, 0, Math.PI * 2);
          ctx.stroke();
          ctx.closePath();
          if (disc.w < stateRef.current.clip.disc.w - 5) {
            ctx.restore();
          }
        });
      },
      [strokeColor]
    );

    const drawLines = React.useCallback((ctx: CanvasRenderingContext2D) => {
      if (stateRef.current.linesCanvas) {
        ctx.drawImage(stateRef.current.linesCanvas, 0, 0);
      }
    }, []);

    const drawParticles = React.useCallback((ctx: CanvasRenderingContext2D) => {
      ctx.save();
      ctx.clip(stateRef.current.clip.path);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      stateRef.current.particles.forEach((particle: any) => {
        ctx.fillStyle = particle.c;
        ctx.beginPath();
        ctx.rect(particle.x, particle.y, particle.r, particle.r);
        ctx.closePath();
        ctx.fill();
      });
      ctx.restore();
    }, []);

    const drawHorizontalLines = React.useCallback(
      (ctx: CanvasRenderingContext2D) => {
        const { width } = stateRef.current.rect;
        const now = Date.now();
        const lineColor = horizontalLineColor || strokeColor;

        // Remove expired lines and update opacity
        horizontalLinesRef.current = horizontalLinesRef.current
          .map((line) => {
            const age = now - line.createdAt;
            const progress = age / horizontalLineDuration;
            const newOpacity = Math.max(0, 1 - progress);

            if (newOpacity <= 0) {
              return null; // Mark for removal
            }

            return {
              ...line,
              opacity: newOpacity,
            };
          })
          .filter((line): line is HorizontalLine => line !== null);

        // Draw horizontal lines
        horizontalLinesRef.current.forEach((line) => {
          ctx.save();
          ctx.strokeStyle = line.color || lineColor;
          ctx.lineWidth = line.width || horizontalLineWidth;
          ctx.globalAlpha = line.opacity;
          ctx.beginPath();
          ctx.moveTo(0, line.y);
          ctx.lineTo(width, line.y);
          ctx.stroke();
          ctx.closePath();
          ctx.restore();
        });
      },
      [
        strokeColor,
        horizontalLineColor,
        horizontalLineWidth,
        horizontalLineDuration,
      ]
    );

    const addHorizontalLine = React.useCallback(
      (options?: { y?: number; color?: string; width?: number }) => {
        const { height } = stateRef.current.rect;
        const y = options?.y ?? Math.random() * height;
        const id = `line-${lineIdCounterRef.current++}`;
        const now = Date.now();

        horizontalLinesRef.current.push({
          id,
          y,
          opacity: 1,
          createdAt: now,
          color: options?.color,
          width: options?.width,
        });
      },
      []
    );

    const addDisc = React.useCallback(
      (options?: { startFromInside?: boolean; color?: string }) => {
        // Disc journey explanation:
        // - p=0: Disc is at startDisc (top, large, outside the vortex)
        // - p=1: Disc is at endDisc (bottom, small, inside the vortex)
        // - When reverse=false: discs move from p=0 to p=1 (top to bottom, outside to inside)
        // - When reverse=true: discs move from p=1 to p=0 (bottom to top, inside to outside)
        //
        // When reverse=false: default to starting from outside (p=0) so disc shrinks inward
        // When reverse=true: default to starting from inside (p=1) so disc expands outward
        let startP: number;
        if (options?.startFromInside !== undefined) {
          // Explicitly specified
          startP = options.startFromInside ? 1 : 0;
        } else {
          // Default based on reverse direction
          // reverse=false: start from outside (p=0) to shrink inward
          // reverse=true: start from inside (p=1) to expand outward
          startP = reverse ? 1 : 0;
        }

        const id = `disc-${discIdCounterRef.current++}`;
        const disc: DynamicDisc = {
          id,
          p: startP,
          x: 0,
          y: 0,
          w: 0,
          h: 0,
          createdAt: Date.now(),
          color: options?.color,
        };

        // Initialize disc position using tweenDisc
        tweenDisc(disc);
        dynamicDiscsRef.current.push(disc);
      },
      [reverse, tweenDisc]
    );

    // Expose ref methods
    React.useImperativeHandle(
      ref,
      () => ({
        addHorizontalLine,
        addDisc,
      }),
      [addHorizontalLine, addDisc]
    );

    // Call onReady callback when component is ready
    React.useEffect(() => {
      if (onReady && stateRef.current.rect.width > 0) {
        onReady({
          addHorizontalLine,
          addDisc,
        });
      }
    }, [onReady, addHorizontalLine, addDisc]);

    const moveDiscs = React.useCallback(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      stateRef.current.discs.forEach((disc: any) => {
        if (reverse) {
          disc.p = disc.p - 0.001;
          if (disc.p < 0) disc.p = 1 + disc.p; // Wrap negative values
        } else {
          disc.p = (disc.p + 0.001) % 1; // Increment and wrap
        }
        tweenDisc(disc);
      });

      // Move dynamic discs
      dynamicDiscsRef.current = dynamicDiscsRef.current
        .map((disc) => {
          if (reverse) {
            disc.p = disc.p - 0.001;
            if (disc.p < 0) {
              return null; // Remove when it goes past the start
            }
          } else {
            disc.p = disc.p + 0.001;
            if (disc.p > 1) {
              return null; // Remove when it goes past the end
            }
          }
          tweenDisc(disc);
          return disc;
        })
        .filter((disc): disc is DynamicDisc => disc !== null);
    }, [tweenDisc, reverse]);

    const moveParticles = React.useCallback(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      stateRef.current.particles.forEach((particle: any, idx: number) => {
        particle.p = 1 - particle.y / stateRef.current.particleArea.h;
        particle.x = particle.sx + particle.dx * particle.p;
        particle.y -= particle.vy;
        if (particle.y < 0) {
          stateRef.current.particles[idx] = initParticle();
        }
      });
    }, [initParticle]);

    const tickRef = React.useRef<() => void>(() => {});

    const tick = React.useCallback(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.save();
      ctx.scale(stateRef.current.render.dpi, stateRef.current.render.dpi);
      moveDiscs();
      moveParticles();
      drawDiscs(ctx);
      drawLines(ctx);
      drawParticles(ctx);
      drawHorizontalLines(ctx);
      ctx.restore();
      if (tickRef.current) {
        animationFrameIdRef.current = requestAnimationFrame(tickRef.current);
      }
    }, [
      moveDiscs,
      moveParticles,
      drawDiscs,
      drawLines,
      drawParticles,
      drawHorizontalLines,
    ]);

    React.useEffect(() => {
      tickRef.current = tick;
    }, [tick]);

    const init = React.useCallback(() => {
      setSize();
      setDiscs();
      setLines();
      setParticles();
    }, [setSize, setDiscs, setLines, setParticles]);

    React.useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      init();
      tick();
      const handleResize = () => {
        setSize();
        setDiscs();
        setLines();
        setParticles();
      };
      window.addEventListener("resize", handleResize);
      return () => {
        window.removeEventListener("resize", handleResize);
        cancelAnimationFrame(animationFrameIdRef.current);
      };
    }, [init, tick, setSize, setDiscs, setLines, setParticles]);

    return (
      <div
        data-slot="hole-background"
        className={cn(
          "relative size-full overflow-hidden",
          'before:content-[""] before:absolute before:top-1/2 before:left-1/2 before:block before:size-[140%] dark:before:[background:radial-gradient(ellipse_at_50%_55%,transparent_10%,black_50%)] before:[background:radial-gradient(ellipse_at_50%_55%,transparent_10%,white_50%)] before:[transform:translate3d(-50%,-50%,0)]',
          'after:content-[""] after:absolute after:z-[5] after:top-1/2 after:left-1/2 after:block after:size-full after:[background:radial-gradient(ellipse_at_50%_75%,#a900ff_20%,transparent_75%)] after:[transform:translate3d(-50%,-50%,0)] after:mix-blend-overlay',
          className
        )}
        {...props}
      >
        {children}
        <canvas
          ref={canvasRef}
          className="absolute inset-0 block size-full dark:opacity-20 opacity-10"
        />
        <motion.div
          className={cn(
            "absolute top-[-71.5%] left-1/2 z-[3] w-[30%] h-[140%] rounded-b-full blur-3xl opacity-75 dark:mix-blend-plus-lighter mix-blend-plus-darker [transform:translate3d(-50%,0,0)] [background-position:0%_100%] [background-size:100%_200%]",
            "dark:[background:linear-gradient(20deg,#00f8f1,#ffbd1e20_16.5%,#fe848f_33%,#fe848f20_49.5%,#00f8f1_66%,#00f8f160_85.5%,#ffbd1e_100%)_0_100%_/_100%_200%] [background:linear-gradient(20deg,#00f8f1,#ffbd1e40_16.5%,#fe848f_33%,#fe848f40_49.5%,#00f8f1_66%,#00f8f180_85.5%,#ffbd1e_100%)_0_100%_/_100%_200%]"
          )}
          animate={{
            backgroundPosition: reverse
              ? ["0% 300%", "0% 100%"]
              : ["0% 100%", "0% 300%"],
          }}
          transition={{ duration: 5, ease: "linear", repeat: Infinity }}
        />
        <div className="absolute top-0 left-0 z-[7] size-full dark:[background:repeating-linear-gradient(transparent,transparent_1px,white_1px,white_2px)] mix-blend-overlay opacity-50" />
      </div>
    );
  }
);

export { HoleBackground, type HoleBackgroundProps };
