/**
 * AI Middleware System
 *
 * Composes middleware transformations onto a language model.
 * Uses AI SDK v6's wrapLanguageModel() for composable model wrapping.
 */

import {
  wrapLanguageModel,
  type LanguageModel,
  type LanguageModelMiddleware,
} from "ai";

export { defaultSettingsMiddleware } from "./default-settings";

/** The concrete model type that wrapLanguageModel accepts. */
type ConcreteModel = Parameters<typeof wrapLanguageModel>[0]["model"];

/**
 * Applies a stack of middleware to a language model.
 *
 * Accepts the broad LanguageModel type (which includes string model IDs)
 * but narrows to the concrete model object that wrapLanguageModel requires.
 * Our providers always return concrete model objects, never string IDs.
 */
export function applyMiddleware(
  model: LanguageModel,
  middlewares: LanguageModelMiddleware[]
): LanguageModel {
  return wrapLanguageModel({
    model: model as ConcreteModel,
    middleware: middlewares,
  });
}
