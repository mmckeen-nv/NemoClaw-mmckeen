// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import {
  getConfiguredModelCatalog,
  isLocalEndpointType,
  type NemoClawOnboardConfig,
} from "./config.js";

function config(overrides: Partial<NemoClawOnboardConfig> = {}): NemoClawOnboardConfig {
  return {
    endpointType: "ollama",
    endpointUrl: "http://host.openshell.internal:11434/v1",
    ncpPartner: null,
    model: "nemotron-3-nano:30b",
    profile: "ollama",
    credentialEnv: "OPENAI_API_KEY",
    provider: "ollama-local",
    providerLabel: "Local Ollama",
    onboardedAt: "2026-03-20T22:08:00.000Z",
    ...overrides,
  };
}

describe("onboard config helpers", () => {
  it("identifies local endpoint types", () => {
    expect(isLocalEndpointType("ollama")).toBe(true);
    expect(isLocalEndpointType("vllm")).toBe(true);
    expect(isLocalEndpointType("nim-local")).toBe(true);
    expect(isLocalEndpointType("build")).toBe(false);
    expect(isLocalEndpointType("ncp")).toBe(false);
  });

  it("returns the selected model first and de-duplicates the catalog", () => {
    expect(
      getConfiguredModelCatalog(
        config({
          availableModels: ["llama3.3:70b", "nemotron-3-nano:30b", "llama3.3:70b", "qwen2.5:32b"],
        }),
      ),
    ).toEqual(["nemotron-3-nano:30b", "llama3.3:70b", "qwen2.5:32b"]);
  });

  it("falls back to the primary model when no catalog is stored", () => {
    expect(getConfiguredModelCatalog(config({ availableModels: undefined }))).toEqual([
      "nemotron-3-nano:30b",
    ]);
  });
});
