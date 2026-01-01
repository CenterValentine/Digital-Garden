/**
 * Third-Party Components Showcase
 *
 * This page demonstrates all integrated third-party components
 * organized by library and category. Use this as a reference
 * when building new features.
 */

"use client";

import {
  // Backgrounds & Effects
  BackgroundRipple,
  DottedGlowBackground,
  BackgroundGradient,
  GradientAnimations,
  WavyBackground,
  BackgroundBoxes,
  AuroraBackground,
  NoiseBackground,
  // Cards
  Card3D,
  EvervaultCard,
  WobbleCard,
  ExpandableCard,
  DraggableCard,
  CardsSections,
  // Buttons
  StatefulButtons,
  MovingBorder,
  TailwindCSSButtons,
  // Navigation
  Sidebar,
  FloatingDock,
  AnimatedTabs,
  StickyBanner,
  // Forms
  PlaceholdersAndVanishInput,
  SignupForm,
  // Modals
  AnimatedModal,
  // Data Display
  Timeline,
  BentoGrid,
  Testimonials,
  // Interactive
  StickyScrollReveal,
  MacbookScroll,
  HeroParallax,
  // Layout
  AnimatedHeader,
  HeroSections,
  FeatureSections,
} from "@/components/third-party/aceternity";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { ExternalLink } from "lucide-react";

// Component metadata types
interface ComponentInfo {
  name: string;
  description: string;
  sourceUrl: string;
  implemented: boolean;
  category?: string;
}

// Helper component for preview cards (implemented components)
function ComponentPreviewCard({
  name,
  description,
  sourceUrl,
  children,
  category,
}: {
  name: string;
  description: string;
  sourceUrl: string;
  children: React.ReactNode;
  category?: string;
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <CardTitle className="text-base">{name}</CardTitle>
            <CardDescription className="mt-1">{description}</CardDescription>
          </div>
          <Badge variant="default" className="ml-2">
            Implemented
          </Badge>
        </div>
        {category && (
          <Badge variant="outline" className="mt-2 w-fit">
            {category}
          </Badge>
        )}
      </CardHeader>
      <CardContent>
        <div className="mb-4">{children}</div>
        <a
          href={sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-primary hover:underline inline-flex items-center gap-1"
        >
          View Original <ExternalLink className="h-3 w-3" />
        </a>
      </CardContent>
    </Card>
  );
}

// Helper component for documentation cards (unimplemented components)
function ComponentDocCard({
  name,
  description,
  sourceUrl,
  category,
}: ComponentInfo) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <CardTitle className="text-base">{name}</CardTitle>
            <CardDescription className="mt-1">{description}</CardDescription>
          </div>
          <Badge variant="secondary" className="ml-2">
            Not Implemented
          </Badge>
        </div>
        {category && (
          <Badge variant="outline" className="mt-2 w-fit">
            {category}
          </Badge>
        )}
      </CardHeader>
      <CardContent>
        <a
          href={sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-primary hover:underline inline-flex items-center gap-1"
        >
          View Original <ExternalLink className="h-3 w-3" />
        </a>
      </CardContent>
    </Card>
  );
}

// Library section component
function LibrarySection({
  id,
  name,
  description,
  sourceUrl,
  children,
}: {
  id: string;
  name: string;
  description: string;
  sourceUrl: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-20">
      <div className="mb-6">
        <h2 className="text-3xl font-semibold mb-2">{name}</h2>
        <p className="text-muted-foreground">
          {description}{" "}
          <a
            href={sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline inline-flex items-center gap-1"
          >
            Source <ExternalLink className="h-3 w-3" />
          </a>
        </p>
      </div>
      {children}
    </section>
  );
}

export default function ThirdPartyShowcasePage() {
  return (
    <div className="container mx-auto py-12 space-y-16">
      {/* Header */}
      <div>
        <h1 className="text-4xl font-bold mb-4">
          Third-Party Component Libraries
        </h1>
        <p className="text-muted-foreground text-lg">
          Comprehensive reference of all integrated third-party components
          adapted for the Digital Garden design system. Use this page to
          discover and understand available components for building features.
        </p>
      </div>

      {/* Table of Contents */}
      <Card>
        <CardHeader>
          <CardTitle>Quick Navigation</CardTitle>
          <CardDescription>Jump to a specific library</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
            <a href="#aceternity" className="text-sm hover:underline">
              Aceternity UI
            </a>
            <a href="#animate-ui" className="text-sm hover:underline">
              Animate UI
            </a>
            <a href="#cult-ui" className="text-sm hover:underline">
              Cult UI
            </a>
            <a href="#glass-ui" className="text-sm hover:underline">
              Glass UI
            </a>
            <a href="#dice-ui" className="text-sm hover:underline">
              Dice UI
            </a>
            <a href="#ali-imam" className="text-sm hover:underline">
              Ali Imam
            </a>
            <a href="#8labs" className="text-sm hover:underline">
              8Labs
            </a>
            <a href="#abui" className="text-sm hover:underline">
              ABUI
            </a>
            <a href="#ein-dev" className="text-sm hover:underline">
              Ein Dev
            </a>
            <a href="#blocks-so" className="text-sm hover:underline">
              Blocks.so
            </a>
            <a href="#formcn" className="text-sm hover:underline">
              FormCN
            </a>
            <a href="#ai-sdk" className="text-sm hover:underline">
              AI SDK
            </a>
            <a href="#billing-sdk" className="text-sm hover:underline">
              Billing SDK
            </a>
            <a href="#coss-ui" className="text-sm hover:underline">
              Coss UI
            </a>
            <a href="#creative-tim" className="text-sm hover:underline">
              Creative Tim
            </a>
            <a href="#hexta-ui" className="text-sm hover:underline">
              Hexta UI
            </a>
          </div>
        </CardContent>
      </Card>

      {/* Aceternity UI Section */}
      <LibrarySection
        id="aceternity"
        name="Aceternity UI"
        description="Animated components, backgrounds, and effects."
        sourceUrl="https://ui.aceternity.com/"
      >
        <Tabs defaultValue="backgrounds" className="w-full">
          <TabsList className="grid w-full grid-cols-5 lg:grid-cols-9">
            <TabsTrigger value="backgrounds">Backgrounds</TabsTrigger>
            <TabsTrigger value="cards">Cards</TabsTrigger>
            <TabsTrigger value="buttons">Buttons</TabsTrigger>
            <TabsTrigger value="navigation">Navigation</TabsTrigger>
            <TabsTrigger value="forms">Forms</TabsTrigger>
            <TabsTrigger value="modals">Modals</TabsTrigger>
            <TabsTrigger value="display">Display</TabsTrigger>
            <TabsTrigger value="interactive">Interactive</TabsTrigger>
            <TabsTrigger value="layout">Layout</TabsTrigger>
          </TabsList>

          {/* Backgrounds & Effects */}
          <TabsContent value="backgrounds" className="space-y-8">
          <div>
              <h3 className="text-xl font-medium mb-4">
                Backgrounds & Effects
              </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <ComponentPreviewCard
                  name="BackgroundRipple"
                  description="Ripple effect background"
                  sourceUrl="https://www.aceternity.com/components/background-ripple-effect"
                  category="Background"
                >
              <BackgroundRipple color="shale" className="h-32 rounded-lg">
                    <div className="p-4 text-white">Background Ripple</div>
              </BackgroundRipple>
                </ComponentPreviewCard>

                <ComponentPreviewCard
                  name="DottedGlowBackground"
                  description="Dotted glow pattern"
                  sourceUrl="https://www.aceternity.com/components/dotted-glow-background"
                  category="Background"
                >
                  <DottedGlowBackground
                    color="gold"
                    className="h-32 rounded-lg"
                  >
                    <div className="p-4">Dotted Glow</div>
                  </DottedGlowBackground>
                </ComponentPreviewCard>

                <ComponentPreviewCard
                  name="BackgroundGradient"
                  description="Animated gradient background"
                  sourceUrl="https://ui.aceternity.com/components/background-gradient"
                  category="Background"
                >
                  <BackgroundGradient color="leaf" className="h-32 rounded-lg">
                    <div className="p-4 text-white">Gradient Background</div>
                  </BackgroundGradient>
                </ComponentPreviewCard>

                <ComponentPreviewCard
                  name="GradientAnimations"
                  description="Animated gradient effects"
                  sourceUrl="https://ui.aceternity.com/components/gradient-animations"
                  category="Background"
                >
                  <GradientAnimations color="shale" className="h-32 rounded-lg">
                    <div className="p-4 text-white">Gradient Animations</div>
                  </GradientAnimations>
                </ComponentPreviewCard>

                <ComponentPreviewCard
                  name="WavyBackground"
                  description="Wavy animated background"
                  sourceUrl="https://ui.aceternity.com/components/wavy-background"
                  category="Background"
                >
                  <WavyBackground className="h-32 rounded-lg">
                    <div className="p-4 text-white">Wavy Background</div>
                  </WavyBackground>
                </ComponentPreviewCard>

                <ComponentPreviewCard
                  name="BackgroundBoxes"
                  description="Animated background boxes"
                  sourceUrl="https://ui.aceternity.com/components/background-boxes"
                  category="Background"
                >
                  <BackgroundBoxes className="h-32 rounded-lg">
                    <div className="p-4 text-white">Background Boxes</div>
                  </BackgroundBoxes>
                </ComponentPreviewCard>

                <ComponentPreviewCard
                  name="AuroraBackground"
                  description="Aurora effect background"
                  sourceUrl="https://ui.aceternity.com/components/aurora-background"
                  category="Background"
                >
                  <AuroraBackground className="h-32 rounded-lg">
                    <div className="p-4 text-white">Aurora Background</div>
                  </AuroraBackground>
                </ComponentPreviewCard>

                <ComponentPreviewCard
                  name="NoiseBackground"
                  description="Noise texture background"
                  sourceUrl="https://ui.aceternity.com/components/noise-background"
                  category="Background"
                >
                  <NoiseBackground className="h-32 rounded-lg">
                    <div className="p-4 text-white">Noise Background</div>
                  </NoiseBackground>
                </ComponentPreviewCard>
            </div>
          </div>
          </TabsContent>

          {/* Cards */}
          <TabsContent value="cards" className="space-y-8">
          <div>
            <h3 className="text-xl font-medium mb-4">Cards</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <ComponentPreviewCard
                  name="Card3D"
                  description="3D card effect with tilt"
                  sourceUrl="https://ui.aceternity.com/components/3d-card-effect"
                  category="Card"
                >
              <Card3D color="gold" className="p-6">
                <h4 className="text-lg font-semibold">3D Card</h4>
                <p>Example 3D card effect</p>
              </Card3D>
                </ComponentPreviewCard>

                <ComponentPreviewCard
                  name="EvervaultCard"
                  description="Card with animated gradient border"
                  sourceUrl="https://ui.aceternity.com/components/evervault-card"
                  category="Card"
                >
                  <EvervaultCard className="h-32 rounded-lg">
                    <div className="p-4">Evervault Card</div>
                  </EvervaultCard>
                </ComponentPreviewCard>

                <ComponentPreviewCard
                  name="WobbleCard"
                  description="Card with wobble animation on hover"
                  sourceUrl="https://ui.aceternity.com/components/wobble-card"
                  category="Card"
                >
                  <WobbleCard className="h-32 rounded-lg">
                    <div className="p-4">Wobble Card</div>
                  </WobbleCard>
                </ComponentPreviewCard>

                <ComponentPreviewCard
                  name="ExpandableCard"
                  description="Card that expands on interaction"
                  sourceUrl="https://ui.aceternity.com/components/expandable-card"
                  category="Card"
                >
                  <ExpandableCard className="h-32 rounded-lg">
                    <div className="p-4">Expandable Card</div>
                  </ExpandableCard>
                </ComponentPreviewCard>

                <ComponentPreviewCard
                  name="DraggableCard"
                  description="Draggable card component"
                  sourceUrl="https://ui.aceternity.com/components/draggable-card"
                  category="Card"
                >
                  <DraggableCard className="h-32 rounded-lg">
                    <div className="p-4">Draggable Card</div>
                  </DraggableCard>
                </ComponentPreviewCard>

                <ComponentPreviewCard
                  name="CardsSections"
                  description="Card sections layout"
                  sourceUrl="https://ui.aceternity.com/components/cards"
                  category="Card"
                >
                  <CardsSections className="h-32 rounded-lg">
                    <div className="p-4">Cards Sections</div>
                  </CardsSections>
                </ComponentPreviewCard>
            </div>
          </div>
          </TabsContent>

          {/* Buttons */}
          <TabsContent value="buttons" className="space-y-8">
          <div>
            <h3 className="text-xl font-medium mb-4">Buttons</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <ComponentPreviewCard
                  name="StatefulButtons"
                  description="Buttons with state animations"
                  sourceUrl="https://ui.aceternity.com/components/stateful-buttons"
                  category="Button"
                >
            <div className="flex gap-4">
              <StatefulButtons color="leaf" intent="primary">
                Stateful Button
              </StatefulButtons>
            </div>
                </ComponentPreviewCard>

                <ComponentPreviewCard
                  name="MovingBorder"
                  description="Button with animated border"
                  sourceUrl="https://ui.aceternity.com/components/moving-border"
                  category="Button"
                >
                  <MovingBorder className="h-32 rounded-lg flex items-center justify-center">
                    <div className="p-4">Moving Border</div>
                  </MovingBorder>
                </ComponentPreviewCard>

                <ComponentPreviewCard
                  name="TailwindCSSButtons"
                  description="Collection of Tailwind CSS button styles"
                  sourceUrl="https://ui.aceternity.com/components/tailwindcss-buttons"
                  category="Button"
                >
                  <TailwindCSSButtons className="h-32 rounded-lg flex items-center justify-center">
                    <div className="p-4">Tailwind Buttons</div>
                  </TailwindCSSButtons>
                </ComponentPreviewCard>
          </div>
            </div>
          </TabsContent>

          {/* Navigation */}
          <TabsContent value="navigation" className="space-y-8">
          <div>
            <h3 className="text-xl font-medium mb-4">Navigation</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <ComponentPreviewCard
                  name="Sidebar"
                  description="Animated sidebar component"
                  sourceUrl="https://ui.aceternity.com/components/sidebar"
                  category="Navigation"
                >
                  <Sidebar className="h-32 rounded-lg">
                    <div className="p-4">Sidebar</div>
                  </Sidebar>
                </ComponentPreviewCard>

                <ComponentPreviewCard
                  name="FloatingDock"
                  description="Floating dock navigation"
                  sourceUrl="https://ui.aceternity.com/components/floating-dock"
                  category="Navigation"
                >
                  <FloatingDock className="h-32 rounded-lg">
                    <div className="p-4">Floating Dock</div>
                  </FloatingDock>
                </ComponentPreviewCard>

                <ComponentPreviewCard
                  name="AnimatedTabs"
                  description="Animated tabs component"
                  sourceUrl="https://ui.aceternity.com/components/tabs"
                  category="Navigation"
                >
            <AnimatedTabs
              color="shale"
              tabs={["Tab 1", "Tab 2", "Tab 3"]}
              activeTab="Tab 1"
            />
                </ComponentPreviewCard>

                <ComponentPreviewCard
                  name="StickyBanner"
                  description="Sticky banner component"
                  sourceUrl="https://ui.aceternity.com/components/sticky-banner"
                  category="Navigation"
                >
                  <StickyBanner className="h-32 rounded-lg">
                    <div className="p-4">Sticky Banner</div>
                  </StickyBanner>
                </ComponentPreviewCard>
          </div>
        </div>
          </TabsContent>

          {/* Forms */}
          <TabsContent value="forms" className="space-y-8">
            <div>
              <h3 className="text-xl font-medium mb-4">Forms</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <ComponentPreviewCard
                  name="PlaceholdersAndVanishInput"
                  description="Input with placeholder animations"
                  sourceUrl="https://ui.aceternity.com/components/placeholders-and-vanish-input"
                  category="Form"
                >
                  <div className="h-32 rounded-lg flex items-center justify-center">
                    <PlaceholdersAndVanishInput className="w-full max-w-xs" />
          </div>
                </ComponentPreviewCard>

                <ComponentPreviewCard
                  name="SignupForm"
                  description="Animated signup form"
                  sourceUrl="https://ui.aceternity.com/components/signup-form"
                  category="Form"
                >
                  <div className="h-32 rounded-lg flex items-center justify-center">
                    <SignupForm className="w-full max-w-xs" />
          </div>
                </ComponentPreviewCard>
          </div>
          </div>
          </TabsContent>

          {/* Modals */}
          <TabsContent value="modals" className="space-y-8">
            <div>
              <h3 className="text-xl font-medium mb-4">Modals</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <ComponentPreviewCard
                  name="AnimatedModal"
                  description="Animated modal component"
                  sourceUrl="https://ui.aceternity.com/components/animated-modal"
                  category="Modal"
                >
                  <AnimatedModal className="h-32 rounded-lg">
                    <div className="p-4">Animated Modal</div>
                  </AnimatedModal>
                </ComponentPreviewCard>
          </div>
        </div>
          </TabsContent>

          {/* Data Display */}
          <TabsContent value="display" className="space-y-8">
            <div>
              <h3 className="text-xl font-medium mb-4">Data Display</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <ComponentPreviewCard
                  name="Timeline"
                  description="Animated timeline component"
                  sourceUrl="https://ui.aceternity.com/components/timeline"
                  category="Data Display"
                >
                  <div className="h-32 rounded-lg flex items-center justify-center">
                    <Timeline className="w-full" />
                  </div>
                </ComponentPreviewCard>

                <ComponentPreviewCard
                  name="BentoGrid"
                  description="Bento grid layout"
                  sourceUrl="https://ui.aceternity.com/components/bento-grid"
                  category="Data Display"
                >
                  <BentoGrid className="h-32 rounded-lg">
                    <div className="p-4">Bento Grid</div>
                  </BentoGrid>
                </ComponentPreviewCard>

                <ComponentPreviewCard
                  name="Testimonials"
                  description="Testimonials display component"
                  sourceUrl="https://ui.aceternity.com/components/testimonials"
                  category="Data Display"
                >
                  <div className="h-32 rounded-lg flex items-center justify-center">
                    <Testimonials className="w-full" />
                  </div>
                </ComponentPreviewCard>
              </div>
            </div>
          </TabsContent>

          {/* Interactive */}
          <TabsContent value="interactive" className="space-y-8">
            <div>
              <h3 className="text-xl font-medium mb-4">Interactive</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <ComponentPreviewCard
                  name="StickyScrollReveal"
                  description="Sticky scroll reveal effect"
                  sourceUrl="https://ui.aceternity.com/components/sticky-scroll-reveal"
                  category="Interactive"
                >
                  <StickyScrollReveal className="h-32 rounded-lg">
                    <div className="p-4">Sticky Scroll Reveal</div>
                  </StickyScrollReveal>
                </ComponentPreviewCard>

                <ComponentPreviewCard
                  name="MacbookScroll"
                  description="MacBook scroll effect"
                  sourceUrl="https://ui.aceternity.com/components/macbook-scroll"
                  category="Interactive"
                >
                  <MacbookScroll className="h-32 rounded-lg">
                    <div className="p-4">Macbook Scroll</div>
                  </MacbookScroll>
                </ComponentPreviewCard>

                <ComponentPreviewCard
                  name="HeroParallax"
                  description="Hero parallax effect"
                  sourceUrl="https://ui.aceternity.com/components/hero-parallax"
                  category="Interactive"
                >
                  <HeroParallax className="h-32 rounded-lg">
                    <div className="p-4">Hero Parallax</div>
                  </HeroParallax>
                </ComponentPreviewCard>
              </div>
            </div>
          </TabsContent>

          {/* Layout */}
          <TabsContent value="layout" className="space-y-8">
            <div>
              <h3 className="text-xl font-medium mb-4">Layout</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <ComponentPreviewCard
                  name="AnimatedHeader"
                  description="Animated header component"
                  sourceUrl="https://ui.aceternity.com/components/animated-header"
                  category="Layout"
                >
                  <AnimatedHeader className="h-32 rounded-lg">
                    <div className="p-4">Animated Header</div>
                  </AnimatedHeader>
                </ComponentPreviewCard>

                <ComponentPreviewCard
                  name="HeroSections"
                  description="Hero section layouts"
                  sourceUrl="https://ui.aceternity.com/components/hero-sections"
                  category="Layout"
                >
                  <HeroSections className="h-32 rounded-lg">
                    <div className="p-4">Hero Sections</div>
                  </HeroSections>
                </ComponentPreviewCard>

                <ComponentPreviewCard
                  name="FeatureSections"
                  description="Feature section layouts"
                  sourceUrl="https://ui.aceternity.com/components/feature-sections"
                  category="Layout"
                >
                  <FeatureSections className="h-32 rounded-lg">
                    <div className="p-4">Feature Sections</div>
                  </FeatureSections>
                </ComponentPreviewCard>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </LibrarySection>

      {/* Animate UI Section */}
      <LibrarySection
        id="animate-ui"
        name="Animate UI"
        description="Radix-based animated components."
        sourceUrl="https://animate-ui.com/"
      >
        <Tabs defaultValue="backgrounds" className="w-full">
          <TabsList className="grid w-full grid-cols-7">
            <TabsTrigger value="backgrounds">Backgrounds</TabsTrigger>
            <TabsTrigger value="buttons">Buttons</TabsTrigger>
            <TabsTrigger value="navigation">Navigation</TabsTrigger>
            <TabsTrigger value="forms">Forms</TabsTrigger>
            <TabsTrigger value="modals">Modals</TabsTrigger>
            <TabsTrigger value="display">Display</TabsTrigger>
            <TabsTrigger value="interactive">Interactive</TabsTrigger>
          </TabsList>

          <TabsContent value="backgrounds">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <ComponentDocCard
                name="GravityStars"
                description="Gravity stars background effect"
                sourceUrl="https://animate-ui.com/docs/components/backgrounds/gravity-stars"
                implemented={false}
                category="Background"
              />
              <ComponentDocCard
                name="HoleBackground"
                description="Hole background effect"
                sourceUrl="https://animate-ui.com/docs/components/backgrounds/hole"
                implemented={false}
                category="Background"
              />
              <ComponentDocCard
                name="FireworksBackground"
                description="Fireworks background animation"
                sourceUrl="https://animate-ui.com/docs/components/backgrounds/fireworks"
                implemented={false}
                category="Background"
              />
            </div>

            <div> </div>
          </TabsContent>

          <TabsContent value="buttons">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <ComponentDocCard
                name="FlipButton"
                description="Button with flip animation"
                sourceUrl="https://animate-ui.com/docs/components/buttons/flip"
                implemented={false}
                category="Button"
              />
              <ComponentDocCard
                name="LiquidButton"
                description="Liquid animation button"
                sourceUrl="https://animate-ui.com/docs/components/buttons/liquid"
                implemented={false}
                category="Button"
              />
              <ComponentDocCard
                name="RippleButton"
                description="Button with ripple effect"
                sourceUrl="https://animate-ui.com/docs/components/buttons/ripple"
                implemented={false}
                category="Button"
              />
              <ComponentDocCard
                name="CopyButton"
                description="Copy button with animation"
                sourceUrl="https://animate-ui.com/docs/components/buttons/copy"
                implemented={false}
                category="Button"
              />
              <ComponentDocCard
                name="IconButton"
                description="Animated icon button"
                sourceUrl="https://animate-ui.com/docs/components/buttons/icon"
                implemented={false}
                category="Button"
              />
            </div>
          </TabsContent>

          <TabsContent value="navigation">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <ComponentDocCard
                name="Sidebar"
                description="Animated sidebar component"
                sourceUrl="https://animate-ui.com/docs/components/radix/sidebar"
                implemented={false}
                category="Navigation"
              />
              <ComponentDocCard
                name="Sheet"
                description="Animated sheet component"
                sourceUrl="https://animate-ui.com/docs/components/radix/sheet"
                implemented={false}
                category="Navigation"
              />
              <ComponentDocCard
                name="Tabs"
                description="Animated tabs component"
                sourceUrl="https://animate-ui.com/docs/components/radix/tabs"
                implemented={false}
                category="Navigation"
              />
              <ComponentDocCard
                name="Progress"
                description="Animated progress indicator"
                sourceUrl="https://animate-ui.com/docs/components/radix/progress"
                implemented={false}
                category="Navigation"
              />
            </div>
          </TabsContent>

          <TabsContent value="forms">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <ComponentDocCard
                name="Checkbox"
                description="Animated checkbox component"
                sourceUrl="https://animate-ui.com/docs/components/radix/checkbox"
                implemented={false}
                category="Form"
              />
              <ComponentDocCard
                name="RadioGroup"
                description="Animated radio group"
                sourceUrl="https://animate-ui.com/docs/components/radix/radio-group"
                implemented={false}
                category="Form"
              />
              <ComponentDocCard
                name="Switch"
                description="Animated switch component"
                sourceUrl="https://animate-ui.com/docs/components/radix/switch"
                implemented={false}
                category="Form"
              />
              <ComponentDocCard
                name="Toggle"
                description="Animated toggle component"
                sourceUrl="https://animate-ui.com/docs/components/radix/toggle"
                implemented={false}
                category="Form"
              />
              <ComponentDocCard
                name="ToggleGroup"
                description="Animated toggle group"
                sourceUrl="https://animate-ui.com/docs/components/radix/toggle-group"
                implemented={false}
                category="Form"
              />
            </div>
          </TabsContent>

          <TabsContent value="modals">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <ComponentDocCard
                name="AlertDialog"
                description="Animated alert dialog"
                sourceUrl="https://animate-ui.com/docs/components/radix/alert-dialog"
                implemented={false}
                category="Modal"
              />
              <ComponentDocCard
                name="Dialog"
                description="Animated dialog component"
                sourceUrl="https://animate-ui.com/docs/components/radix/dialog"
                implemented={false}
                category="Modal"
              />
              <ComponentDocCard
                name="Popover"
                description="Animated popover component"
                sourceUrl="https://animate-ui.com/docs/components/radix/popover"
                implemented={false}
                category="Modal"
              />
            </div>
          </TabsContent>

          <TabsContent value="display">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <ComponentDocCard
                name="Table"
                description="Animated table component"
                sourceUrl="https://animate-ui.com/docs/components/radix/table"
                implemented={false}
                category="Data Display"
              />
              <ComponentDocCard
                name="Files"
                description="File display component"
                sourceUrl="https://animate-ui.com/docs/components/radix/files"
                implemented={false}
                category="Data Display"
              />
            </div>
          </TabsContent>

          <TabsContent value="interactive">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <ComponentDocCard
                name="PreviewLinkCard"
                description="Preview link card component"
                sourceUrl="https://animate-ui.com/docs/components/radix/preview-link-card"
                implemented={false}
                category="Interactive"
              />
              <ComponentDocCard
                name="HoverCard"
                description="Hover card component"
                sourceUrl="https://animate-ui.com/docs/components/radix/hover-card"
                implemented={false}
                category="Interactive"
              />
            </div>
          </TabsContent>
        </Tabs>
      </LibrarySection>

      {/* Cult UI Section */}
      <LibrarySection
        id="cult-ui"
        name="Cult UI"
        description="Unique aesthetic components."
        sourceUrl="https://www.cult-ui.com/"
      >
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <ComponentDocCard
            name="MinimalCard"
            description="Minimal card component"
            sourceUrl="https://www.cult-ui.com/docs/components/minimal-card"
            implemented={false}
            category="Card"
          />
          <ComponentDocCard
            name="TextureCard"
            description="Card with texture effect"
            sourceUrl="https://www.cult-ui.com/docs/components/texture-card"
            implemented={false}
            category="Card"
          />
          <ComponentDocCard
            name="ShiftCard"
            description="Card with shift animation"
            sourceUrl="https://www.cult-ui.com/docs/components/shift-card"
            implemented={false}
            category="Card"
          />
          <ComponentDocCard
            name="Expandable"
            description="Expandable component"
            sourceUrl="https://www.cult-ui.com/docs/components/expandable"
            implemented={false}
            category="Interactive"
          />
          <ComponentDocCard
            name="ExpandableScreen"
            description="Expandable screen component"
            sourceUrl="https://www.cult-ui.com/docs/components/expandable-screen"
            implemented={false}
            category="Interactive"
          />
          <ComponentDocCard
            name="NeumorphButton"
            description="Neumorphic button style"
            sourceUrl="https://www.cult-ui.com/docs/components/neumorph-button"
            implemented={false}
            category="Button"
          />
          <ComponentDocCard
            name="BGAnimatedButton"
            description="Background animated button"
            sourceUrl="https://www.cult-ui.com/docs/components/bg-animate-button"
            implemented={false}
            category="Button"
          />
          <ComponentDocCard
            name="Dock"
            description="Dock navigation component"
            sourceUrl="https://www.cult-ui.com/docs/components/dock"
            implemented={false}
            category="Navigation"
          />
          <ComponentDocCard
            name="DirectionAwareTabs"
            description="Direction-aware tabs"
            sourceUrl="https://www.cult-ui.com/docs/components/direction-aware-tabs"
            implemented={false}
            category="Navigation"
          />
          <ComponentDocCard
            name="PopoverForm"
            description="Popover form component"
            sourceUrl="https://www.cult-ui.com/docs/components/popover-form"
            implemented={false}
            category="Form"
          />
        </div>
      </LibrarySection>

      {/* Glass UI Section */}
      <LibrarySection
        id="glass-ui"
        name="Glass UI"
        description="Glass morphism effects."
        sourceUrl="https://glass-ui.crenspire.com/"
      >
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <ComponentDocCard
            name="Card"
            description="Glass morphism card"
            sourceUrl="https://glass-ui.crenspire.com/docs/components/card"
            implemented={false}
            category="Card"
          />
          <ComponentDocCard
            name="Button"
            description="Glass morphism button"
            sourceUrl="https://glass-ui.crenspire.com/docs/components/button"
            implemented={false}
            category="Button"
          />
          <ComponentDocCard
            name="ButtonGroup"
            description="Glass button group"
            sourceUrl="https://glass-ui.crenspire.com/docs/components/button-group"
            implemented={false}
            category="Button"
          />
          <ComponentDocCard
            name="MenuBar"
            description="Glass menu bar"
            sourceUrl="https://glass-ui.crenspire.com/docs/components/menu-bar"
            implemented={false}
            category="Navigation"
          />
          <ComponentDocCard
            name="DropdownMenu"
            description="Glass dropdown menu"
            sourceUrl="https://glass-ui.crenspire.com/docs/components/dropdown-menu"
            implemented={false}
            category="Navigation"
          />
          <ComponentDocCard
            name="Breadcrumb"
            description="Glass breadcrumb"
            sourceUrl="https://glass-ui.crenspire.com/docs/components/breadcrumb"
            implemented={false}
            category="Navigation"
          />
          <ComponentDocCard
            name="Sheet"
            description="Glass sheet component"
            sourceUrl="https://glass-ui.crenspire.com/docs/components/sheet"
            implemented={false}
            category="Navigation"
          />
          <ComponentDocCard
            name="Switch"
            description="Glass switch component"
            sourceUrl="https://glass-ui.crenspire.com/docs/components/switch"
            implemented={false}
            category="Form"
          />
          <ComponentDocCard
            name="Table"
            description="Glass table component"
            sourceUrl="https://glass-ui.crenspire.com/docs/components/table"
            implemented={false}
            category="Data Display"
          />
          <ComponentDocCard
            name="Chart"
            description="Glass chart component"
            sourceUrl="https://glass-ui.crenspire.com/docs/components/chart"
            implemented={false}
            category="Data Display"
          />
          <ComponentDocCard
            name="Calendar"
            description="Glass calendar component"
            sourceUrl="https://glass-ui.crenspire.com/docs/components/calendar"
            implemented={false}
            category="Data Display"
          />
          <ComponentDocCard
            name="Carousel"
            description="Glass carousel component"
            sourceUrl="https://glass-ui.crenspire.com/docs/components/carousel"
            implemented={false}
            category="Data Display"
          />
          <ComponentDocCard
            name="Accordion"
            description="Glass accordion component"
            sourceUrl="https://glass-ui.crenspire.com/docs/components/accordion"
            implemented={false}
            category="Data Display"
          />
          <ComponentDocCard
            name="ScrollArea"
            description="Glass scroll area"
            sourceUrl="https://glass-ui.crenspire.com/docs/components/scroll-area"
            implemented={false}
            category="Data Display"
          />
          <ComponentDocCard
            name="Spinner"
            description="Glass spinner component"
            sourceUrl="https://glass-ui.crenspire.com/docs/components/spinner"
            implemented={false}
            category="Data Display"
          />
        </div>
      </LibrarySection>

      {/* Dice UI Section */}
      <LibrarySection
        id="dice-ui"
        name="Dice UI"
        description="Form and input components."
        sourceUrl="https://www.diceui.com/"
      >
        <Tabs defaultValue="forms" className="w-full">
          <TabsList>
            <TabsTrigger value="forms">Forms</TabsTrigger>
            <TabsTrigger value="display">Data Display</TabsTrigger>
          </TabsList>

          <TabsContent value="forms">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <ComponentDocCard
                name="Editable"
                description="Editable input component"
                sourceUrl="https://www.diceui.com/docs/components/editable"
                implemented={false}
                category="Form"
              />
              <ComponentDocCard
                name="SegmentedInput"
                description="Segmented input component"
                sourceUrl="https://www.diceui.com/docs/components/segmented-input"
                implemented={false}
                category="Form"
              />
              <ComponentDocCard
                name="MaskInput"
                description="Masked input component"
                sourceUrl="https://www.diceui.com/docs/components/mask-input"
                implemented={false}
                category="Form"
              />
              <ComponentDocCard
                name="TagsInput"
                description="Tags input component"
                sourceUrl="https://www.diceui.com/docs/components/tags-input"
                implemented={false}
                category="Form"
              />
              <ComponentDocCard
                name="Rating"
                description="Rating input component"
                sourceUrl="https://www.diceui.com/docs/components/rating"
                implemented={false}
                category="Form"
              />
              <ComponentDocCard
                name="TimePicker"
                description="Time picker component"
                sourceUrl="https://www.diceui.com/docs/components/time-picker"
                implemented={false}
                category="Form"
              />
              <ComponentDocCard
                name="Listbox"
                description="Listbox component"
                sourceUrl="https://www.diceui.com/docs/components/listbox"
                implemented={false}
                category="Form"
              />
              <ComponentDocCard
                name="FileUpload"
                description="File upload component"
                sourceUrl="https://www.diceui.com/docs/components/file-upload"
                implemented={false}
                category="Form"
              />
            </div>
          </TabsContent>

          <TabsContent value="display">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <ComponentDocCard
                name="Stat"
                description="Stat display component"
                sourceUrl="https://www.diceui.com/docs/components/stat"
                implemented={false}
                category="Data Display"
              />
              <ComponentDocCard
                name="Gauge"
                description="Gauge component"
                sourceUrl="https://www.diceui.com/docs/components/gauge"
                implemented={false}
                category="Data Display"
              />
              <ComponentDocCard
                name="CircularProgress"
                description="Circular progress indicator"
                sourceUrl="https://www.diceui.com/docs/components/circular-progress"
                implemented={false}
                category="Data Display"
              />
            </div>
          </TabsContent>
        </Tabs>
      </LibrarySection>

      {/* Ali Imam Section */}
      <LibrarySection
        id="ali-imam"
        name="Ali Imam"
        description="Background effects and patterns."
        sourceUrl="https://aliimam.in/"
      >
        <Tabs defaultValue="backgrounds" className="w-full">
          <TabsList>
            <TabsTrigger value="backgrounds">Backgrounds</TabsTrigger>
            <TabsTrigger value="text">Text</TabsTrigger>
            <TabsTrigger value="other">Other</TabsTrigger>
          </TabsList>

          <TabsContent value="backgrounds">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <ComponentDocCard
                name="GridPattern"
                description="Grid pattern background"
                sourceUrl="https://aliimam.in/docs/backgrounds/grid-pattern"
                implemented={false}
                category="Background"
              />
              <ComponentDocCard
                name="DotPattern"
                description="Dot pattern background"
                sourceUrl="https://aliimam.in/docs/backgrounds/dot-pattern"
                implemented={false}
                category="Background"
              />
              <ComponentDocCard
                name="ShineBorder"
                description="Shine border effect"
                sourceUrl="https://aliimam.in/docs/backgrounds/shine-border"
                implemented={false}
                category="Background"
              />
              <ComponentDocCard
                name="ShaderRGB"
                description="RGB shader background"
                sourceUrl="https://aliimam.in/docs/backgrounds/shader-rgb"
                implemented={false}
                category="Background"
              />
              <ComponentDocCard
                name="ParticleCircle"
                description="Particle circle effect"
                sourceUrl="https://aliimam.in/docs/backgrounds/particle-circle"
                implemented={false}
                category="Background"
              />
              <ComponentDocCard
                name="RenderCanvas"
                description="Render canvas background"
                sourceUrl="https://aliimam.in/docs/backgrounds/render-canvas"
                implemented={false}
                category="Background"
              />
              <ComponentDocCard
                name="ScrollProgress"
                description="Scroll progress indicator"
                sourceUrl="https://aliimam.in/docs/backgrounds/scroll-progress"
                implemented={false}
                category="Background"
              />
            </div>
          </TabsContent>

          <TabsContent value="text">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <ComponentDocCard
                name="FontWeight"
                description="Font weight animation"
                sourceUrl="https://aliimam.in/docs/texts/font-weight"
                implemented={false}
                category="Text"
              />
            </div>
          </TabsContent>

          <TabsContent value="other">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <ComponentDocCard
                name="AvatarGroup"
                description="Avatar group component"
                sourceUrl="https://aliimam.in/docs/backgrounds/avatar-group"
                implemented={false}
                category="Other"
              />
            </div>
          </TabsContent>
        </Tabs>
      </LibrarySection>

      {/* 8Labs Section */}
      <LibrarySection
        id="8labs"
        name="8Labs"
        description="System components and indicators."
        sourceUrl="https://www.8labs.io/"
      >
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <ComponentDocCard
            name="SystemBanner"
            description="System banner component"
            sourceUrl="https://www.8labs.io/components/system-banner"
            implemented={false}
            category="Navigation"
          />
          <ComponentDocCard
            name="Timeline"
            description="Timeline component"
            sourceUrl="https://www.8labs.io/components/timeline"
            implemented={false}
            category="Data Display"
          />
          <ComponentDocCard
            name="StatusIndicator"
            description="Status indicator component"
            sourceUrl="https://www.8labs.io/components/status-indicator"
            implemented={false}
            category="Data Display"
          />
        </div>
      </LibrarySection>

      {/* ABUI Section */}
      <LibrarySection
        id="abui"
        name="ABUI"
        description="UI components and blocks."
        sourceUrl="https://www.abui.io/"
      >
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <ComponentDocCard
            name="RadioTabs"
            description="Radio tabs component"
            sourceUrl="https://www.abui.io/components/radio-tabs"
            implemented={false}
            category="Navigation"
          />
          <ComponentDocCard
            name="ScrollProgress"
            description="Scroll progress indicator"
            sourceUrl="https://www.abui.io/components/scroll-progress"
            implemented={false}
            category="Navigation"
          />
          <ComponentDocCard
            name="ScrollRevealContent"
            description="Scroll reveal content block"
            sourceUrl="https://www.abui.io/blocks/scroll-reveal-content-a"
            implemented={false}
            category="Interactive"
          />
          <ComponentDocCard
            name="Timeline"
            description="Timeline block"
            sourceUrl="https://www.abui.io/blocks/timeline"
            implemented={false}
            category="Data Display"
          />
        </div>
      </LibrarySection>

      {/* Ein Dev Section */}
      <LibrarySection
        id="ein-dev"
        name="Ein Dev"
        description="Widget components and effects."
        sourceUrl="https://ui.eindev.ir/"
      >
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <ComponentDocCard
            name="GlassRipple"
            description="Glass ripple effect"
            sourceUrl="https://ui.eindev.ir/docs/components/glass-ripple"
            implemented={false}
            category="Background"
          />
          <ComponentDocCard
            name="StatsWidget"
            description="Stats widget component"
            sourceUrl="https://ui.eindev.ir/docs/components/stats-widget"
            implemented={false}
            category="Data Display"
          />
          <ComponentDocCard
            name="StockWidget"
            description="Stock widget component"
            sourceUrl="https://ui.eindev.ir/docs/components/stock-widget"
            implemented={false}
            category="Data Display"
          />
          <ComponentDocCard
            name="WeatherWidget"
            description="Weather widget component"
            sourceUrl="https://ui.eindev.ir/docs/components/weather-widget"
            implemented={false}
            category="Data Display"
          />
          <ComponentDocCard
            name="GlassTimeline"
            description="Glass timeline component"
            sourceUrl="https://ui.eindev.ir/docs/components/glass-timeline"
            implemented={false}
            category="Data Display"
          />
          <ComponentDocCard
            name="CalendarWidget"
            description="Calendar widget component"
            sourceUrl="https://ui.eindev.ir/docs/components/calendar-widget"
            implemented={false}
            category="Data Display"
          />
        </div>
      </LibrarySection>

      {/* Blocks.so Section */}
      <LibrarySection
        id="blocks-so"
        name="Blocks.so"
        description="Form layouts and data components."
        sourceUrl="https://blocks.so/"
      >
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <ComponentDocCard
            name="FormLayout"
            description="Form layout component"
            sourceUrl="https://blocks.so/form-layout"
            implemented={false}
            category="Form"
          />
          <ComponentDocCard
            name="Tables"
            description="Table component"
            sourceUrl="https://blocks.so/tables"
            implemented={false}
            category="Data Display"
          />
          <ComponentDocCard
            name="Stats"
            description="Stats component"
            sourceUrl="https://blocks.so/stats"
            implemented={false}
            category="Data Display"
          />
        </div>
      </LibrarySection>

      {/* FormCN Section */}
      <LibrarySection
        id="formcn"
        name="FormCN"
        description="Form templates and components."
        sourceUrl="https://formcn.dev/"
      >
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <ComponentDocCard
            name="FormTemplates"
            description="Form templates collection"
            sourceUrl="https://formcn.dev/my-forms?id=template-customer-support"
            implemented={false}
            category="Form"
          />
        </div>
      </LibrarySection>

      {/* AI SDK Section */}
      <LibrarySection
        id="ai-sdk"
        name="AI SDK"
        description="AI and chatbot components."
        sourceUrl="https://ai-sdk.dev/"
      >
        <Tabs defaultValue="chat" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="chat">Chat Components</TabsTrigger>
            <TabsTrigger value="canvas">Canvas Components</TabsTrigger>
            <TabsTrigger value="other">Other</TabsTrigger>
          </TabsList>

          <TabsContent value="chat">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <ComponentDocCard
                name="PromptInput"
                description="Prompt input component"
                sourceUrl="https://ai-sdk.dev/elements/components/prompt-input"
                implemented={false}
                category="Form"
              />
              <ComponentDocCard
                name="ChainOfThought"
                description="Chain of thought display"
                sourceUrl="https://ai-sdk.dev/elements/components/chain-of-thought"
                implemented={false}
                category="Data Display"
              />
              <ComponentDocCard
                name="Checkpoint"
                description="Checkpoint component"
                sourceUrl="https://ai-sdk.dev/elements/components/checkpoint"
                implemented={false}
                category="Data Display"
              />
              <ComponentDocCard
                name="Confirmation"
                description="Confirmation component"
                sourceUrl="https://ai-sdk.dev/elements/components/confirmation"
                implemented={false}
                category="Interactive"
              />
              <ComponentDocCard
                name="Context"
                description="Context display component"
                sourceUrl="https://ai-sdk.dev/elements/components/context"
                implemented={false}
                category="Data Display"
              />
              <ComponentDocCard
                name="Conversation"
                description="Conversation component"
                sourceUrl="https://ai-sdk.dev/elements/components/conversation"
                implemented={false}
                category="Data Display"
              />
              <ComponentDocCard
                name="Message"
                description="Message component"
                sourceUrl="https://ai-sdk.dev/elements/components/message"
                implemented={false}
                category="Data Display"
              />
              <ComponentDocCard
                name="ModelSelection"
                description="Model selection component"
                sourceUrl="https://ai-sdk.dev/elements/components/model-selection"
                implemented={false}
                category="Form"
              />
              <ComponentDocCard
                name="Planning"
                description="Planning component"
                sourceUrl="https://ai-sdk.dev/elements/components/plan"
                implemented={false}
                category="Data Display"
              />
              <ComponentDocCard
                name="Queue"
                description="Queue component"
                sourceUrl="https://ai-sdk.dev/elements/components/queue"
                implemented={false}
                category="Data Display"
              />
              <ComponentDocCard
                name="Reasoning"
                description="Reasoning display component"
                sourceUrl="https://ai-sdk.dev/elements/components/reasoning"
                implemented={false}
                category="Data Display"
              />
              <ComponentDocCard
                name="Suggestion"
                description="Suggestion component"
                sourceUrl="https://ai-sdk.dev/elements/components/suggestion"
                implemented={false}
                category="Interactive"
              />
              <ComponentDocCard
                name="Task"
                description="Task component"
                sourceUrl="https://ai-sdk.dev/elements/components/task"
                implemented={false}
                category="Data Display"
              />
              <ComponentDocCard
                name="Tool"
                description="Tool component"
                sourceUrl="https://ai-sdk.dev/elements/components/tool"
                implemented={false}
                category="Data Display"
              />
              <ComponentDocCard
                name="InlineCitation"
                description="Inline citation component"
                sourceUrl="https://ai-sdk.dev/elements/components/inline-citation"
                implemented={false}
                category="Data Display"
              />
              <ComponentDocCard
                name="Sources"
                description="Sources component"
                sourceUrl="https://ai-sdk.dev/elements/components/sources"
                implemented={false}
                category="Data Display"
              />
              <ComponentDocCard
                name="Shimmer"
                description="Shimmer loading effect"
                sourceUrl="https://ai-sdk.dev/elements/components/shimmer"
                implemented={false}
                category="Data Display"
              />
            </div>
          </TabsContent>

          <TabsContent value="canvas">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <ComponentDocCard
                name="Canvas"
                description="Canvas component"
                sourceUrl="https://ai-sdk.dev/elements/components/canvas"
                implemented={false}
                category="Interactive"
              />
              <ComponentDocCard
                name="Connection"
                description="Connection component"
                sourceUrl="https://ai-sdk.dev/elements/components/connection"
                implemented={false}
                category="Interactive"
              />
              <ComponentDocCard
                name="Controls"
                description="Controls component"
                sourceUrl="https://ai-sdk.dev/elements/components/controls"
                implemented={false}
                category="Interactive"
              />
              <ComponentDocCard
                name="Edge"
                description="Edge component"
                sourceUrl="https://ai-sdk.dev/elements/components/edge"
                implemented={false}
                category="Interactive"
              />
              <ComponentDocCard
                name="Node"
                description="Node component"
                sourceUrl="https://ai-sdk.dev/elements/components/node"
                implemented={false}
                category="Interactive"
              />
              <ComponentDocCard
                name="Panel"
                description="Panel component"
                sourceUrl="https://ai-sdk.dev/elements/components/panel"
                implemented={false}
                category="Layout"
              />
              <ComponentDocCard
                name="Toolbar"
                description="Toolbar component"
                sourceUrl="https://ai-sdk.dev/elements/components/toolbar"
                implemented={false}
                category="Navigation"
              />
            </div>
          </TabsContent>

          <TabsContent value="other">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {/* Additional AI SDK components can go here if needed */}
            </div>
          </TabsContent>
        </Tabs>
      </LibrarySection>

      {/* Billing SDK Section */}
      <LibrarySection
        id="billing-sdk"
        name="Billing SDK"
        description="Pricing and billing components."
        sourceUrl="https://billingsdk.com/"
      >
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <ComponentDocCard
            name="PricingTable"
            description="Pricing table component"
            sourceUrl="https://billingsdk.com/docs/components/pricing-table/pricing-table-one"
            implemented={false}
            category="Data Display"
          />
        </div>
      </LibrarySection>

      {/* Coss UI Section */}
      <LibrarySection
        id="coss-ui"
        name="Coss UI"
        description="Toast and toolbar components."
        sourceUrl="https://coss.com/ui/"
      >
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <ComponentDocCard
            name="Toast"
            description="Toast notification component"
            sourceUrl="https://coss.com/ui/docs/components/toast"
            implemented={false}
            category="Data Display"
          />
          <ComponentDocCard
            name="Toolbar"
            description="Toolbar component"
            sourceUrl="https://coss.com/ui/docs/components/toolbar"
            implemented={false}
            category="Navigation"
          />
        </div>
      </LibrarySection>

      {/* Creative Tim Section */}
      <LibrarySection
        id="creative-tim"
        name="Creative Tim"
        description="Admin and content UI blocks."
        sourceUrl="https://www.creative-tim.com/"
      >
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <ComponentDocCard
            name="Account"
            description="Account management block"
            sourceUrl="https://www.creative-tim.com/ui/blocks/application-admin/account"
            implemented={false}
            category="Layout"
          />
          <ComponentDocCard
            name="Charts"
            description="Charts block"
            sourceUrl="https://www.creative-tim.com/ui/blocks/application-admin/charts"
            implemented={false}
            category="Data Display"
          />
          <ComponentDocCard
            name="KPI"
            description="KPI dashboard block"
            sourceUrl="https://www.creative-tim.com/ui/blocks/application-admin/kpi"
            implemented={false}
            category="Data Display"
          />
          <ComponentDocCard
            name="Logo"
            description="Logo component"
            sourceUrl="https://www.creative-tim.com/ui/blocks/content-ui/logo"
            implemented={false}
            category="Layout"
          />
        </div>
      </LibrarySection>

      {/* Hexta UI Section */}
      <LibrarySection
        id="hexta-ui"
        name="Hexta UI"
        description="Clerk integration components."
        sourceUrl="https://www.hextaui.com/"
      >
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <ComponentDocCard
            name="ClerkIntegration"
            description="Clerk integration components"
            sourceUrl="https://www.hextaui.com/"
            implemented={false}
            category="Integration"
          />
        </div>
      </LibrarySection>

      {/* Integration Notes */}
      <section>
        <h2 className="text-3xl font-semibold mb-6">Integration Notes</h2>
        <div className="prose max-w-none">
          <p>
            All third-party components have been adapted to use Digital Garden
            design tokens. Components are organized by library in{" "}
            <code>/components/third-party/</code>.
          </p>
          <p>Each library directory contains a README with:</p>
          <ul>
            <li>Component list with source URLs</li>
            <li>Usage examples</li>
            <li>Design system adaptations</li>
            <li>Known issues/limitations</li>
          </ul>
          <p>
            <strong>Note:</strong> Some components are placeholder
            implementations. To complete integration, copy the original
            component code from the source URL and adapt it using the utilities
            in <code>/lib/third-party/</code>.
          </p>
        </div>
      </section>
    </div>
  );
}
