import type { CrmAutomationAdapter } from "./types";

/**
 * Local stand-in for n8n. Nothing leaves the process: "telling the
 * executor" is a recorded no-op, so the visible behaviour — status flips,
 * activity entries, idempotent replays — is exactly what the real executor
 * path produces, minus the network call.
 */
export const simulatorCrmAutomation: CrmAutomationAdapter = {
  id: "simulator",
  label: "Local simulator (stands in for n8n)",
  simulated: true,
  async pauseFollowUp(ref) {
    return {
      delivered: true,
      detail: `Simulator: the timed follow-up for “${ref.opportunityTitle}” was cancelled. No text will be sent.`,
    };
  },
};
