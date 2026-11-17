import type { CrmConfig } from "@/lib/domain/crm/config";
import { n8nCrmAutomation } from "./n8n";
import { simulatorCrmAutomation } from "./simulator";
import type { CrmAutomationAdapter } from "./types";

/** Server-only. A business picks its executor in `CrmConfig.automation.engine`. */
const CRM_AUTOMATION_REGISTRY: Record<string, CrmAutomationAdapter> = {
  [simulatorCrmAutomation.id]: simulatorCrmAutomation,
  [n8nCrmAutomation.id]: n8nCrmAutomation,
};

export function getCrmAutomation(config: CrmConfig): CrmAutomationAdapter {
  return CRM_AUTOMATION_REGISTRY[config.automation.engine] ?? simulatorCrmAutomation;
}

export function describeCrmAutomation(config: CrmConfig): {
  engine: string;
  label: string;
  simulated: boolean;
} {
  const adapter = getCrmAutomation(config);
  return { engine: adapter.id, label: adapter.label, simulated: adapter.simulated };
}
