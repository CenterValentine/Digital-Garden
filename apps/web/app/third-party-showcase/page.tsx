/**
 * Third-Party Components Showcase
 *
 * This page demonstrates all integrated third-party components
 * organized by library and category.
 */

import {
  BackgroundRipple,
  Card3D,
  StatefulButtons,
  AnimatedTabs,
} from "@/components/third-party/aceternity";

export default function ThirdPartyShowcasePage() {
  return (
    <div className="container mx-auto py-12 space-y-16">
      <div>
        <h1 className="text-4xl font-bold mb-4">
          Third-Party Component Libraries
        </h1>
        <p className="text-muted-foreground">
          Showcase of all integrated third-party components adapted for the
          Digital Garden design system.
        </p>
      </div>

      {/* Aceternity UI Section */}
      <section>
        <h2 className="text-3xl font-semibold mb-6">Aceternity UI</h2>
        <div className="space-y-8">
          <div>
            <h3 className="text-xl font-medium mb-4">Backgrounds & Effects</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <BackgroundRipple color="shale" className="h-32 rounded-lg">
                <div className="p-4">Background Ripple</div>
              </BackgroundRipple>
            </div>
          </div>

          <div>
            <h3 className="text-xl font-medium mb-4">Cards</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <Card3D color="gold" className="p-6">
                <h4 className="text-lg font-semibold">3D Card</h4>
                <p>Example 3D card effect</p>
              </Card3D>
            </div>
          </div>

          <div>
            <h3 className="text-xl font-medium mb-4">Buttons</h3>
            <div className="flex gap-4">
              <StatefulButtons color="leaf" intent="primary">
                Stateful Button
              </StatefulButtons>
            </div>
          </div>

          <div>
            <h3 className="text-xl font-medium mb-4">Navigation</h3>
            <AnimatedTabs
              color="shale"
              tabs={["Tab 1", "Tab 2", "Tab 3"]}
              activeTab="Tab 1"
            />
          </div>
        </div>
      </section>

      {/* Other Libraries Section */}
      <section>
        <h2 className="text-3xl font-semibold mb-6">Other Libraries</h2>
        <div className="space-y-4">
          <div className="p-4 border rounded-lg">
            <h3 className="font-semibold mb-2">Animate UI</h3>
            <p className="text-sm text-muted-foreground">
              Radix-based animated components. See README for component list.
            </p>
          </div>
          <div className="p-4 border rounded-lg">
            <h3 className="font-semibold mb-2">Cult UI</h3>
            <p className="text-sm text-muted-foreground">
              Unique aesthetic components. See README for component list.
            </p>
          </div>
          <div className="p-4 border rounded-lg">
            <h3 className="font-semibold mb-2">Glass UI</h3>
            <p className="text-sm text-muted-foreground">
              Glass morphism effects. See README for component list.
            </p>
          </div>
          <div className="p-4 border rounded-lg">
            <h3 className="font-semibold mb-2">Dice UI</h3>
            <p className="text-sm text-muted-foreground">
              Form and input components. See README for component list.
            </p>
          </div>
          <div className="p-4 border rounded-lg">
            <h3 className="font-semibold mb-2">Ali Imam</h3>
            <p className="text-sm text-muted-foreground">
              Background effects and patterns. See README for component list.
            </p>
          </div>
        </div>
      </section>

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
