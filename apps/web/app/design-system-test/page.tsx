"use client";

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

export default function DesignSystemTestPage() {
  return (
    <div className="min-h-screen bg-surface-default p-8 space-y-8">
      <div className="max-w-4xl mx-auto space-y-12">
        <header>
          <h1 className="text-4xl font-bold mb-2">Design System Test Page</h1>
          <p className="text-intent-neutral">
            Testing all component variants and ensuring proper styling
          </p>
        </header>

        {/* Button Variants */}
        <section className="space-y-4">
          <h2 className="text-2xl font-semibold">Button Component</h2>
          
          <div className="space-y-4">
            <div>
              <h3 className="text-lg font-medium mb-2">Intents</h3>
              <div className="flex flex-wrap gap-2">
                <Button intent="primary">Primary</Button>
                <Button intent="secondary">Secondary</Button>
                <Button intent="accent">Accent</Button>
                <Button intent="danger">Danger</Button>
                <Button intent="ghost">Ghost</Button>
              </div>
            </div>

            <div>
              <h3 className="text-lg font-medium mb-2">Sizes</h3>
              <div className="flex flex-wrap items-center gap-2">
                <Button size="small">Small</Button>
                <Button size="medium">Medium</Button>
                <Button size="large">Large</Button>
              </div>
            </div>

            <div>
              <h3 className="text-lg font-medium mb-2">States</h3>
              <div className="flex flex-wrap gap-2">
                <Button state="default">Default</Button>
                <Button state="disabled">Disabled</Button>
                <Button state="loading">Loading</Button>
              </div>
            </div>
          </div>
        </section>

        {/* Card Variants */}
        <section className="space-y-4">
          <h2 className="text-2xl font-semibold">Card Component</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card intent="default" size="standard">
              <CardHeader>
                <CardTitle>Default Card</CardTitle>
                <CardDescription>Standard card with default styling</CardDescription>
              </CardHeader>
              <CardContent>
                <p>This is a default card with standard spacing.</p>
              </CardContent>
              <CardFooter>
                <Button size="small">Action</Button>
              </CardFooter>
            </Card>

            <Card intent="highlight" size="standard">
              <CardHeader>
                <CardTitle>Highlight Card</CardTitle>
                <CardDescription>Card with highlight intent</CardDescription>
              </CardHeader>
              <CardContent>
                <p>This card uses the highlight intent variant.</p>
              </CardContent>
              <CardFooter>
                <Button intent="primary" size="small">Action</Button>
              </CardFooter>
            </Card>

            <Card intent="warning" size="compact">
              <CardHeader size="compact">
                <CardTitle>Warning Card</CardTitle>
                <CardDescription>Compact warning card</CardDescription>
              </CardHeader>
              <CardContent>
                <p>This is a compact card with warning intent.</p>
              </CardContent>
            </Card>

            <Card intent="error" size="jumbo">
              <CardHeader size="jumbo">
                <CardTitle>Error Card</CardTitle>
                <CardDescription>Jumbo error card</CardDescription>
              </CardHeader>
              <CardContent>
                <p>This is a jumbo card with error intent.</p>
              </CardContent>
              <CardFooter size="jumbo">
                <Button intent="danger" size="small">Delete</Button>
              </CardFooter>
            </Card>
          </div>
        </section>

        {/* Prose Component */}
        <section className="space-y-4">
          <h2 className="text-2xl font-semibold">Prose Component</h2>
          
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-medium mb-2">Default Prose</h3>
              <Prose intent="default">
                <h2>Article Title</h2>
                <p>
                  This is default prose styling. It provides proper typography
                  for long-form content with appropriate spacing and readability.
                </p>
                <p>
                  Multiple paragraphs are properly spaced, and headings have
                  appropriate hierarchy.
                </p>
                <ul>
                  <li>List item one</li>
                  <li>List item two</li>
                  <li>List item three</li>
                </ul>
              </Prose>
            </div>

            <div>
              <h3 className="text-lg font-medium mb-2">Blog Prose</h3>
              <Prose intent="blog">
                <h2>Blog Post Title</h2>
                <p>
                  Blog prose uses larger text for better readability in blog
                  posts and articles. The spacing is optimized for longer
                  reading sessions.
                </p>
              </Prose>
            </div>

            <div>
              <h3 className="text-lg font-medium mb-2">Compact Prose</h3>
              <Prose intent="compact">
                <h2>Documentation Title</h2>
                <p>
                  Compact prose is ideal for documentation and technical content
                  where space is at a premium.
                </p>
              </Prose>
            </div>
          </div>
        </section>

        {/* Neon Glow Effects */}
        <section className="space-y-4">
          <h2 className="text-2xl font-semibold">Neon Glow Effects</h2>
          
          <div className="space-y-4">
            <div className="neon-glow-sm text-intent-primary text-lg">
              Small neon glow with primary color
            </div>
            <div className="neon-glow-md text-intent-secondary text-lg">
              Medium neon glow with secondary color
            </div>
            <div className="neon-glow-lg text-intent-accent text-lg">
              Large neon glow with accent color
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
