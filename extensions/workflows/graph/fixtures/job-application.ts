/**
 * Job-application research expressed as a user-authorable graph — the
 * parity fixture for the Builder + Interpreter plan. This graph reproduces
 * Plan 1's hardened jobApplicationWorkflow using only palette nodes, and
 * ships as a starter template in Session 5 (when the code recipe retires).
 */

import type { WorkflowGraph } from "../schema";

export const jobApplicationGraph: WorkflowGraph = {
  version: 1,
  engine: "wdk-interpreter@1",
  entryNodeId: "capture",
  nodes: [
    {
      id: "capture",
      type: "trigger-page-capture",
      label: "On job page capture",
      config: { urlPattern: "" },
    },
    {
      id: "listing",
      type: "get-content",
      label: "Read captured listing",
      config: { contentNodeId: "{{input.captureNodeId}}" },
    },
    {
      id: "research",
      type: "ai-complete",
      label: "Research the company",
      config: {
        system:
          "You are a job-application research analyst. Respond with ONLY a JSON object.",
        prompt:
          'Analyze this job listing and respond with JSON {"companyName": string, "summary": string (<=500 chars), "highlights": string[]}.\n\nListing from {{input.pageUrl}}:\n\n{{listing.text}}',
        expectJson: true,
        maxOutputTokens: 700,
      },
    },
    {
      id: "match",
      type: "ai-complete",
      label: "Score the fit",
      config: {
        system:
          "You are a candidate-fit analyst. Respond with ONLY a JSON object.",
        prompt:
          'Given this company research: {{research.json.summary}}\nHighlights: {{research.json.highlights}}\n\nAssess the role\'s demands and respond with JSON {"score": number (0-100), "strengths": string[], "concerns": string[]}.',
        expectJson: true,
        maxOutputTokens: 500,
      },
    },
    {
      id: "review",
      type: "gate",
      label: "Review the match",
      config: {
        title: "Job match ready — {{match.json.score}}% fit",
        body: "{{research.json.summary}}",
      },
    },
    {
      id: "approved",
      type: "branch",
      label: "Approved?",
      config: { path: "review.approved", operator: "truthy" },
    },
    {
      id: "dossier",
      type: "export-docx",
      label: "Export dossier",
      config: {
        title: "{{research.json.companyName}} application dossier",
        body: "# {{research.json.companyName}} — Job Application Dossier\n\n## Company Research\n\n{{research.json.summary}}\n\n## Match Report\n\nFit score: {{match.json.score}}/100\n\n## Source\n\n{{input.pageUrl}}",
      },
    },
    {
      id: "done",
      type: "notify",
      label: "Tell me it's filed",
      config: {
        title: "Dossier ready — {{research.json.companyName}}",
        body: "Saved to your Job Applications folder.",
      },
    },
  ],
  edges: [
    { id: "e0", from: "capture", to: "listing" },
    { id: "e1", from: "listing", to: "research" },
    { id: "e2", from: "research", to: "match" },
    { id: "e3", from: "match", to: "review" },
    { id: "e4", from: "review", to: "approved" },
    { id: "e5", from: "approved", to: "dossier", branch: "true" },
    { id: "e6", from: "dossier", to: "done" },
  ],
};

/**
 * Starter variant (manual entry): swaps the page-capture trigger for a
 * Manual trigger and the get-content step for fetch-url ({{input.pageUrl}}),
 * so it runs standalone from the builder's Run form. The capture variant
 * above remains the extension-capture template.
 */
export const jobApplicationStarterGraph: WorkflowGraph = {
  ...jobApplicationGraph,
  entryNodeId: "trigger",
  nodes: jobApplicationGraph.nodes.map((node) => {
    if (node.id === "capture") {
      return {
        id: "trigger",
        type: "trigger-manual",
        label: "Run manually",
        config: { inputs: "pageUrl" },
      };
    }
    if (node.id === "listing") {
      return {
        ...node,
        type: "fetch-url",
        label: "Fetch the listing",
        config: { url: "{{input.pageUrl}}" },
      };
    }
    return node;
  }),
  edges: jobApplicationGraph.edges.map((edge) =>
    edge.from === "capture" ? { ...edge, from: "trigger" } : edge
  ),
};
