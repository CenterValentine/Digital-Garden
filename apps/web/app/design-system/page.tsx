"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { Prose } from "@/components/ui/prose";
import { TreeNode, BranchLine } from "@/components/ui/tree-node";

export default function DesignSystemPage() {
  const [activeHoverDemo, setActiveHoverDemo] = useState<string | null>(null);
  return (
    <div className="min-h-screen bg-gradient-to-br from-shale-dark via-shale-mid to-shale-dark p-8 space-y-8">
      <div className="max-w-5xl mx-auto space-y-12">
        <header className="text-center">
          <h1 className="text-4xl font-bold mb-2 text-gold-primary">
            David&apos;s Digital Garden Design System
          </h1>
          <p className="text-gold-light text-lg">
            Applied Learning &amp; Ideas - Component Library Reference
          </p>
        </header>

        {/* Fonts */}
        <section className="space-y-6">
          <h2 className="text-2xl font-semibold text-gold-primary border-b border-gold-primary/30 pb-2">
            Fonts
          </h2>

          <div className="bg-shale-dark/50 p-6 rounded-xl border border-shale-light/20 space-y-6">
            {/* Primary Fonts */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-3">
                <h3 className="text-lg font-medium text-gold-light">
                  Geist Sans (Primary)
                </h3>
                <p className="text-shale-light text-sm mb-2">
                  CSS Variable:{" "}
                  <code className="text-gold-light">--font-geist-sans</code>
                </p>
                <div className="space-y-2 bg-shale-dark p-4 rounded-lg">
                  <p className="font-sans text-gold-light text-2xl">
                    The quick brown fox jumps over the lazy dog
                  </p>
                  <p className="font-sans text-gold-light/80">
                    ABCDEFGHIJKLMNOPQRSTUVWXYZ
                  </p>
                  <p className="font-sans text-gold-light/80">
                    abcdefghijklmnopqrstuvwxyz
                  </p>
                  <p className="font-sans text-gold-light/80">
                    0123456789 !@#$%^&amp;*()
                  </p>
                </div>
                <p className="text-shale-light text-xs">
                  Used for: Body text, headings, UI elements
                </p>
              </div>

              <div className="space-y-3">
                <h3 className="text-lg font-medium text-gold-light">
                  Geist Mono (Code)
                </h3>
                <p className="text-shale-light text-sm mb-2">
                  CSS Variable:{" "}
                  <code className="text-gold-light">--font-geist-mono</code>
                </p>
                <div className="space-y-2 bg-shale-dark p-4 rounded-lg">
                  <p className="font-mono text-gold-light text-lg">
                    const garden = &quot;digital&quot;;
                  </p>
                  <p className="font-mono text-gold-light/80 text-sm">
                    ABCDEFGHIJKLMNOPQRSTUVWXYZ
                  </p>
                  <p className="font-mono text-gold-light/80 text-sm">
                    abcdefghijklmnopqrstuvwxyz
                  </p>
                  <p className="font-mono text-gold-light/80 text-sm">
                    0123456789 {`{} [] () => ===`}
                  </p>
                </div>
                <p className="text-shale-light text-xs">
                  Used for: Code snippets, technical content, monospace text
                </p>
              </div>
            </div>

            {/* Font Stack Fallbacks */}
            <div className="space-y-3">
              <h3 className="text-lg font-medium text-gold-light">
                Fallback Stack
              </h3>
              <div className="bg-shale-dark p-4 rounded-lg">
                <code className="text-gold-light/80 text-sm font-mono">
                  font-family: var(--font-geist-sans), Arial, Helvetica,
                  sans-serif;
                </code>
              </div>
            </div>

            {/* Usage Examples */}
            <div className="space-y-3">
              <h3 className="text-lg font-medium text-gold-light">
                Tailwind Classes
              </h3>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div className="bg-shale-dark p-3 rounded-lg">
                  <code className="text-gold-light font-mono">font-sans</code>
                  <p className="text-shale-light mt-1">Primary font (Geist)</p>
                </div>
                <div className="bg-shale-dark p-3 rounded-lg">
                  <code className="text-gold-light font-mono">font-mono</code>
                  <p className="text-shale-light mt-1">
                    Monospace font (Geist Mono)
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Color Palette */}
        <section className="space-y-6">
          <h2 className="text-2xl font-semibold text-gold-primary border-b border-gold-primary/30 pb-2">
            Color Palette
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Slate (formerly Shale) */}
            <div className="space-y-3 bg-shale-dark/50 p-4 rounded-xl border border-shale-light/20">
              <h3 className="text-lg font-medium text-gold-light">
                Slate (Depth/Connection)
              </h3>
              <div className="space-y-2">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-lg border-2 border-shale-light bg-shale-dark" />
                  <div>
                    <p className="text-gold-light font-medium">shale-dark</p>
                    <p className="text-shale-light text-sm">#465E73</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-lg bg-shale-mid" />
                  <div>
                    <p className="text-gold-light font-medium">shale-mid</p>
                    <p className="text-shale-light text-sm">#5A7288</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-lg bg-shale-light" />
                  <div>
                    <p className="text-gold-light font-medium">shale-light</p>
                    <p className="text-shale-light text-sm">#6E869D</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Gold */}
            <div className="space-y-3 bg-shale-dark/50 p-4 rounded-xl border border-shale-light/20">
              <h3 className="text-lg font-medium text-gold-light">
                Gold (Knowledge/Foundation)
              </h3>
              <div className="space-y-2">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-lg bg-gold-dark" />
                  <div>
                    <p className="text-gold-light font-medium">gold-dark</p>
                    <p className="text-shale-light text-sm">#B8965A</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-lg bg-gold-primary" />
                  <div>
                    <p className="text-gold-light font-medium">gold-primary</p>
                    <p className="text-shale-light text-sm">#C9A86C</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-lg bg-gold-light" />
                  <div>
                    <p className="text-gold-light font-medium">gold-light</p>
                    <p className="text-shale-light text-sm">#D9B87E</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Leaf */}
            <div className="space-y-3 bg-shale-dark/50 p-4 rounded-xl border border-shale-light/20">
              <h3 className="text-lg font-medium text-gold-light">
                Leaf (Growth/Success)
              </h3>
              <div className="space-y-2">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-lg bg-leaf-primary" />
                  <div>
                    <p className="text-gold-light font-medium">leaf-primary</p>
                    <p className="text-shale-light text-sm">#49A657</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-lg bg-leaf-light" />
                  <div>
                    <p className="text-gold-light font-medium">leaf-light</p>
                    <p className="text-shale-light text-sm">#6BC578</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-lg bg-leaf-bright" />
                  <div>
                    <p className="text-gold-light font-medium">leaf-bright</p>
                    <p className="text-shale-light text-sm">#8FE39A</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Neon Palettes */}
          <div className="space-y-6">
            <h3 className="text-xl font-semibold text-gold-primary border-b border-gold-primary/30 pb-2">
              Neon Palettes (Triadic Harmony)
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Neon Blue */}
              <div className="space-y-3 bg-shale-dark/50 p-4 rounded-xl border border-shale-light/20">
                <h4 className="text-lg font-medium text-gold-light">
                  Neon Blue (Triadic from Slate)
                </h4>
                <div className="space-y-2">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-12 h-12 rounded-lg border-2 border-neon-blue-light bg-neon-blue-primary shadow-glow-lg"
                      style={{ boxShadow: "0 0 20px rgba(0, 212, 255, 0.6)" }}
                    />
                    <div>
                      <p className="text-gold-light font-medium">
                        neon-blue-primary
                      </p>
                      <p className="text-shale-light text-sm">#00D4FF</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div
                      className="w-12 h-12 rounded-lg bg-neon-blue-secondary"
                      style={{ boxShadow: "0 0 15px rgba(255, 107, 53, 0.5)" }}
                    />
                    <div>
                      <p className="text-gold-light font-medium">
                        neon-blue-secondary
                      </p>
                      <p className="text-shale-light text-sm">#FF6B35</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div
                      className="w-12 h-12 rounded-lg bg-neon-blue-accent"
                      style={{ boxShadow: "0 0 15px rgba(127, 255, 0, 0.5)" }}
                    />
                    <div>
                      <p className="text-gold-light font-medium">
                        neon-blue-accent
                      </p>
                      <p className="text-shale-light text-sm">#7FFF00</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Neon Gold */}
              <div className="space-y-3 bg-shale-dark/50 p-4 rounded-xl border border-shale-light/20">
                <h4 className="text-lg font-medium text-gold-light">
                  Neon Gold (Triadic from Gold)
                </h4>
                <div className="space-y-2">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-12 h-12 rounded-lg border-2 border-neon-gold-light bg-neon-gold-primary shadow-glow-lg"
                      style={{ boxShadow: "0 0 20px rgba(255, 215, 0, 0.6)" }}
                    />
                    <div>
                      <p className="text-gold-light font-medium">
                        neon-gold-primary
                      </p>
                      <p className="text-shale-light text-sm">#FFD700</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div
                      className="w-12 h-12 rounded-lg bg-neon-gold-secondary"
                      style={{ boxShadow: "0 0 15px rgba(0, 191, 255, 0.5)" }}
                    />
                    <div>
                      <p className="text-gold-light font-medium">
                        neon-gold-secondary
                      </p>
                      <p className="text-shale-light text-sm">#00BFFF</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div
                      className="w-12 h-12 rounded-lg bg-neon-gold-accent"
                      style={{ boxShadow: "0 0 15px rgba(255, 20, 147, 0.5)" }}
                    />
                    <div>
                      <p className="text-gold-light font-medium">
                        neon-gold-accent
                      </p>
                      <p className="text-shale-light text-sm">#FF1493</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Neon Green */}
              <div className="space-y-3 bg-shale-dark/50 p-4 rounded-xl border border-shale-light/20">
                <h4 className="text-lg font-medium text-gold-light">
                  Neon Green (Triadic from Leaf)
                </h4>
                <div className="space-y-2">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-12 h-12 rounded-lg border-2 border-neon-green-light bg-neon-green-primary shadow-glow-lg"
                      style={{ boxShadow: "0 0 20px rgba(0, 255, 127, 0.6)" }}
                    />
                    <div>
                      <p className="text-gold-light font-medium">
                        neon-green-primary
                      </p>
                      <p className="text-shale-light text-sm">#00FF7F</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div
                      className="w-12 h-12 rounded-lg bg-neon-green-secondary"
                      style={{ boxShadow: "0 0 15px rgba(255, 140, 0, 0.5)" }}
                    />
                    <div>
                      <p className="text-gold-light font-medium">
                        neon-green-secondary
                      </p>
                      <p className="text-shale-light text-sm">#FF8C00</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div
                      className="w-12 h-12 rounded-lg bg-neon-green-accent"
                      style={{ boxShadow: "0 0 15px rgba(147, 112, 219, 0.5)" }}
                    />
                    <div>
                      <p className="text-gold-light font-medium">
                        neon-green-accent
                      </p>
                      <p className="text-shale-light text-sm">#9370DB</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Semantic Colors */}
          <div className="space-y-3 bg-shale-dark/50 p-4 rounded-xl border border-shale-light/20">
            <h3 className="text-lg font-medium text-gold-light">
              Semantic Colors (for UI Components)
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="flex flex-col items-center gap-2">
                <div className="w-12 h-12 rounded-lg bg-primary" />
                <p className="text-gold-light text-xs">primary</p>
              </div>
              <div className="flex flex-col items-center gap-2">
                <div className="w-12 h-12 rounded-lg bg-secondary" />
                <p className="text-gold-light text-xs">secondary</p>
              </div>
              <div className="flex flex-col items-center gap-2">
                <div className="w-12 h-12 rounded-lg bg-accent" />
                <p className="text-gold-light text-xs">accent</p>
              </div>
              <div className="flex flex-col items-center gap-2">
                <div className="w-12 h-12 rounded-lg bg-destructive" />
                <p className="text-gold-light text-xs">destructive</p>
              </div>
              <div className="flex flex-col items-center gap-2">
                <div className="w-12 h-12 rounded-lg bg-muted" />
                <p className="text-gold-light text-xs">muted</p>
              </div>
              <div className="flex flex-col items-center gap-2">
                <div className="w-12 h-12 rounded-lg bg-card border border-border" />
                <p className="text-gold-light text-xs">card</p>
              </div>
              <div className="flex flex-col items-center gap-2">
                <div className="w-12 h-12 rounded-lg bg-background border border-border" />
                <p className="text-gold-light text-xs">background</p>
              </div>
              <div className="flex flex-col items-center gap-2">
                <div className="w-12 h-12 rounded-lg bg-foreground" />
                <p className="text-gold-light text-xs">foreground</p>
              </div>
            </div>
          </div>

          {/* Gradients */}
          <div className="space-y-3 bg-shale-dark/50 p-4 rounded-xl border border-shale-light/20">
            <h3 className="text-lg font-medium text-gold-light">
              Gradient Backgrounds
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="flex flex-col items-center gap-2">
                <div className="w-full h-16 rounded-lg bg-gradient-to-b from-shale-light via-shale-mid to-shale-dark" />
                <p className="text-gold-light text-xs text-center">
                  Shale Gradient
                </p>
              </div>
              <div className="flex flex-col items-center gap-2">
                <div className="w-full h-16 rounded-lg bg-gradient-to-b from-gold-light via-gold-primary to-gold-dark" />
                <p className="text-gold-light text-xs text-center">
                  Gold Gradient
                </p>
              </div>
              <div className="flex flex-col items-center gap-2">
                <div className="w-full h-16 rounded-lg bg-gradient-to-b from-leaf-bright via-leaf-light to-leaf-primary" />
                <p className="text-gold-light text-xs text-center">
                  Leaf Gradient
                </p>
              </div>
              <div className="flex flex-col items-center gap-2">
                <div className="w-full h-16 rounded-lg bg-gradient-to-b from-gold-light via-shale-mid to-shale-dark" />
                <p className="text-gold-light text-xs text-center">
                  Mixed Gradient
                </p>
              </div>
            </div>
          </div>

          {/* State Colors */}
          <div className="space-y-3 bg-shale-dark/50 p-4 rounded-xl border border-shale-light/20">
            <h3 className="text-lg font-medium text-gold-light">
              State Colors (Interactive Feedback)
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="flex flex-col items-center gap-2">
                <div className="w-16 h-16 rounded-lg bg-state-hover border-2 border-gold-primary/50" />
                <p className="text-gold-light text-xs">hover</p>
                <p className="text-shale-light text-[10px]">Gold 15%</p>
              </div>
              <div className="flex flex-col items-center gap-2">
                <div className="w-16 h-16 rounded-lg bg-state-focus border-2 border-leaf-primary/50" />
                <p className="text-gold-light text-xs">focus</p>
                <p className="text-shale-light text-[10px]">Leaf 20%</p>
              </div>
              <div className="flex flex-col items-center gap-2">
                <div className="w-16 h-16 rounded-lg bg-state-active border-2 border-leaf-primary/50" />
                <p className="text-gold-light text-xs">active</p>
                <p className="text-shale-light text-[10px]">Leaf 30%</p>
              </div>
              <div className="flex flex-col items-center gap-2">
                <div className="w-16 h-16 rounded-lg bg-state-disabled border-2 border-shale-light/50" />
                <p className="text-gold-light text-xs">disabled</p>
                <p className="text-shale-light text-[10px]">Shale 30%</p>
              </div>
            </div>
          </div>
        </section>

        {/* Interactive States & Hover Effects */}
        <section className="space-y-6">
          <h2 className="text-2xl font-semibold text-gold-primary border-b border-gold-primary/30 pb-2">
            Interactive States &amp; Hover Effects
          </h2>

          <div className="bg-shale-dark/50 p-6 rounded-xl border border-shale-light/20 space-y-6">
            <p className="text-gold-light/80 text-sm">
              Hover over the elements below to see the interactive state
              transitions.
            </p>

            {/* Hover Demo Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div
                className="p-4 rounded-lg bg-shale-mid transition-all duration-300 hover:bg-gold-primary hover:shadow-glow-gold cursor-pointer"
                onMouseEnter={() => setActiveHoverDemo("card1")}
                onMouseLeave={() => setActiveHoverDemo(null)}
              >
                <p className="text-gold-light font-medium">Shale → Gold Hover</p>
                <p className="text-shale-light text-xs mt-1">
                  {activeHoverDemo === "card1" ? "Hovered!" : "Hover me"}
                </p>
              </div>
              <div
                className="p-4 rounded-lg bg-gold-primary transition-all duration-300 hover:bg-leaf-primary hover:shadow-glow-leaf cursor-pointer"
                onMouseEnter={() => setActiveHoverDemo("card2")}
                onMouseLeave={() => setActiveHoverDemo(null)}
              >
                <p className="text-shale-dark font-medium">Gold → Leaf Hover</p>
                <p className="text-gold-dark text-xs mt-1">
                  {activeHoverDemo === "card2" ? "Hovered!" : "Hover me"}
                </p>
              </div>
              <div
                className="p-4 rounded-lg bg-leaf-primary transition-all duration-300 hover:bg-gold-light hover:text-shale-dark cursor-pointer"
                onMouseEnter={() => setActiveHoverDemo("card3")}
                onMouseLeave={() => setActiveHoverDemo(null)}
              >
                <p className="text-white font-medium">
                  Leaf → Gold Light Hover
                </p>
                <p className="text-leaf-bright text-xs mt-1">
                  {activeHoverDemo === "card3" ? "Hovered!" : "Hover me"}
                </p>
              </div>
            </div>

            {/* Scale & Transform Effects */}
            <div className="space-y-3">
              <h3 className="text-lg font-medium text-gold-light">
                Scale &amp; Transform Effects
              </h3>
              <div className="flex flex-wrap gap-4">
                <div className="w-16 h-16 rounded-lg bg-shale-mid transition-transform duration-300 hover:scale-110 cursor-pointer flex items-center justify-center">
                  <span className="text-gold-light text-xs">Scale</span>
                </div>
                <div className="w-16 h-16 rounded-lg bg-gold-primary transition-transform duration-300 hover:-translate-y-2 cursor-pointer flex items-center justify-center">
                  <span className="text-shale-dark text-xs">Lift</span>
                </div>
                <div className="w-16 h-16 rounded-lg bg-leaf-primary transition-all duration-300 hover:rotate-12 cursor-pointer flex items-center justify-center">
                  <span className="text-white text-xs">Rotate</span>
                </div>
                <div className="w-16 h-16 rounded-lg bg-shale-light transition-all duration-300 hover:scale-110 hover:shadow-glow-gold cursor-pointer flex items-center justify-center">
                  <span className="text-shale-dark text-xs">Combined</span>
                </div>
              </div>
            </div>

            {/* Opacity & Border Effects */}
            <div className="space-y-3">
              <h3 className="text-lg font-medium text-gold-light">
                Opacity &amp; Border Effects
              </h3>
              <div className="flex flex-wrap gap-4">
                <div className="w-20 h-16 rounded-lg bg-gold-primary/50 transition-all duration-300 hover:bg-gold-primary cursor-pointer flex items-center justify-center">
                  <span className="text-gold-light text-xs">Opacity</span>
                </div>
                <div className="w-20 h-16 rounded-lg border-2 border-shale-light transition-all duration-300 hover:border-gold-primary hover:border-4 cursor-pointer flex items-center justify-center">
                  <span className="text-gold-light text-xs">Border</span>
                </div>
                <div className="w-20 h-16 rounded-lg bg-shale-mid border-2 border-transparent transition-all duration-300 hover:border-leaf-primary cursor-pointer flex items-center justify-center">
                  <span className="text-gold-light text-xs">Reveal</span>
                </div>
              </div>
            </div>

            {/* Common Hover Patterns */}
            <div className="space-y-3">
              <h3 className="text-lg font-medium text-gold-light">
                Common Hover Class Patterns
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm font-mono text-gold-light/80">
                <div className="bg-shale-dark p-3 rounded-lg">
                  <p className="text-gold-primary mb-1">Color Transition</p>
                  <code>hover:bg-gold-primary transition-colors</code>
                </div>
                <div className="bg-shale-dark p-3 rounded-lg">
                  <p className="text-gold-primary mb-1">Scale Effect</p>
                  <code>hover:scale-105 transition-transform</code>
                </div>
                <div className="bg-shale-dark p-3 rounded-lg">
                  <p className="text-gold-primary mb-1">Glow on Hover</p>
                  <code>hover:shadow-glow-leaf transition-shadow</code>
                </div>
                <div className="bg-shale-dark p-3 rounded-lg">
                  <p className="text-gold-primary mb-1">Lift Effect</p>
                  <code>hover:-translate-y-1 transition-transform</code>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Typography */}
        <section className="space-y-6">
          <h2 className="text-2xl font-semibold text-gold-primary border-b border-gold-primary/30 pb-2">
            Typography
          </h2>

          <div className="bg-shale-dark/50 p-6 rounded-xl border border-shale-light/20 space-y-6">
            {/* Font Sizes */}
            <div className="space-y-4">
              <h3 className="text-lg font-medium text-gold-light">
                Font Sizes
              </h3>
              <div className="space-y-3">
                <div className="flex items-baseline gap-4">
                  <span className="text-xs text-gold-light">text-xs</span>
                  <span className="text-shale-light text-xs">
                    0.75rem / 12px
                  </span>
                </div>
                <div className="flex items-baseline gap-4">
                  <span className="text-sm text-gold-light">text-sm</span>
                  <span className="text-shale-light text-xs">
                    0.875rem / 14px
                  </span>
                </div>
                <div className="flex items-baseline gap-4">
                  <span className="text-base text-gold-light">text-base</span>
                  <span className="text-shale-light text-xs">1rem / 16px</span>
                </div>
                <div className="flex items-baseline gap-4">
                  <span className="text-lg text-gold-light">text-lg</span>
                  <span className="text-shale-light text-xs">
                    1.125rem / 18px
                  </span>
                </div>
                <div className="flex items-baseline gap-4">
                  <span className="text-xl text-gold-light">text-xl</span>
                  <span className="text-shale-light text-xs">
                    1.25rem / 20px
                  </span>
                </div>
                <div className="flex items-baseline gap-4">
                  <span className="text-2xl text-gold-light">text-2xl</span>
                  <span className="text-shale-light text-xs">1.5rem / 24px</span>
                </div>
                <div className="flex items-baseline gap-4">
                  <span className="text-3xl text-gold-light">text-3xl</span>
                  <span className="text-shale-light text-xs">
                    1.875rem / 30px
                  </span>
                </div>
                <div className="flex items-baseline gap-4">
                  <span className="text-4xl text-gold-light">text-4xl</span>
                  <span className="text-shale-light text-xs">
                    2.25rem / 36px
                  </span>
                </div>
              </div>
            </div>

            {/* Font Weights */}
            <div className="space-y-4">
              <h3 className="text-lg font-medium text-gold-light">
                Font Weights
              </h3>
              <div className="space-y-2">
                <p className="font-normal text-gold-light">font-normal (400)</p>
                <p className="font-medium text-gold-light">font-medium (500)</p>
                <p className="font-semibold text-gold-light">
                  font-semibold (600)
                </p>
                <p className="font-bold text-gold-light">font-bold (700)</p>
              </div>
            </div>
          </div>
        </section>

        {/* Spacing & Radius */}
        <section className="space-y-6">
          <h2 className="text-2xl font-semibold text-gold-primary border-b border-gold-primary/30 pb-2">
            Spacing &amp; Border Radius
          </h2>

          <div className="bg-shale-dark/50 p-6 rounded-xl border border-shale-light/20 space-y-6">
            {/* Border Radius */}
            <div className="space-y-4">
              <h3 className="text-lg font-medium text-gold-light">
                Border Radius
              </h3>
              <div className="flex flex-wrap gap-4">
                <div className="flex flex-col items-center gap-2">
                  <div className="w-16 h-16 bg-gold-primary rounded-sm" />
                  <p className="text-gold-light text-xs">rounded-sm</p>
                </div>
                <div className="flex flex-col items-center gap-2">
                  <div className="w-16 h-16 bg-gold-primary rounded-md" />
                  <p className="text-gold-light text-xs">rounded-md</p>
                </div>
                <div className="flex flex-col items-center gap-2">
                  <div className="w-16 h-16 bg-gold-primary rounded-lg" />
                  <p className="text-gold-light text-xs">rounded-lg</p>
                </div>
                <div className="flex flex-col items-center gap-2">
                  <div className="w-16 h-16 bg-gold-primary rounded-xl" />
                  <p className="text-gold-light text-xs">rounded-xl</p>
                </div>
                <div className="flex flex-col items-center gap-2">
                  <div className="w-16 h-16 bg-gold-primary rounded-full" />
                  <p className="text-gold-light text-xs">rounded-full</p>
                </div>
              </div>
            </div>

            {/* Common Spacing */}
            <div className="space-y-4">
              <h3 className="text-lg font-medium text-gold-light">
                Common Spacing Scale
              </h3>
              <div className="space-y-2">
                <div className="flex items-center gap-4">
                  <div className="w-1 h-4 bg-leaf-primary" />
                  <span className="text-gold-light text-sm">
                    1 (0.25rem / 4px)
                  </span>
                </div>
                <div className="flex items-center gap-4">
                  <div className="w-2 h-4 bg-leaf-primary" />
                  <span className="text-gold-light text-sm">
                    2 (0.5rem / 8px)
                  </span>
                </div>
                <div className="flex items-center gap-4">
                  <div className="w-3 h-4 bg-leaf-primary" />
                  <span className="text-gold-light text-sm">
                    3 (0.75rem / 12px)
                  </span>
                </div>
                <div className="flex items-center gap-4">
                  <div className="w-4 h-4 bg-leaf-primary" />
                  <span className="text-gold-light text-sm">
                    4 (1rem / 16px)
                  </span>
                </div>
                <div className="flex items-center gap-4">
                  <div className="w-6 h-4 bg-leaf-primary" />
                  <span className="text-gold-light text-sm">
                    6 (1.5rem / 24px)
                  </span>
                </div>
                <div className="flex items-center gap-4">
                  <div className="w-8 h-4 bg-leaf-primary" />
                  <span className="text-gold-light text-sm">
                    8 (2rem / 32px)
                  </span>
                </div>
                <div className="flex items-center gap-4">
                  <div className="w-12 h-4 bg-leaf-primary" />
                  <span className="text-gold-light text-sm">
                    12 (3rem / 48px)
                  </span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Button Variants */}
        <section className="space-y-6">
          <h2 className="text-2xl font-semibold text-gold-primary border-b border-gold-primary/30 pb-2">
            Button Component
          </h2>

          <div className="space-y-6">
            <div className="bg-shale-dark/50 p-4 rounded-xl border border-shale-light/20">
              <h3 className="text-lg font-medium mb-3 text-gold-light">
                Standard Variants
              </h3>
              <div className="flex flex-wrap gap-3">
                <Button variant="default">Default</Button>
                <Button variant="secondary">Secondary</Button>
                <Button variant="outline">Outline</Button>
                <Button variant="ghost">Ghost</Button>
                <Button variant="link">Link</Button>
                <Button variant="destructive">Destructive</Button>
              </div>
            </div>

            <div className="bg-shale-dark/50 p-4 rounded-xl border border-shale-light/20">
              <h3 className="text-lg font-medium mb-3 text-gold-light">
                Digital Garden Variants
              </h3>
              <div className="flex flex-wrap gap-3">
                <Button variant="leaf">Leaf (Growth)</Button>
                <Button variant="gold">Gold (Knowledge)</Button>
                <Button variant="shale">Shale (Connection)</Button>
              </div>
            </div>

            <div className="bg-shale-dark/50 p-4 rounded-xl border border-shale-light/20">
              <h3 className="text-lg font-medium mb-3 text-gold-light">
                Gradient Variants (Full Height for NavBar)
              </h3>
              <div className="flex h-12 border border-shale-light/30 rounded-lg overflow-hidden">
                <Button variant="gradient-shale" size="full">
                  Shale Gradient
                </Button>
                <Button variant="gradient-gold" size="full">
                  Gold Gradient
                </Button>
                <Button variant="gradient-leaf" size="full">
                  Leaf Gradient
                </Button>
                <Button variant="gradient-mixed" size="full">
                  Mixed Gradient
                </Button>
              </div>
            </div>

            <div className="bg-shale-dark/50 p-4 rounded-xl border border-shale-light/20">
              <h3 className="text-lg font-medium mb-3 text-gold-light">
                Sizes
              </h3>
              <div className="flex flex-wrap items-center gap-3">
                <Button size="sm">Small</Button>
                <Button size="default">Default</Button>
                <Button size="lg">Large</Button>
                <Button size="icon">🌱</Button>
              </div>
            </div>
          </div>
        </section>

        {/* Tree Node Component */}
        <section className="space-y-6">
          <h2 className="text-2xl font-semibold text-gold-primary border-b border-gold-primary/30 pb-2">
            Tree Node Component
          </h2>

          <div className="space-y-6">
            <div className="bg-shale-dark/50 p-4 rounded-xl border border-shale-light/20">
              <h3 className="text-lg font-medium mb-4 text-gold-light">
                Node Types
              </h3>
              <div className="flex flex-wrap gap-8">
                <TreeNode type="default" label="Default" />
                <TreeNode type="leaf" label="Leaf" />
                <TreeNode type="junction" label="Junction" />
                <TreeNode type="root" label="Root" />
                <TreeNode type="endpoint" label="Endpoint" />
              </div>
            </div>

            <div className="bg-shale-dark/50 p-4 rounded-xl border border-shale-light/20">
              <h3 className="text-lg font-medium mb-4 text-gold-light">
                Node States (with Glow)
              </h3>
              <div className="flex flex-wrap gap-8">
                <TreeNode state="default" showGlow label="Default" />
                <TreeNode state="active" showGlow label="Active" />
                <TreeNode state="hover" showGlow label="Hover" />
                <TreeNode state="success" showGlow label="Success" />
                <TreeNode state="warning" showGlow label="Warning" />
                <TreeNode state="disabled" label="Disabled" />
              </div>
            </div>

            <div className="bg-shale-dark/50 p-4 rounded-xl border border-shale-light/20">
              <h3 className="text-lg font-medium mb-4 text-gold-light">
                Node Sizes
              </h3>
              <div className="flex flex-wrap items-end gap-8">
                <TreeNode size="sm" state="active" showGlow label="Small" />
                <TreeNode size="md" state="active" showGlow label="Medium" />
                <TreeNode size="lg" state="active" showGlow label="Large" />
                <TreeNode size="xl" state="active" showGlow label="XL" />
              </div>
            </div>

            <div className="bg-shale-dark/50 p-4 rounded-xl border border-shale-light/20">
              <h3 className="text-lg font-medium mb-4 text-gold-light">
                Branch Lines
              </h3>
              <div className="flex flex-wrap gap-8">
                <div className="flex flex-col items-center gap-2">
                  <BranchLine
                    type="straight"
                    direction="vertical"
                    length={60}
                    color="gold"
                  />
                  <span className="text-xs text-gold-light">Gold Vertical</span>
                </div>
                <div className="flex flex-col items-center gap-2">
                  <BranchLine
                    type="straight"
                    direction="horizontal"
                    length={80}
                    color="shale"
                  />
                  <span className="text-xs text-gold-light">
                    Shale Horizontal
                  </span>
                </div>
                <div className="flex flex-col items-center gap-2">
                  <BranchLine
                    type="circuit"
                    length={120}
                    color="gold"
                    withJunctions
                  />
                  <span className="text-xs text-gold-light">
                    Circuit with Junctions
                  </span>
                </div>
                <div className="flex flex-col items-center gap-2">
                  <BranchLine type="curved" length={60} color="green" />
                  <span className="text-xs text-gold-light">Curved Green</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Card Variants */}
        <section className="space-y-6">
          <h2 className="text-2xl font-semibold text-gold-primary border-b border-gold-primary/30 pb-2">
            Card Component
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card intent="default">
              <CardHeader>
                <CardTitle>Default Card</CardTitle>
                <CardDescription>Standard card styling</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">Default card content</p>
              </CardContent>
              <CardFooter>
                <Button size="sm">Action</Button>
              </CardFooter>
            </Card>

            <Card intent="highlight">
              <CardHeader>
                <CardTitle>Highlight Card</CardTitle>
                <CardDescription>Growth/success variant</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">
                  Leaf-highlighted content
                </p>
              </CardContent>
              <CardFooter>
                <Button variant="leaf" size="sm">
                  Grow
                </Button>
              </CardFooter>
            </Card>

            <Card intent="shale">
              <CardHeader>
                <CardTitle className="text-gold-light">Shale Card</CardTitle>
                <CardDescription className="text-shale-light">
                  Connection/depth variant
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-gold-light/80">Deep shale background</p>
              </CardContent>
              <CardFooter>
                <Button variant="gold" size="sm">
                  Connect
                </Button>
              </CardFooter>
            </Card>

            <Card intent="gold">
              <CardHeader>
                <CardTitle className="text-gold-light">Gold Card</CardTitle>
                <CardDescription className="text-gold-light/70">
                  Knowledge/foundation variant
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-gold-light/80">Gold-accented content</p>
              </CardContent>
              <CardFooter>
                <Button variant="shale" size="sm">
                  Learn
                </Button>
              </CardFooter>
            </Card>
          </div>
        </section>

        {/* Prose Component */}
        <section className="space-y-6">
          <h2 className="text-2xl font-semibold text-gold-primary border-b border-gold-primary/30 pb-2">
            Prose Component
          </h2>

          <div className="bg-card rounded-xl p-6 border border-border">
            <Prose intent="default">
              <h2>Applied Learning &amp; Ideas</h2>
              <p>
                This is the Digital Garden prose styling, optimized for
                long-form content with appropriate spacing and readability.
              </p>
              <ul>
                <li>Knowledge grows through connection</li>
                <li>Ideas branch from foundations</li>
                <li>Learning is an organic process</li>
              </ul>
            </Prose>
          </div>
        </section>

        {/* Glow Effects */}
        <section className="space-y-6">
          <h2 className="text-2xl font-semibold text-gold-primary border-b border-gold-primary/30 pb-2">
            Glow Effects
          </h2>

          <div className="bg-shale-dark/50 p-6 rounded-xl border border-shale-light/20 space-y-6">
            <div className="space-y-4">
              <h3 className="text-lg font-medium text-gold-light">
                Neon Text Glow (CSS Filter)
              </h3>
              <div className="space-y-3">
                <div className="neon-glow-sm text-lg text-leaf-primary">
                  Small glow with leaf color (growth)
                </div>
                <div className="neon-glow-md text-lg text-gold-primary">
                  Medium glow with gold color (knowledge)
                </div>
                <div className="neon-glow-lg text-lg text-shale-light">
                  Large glow with shale color (connection)
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="text-lg font-medium text-gold-light">
                Box Shadow Glow (for Nodes/Elements)
              </h3>
              <div className="flex flex-wrap gap-4">
                <div className="w-16 h-16 rounded-full shadow-glow-leaf bg-leaf-primary flex items-center justify-center">
                  <span className="text-white text-xs">Leaf</span>
                </div>
                <div className="w-16 h-16 rounded-full shadow-glow-gold bg-gold-primary flex items-center justify-center">
                  <span className="text-shale-dark text-xs">Gold</span>
                </div>
                <div className="w-16 h-16 rounded-full shadow-glow-success bg-leaf-light flex items-center justify-center">
                  <span className="text-white text-xs">Success</span>
                </div>
                <div className="w-16 h-16 rounded-full shadow-glow-warning bg-gold-dark flex items-center justify-center">
                  <span className="text-gold-light text-xs">Warning</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Usage Reference */}
        <section className="space-y-6">
          <h2 className="text-2xl font-semibold text-gold-primary border-b border-gold-primary/30 pb-2">
            Quick Reference
          </h2>

          <div className="bg-shale-dark/50 p-6 rounded-xl border border-shale-light/20">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm">
              <div>
                <h3 className="text-lg font-medium text-gold-light mb-3">
                  Tailwind Color Classes
                </h3>
                <ul className="space-y-1 text-gold-light/80 font-mono">
                  <li>bg-shale-dark / text-shale-dark</li>
                  <li>bg-shale-mid / text-shale-mid</li>
                  <li>bg-shale-light / text-shale-light</li>
                  <li>bg-gold-primary / text-gold-primary</li>
                  <li>bg-gold-dark / text-gold-dark</li>
                  <li>bg-gold-light / text-gold-light</li>
                  <li>bg-leaf-primary / text-leaf-primary</li>
                  <li>bg-leaf-light / text-leaf-light</li>
                  <li>bg-leaf-bright / text-leaf-bright</li>
                </ul>
              </div>
              <div>
                <h3 className="text-lg font-medium text-gold-light mb-3">
                  Button Variants
                </h3>
                <ul className="space-y-1 text-gold-light/80 font-mono">
                  <li>
                    variant=&quot;leaf&quot; | &quot;gold&quot; |
                    &quot;shale&quot;
                  </li>
                  <li>variant=&quot;gradient-shale&quot;</li>
                  <li>variant=&quot;gradient-gold&quot;</li>
                  <li>variant=&quot;gradient-leaf&quot;</li>
                  <li>variant=&quot;gradient-mixed&quot;</li>
                  <li>
                    size=&quot;sm&quot; | &quot;default&quot; | &quot;lg&quot; |
                    &quot;full&quot;
                  </li>
                </ul>
              </div>
              <div>
                <h3 className="text-lg font-medium text-gold-light mb-3">
                  Shadow Glow Classes
                </h3>
                <ul className="space-y-1 text-gold-light/80 font-mono">
                  <li>shadow-glow-leaf</li>
                  <li>shadow-glow-gold</li>
                  <li>shadow-glow-success</li>
                  <li>shadow-glow-warning</li>
                </ul>
              </div>
              <div>
                <h3 className="text-lg font-medium text-gold-light mb-3">
                  Neon Text Glow
                </h3>
                <ul className="space-y-1 text-gold-light/80 font-mono">
                  <li>neon-glow-sm</li>
                  <li>neon-glow-md</li>
                  <li>neon-glow-lg</li>
                </ul>
              </div>
              <div>
                <h3 className="text-lg font-medium text-gold-light mb-3">
                  Card Intents
                </h3>
                <ul className="space-y-1 text-gold-light/80 font-mono">
                  <li>intent=&quot;default&quot;</li>
                  <li>intent=&quot;highlight&quot;</li>
                  <li>intent=&quot;shale&quot;</li>
                  <li>intent=&quot;gold&quot;</li>
                  <li>intent=&quot;warning&quot;</li>
                  <li>intent=&quot;error&quot;</li>
                </ul>
              </div>
              <div>
                <h3 className="text-lg font-medium text-gold-light mb-3">
                  TreeNode Props
                </h3>
                <ul className="space-y-1 text-gold-light/80 font-mono">
                  <li>type: default | leaf | junction | root | endpoint</li>
                  <li>
                    state: default | active | hover | success | warning |
                    disabled
                  </li>
                  <li>size: sm | md | lg | xl</li>
                  <li>showGlow: boolean</li>
                </ul>
              </div>
              <div>
                <h3 className="text-lg font-medium text-gold-light mb-3">
                  Gradient Classes
                </h3>
                <ul className="space-y-1 text-gold-light/80 font-mono">
                  <li>
                    bg-gradient-to-b from-shale-light via-shale-mid to-shale-dark
                  </li>
                  <li>
                    bg-gradient-to-b from-gold-light via-gold-primary
                    to-gold-dark
                  </li>
                  <li>
                    bg-gradient-to-br from-shale-dark via-shale-mid to-shale-dark
                  </li>
                </ul>
              </div>
              <div>
                <h3 className="text-lg font-medium text-gold-light mb-3">
                  State Colors
                </h3>
                <ul className="space-y-1 text-gold-light/80 font-mono">
                  <li>bg-state-hover (gold 15%)</li>
                  <li>bg-state-focus (leaf 20%)</li>
                  <li>bg-state-active (leaf 30%)</li>
                  <li>bg-state-disabled (shale 30%)</li>
                </ul>
              </div>
              <div>
                <h3 className="text-lg font-medium text-gold-light mb-3">
                  Hover Transitions
                </h3>
                <ul className="space-y-1 text-gold-light/80 font-mono">
                  <li>transition-colors duration-300</li>
                  <li>transition-transform duration-300</li>
                  <li>transition-shadow duration-300</li>
                  <li>transition-all duration-300</li>
                </ul>
              </div>
            </div>
          </div>
        </section>

        <footer className="text-center py-8 text-shale-light text-sm">
          <p>David&apos;s Digital Garden Design System v1.0</p>
        </footer>
      </div>
    </div>
  );
}
