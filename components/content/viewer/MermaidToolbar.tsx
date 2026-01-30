/**
 * Mermaid Toolbar Component
 *
 * Features:
 * - Sample diagram templates dropdown
 * - Export dropdown (PNG, SVG, Markdown)
 * - Full view button (opens new browser tab)
 * - Auto-save indicator
 */

"use client";

import { Download, ExternalLink, Shapes } from "lucide-react";
import { Button } from "@/components/ui/glass/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/client/ui/dropdown-menu";

// Mermaid diagram templates
const DIAGRAM_TEMPLATES = {
  flowchart: `graph TD
    A[Start] --> B{Decision}
    B -->|Yes| C[Action 1]
    B -->|No| D[Action 2]
    C --> E[End]
    D --> E`,

  class: `classDiagram
    class Animal {
        +String name
        +int age
        +makeSound()
    }
    class Dog {
        +bark()
    }
    Animal <|-- Dog`,

  sequence: `sequenceDiagram
    Alice->>John: Hello John, how are you?
    John-->>Alice: Great!
    Alice-)John: See you later!`,

  entityRelationship: `erDiagram
    CUSTOMER ||--o{ ORDER : places
    ORDER ||--|{ LINE-ITEM : contains
    CUSTOMER }|..|{ DELIVERY-ADDRESS : uses`,

  state: `stateDiagram-v2
    [*] --> Still
    Still --> [*]
    Still --> Moving
    Moving --> Still
    Moving --> Crash
    Crash --> [*]`,

  mindmap: `mindmap
  root((Digital Garden))
    Notes
      Daily
      Projects
      Ideas
    Tasks
      Todo
      In Progress
      Done
    Resources
      Links
      Files`,

  architecture: `C4Context
    title System Context diagram for Internet Banking System
    Person(customer, "Customer", "A customer of the bank")
    System(banking, "Internet Banking", "Allows customers to view information about their accounts")
    System_Ext(email, "Email System", "Sends emails to customers")
    Rel(customer, banking, "Uses")
    Rel(banking, email, "Sends emails", "SMTP")`,

  block: `block-beta
    columns 3
    A B C
    D E F
    G H I`,

  c4: `C4Component
    title Component diagram for Internet Banking System
    Container_Boundary(c1, "Single-Page App") {
        Component(sign, "Sign In Controller", "MVC Controller", "Allows users to sign in")
        Component(accounts, "Accounts Summary Controller", "MVC Controller", "Provides customers with summary")
    }`,

  gantt: `gantt
    title Project Timeline
    dateFormat YYYY-MM-DD
    section Phase 1
    Task 1           :a1, 2024-01-01, 30d
    Task 2           :after a1, 20d
    section Phase 2
    Task 3           :2024-02-01, 12d
    Task 4           :24d`,

  git: `gitGraph
    commit
    branch develop
    checkout develop
    commit
    commit
    checkout main
    merge develop
    commit`,

  kanban: `kanban
    Todo
      Item 1
      Item 2
    In Progress
      Item 3
    Done
      Item 4
      Item 5`,

  packet: `packet-beta
    0-15: "Source Port"
    16-31: "Destination Port"
    32-63: "Sequence Number"
    64-95: "Acknowledgment Number"`,

  pie: `pie title Pets adopted by volunteers
    "Dogs" : 386
    "Cats" : 85
    "Rats" : 15`,

  quadrant: `quadrantChart
    title Reach and engagement of campaigns
    x-axis Low Reach --> High Reach
    y-axis Low Engagement --> High Engagement
    quadrant-1 We should expand
    quadrant-2 Need to promote
    quadrant-3 Re-evaluate
    quadrant-4 May be improved
    Campaign A: [0.3, 0.6]
    Campaign B: [0.45, 0.23]`,

  radar: `%%{init: {'theme':'dark'}}%%
    radarChart
    title Skills Assessment
    "Communication" [80]
    "Technical" [90]
    "Leadership" [70]
    "Problem Solving" [85]
    "Creativity" [75]`,

  requirement: `requirementDiagram
    requirement test_req {
        id: 1
        text: System shall process requests
        risk: high
        verifymethod: test
    }`,

  sankey: `%%{init: {'theme':'dark'}}%%
    sankey-beta
    Agricultural 'waste',Bio-conversion,124.729
    Bio-conversion,Liquid,0.597
    Bio-conversion,Losses,26.862
    Bio-conversion,Solid,280.322
    Bio-conversion,Gas,81.144`,
};

interface MermaidToolbarProps {
  onExport: (format: "png" | "svg" | "md") => void;
  onFullView: () => void;
  onInsertTemplate?: (template: string) => void;
  isModified: boolean;
  isSaving: boolean;
  isEditMode?: boolean;
  isFullScreen?: boolean;
}

export function MermaidToolbar({
  onExport,
  onFullView,
  onInsertTemplate,
  isModified,
  isSaving,
  isEditMode = false,
  isFullScreen = false,
}: MermaidToolbarProps) {
  return (
    <div className="flex items-center justify-between border-t px-4 py-3 bg-gray-50">
      <div className="flex items-center gap-2">
        {/* Auto-save status (text) */}
        <span className="text-xs text-gray-500">
          {isSaving && "• Saving..."}
          {!isSaving && isModified && "• Unsaved changes"}
          {!isSaving && !isModified && "• All changes saved"}
        </span>
      </div>

      <div className="flex items-center gap-2">
        {/* Sample Diagrams Dropdown (only in edit mode) */}
        {isEditMode && onInsertTemplate && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm">
                <Shapes className="h-4 w-4 mr-2" />
                <span className="hidden sm:inline">Sample Diagrams</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="max-h-[400px] overflow-y-auto">
              <DropdownMenuLabel>Basic Diagrams</DropdownMenuLabel>
              <DropdownMenuItem onClick={() => onInsertTemplate(DIAGRAM_TEMPLATES.flowchart)}>
                Flowchart
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onInsertTemplate(DIAGRAM_TEMPLATES.class)}>
                Class
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onInsertTemplate(DIAGRAM_TEMPLATES.sequence)}>
                Sequence
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onInsertTemplate(DIAGRAM_TEMPLATES.entityRelationship)}>
                Entity Relationship
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onInsertTemplate(DIAGRAM_TEMPLATES.state)}>
                State
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onInsertTemplate(DIAGRAM_TEMPLATES.mindmap)}>
                Mindmap
              </DropdownMenuItem>

              <DropdownMenuSeparator />
              <DropdownMenuLabel>Advanced Diagrams</DropdownMenuLabel>
              <DropdownMenuItem onClick={() => onInsertTemplate(DIAGRAM_TEMPLATES.architecture)}>
                Architecture
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onInsertTemplate(DIAGRAM_TEMPLATES.block)}>
                Block
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onInsertTemplate(DIAGRAM_TEMPLATES.c4)}>
                C4
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onInsertTemplate(DIAGRAM_TEMPLATES.gantt)}>
                Gantt
              </DropdownMenuItem>

              <DropdownMenuSeparator />
              <DropdownMenuLabel>Specialized Diagrams</DropdownMenuLabel>
              <DropdownMenuItem onClick={() => onInsertTemplate(DIAGRAM_TEMPLATES.git)}>
                Git
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onInsertTemplate(DIAGRAM_TEMPLATES.kanban)}>
                Kanban
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onInsertTemplate(DIAGRAM_TEMPLATES.packet)}>
                Packet
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onInsertTemplate(DIAGRAM_TEMPLATES.pie)}>
                Pie
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onInsertTemplate(DIAGRAM_TEMPLATES.quadrant)}>
                Quadrant
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onInsertTemplate(DIAGRAM_TEMPLATES.radar)}>
                Radar
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onInsertTemplate(DIAGRAM_TEMPLATES.requirement)}>
                Requirement
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onInsertTemplate(DIAGRAM_TEMPLATES.sankey)}>
                Sankey
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        {/* Export Dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm">
              <Download className="h-4 w-4 mr-2" />
              <span className="hidden sm:inline">Export</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => onExport("png")}>
              <span className="mr-2">🖼️</span>
              Export as PNG
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onExport("svg")}>
              <span className="mr-2">🎨</span>
              Export as SVG
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onExport("md")}>
              <span className="mr-2">📝</span>
              Export as Markdown
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Full View Button (hide in fullscreen) */}
        {!isFullScreen && (
          <Button onClick={onFullView} variant="ghost" size="sm" type="button">
            <ExternalLink className="h-4 w-4 mr-2" />
            <span className="hidden sm:inline">Full View</span>
          </Button>
        )}
      </div>
    </div>
  );
}
