import * as React from "react";
import { cn } from "@/lib/core/utils";
import { GOLD, SLATE, LEAF } from "@/lib/design-system/colors";

export type NodeType = "default" | "leaf" | "junction" | "root" | "endpoint";
export type NodeState =
  | "default"
  | "active"
  | "hover"
  | "success"
  | "warning"
  | "disabled";

interface TreeNodeProps {
  type?: NodeType;
  state?: NodeState;
  icon?: React.ReactNode;
  label?: string;
  size?: "sm" | "md" | "lg" | "xl";
  showGlow?: boolean;
  className?: string;
  onClick?: () => void;
}

const sizeClasses = {
  sm: "w-6 h-6",
  md: "w-10 h-10",
  lg: "w-14 h-14",
  xl: "w-20 h-20",
};

const iconSizes = {
  sm: "w-3 h-3",
  md: "w-5 h-5",
  lg: "w-7 h-7",
  xl: "w-10 h-10",
};

// Base styles for different node types
const getNodeStyles = (type: NodeType) => {
  const baseStyles =
    "transition-all duration-300 flex items-center justify-center relative";

  switch (type) {
    case "leaf":
      return `${baseStyles} rotate-45`;
    case "junction":
      return `${baseStyles} rounded-full`;
    case "root":
      return `${baseStyles} rounded-lg`;
    case "endpoint":
      return `${baseStyles} rotate-45 rounded-sm`;
    default:
      return `${baseStyles} rounded-full`;
  }
};

// Color and glow styles based on state
const getStateStyles = (state: NodeState, showGlow: boolean) => {
  switch (state) {
    case "active":
      return {
        bg: "bg-leaf-primary",
        border: "border-leaf-light border-2",
        glow: showGlow ? "shadow-glow-leaf" : "",
        text: "text-white",
      };
    case "hover":
      return {
        bg: "bg-gold-primary",
        border: "border-gold-light border-2",
        glow: showGlow ? "shadow-glow-gold" : "",
        text: "text-white",
      };
    case "success":
      return {
        bg: "bg-leaf-light",
        border: "border-leaf-bright border-2",
        glow: showGlow ? "shadow-glow-success" : "",
        text: "text-white",
      };
    case "warning":
      return {
        bg: "bg-gold-dark",
        border: "border-gold-primary border-2",
        glow: showGlow ? "shadow-glow-warning" : "",
        text: "text-gold-light",
      };
    case "disabled":
      return {
        bg: "bg-shale-light",
        border: "border-shale-mid border",
        glow: "",
        text: "text-shale-dark",
      };
    default:
      return {
        bg: "bg-shale-mid",
        border: "border-shale-light border-2",
        glow: "",
        text: "text-gold-light",
      };
  }
};

export function TreeNode({
  type = "default",
  state = "default",
  icon,
  label,
  size = "md",
  showGlow = false,
  className,
  onClick,
}: TreeNodeProps) {
  const styles = getStateStyles(state, showGlow);

  return (
    <div className="flex flex-col items-center gap-2">
      <div
        onClick={onClick}
        className={cn(
          getNodeStyles(type),
          sizeClasses[size],
          styles.bg,
          styles.border,
          styles.glow,
          styles.text,
          "cursor-pointer hover:scale-110",
          className
        )}
      >
        {type === "leaf" || type === "endpoint" ? (
          <div className="-rotate-45 flex items-center justify-center">
            {icon && <div className={iconSizes[size]}>{icon}</div>}
          </div>
        ) : (
          icon && <div className={iconSizes[size]}>{icon}</div>
        )}
      </div>
      {label && (
        <span className="text-xs text-gold-light text-center whitespace-nowrap">
          {label}
        </span>
      )}
    </div>
  );
}

interface BranchLineProps {
  type?: "straight" | "curved" | "angular" | "circuit";
  direction?: "vertical" | "horizontal" | "diagonal-right" | "diagonal-left";
  length?: number;
  color?: "gold" | "shale" | "green";
  animated?: boolean;
  withJunctions?: boolean;
}

const colorClasses = {
  gold: "stroke-gold-primary",
  shale: "stroke-shale-mid",
  green: "stroke-leaf-primary",
};

const fillColors = {
  gold: GOLD.primary,
  shale: SLATE.mid,
  green: LEAF.primary,
};

export function BranchLine({
  type = "straight",
  direction = "vertical",
  length = 100,
  color = "shale",
  animated = false,
  withJunctions = false,
}: BranchLineProps) {
  const renderStraightLine = () => {
    const isVertical = direction === "vertical";
    return (
      <svg
        width={isVertical ? "4" : `${length}`}
        height={isVertical ? `${length}` : "4"}
        className={animated ? "animate-pulse" : ""}
      >
        <line
          x1={isVertical ? "2" : "0"}
          y1={isVertical ? "0" : "2"}
          x2={isVertical ? "2" : `${length}`}
          y2={isVertical ? `${length}` : "2"}
          className={colorClasses[color]}
          strokeWidth="2"
          strokeLinecap="round"
        />
        {withJunctions && (
          <>
            <circle
              cx={isVertical ? "2" : length / 3}
              cy={isVertical ? length / 3 : "2"}
              r="3"
              fill={fillColors[color]}
            />
            <circle
              cx={isVertical ? "2" : (2 * length) / 3}
              cy={isVertical ? (2 * length) / 3 : "2"}
              r="3"
              fill={fillColors[color]}
            />
          </>
        )}
      </svg>
    );
  };

  const renderCircuitLine = () => {
    return (
      <svg
        width={length}
        height="60"
        className={animated ? "animate-pulse" : ""}
      >
        <path
          d={`M 0 30 L 20 30 L 30 20 L 50 20 L 60 30 L ${length - 60} 30 L ${length - 50} 20 L ${length - 30} 20 L ${length - 20} 30 L ${length} 30`}
          fill="none"
          className={colorClasses[color]}
          strokeWidth="2"
        />
        {withJunctions && (
          <>
            <circle cx="30" cy="20" r="3" fill={fillColors[color]} />
            <circle cx={length / 2} cy="30" r="3" fill={fillColors[color]} />
            <circle cx={length - 30} cy="20" r="3" fill={fillColors[color]} />
          </>
        )}
      </svg>
    );
  };

  const renderCurvedLine = () => {
    return (
      <svg
        width={length}
        height={length}
        className={animated ? "animate-pulse" : ""}
      >
        <path
          d={`M 0 0 Q ${length / 2} ${length / 2} ${length} ${length}`}
          fill="none"
          className={colorClasses[color]}
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
    );
  };

  switch (type) {
    case "circuit":
      return renderCircuitLine();
    case "curved":
      return renderCurvedLine();
    default:
      return renderStraightLine();
  }
}
