"use client";

import React, { useEffect } from "react";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/client/ui/card";

// #endregion
import Tree from "@/components/client/logo/logo-parts/Tree";

export default function AboutPage() {
  return (
    <div>
      <Card>
        <CardHeader>
          <CardTitle>About</CardTitle>
        </CardHeader>
        <CardContent>
          <p>About page</p>
        </CardContent>
      </Card>
      <div className="flex justify-center items-center">
        <Tree />
      </div>
    </div>
  );
}
