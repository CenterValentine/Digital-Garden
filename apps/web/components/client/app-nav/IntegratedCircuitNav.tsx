/**
 * Circuit Navigation Component
 * Renders branch-based navigation driven by built branch trees
 */

import React, { useMemo } from "react";
import {
  buildBranchTree,
  BranchBuilderConfig,
  BranchPresetName,
  BRANCH_PRESETS,
  BuiltBranch,
} from "@/lib/app-nav/branch-builder";

// Get all preset names as an array for cycling
const PRESET_NAMES: BranchPresetName[] = Object.keys(
  BRANCH_PRESETS
) as BranchPresetName[];

interface Branch {
  id: number;
  yPercent: number;
  baseAngle: number;
  length: number;
  color: string;
  radialDistance: number;
  branchConfig?: Partial<BranchBuilderConfig> | BranchPresetName; // Branch builder config or preset name
}

// Configuration for which branches get custom depth/splits
interface BranchDepthConfig {
  branchId: number;
  config: Partial<BranchBuilderConfig> | BranchPresetName;
}

interface BranchClickData {
  branchId: number;
  yPercent: number;
  position: { x: number; y: number };
  branchNodeId?: string; // For sub-branch nodes
  depth?: number; // For sub-branch nodes
}

interface IntegratedCircuitNavProps {
  progress: number;
  height?: number;
  containerWidth?: number;
  containerHeight?: number;
  onNodeClick?: (data: BranchClickData) => void;
  branchDepthConfigs?: BranchDepthConfig[]; // Configure custom branch depths
  defaultBranchConfig?: Partial<BranchBuilderConfig> | BranchPresetName; // Default config for all branches
  scrollRotation?: number; // Scroll-driven rotation override (in degrees)
}

// Helper to resolve preset name to config
function resolveConfig(
  config: Partial<BranchBuilderConfig> | BranchPresetName | undefined
): Partial<BranchBuilderConfig> | undefined {
  if (!config) return undefined;
  if (typeof config === "string") {
    return BRANCH_PRESETS[config];
  }
  return config;
}

export function IntegratedCircuitNav({
  progress,
  height = 800,
  containerWidth = 1200,
  containerHeight = 800,
  onNodeClick,
  branchDepthConfigs = [], // Can override with specific configs if needed
  defaultBranchConfig, // If not set, all branches will cycle through presets
  scrollRotation, // Scroll-driven rotation override
}: IntegratedCircuitNavProps) {
  // Base rotation is much slower now (10 degrees per full progress instead of 360)
  // Scroll rotation override takes precedence if provided
  const baseRotation = progress * 10; // Much slower base rotation
  const rotation = scrollRotation !== undefined ? scrollRotation : baseRotation;

  // SVG dimensions and center - make it larger and more visible
  const svgWidth = Math.min(containerWidth * 0.8, 800); // Responsive width, max 800px
  const svgCenterX = svgWidth / 2;

  // Branch properties
  const branchBaseRadius = 3; // Distance from trunk to branch connection (base branch)
  const branchLength = 40; // Length of branch extending outward (shortened)

  // Performance optimization: Vertical Tree Culling
  // Render only middle portion of vertical tree (50%) while maintaining full-screen display
  const TREE_CULL_RATIO = 0.5; // Render 50% of tree
  const treeStart = (1 - TREE_CULL_RATIO) / 2; // 0.25 (start at 25%)
  const treeEnd = treeStart + TREE_CULL_RATIO; // 0.75 (end at 75%)

  // Create a map for quick lookup of branch configs
  const branchConfigMap = useMemo(() => {
    const map = new Map<number, Partial<BranchBuilderConfig>>();
    branchDepthConfigs.forEach(({ branchId, config }) => {
      const resolved = resolveConfig(config);
      if (resolved) {
        map.set(branchId, resolved);
      }
    });
    return map;
  }, [branchDepthConfigs]);

  // Generate stable branches
  const branches = useMemo(() => {
    const branchCount = 28;
    const newBranches: Branch[] = [];

    for (let i = 0; i < branchCount; i++) {
      const yPercent = (i / branchCount) * 100;

      let color = "#10b981";
      if (yPercent > 60) {
        color = yPercent > 70 ? "#fb923c" : "#f59e0b";
      } else if (yPercent > 40) {
        color = "#3b82f6";
      }

      const baseAngle = (i / branchCount) * 360;

      // Get branch config - either specific config, default config, or cycle through presets
      let branchConfig =
        branchConfigMap.get(i) || resolveConfig(defaultBranchConfig);

      // If no config specified, cycle through all presets
      if (!branchConfig) {
        const presetIndex = i % PRESET_NAMES.length;
        branchConfig = resolveConfig(PRESET_NAMES[presetIndex]);
      }

      newBranches.push({
        id: i,
        yPercent,
        baseAngle,
        length: branchLength,
        color,
        radialDistance: branchBaseRadius,
        branchConfig,
      });
    }

    return newBranches;
  }, [branchConfigMap, defaultBranchConfig, branchLength, branchBaseRadius]);

  // Calculate 3D positions for branches and build sub-branch trees
  const branchesWithDepth = useMemo(() => {
    return branches
      .map((branch) => {
        const orbitalAngle = branch.baseAngle + rotation;
        const orbitRadians = (orbitalAngle * Math.PI) / 180;

        // Position on the orbit circle
        const x = Math.cos(orbitRadians) * branch.radialDistance;
        const z = Math.sin(orbitRadians) * branch.radialDistance;

        const depthFactor = (z / branch.radialDistance + 1) / 2;
        const scale = 0.5 + depthFactor * 0.5;
        const opacity = 0.4 + depthFactor * 0.6;

        // Start position (connection to trunk)
        const startX = svgCenterX + x;
        const startY = (branch.yPercent / 100) * height;

        // End position (branch extends outward from orbit position)
        const branchAngle = orbitalAngle;
        const angleRad = (branchAngle * Math.PI) / 180;
        const endX = startX + branch.length * Math.cos(angleRad) * scale;
        const endY = startY - branch.length * Math.sin(angleRad) * scale * 0.3;

        // Performance optimization: Lazy Sub-Branch Building
        // Only build sub-branch trees for branches in active vertical range
        const yPercent = branch.yPercent / 100; // Convert to 0-1
        const inActiveRange = yPercent >= treeStart && yPercent <= treeEnd;

        // Build sub-branch tree only if in active range and has config
        let builtBranch: BuiltBranch | null = null;
        if (branch.branchConfig && inActiveRange) {
          const resolvedConfig = resolveConfig(branch.branchConfig);
          if (resolvedConfig) {
            builtBranch = buildBranchTree(
              endX,
              endY,
              angleRad,
              branch.color,
              resolvedConfig,
              scale,
              branch.id
            );
          }
        }

        return {
          ...branch,
          x,
          z,
          scale,
          opacity,
          startX,
          startY,
          endX,
          endY,
          angleRad,
          builtBranch,
        };
      })
      .sort((a, b) => a.z - b.z);
  }, [branches, rotation, height, svgCenterX, treeStart, treeEnd]);

  return (
    <div className="fixed inset-0 w-screen h-screen bg-slate-900 overflow-hidden">
      {/* Circuit Tree SVG - centered */}
      <div
        className="absolute z-10 flex items-center justify-center"
        style={{
          left: 0,
          right: 0,
          top: 0,
          bottom: 0,
          width: "100%",
          height: "100%",
        }}
      >
        <svg
          width={svgWidth}
          height={height}
          viewBox={`0 0 ${svgWidth} ${height}`}
          style={{ pointerEvents: "none" }}
        >
          <defs>
            <filter
              id="neonGlow"
              x="-100%"
              y="-100%"
              width="300%"
              height="300%"
            >
              <feGaussianBlur
                in="SourceGraphic"
                stdDeviation="2"
                result="blur1"
              />
              <feGaussianBlur
                in="SourceGraphic"
                stdDeviation="5"
                result="blur2"
              />
              <feGaussianBlur
                in="SourceGraphic"
                stdDeviation="10"
                result="blur3"
              />
              <feMerge>
                <feMergeNode in="blur3" />
                <feMergeNode in="blur2" />
                <feMergeNode in="blur1" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>

            <filter
              id="nodeGlow"
              x="-100%"
              y="-100%"
              width="300%"
              height="300%"
            >
              <feGaussianBlur
                in="SourceGraphic"
                stdDeviation=".5"
                result="blur1"
              />
              <feGaussianBlur
                in="SourceGraphic"
                stdDeviation="1"
                result="blur2"
              />
              <feMerge>
                <feMergeNode in="blur2" />
                <feMergeNode in="blur1" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* Branches in depth order */}
          {branchesWithDepth
            // Performance optimization: Vertical Tree Culling
            // Filter to only render branches in active vertical range (middle 50%)
            .filter((branch) => {
              const yPercent = branch.yPercent / 100; // Convert to 0-1
              return yPercent >= treeStart && yPercent <= treeEnd;
            })
            .map((branch) => {
              // Start the branch FROM the edge of the trunk node, not the center
              const nodeRadius = 5 * branch.scale; // Increased size

              // Calculate the direction vector from trunk center to branch end
              const dx = branch.endX - svgCenterX;
              const dy = branch.endY - branch.startY;
              const distance = Math.sqrt(dx * dx + dy * dy);

              // Normalize and offset by node radius
              const offsetX = (dx / distance) * nodeRadius;
              const offsetY = (dy / distance) * nodeRadius;

              // Actual start point at edge of trunk node
              const actualStartX = svgCenterX + offsetX;
              const actualStartY = branch.startY + offsetY;

              const controlX =
                actualStartX + (branch.endX - actualStartX) * 0.5;
              const controlY =
                actualStartY + (branch.endY - actualStartY) * 0.5;

              return (
                <g
                  key={`branch-${branch.id}`}
                  style={{ opacity: branch.opacity, pointerEvents: "auto" }}
                >
                  {/* Connection point at trunk - LARGER to ensure visibility */}
                  <circle
                    cx={svgCenterX}
                    cy={branch.startY}
                    r={nodeRadius}
                    fill={branch.color}
                    opacity="0.9"
                    filter="url(#nodeGlow)"
                  />

                  {/* Main branch wire - starts from edge of trunk node */}
                  <path
                    d={`M ${actualStartX} ${actualStartY} Q ${controlX} ${controlY} ${branch.endX} ${branch.endY}`}
                    stroke={branch.color}
                    strokeWidth={2 * branch.scale}
                    fill="none"
                    strokeLinecap="round"
                    filter="url(#neonGlow)"
                  />

                  {/* End node - only show if no sub-branches, otherwise sub-branches start here */}
                  {!branch.builtBranch && (
                    <g
                      onClick={() => {
                        onNodeClick?.({
                          branchId: branch.id,
                          yPercent: branch.yPercent,
                          position: { x: branch.endX, y: branch.endY },
                        });
                      }}
                      style={{ cursor: "pointer" }}
                    >
                      <circle
                        cx={branch.endX}
                        cy={branch.endY}
                        r={6 * branch.scale}
                        fill={branch.color}
                        filter="url(#nodeGlow)"
                      />
                      <circle
                        cx={branch.endX}
                        cy={branch.endY}
                        r={3 * branch.scale}
                        fill="white"
                        opacity="0.8"
                      />
                    </g>
                  )}

                  {/* Render built branch tree if configured */}
                  {branch.builtBranch &&
                    branch.builtBranch.allNodes.map((node) => {
                      // Calculate control point for curved path (matching base branch style)
                      const controlX =
                        node.startX + (node.endX - node.startX) * 0.5;
                      const controlY =
                        node.startY + (node.endY - node.startY) * 0.5;

                      // Check if this is a leaf node (no children)
                      const isLeafNode = node.children.length === 0;

                      return (
                        <g key={`subnode-${node.id}`}>
                          {/* Branch path - curved like base branch */}
                          <path
                            d={`M ${node.startX} ${node.startY} Q ${controlX} ${controlY} ${node.endX} ${node.endY}`}
                            stroke={node.color}
                            strokeWidth={2 * branch.scale}
                            fill="none"
                            strokeLinecap="round"
                            filter="url(#neonGlow)"
                          />
                          {/* End node - matching base branch style, clickable if leaf */}
                          {isLeafNode ? (
                            <g
                              onClick={() => {
                                onNodeClick?.({
                                  branchId: branch.id,
                                  yPercent: branch.yPercent,
                                  position: { x: node.endX, y: node.endY },
                                  branchNodeId: node.id,
                                  depth: node.depth,
                                });
                              }}
                              style={{ cursor: "pointer" }}
                            >
                              <circle
                                cx={node.endX}
                                cy={node.endY}
                                r={6 * branch.scale}
                                fill={node.color}
                                filter="url(#nodeGlow)"
                              />
                              <circle
                                cx={node.endX}
                                cy={node.endY}
                                r={3 * branch.scale}
                                fill="white"
                                opacity="0.8"
                              />
                            </g>
                          ) : (
                            <>
                              <circle
                                cx={node.endX}
                                cy={node.endY}
                                r={6 * branch.scale}
                                fill={node.color}
                                filter="url(#nodeGlow)"
                              />
                              <circle
                                cx={node.endX}
                                cy={node.endY}
                                r={3 * branch.scale}
                                fill="white"
                                opacity="0.8"
                              />
                            </>
                          )}
                        </g>
                      );
                    })}
                </g>
              );
            })}
        </svg>
      </div>
    </div>
  );
}

// double helix navigation system with branches and branch configs
// /**
//  * Circuit Navigation Component
//  * Renders navigation nodes along a parametric path
//  */

// import React, { useMemo } from "react";
// import { NavigationNodeIcon } from "./NavigationNodeIcon";
// import {
//   buildBranchTree,
//   BranchBuilderConfig,
//   BranchPresetName,
//   BRANCH_PRESETS,
//   BuiltBranch,
// } from "../utils/branch-builder";

// interface NavigationNode {
//   id: string;
//   label: string;
//   icon?: string;
//   offset: number; // 0-1 position along the vertical axis
// }

// interface Branch {
//   id: number;
//   yPercent: number;
//   baseAngle: number;
//   length: number;
//   color: string;
//   radialDistance: number;
//   branchConfig?: Partial<BranchBuilderConfig> | BranchPresetName; // Branch builder config or preset name
// }

// // Configuration for which branches get custom depth/splits
// interface BranchDepthConfig {
//   branchId: number;
//   config: Partial<BranchBuilderConfig> | BranchPresetName;
// }

// interface IntegratedCircuitNavProps {
//   progress: number;
//   nodes: NavigationNode[];
//   height?: number;
//   containerWidth?: number;
//   containerHeight?: number;
//   onNodeClick?: (node: NavigationNode) => void;
//   branchDepthConfigs?: BranchDepthConfig[]; // Configure custom branch depths
//   defaultBranchConfig?: Partial<BranchBuilderConfig> | BranchPresetName; // Default config for all branches
// }

// // Helper to resolve preset name to config
// function resolveConfig(
//   config: Partial<BranchBuilderConfig> | BranchPresetName | undefined
// ): Partial<BranchBuilderConfig> | undefined {
//   if (!config) return undefined;
//   if (typeof config === "string") {
//     return BRANCH_PRESETS[config];
//   }
//   return config;
// }

// export function IntegratedCircuitNav({
//   progress,
//   nodes,
//   height = 800,
//   containerWidth = 1200,
//   containerHeight = 800,
//   onNodeClick,
//   branchDepthConfigs = [
//     // Example: configure specific branches with different depths
//     { branchId: 5, config: "binary" },
//     { branchId: 12, config: "trident" },
//     { branchId: 18, config: "deepBinary" },
//     { branchId: 23, config: "organic" },
//   ],
//   defaultBranchConfig, // If not set, branches without config won't have sub-branches
// }: IntegratedCircuitNavProps) {
//   const trunkWidth = 3;

//   // Rotation only affects the orbital angle, not the vertical position
//   const rotation = progress * 360;

//   // Fixed center point - use actual container dimensions
//   const centerX = containerWidth / 2;
//   const centerY = containerHeight / 2;

//   // SVG dimensions and center
//   const svgWidth = 400;
//   const svgCenterX = svgWidth / 2; // 200

//   // Branch properties
//   const branchBaseRadius = 100; // Distance from trunk to branch connection
//   const branchLength = 80; // Length of branch extending outward

//   // Icon orbit radius - must match branch endpoint distance
//   const iconOrbitRadius = branchBaseRadius + branchLength;

//   // Create a map for quick lookup of branch configs
//   const branchConfigMap = useMemo(() => {
//     const map = new Map<number, Partial<BranchBuilderConfig>>();
//     branchDepthConfigs.forEach(({ branchId, config }) => {
//       const resolved = resolveConfig(config);
//       if (resolved) {
//         map.set(branchId, resolved);
//       }
//     });
//     return map;
//   }, [branchDepthConfigs]);

//   // Generate stable branches
//   const branches = useMemo(() => {
//     const branchCount = 28;
//     const newBranches: Branch[] = [];

//     for (let i = 0; i < branchCount; i++) {
//       const yPercent = (i / branchCount) * 100;

//       let color = "#10b981";
//       if (yPercent > 60) {
//         color = yPercent > 70 ? "#fb923c" : "#f59e0b";
//       } else if (yPercent > 40) {
//         color = "#3b82f6";
//       }

//       const baseAngle = (i / branchCount) * 360;

//       // Get branch config - either specific config, default config, or undefined
//       const branchConfig =
//         branchConfigMap.get(i) || resolveConfig(defaultBranchConfig);

//       newBranches.push({
//         id: i,
//         yPercent,
//         baseAngle,
//         length: branchLength,
//         color,
//         radialDistance: branchBaseRadius,
//         branchConfig,
//       });
//     }

//     return newBranches;
//   }, [branchConfigMap, defaultBranchConfig, branchLength, branchBaseRadius]);

//   // Calculate 3D positions for branches and build sub-branch trees
//   const branchesWithDepth = useMemo(() => {
//     return branches
//       .map((branch) => {
//         const orbitalAngle = branch.baseAngle + rotation;
//         const orbitRadians = (orbitalAngle * Math.PI) / 180;

//         // Position on the orbit circle
//         const x = Math.cos(orbitRadians) * branch.radialDistance;
//         const z = Math.sin(orbitRadians) * branch.radialDistance;

//         const depthFactor = (z / branch.radialDistance + 1) / 2;
//         const scale = 0.5 + depthFactor * 0.5;
//         const opacity = 0.4 + depthFactor * 0.6;

//         // Start position (connection to trunk)
//         const startX = svgCenterX + x;
//         const startY = (branch.yPercent / 100) * height;

//         // End position (branch extends outward from orbit position)
//         const branchAngle = orbitalAngle;
//         const angleRad = (branchAngle * Math.PI) / 180;
//         const endX = startX + branch.length * Math.cos(angleRad) * scale;
//         const endY = startY - branch.length * Math.sin(angleRad) * scale * 0.3;

//         // Build sub-branch tree if this branch has a config
//         let builtBranch: BuiltBranch | null = null;
//         if (branch.branchConfig) {
//           builtBranch = buildBranchTree(
//             endX,
//             endY,
//             angleRad,
//             branch.color,
//             branch.branchConfig,
//             scale,
//             branch.id
//           );
//         }

//         return {
//           ...branch,
//           x,
//           z,
//           scale,
//           opacity,
//           startX,
//           startY,
//           endX,
//           endY,
//           angleRad,
//           builtBranch,
//         };
//       })
//       .sort((a, b) => a.z - b.z);
//   }, [branches, rotation, height, svgCenterX]);

//   // Calculate icon positions - MUST use same coordinate system as branches
//   const iconPositions = useMemo(() => {
//     return nodes
//       .map((node) => {
//         // Each node has a fixed vertical position based on offset (0-1)
//         const yPosition = node.offset * height;

//         // Calculate orbital angle - only this rotates with progress
//         const orbitalAngle = node.offset * 360 + rotation;
//         const orbitRadians = (orbitalAngle * Math.PI) / 180;

//         // 3D position relative to the trunk center
//         const x = Math.cos(orbitRadians) * iconOrbitRadius;
//         const z = Math.sin(orbitRadians) * iconOrbitRadius;

//         // Depth-based scaling
//         const depthFactor = (z / iconOrbitRadius + 1) / 2;
//         const scale = 0.6 + depthFactor * 0.4;
//         const opacity = 0.5 + depthFactor * 0.5;

//         // Convert to screen coordinates
//         const screenX = centerX + (x / svgWidth) * svgWidth;
//         const screenY = centerY - height / 2 + yPosition;

//         return {
//           node,
//           screenX,
//           screenY,
//           scale,
//           opacity,
//           z,
//         };
//       })
//       .sort((a, b) => a.z - b.z);
//   }, [nodes, rotation, iconOrbitRadius, height, centerX, centerY, svgWidth]);

//   return (
//     <div className="relative w-full h-full bg-slate-900 overflow-hidden">
//       {/* Circuit Tree SVG - centered */}
//       <div
//         className="absolute z-10 pointer-events-none"
//         style={{
//           left: centerX,
//           top: centerY,
//           transform: "translate(-50%, -50%)",
//         }}
//       >
//         <svg
//           width={svgWidth}
//           height={height}
//           viewBox={`0 0 ${svgWidth} ${height}`}
//         >
//           <defs>
//             <linearGradient
//               id="trunkGradient"
//               x1="0%"
//               y1="0%"
//               x2="0%"
//               y2="100%"
//             >
//               <stop offset="0%" stopColor="#10b981" stopOpacity="0.8" />
//               <stop offset="40%" stopColor="#3b82f6" stopOpacity="0.9" />
//               <stop offset="60%" stopColor="#f59e0b" stopOpacity="0.9" />
//               <stop offset="100%" stopColor="#fb923c" stopOpacity="0.8" />
//             </linearGradient>

//             <filter
//               id="neonGlow"
//               x="-100%"
//               y="-100%"
//               width="300%"
//               height="300%"
//             >
//               <feGaussianBlur
//                 in="SourceGraphic"
//                 stdDeviation="2"
//                 result="blur1"
//               />
//               <feGaussianBlur
//                 in="SourceGraphic"
//                 stdDeviation="5"
//                 result="blur2"
//               />
//               <feGaussianBlur
//                 in="SourceGraphic"
//                 stdDeviation="10"
//                 result="blur3"
//               />
//               <feMerge>
//                 <feMergeNode in="blur3" />
//                 <feMergeNode in="blur2" />
//                 <feMergeNode in="blur1" />
//                 <feMergeNode in="SourceGraphic" />
//               </feMerge>
//             </filter>

//             <filter
//               id="nodeGlow"
//               x="-100%"
//               y="-100%"
//               width="300%"
//               height="300%"
//             >
//               <feGaussianBlur
//                 in="SourceGraphic"
//                 stdDeviation="3"
//                 result="blur1"
//               />
//               <feGaussianBlur
//                 in="SourceGraphic"
//                 stdDeviation="6"
//                 result="blur2"
//               />
//               <feMerge>
//                 <feMergeNode in="blur2" />
//                 <feMergeNode in="blur1" />
//                 <feMergeNode in="SourceGraphic" />
//               </feMerge>
//             </filter>
//           </defs>

//           {/* Central trunk */}
//           <line
//             x1={svgCenterX}
//             y1="0"
//             x2={svgCenterX}
//             y2={height}
//             stroke="url(#trunkGradient)"
//             strokeWidth={trunkWidth}
//             strokeLinecap="round"
//           />

//           {/* Branches in depth order */}
//           {branchesWithDepth.map((branch) => {
//             // Start the branch FROM the edge of the trunk node, not the center
//             const nodeRadius = 5 * branch.scale; // Increased size

//             // Calculate the direction vector from trunk center to branch end
//             const dx = branch.endX - svgCenterX;
//             const dy = branch.endY - branch.startY;
//             const distance = Math.sqrt(dx * dx + dy * dy);

//             // Normalize and offset by node radius
//             const offsetX = (dx / distance) * nodeRadius;
//             const offsetY = (dy / distance) * nodeRadius;

//             // Actual start point at edge of trunk node
//             const actualStartX = svgCenterX + offsetX;
//             const actualStartY = branch.startY + offsetY;

//             const controlX = actualStartX + (branch.endX - actualStartX) * 0.5;
//             const controlY = actualStartY + (branch.endY - actualStartY) * 0.5;

//             return (
//               <g
//                 key={`branch-${branch.id}`}
//                 style={{ opacity: branch.opacity }}
//               >
//                 {/* Connection point at trunk - LARGER to ensure visibility */}
//                 <circle
//                   cx={svgCenterX}
//                   cy={branch.startY}
//                   r={nodeRadius}
//                   fill={branch.color}
//                   opacity="0.9"
//                   filter="url(#nodeGlow)"
//                 />

//                 {/* Main branch wire - starts from edge of trunk node */}
//                 <path
//                   d={`M ${actualStartX} ${actualStartY} Q ${controlX} ${controlY} ${branch.endX} ${branch.endY}`}
//                   stroke={branch.color}
//                   strokeWidth={2 * branch.scale}
//                   fill="none"
//                   strokeLinecap="round"
//                   filter="url(#neonGlow)"
//                 />

//                 {/* End node - only show if no sub-branches, otherwise sub-branches start here */}
//                 {!branch.builtBranch && (
//                   <>
//                     <circle
//                       cx={branch.endX}
//                       cy={branch.endY}
//                       r={6 * branch.scale}
//                       fill={branch.color}
//                       filter="url(#nodeGlow)"
//                     />
//                     <circle
//                       cx={branch.endX}
//                       cy={branch.endY}
//                       r={3 * branch.scale}
//                       fill="white"
//                       opacity="0.8"
//                     />
//                   </>
//                 )}

//                 {/* Render built branch tree if configured */}
//                 {branch.builtBranch &&
//                   branch.builtBranch.allNodes.map((node) => (
//                     <g key={`subnode-${node.id}`}>
//                       {/* Branch line */}
//                       <line
//                         x1={node.startX}
//                         y1={node.startY}
//                         x2={node.endX}
//                         y2={node.endY}
//                         stroke={node.color}
//                         strokeWidth={node.strokeWidth}
//                         strokeLinecap="round"
//                         opacity={branch.opacity}
//                         filter="url(#neonGlow)"
//                       />
//                       {/* End node */}
//                       <circle
//                         cx={node.endX}
//                         cy={node.endY}
//                         r={node.nodeRadius}
//                         fill={node.color}
//                         opacity={branch.opacity}
//                         filter="url(#nodeGlow)"
//                       />
//                       {/* Inner highlight for larger nodes */}
//                       {node.nodeRadius > 2 && (
//                         <circle
//                           cx={node.endX}
//                           cy={node.endY}
//                           r={node.nodeRadius * 0.5}
//                           fill="white"
//                           opacity={branch.opacity * 0.7}
//                         />
//                       )}
//                     </g>
//                   ))}
//               </g>
//             );
//           })}
//         </svg>
//       </div>

//       {/* Navigation Icons - positioned to align with branch endpoints */}
//       {iconPositions.map(({ node, screenX, screenY, scale, opacity, z }) => (
//         <button
//           key={node.id}
//           onClick={() => onNodeClick?.(node)}
//           className="absolute will-change-transform transition-none cursor-pointer"
//           style={{
//             left: screenX,
//             top: screenY,
//             transform: `translate(-50%, -50%) scale(${scale})`,
//             opacity,
//             zIndex: z > 0 ? 30 : 20,
//           }}
//         >
//           <NavigationNodeIcon label={node.label} icon={node.icon} />
//         </button>
//       ))}

//       {/* Progress indicator */}
//       <div className="absolute right-12 top-1/2 -translate-y-1/2 text-white/60 text-sm space-y-1 z-40">
//         <div className="text-xs uppercase tracking-wider">Network</div>
//         <div className="text-2xl tabular-nums text-white">
//           {(progress * 100).toFixed(0)}%
//         </div>
//         <div className="text-xs opacity-60">Signal Flow</div>
//       </div>
//     </div>
//   );
// }
