"use client";

import { useState } from "react";
import { GradientBackgroundDemo } from "@/components/third-party/animate-ui";
import { AnimatePresence, motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ColorSelector } from "@/components/ui/utility/color-selector";
import type { DigitalGardenColor } from "@/lib/third-party/colors";

export default function GradientBackgroundPreview() {
  const [selectedColor, setColor] = useState<DigitalGardenColor>("gold");

  return (
    <div
      className="w-full h-screen min-h-screen relative"
      style={{ height: "100vh" }}
    >
      <AnimatePresence>
        <motion.div
          key={selectedColor}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.5 }}
          className="absolute inset-0"
        >
          <GradientBackgroundDemo className="h-screen" color={selectedColor} />
        </motion.div>
      </AnimatePresence>

      {/* Control Panel */}
      <div className="absolute top-4 right-4 z-50">
        <Card className="w-64">
          <CardHeader>
            <CardTitle className="text-sm">
              Gradient Background Selector
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ColorSelector
              value={selectedColor}
              onValueChange={setColor}
              label="Theme Color"
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
