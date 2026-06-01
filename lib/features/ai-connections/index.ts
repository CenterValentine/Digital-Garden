/**
 * AI Connections module — barrel.
 *
 * The "Connection" is the universal unit of AI provider configuration.
 * See `./types.ts` for the data shape and `./service.ts` for CRUD.
 * `./templates.ts` ships the built-in presets the settings UI uses.
 */

export type {
  AdapterKind,
  ConnectionKind,
  ConnectionModel,
  ConnectionRow,
  ConnectionView,
  ConnectionWithKey,
  CreateConnectionInput,
  UpdateConnectionPatch,
} from "./types";

export {
  ConnectionNotFoundError,
  createConnection,
  deleteConnection,
  getConnection,
  getConnectionWithKey,
  listConnections,
  updateConnection,
} from "./service";

export {
  CONNECTION_TEMPLATES,
  DIRECT_TEMPLATES,
  GATEWAY_TEMPLATES,
  TEMPLATE_BY_ID,
  lookupTemplate,
  type ConnectionTemplate,
} from "./templates";

export {
  fetchUpstreamModels,
  ModelFetchError,
  type FetchedModel,
} from "./fetch-models";

export {
  getConnectionUsage,
  type UsageReport,
  type UsageSource,
  type UsageBudget,
  type UsageMoney,
  type UsagePeriod,
  type UsageTokens,
  type ModelUsageRow,
  type ProviderUsageRow,
} from "./usage";
