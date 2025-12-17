/**
 * Branch Builder Utility
 * Creates hierarchical branch structures with configurable depth and parameters
 */

// Configuration for a single depth level
export interface BranchLevelConfig {
  splitCount: number; // How many sub-branches to create (2 = Y split, 3 = trident, etc.)
  length: number; // Length of branches at this level
  angleSpread: number; // Total angle spread in degrees (evenly distributed)
  nodeRadius: number; // Size of end nodes at this level
  strokeWidth: number; // Line thickness at this level
  lengthVariance?: number; // Random variance in length (0-1, default 0)
  angleOffset?: number; // Base angle offset in degrees (default 0)
}

// Full branch builder configuration
export interface BranchBuilderConfig {
  maxDepth: number; // Maximum recursion depth
  levels: BranchLevelConfig[]; // Config for each depth level (index 0 = first split)
  inheritColor?: boolean; // Whether child branches inherit parent color
  depthColorShift?: number; // Hue shift per depth level (degrees)
  terminateChance?: number; // Chance (0-1) to stop branching early at any level
  seedOffset?: number; // Offset for deterministic randomness
}

// A single node in the branch tree
export interface BranchNode {
  id: string;
  depth: number;
  parentId: string | null;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  angle: number; // Angle in radians
  length: number;
  nodeRadius: number;
  strokeWidth: number;
  color: string;
  children: BranchNode[];
}

// Output from the branch builder
export interface BuiltBranch {
  rootNode: BranchNode;
  allNodes: BranchNode[]; // Flattened list for easy rendering
  totalDepth: number;
  nodeCount: number;
}

// Seeded random number generator for deterministic results
function seededRandom(seed: number): number {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

// Shift a hex color's hue
function shiftHue(hexColor: string, degrees: number): string {
  // Convert hex to HSL, shift hue, convert back
  const r = parseInt(hexColor.slice(1, 3), 16) / 255;
  const g = parseInt(hexColor.slice(3, 5), 16) / 255;
  const b = parseInt(hexColor.slice(5, 7), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;

  let h = 0;
  let s = 0;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

    switch (max) {
      case r:
        h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
        break;
      case g:
        h = ((b - r) / d + 2) / 6;
        break;
      case b:
        h = ((r - g) / d + 4) / 6;
        break;
    }
  }

  // Shift hue
  h = (h + degrees / 360) % 1;
  if (h < 0) h += 1;

  // Convert back to RGB
  const hslToRgb = (
    h: number,
    s: number,
    l: number
  ): [number, number, number] => {
    if (s === 0) {
      return [l, l, l];
    }

    const hue2rgb = (p: number, q: number, t: number) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };

    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;

    return [
      hue2rgb(p, q, h + 1 / 3),
      hue2rgb(p, q, h),
      hue2rgb(p, q, h - 1 / 3),
    ];
  };

  const [newR, newG, newB] = hslToRgb(h, s, l);
  const toHex = (n: number) =>
    Math.round(n * 255)
      .toString(16)
      .padStart(2, "0");

  return `#${toHex(newR)}${toHex(newG)}${toHex(newB)}`;
}

// Default level configurations
export const DEFAULT_LEVEL_CONFIGS: BranchLevelConfig[] = [
  {
    splitCount: 2,
    length: 15, // Shortened initial built branch bar
    angleSpread: 50,
    nodeRadius: 4,
    strokeWidth: 1.5,
  },
  {
    splitCount: 2,
    length: 20,
    angleSpread: 60,
    nodeRadius: 3,
    strokeWidth: 1.2,
  },
  {
    splitCount: 2,
    length: 15,
    angleSpread: 70,
    nodeRadius: 2.5,
    strokeWidth: 1,
  },
  {
    splitCount: 2,
    length: 10,
    angleSpread: 80,
    nodeRadius: 2,
    strokeWidth: 0.8,
  },
];

// Default builder configuration
export const DEFAULT_BRANCH_CONFIG: BranchBuilderConfig = {
  maxDepth: 2,
  levels: DEFAULT_LEVEL_CONFIGS,
  inheritColor: true,
  depthColorShift: 15,
  terminateChance: 0,
  seedOffset: 0,
};

/**
 * Build a branch tree starting from a given endpoint
 */
export function buildBranchTree(
  startX: number,
  startY: number,
  baseAngle: number, // In radians
  baseColor: string,
  config: Partial<BranchBuilderConfig> = {},
  scale: number = 1, // For depth-based scaling
  branchId: number = 0 // For seeding randomness
): BuiltBranch {
  const fullConfig: BranchBuilderConfig = {
    ...DEFAULT_BRANCH_CONFIG,
    ...config,
  };
  const allNodes: BranchNode[] = [];
  let nodeCounter = 0;

  function buildNode(
    parentId: string | null,
    depth: number,
    x: number,
    y: number,
    angle: number,
    color: string,
    seed: number
  ): BranchNode | null {
    // Check max depth
    if (depth > fullConfig.maxDepth) return null;

    // Get level config (use last config if depth exceeds available configs)
    const levelIndex = Math.min(depth - 1, fullConfig.levels.length - 1);
    const levelConfig = fullConfig.levels[levelIndex];

    // Check terminate chance
    if (
      depth > 1 &&
      fullConfig.terminateChance &&
      seededRandom(seed * 7.89) < fullConfig.terminateChance
    ) {
      return null;
    }

    // Calculate length with variance
    let length = levelConfig.length * scale;
    if (levelConfig.lengthVariance) {
      const variance =
        (seededRandom(seed * 2.34) - 0.5) * 2 * levelConfig.lengthVariance;
      length *= 1 + variance;
    }

    // Calculate end position
    const endX = x + Math.cos(angle) * length;
    const endY = y - Math.sin(angle) * length * 0.3; // Perspective flattening

    // Create node
    const nodeId = `${branchId}-d${depth}-n${nodeCounter++}`;
    const node: BranchNode = {
      id: nodeId,
      depth,
      parentId,
      startX: x,
      startY: y,
      endX,
      endY,
      angle,
      length,
      nodeRadius: levelConfig.nodeRadius * scale,
      strokeWidth: levelConfig.strokeWidth * scale,
      color,
      children: [],
    };

    allNodes.push(node);

    // Build children if not at max depth
    if (depth < fullConfig.maxDepth) {
      const childLevelIndex = Math.min(depth, fullConfig.levels.length - 1);
      const childConfig = fullConfig.levels[childLevelIndex];
      const splitCount = childConfig.splitCount;
      const angleSpread = (childConfig.angleSpread * Math.PI) / 180;
      const angleOffset = ((childConfig.angleOffset || 0) * Math.PI) / 180;

      // Calculate child color
      let childColor = color;
      if (!fullConfig.inheritColor && fullConfig.depthColorShift) {
        childColor = shiftHue(color, fullConfig.depthColorShift * depth);
      }

      // Create child branches
      for (let i = 0; i < splitCount; i++) {
        // Distribute angles evenly across the spread
        let childAngle: number;
        if (splitCount === 1) {
          childAngle = angle + angleOffset;
        } else {
          const t = i / (splitCount - 1); // 0 to 1
          childAngle = angle + angleOffset + (t - 0.5) * angleSpread;
        }

        const childNode = buildNode(
          nodeId,
          depth + 1,
          endX,
          endY,
          childAngle,
          childColor,
          seed + i * 100 + depth * 1000
        );

        if (childNode) {
          node.children.push(childNode);
        }
      }
    }

    return node;
  }

  // Build the tree starting at depth 1
  const rootNode = buildNode(
    null,
    1,
    startX,
    startY,
    baseAngle,
    baseColor,
    branchId + (fullConfig.seedOffset || 0)
  );

  // Handle case where root node was terminated
  if (!rootNode) {
    return {
      rootNode: {
        id: `${branchId}-empty`,
        depth: 0,
        parentId: null,
        startX,
        startY,
        endX: startX,
        endY: startY,
        angle: baseAngle,
        length: 0,
        nodeRadius: 0,
        strokeWidth: 0,
        color: baseColor,
        children: [],
      },
      allNodes: [],
      totalDepth: 0,
      nodeCount: 0,
    };
  }

  // Calculate actual depth achieved
  let maxDepthReached = 0;
  allNodes.forEach((node) => {
    if (node.depth > maxDepthReached) maxDepthReached = node.depth;
  });

  return {
    rootNode,
    allNodes,
    totalDepth: maxDepthReached,
    nodeCount: allNodes.length,
  };
}

// Preset configurations for common branch styles
export const BRANCH_PRESETS = {
  // Simple Y split (like current implementation)
  simple: {
    maxDepth: 1,
    levels: [
      {
        splitCount: 2,
        length: 70,
        angleSpread: 85,
        nodeRadius: 4,
        strokeWidth: 1.5,
      },
    ],
  } as Partial<BranchBuilderConfig>,

  // Binary tree - 2 levels deep
  binary: {
    maxDepth: 2,
    levels: [
      {
        splitCount: 2,
        length: 60,
        angleSpread: 85,
        nodeRadius: 4,
        strokeWidth: 1.5,
      },
      {
        splitCount: 2,
        length: 120,
        angleSpread: 100,
        nodeRadius: 3,
        strokeWidth: 1.2,
      },
    ],
  } as Partial<BranchBuilderConfig>,

  // Deep binary - 3 levels
  deepBinary: {
    maxDepth: 3,
    levels: [
      {
        splitCount: 2,
        length: 50,
        angleSpread: 75,
        nodeRadius: 4,
        strokeWidth: 1.5,
      },
      {
        splitCount: 2,
        length: 100,
        angleSpread: 90,
        nodeRadius: 3,
        strokeWidth: 1.2,
      },
      {
        splitCount: 2,
        length: 130,
        angleSpread: 110,
        nodeRadius: 2.5,
        strokeWidth: 1,
      },
    ],
  } as Partial<BranchBuilderConfig>,

  // Trident - 3-way split
  trident: {
    maxDepth: 1,
    levels: [
      {
        splitCount: 3,
        length: 60,
        angleSpread: 130,
        nodeRadius: 4,
        strokeWidth: 1.5,
      },
    ],
  } as Partial<BranchBuilderConfig>,

  // Trident with sub-splits
  tridentDeep: {
    maxDepth: 2,
    levels: [
      {
        splitCount: 3,
        length: 50,
        angleSpread: 120,
        nodeRadius: 4,
        strokeWidth: 1.5,
      },
      {
        splitCount: 2,
        length: 120,
        angleSpread: 85,
        nodeRadius: 3,
        strokeWidth: 1.2,
      },
    ],
  } as Partial<BranchBuilderConfig>,

  // Fan - many small branches
  fan: {
    maxDepth: 1,
    levels: [
      {
        splitCount: 5,
        length: 50,
        angleSpread: 180,
        nodeRadius: 3,
        strokeWidth: 1.2,
      },
    ],
  } as Partial<BranchBuilderConfig>,

  // Organic - varies with some randomness
  organic: {
    maxDepth: 3,
    levels: [
      {
        splitCount: 2,
        length: 50,
        angleSpread: 90,
        nodeRadius: 4,
        strokeWidth: 1.5,
        lengthVariance: 0.2,
      },
      {
        splitCount: 2,
        length: 100,
        angleSpread: 105,
        nodeRadius: 3,
        strokeWidth: 1.2,
        lengthVariance: 0.25,
      },
      {
        splitCount: 2,
        length: 130,
        angleSpread: 120,
        nodeRadius: 2.5,
        strokeWidth: 1,
        lengthVariance: 0.3,
      },
    ],
    terminateChance: 0.15,
  } as Partial<BranchBuilderConfig>,

  // Neural - dense network style
  neural: {
    maxDepth: 4,
    levels: [
      {
        splitCount: 2,
        length: 40,
        angleSpread: 70,
        nodeRadius: 3.5,
        strokeWidth: 1.4,
      },
      {
        splitCount: 2,
        length: 80,
        angleSpread: 85,
        nodeRadius: 3,
        strokeWidth: 1.2,
      },
      {
        splitCount: 2,
        length: 110,
        angleSpread: 100,
        nodeRadius: 2.5,
        strokeWidth: 1,
      },
      {
        splitCount: 2,
        length: 130,
        angleSpread: 115,
        nodeRadius: 2,
        strokeWidth: 0.8,
      },
    ],
    terminateChance: 0.1,
  } as Partial<BranchBuilderConfig>,

  // Single straight extension
  straight: {
    maxDepth: 1,
    levels: [
      {
        splitCount: 1,
        length: 100,
        angleSpread: 0,
        nodeRadius: 5,
        strokeWidth: 1.5,
      },
    ],
  } as Partial<BranchBuilderConfig>,
};

export type BranchPresetName = keyof typeof BRANCH_PRESETS;
