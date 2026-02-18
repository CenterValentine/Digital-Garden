/**
 * Type definitions for visualization engines
 *
 * Architecture: Discriminated unions ensure type safety across three engines
 * - Diagrams.net: XML-based comprehensive diagramming (iframe)
 * - Excalidraw: JSON-based hand-drawn whiteboarding (React component)
 * - Mermaid: Text-based code-to-diagram rendering (text + mermaid.js)
 */

// ============================================================================
// DIAGRAMS.NET TYPES
// ============================================================================

export type DiagramsNetTheme = "kennedy" | "atlas" | "dark" | "minimal";

export interface DiagramsNetConfig {
  formatVersion: string; // e.g., "21.6.5"
  theme: DiagramsNetTheme;
  grid: boolean;
  pageFormat?: "A4" | "Letter" | "Legal";
}

export interface DiagramsNetData {
  xml: string; // mxGraphModel XML format
}

// ============================================================================
// EXCALIDRAW TYPES
// ============================================================================

export type ExcalidrawTheme = "light" | "dark";

export interface ExcalidrawConfig {
  excalidrawVersion: string; // e.g., "0.17.0"
  viewBackgroundColor: string;
  gridSize?: number | null;
}

// Simplified Excalidraw element type (full type is complex)
export interface ExcalidrawElement {
  id: string;
  type: "rectangle" | "diamond" | "ellipse" | "arrow" | "line" | "text" | "freedraw" | "image";
  x: number;
  y: number;
  width?: number;
  height?: number;
  angle?: number;
  strokeColor?: string;
  backgroundColor?: string;
  fillStyle?: string;
  strokeWidth?: number;
  roughness?: number;
  opacity?: number;
  [key: string]: any; // Allow other Excalidraw-specific properties
}

export interface ExcalidrawAppState {
  viewBackgroundColor?: string;
  zoom?: { value: number };
  scrollX?: number;
  scrollY?: number;
  [key: string]: any;
}

export interface ExcalidrawData {
  elements: ExcalidrawElement[];
  appState: ExcalidrawAppState;
  files: Record<string, any>; // Embedded images
}

// ============================================================================
// MERMAID TYPES
// ============================================================================

export type MermaidTheme = "default" | "dark" | "forest" | "neutral";

export type MermaidDiagramType =
  | "flowchart"
  | "class"
  | "sequence"
  | "entityRelationship"
  | "state"
  | "mindmap"
  | "architecture"
  | "block"
  | "c4"
  | "gantt"
  | "git"
  | "kanban"
  | "packet"
  | "pie"
  | "quadrant"
  | "radar"
  | "requirement"
  | "sankey"
  | "timeline"
  | "treemap"
  | "userJourney"
  | "xy"
  | "zenUML";

export interface MermaidConfig {
  mermaidVersion: string; // e.g., "10.6.0"
  theme: MermaidTheme;
  flowchart?: {
    curve?: "basis" | "linear" | "step";
  };
  sequence?: {
    actorMargin?: number;
    messageMargin?: number;
  };
}

export interface MermaidData {
  source: string; // Plain text Mermaid syntax
}

// ============================================================================
// DISCRIMINATED UNION
// ============================================================================

export type VisualizationPayloadData =
  | {
      engine: "diagrams-net";
      config: DiagramsNetConfig;
      data: DiagramsNetData;
    }
  | {
      engine: "excalidraw";
      config: ExcalidrawConfig;
      data: ExcalidrawData;
    }
  | {
      engine: "mermaid";
      config: MermaidConfig;
      data: MermaidData;
    };

// Type guards for narrowing
export function isDiagramsNet(
  payload: VisualizationPayloadData
): payload is Extract<VisualizationPayloadData, { engine: "diagrams-net" }> {
  return payload.engine === "diagrams-net";
}

export function isExcalidraw(
  payload: VisualizationPayloadData
): payload is Extract<VisualizationPayloadData, { engine: "excalidraw" }> {
  return payload.engine === "excalidraw";
}

export function isMermaid(
  payload: VisualizationPayloadData
): payload is Extract<VisualizationPayloadData, { engine: "mermaid" }> {
  return payload.engine === "mermaid";
}

// ============================================================================
// SAMPLE DIAGRAM TEMPLATES (MERMAID)
// ============================================================================

export const MERMAID_TEMPLATES: Record<
  MermaidDiagramType,
  { label: string; description: string; template: string }
> = {
  flowchart: {
    label: "Flowchart",
    description: "Flowcharts and process diagrams",
    template: `graph TD
    A[Start] --> B{Decision}
    B -->|Yes| C[Action 1]
    B -->|No| D[Action 2]
    C --> E[End]
    D --> E`,
  },
  class: {
    label: "Class",
    description: "UML class diagrams",
    template: `classDiagram
    class Animal {
        +String name
        +int age
        +makeSound()
    }
    class Dog {
        +bark()
    }
    Animal <|-- Dog`,
  },
  sequence: {
    label: "Sequence",
    description: "Sequence diagrams for interactions",
    template: `sequenceDiagram
    Alice->>John: Hello John, how are you?
    John-->>Alice: Great!
    Alice-)John: See you later!`,
  },
  entityRelationship: {
    label: "Entity Relationship",
    description: "Database ER diagrams",
    template: `erDiagram
    CUSTOMER ||--o{ ORDER : places
    ORDER ||--|{ LINE-ITEM : contains
    CUSTOMER }|..|{ DELIVERY-ADDRESS : uses`,
  },
  state: {
    label: "State",
    description: "State machine diagrams",
    template: `stateDiagram-v2
    [*] --> Still
    Still --> [*]
    Still --> Moving
    Moving --> Still
    Moving --> Crash
    Crash --> [*]`,
  },
  mindmap: {
    label: "Mindmap",
    description: "Mind mapping and brainstorming",
    template: `mindmap
  root((Digital Garden))
    Notes
      Rich Text
      Markdown
    Files
      Images
      Documents
    Visualizations
      Diagrams
      Charts`,
  },
  architecture: {
    label: "Architecture",
    description: "System architecture diagrams",
    template: `architecture-beta
    group api[API Layer]
    service db(database)[Database] in api
    service disk1(disk)[Storage] in api
    db:L -- R:disk1`,
  },
  block: {
    label: "Block",
    description: "Block diagrams",
    template: `block-beta
columns 1
  db(("DB"))
  blockArrowId6<[" "]>(down)
  block:ID
    A
    B["A wide one in the middle"]
    C
  end`,
  },
  c4: {
    label: "C4",
    description: "C4 model architecture",
    template: `C4Context
      title System Context diagram for Internet Banking System
      Person(customerA, "Banking Customer", "A customer of the bank")
      System(SystemAA, "Internet Banking System", "Allows customers to view information")
      customerA --> SystemAA : "Uses"`,
  },
  gantt: {
    label: "Gantt",
    description: "Project timelines",
    template: `gantt
    title Project Timeline
    section Phase 1
    Task 1           :a1, 2024-01-01, 30d
    Task 2           :after a1, 20d
    section Phase 2
    Task 3           :2024-02-01, 12d
    Task 4           :24d`,
  },
  git: {
    label: "Git",
    description: "Git branching diagrams",
    template: `gitGraph
   commit
   commit
   branch develop
   checkout develop
   commit
   commit
   checkout main
   merge develop
   commit`,
  },
  kanban: {
    label: "Kanban",
    description: "Kanban board layout",
    template: `kanban
    Todo
      [Item 1]
      [Item 2]
    In Progress
      [Item 3]
    Done
      [Item 4]
      [Item 5]`,
  },
  packet: {
    label: "Packet",
    description: "Network packet diagrams",
    template: `packet-beta
0-15: "Source Port"
16-31: "Destination Port"
32-63: "Sequence Number"
64-95: "Acknowledgment Number"`,
  },
  pie: {
    label: "Pie",
    description: "Pie charts",
    template: `pie title Pets adopted by volunteers
    "Dogs" : 386
    "Cats" : 85
    "Rats" : 15`,
  },
  quadrant: {
    label: "Quadrant",
    description: "Quadrant charts",
    template: `quadrantChart
    title Reach and engagement of campaigns
    x-axis Low Reach --> High Reach
    y-axis Low Engagement --> High Engagement
    quadrant-1 We should expand
    quadrant-2 Need to promote
    quadrant-3 Re-evaluate
    quadrant-4 May be improved
    Campaign A: [0.3, 0.6]
    Campaign B: [0.45, 0.23]`,
  },
  radar: {
    label: "Radar",
    description: "Radar/spider charts",
    template: `%%{init: {"theme": "forest"}}%%
radar
    title Skills Assessment
    "Design" : 80
    "Coding" : 90
    "Testing" : 70
    "Documentation" : 60
    "Communication" : 85`,
  },
  requirement: {
    label: "Requirement",
    description: "Requirements diagrams",
    template: `requirementDiagram
    requirement test_req {
    id: 1
    text: the test text.
    risk: high
    verifymethod: test
    }
    element test_entity {
    type: simulation
    }
    test_entity - satisfies -> test_req`,
  },
  sankey: {
    label: "Sankey",
    description: "Flow diagrams",
    template: `%%{init: {"theme": "base"}}%%
sankey-beta
Agricultural 'waste',Bio-conversion,124.729
Bio-conversion,Liquid,0.597`,
  },
  timeline: {
    label: "Timeline",
    description: "Timeline diagrams",
    template: `timeline
    title History of Social Media Platform
    2002 : LinkedIn
    2004 : Facebook
         : Google
    2005 : Youtube
    2006 : Twitter`,
  },
  treemap: {
    label: "Treemap",
    description: "Treemap visualizations",
    template: `%%{init: {"theme": "forest"}}%%
treemap
  title Ecosystem Research
  "Origin"
    "Bacteria"
      "Archaea"
      "Eubacteria"
    "Eukaryota"
      "Protista"
      "Fungi"
      "Plantae"
      "Animalia"`,
  },
  userJourney: {
    label: "User Journey",
    description: "User journey maps",
    template: `journey
    title My working day
    section Go to work
      Make tea: 5: Me
      Go upstairs: 3: Me
      Do work: 1: Me, Cat
    section Go home
      Go downstairs: 5: Me
      Sit down: 5: Me`,
  },
  xy: {
    label: "XY",
    description: "XY charts",
    template: `xychart-beta
    title "Sales Revenue"
    x-axis [jan, feb, mar, apr, may, jun]
    y-axis "Revenue (in $)" 4000 --> 11000
    bar [5000, 6000, 7500, 8200, 9500, 10500]
    line [5000, 6000, 7500, 8200, 9500, 10500]`,
  },
  zenUML: {
    label: "ZenUML",
    description: "Sequence diagrams (ZenUML syntax)",
    template: `zenuml
    title Order Service
    @Actor Client
    @Boundary OrderController
    @EC2 OrderService
    Client.order() {
      OrderController.post() {
        OrderService.create()
      }
    }`,
  },
};
