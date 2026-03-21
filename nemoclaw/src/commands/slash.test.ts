// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { beforeEach, describe, expect, it, vi } from "vitest";
import { handleSlashCommand } from "./slash.js";
import { loadState } from "../blueprint/state.js";
import { loadOnboardConfig } from "../onboard/config.js";
import { getInferenceStatus } from "./onboard-status.js";
import { cliSetLocalModel } from "./set-local-model.js";
import { cliRestoreLocalModel } from "./restore-local-model.js";

vi.mock("../blueprint/state.js", () => ({
  loadState: vi.fn(),
}));

vi.mock("../onboard/config.js", async () => {
  const actual = await vi.importActual<typeof import("../onboard/config.js")>("../onboard/config.js");
  return {
    ...actual,
    loadOnboardConfig: vi.fn(),
  };
});

vi.mock("./onboard-status.js", () => ({
  getInferenceStatus: vi.fn(),
}));

vi.mock("./set-local-model.js", () => ({
  cliSetLocalModel: vi.fn(),
}));

vi.mock("./restore-local-model.js", () => ({
  cliRestoreLocalModel: vi.fn(),
}));

describe("/nemoclaw slash command", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(loadState).mockReturnValue({
      lastAction: "onboard",
      lastRunId: "run-123",
      blueprintVersion: "1.2.3",
      sandboxName: "openclaw",
      migrationSnapshot: null,
      hostBackupPath: null,
      updatedAt: "2026-03-20T23:31:00.000Z",
    });
    vi.mocked(loadOnboardConfig).mockReturnValue(null);
    vi.mocked(getInferenceStatus).mockResolvedValue({
      configured: false,
      provider: null,
      model: null,
      endpoint: null,
    });
  });

  it("includes local workflow metadata in status for local onboarding", async () => {
    vi.mocked(loadOnboardConfig).mockReturnValue({
      endpointType: "ollama",
      endpointUrl: "http://host.openshell.internal:11434/v1",
      ncpPartner: null,
      model: "qwen3:32b",
      profile: "ollama",
      credentialEnv: "OPENAI_API_KEY",
      provider: "ollama-local",
      providerLabel: "Local Ollama",
      availableModels: ["nemotron-3-nano:30b", "qwen3:32b"],
      onboardedAt: "2026-03-20T22:00:00.000Z",
    });

    const result = await handleSlashCommand({ args: "status" }, {} as never);

    expect(result.text).toContain("**Onboarding**");
    expect(result.text).toContain("Endpoint: ollama (http://host.openshell.internal:11434/v1)");
    expect(result.text).toContain("Provider: Local Ollama");
    expect(result.text).toContain("Catalog: qwen3:32b, nemotron-3-nano:30b");
    expect(result.text).toContain("**Local Model Workflow**");
    expect(result.text).toContain("Default: qwen3:32b");
    expect(result.text).toContain("Active: qwen3:32b (saved default)");
    expect(result.text).toContain("Provider: Local Ollama (ollama-local)");
    expect(result.text).toContain("Endpoint: http://host.openshell.internal:11434/v1");
    expect(result.text).toContain("Source: onboarding");
    expect(result.text).toContain("Drift: none");
    expect(result.text).toContain("Catalog: active route is in saved catalog");
    expect(result.text).toContain("Saved Models: qwen3:32b, nemotron-3-nano:30b");
  });

  it("keeps cloud onboarding free of local workflow lines", async () => {
    vi.mocked(loadOnboardConfig).mockReturnValue({
      endpointType: "build",
      endpointUrl: "https://integrate.api.nvidia.com/v1",
      ncpPartner: null,
      model: "nvidia/nemotron-3-super-120b-a12b",
      profile: "build",
      credentialEnv: "NVIDIA_API_KEY",
      provider: "nvidia",
      providerLabel: "NVIDIA Cloud API",
      onboardedAt: "2026-03-20T22:00:00.000Z",
    });

    const result = await handleSlashCommand({ args: "status" }, {} as never);

    expect(result.text).toContain("**Onboarding**");
    expect(result.text).not.toContain("**Local Model Workflow**");
    expect(result.text).not.toContain("Drift:");
  });

  it("includes local workflow metadata in onboard status for local onboarding", async () => {
    vi.mocked(loadOnboardConfig).mockReturnValue({
      endpointType: "ollama",
      endpointUrl: "http://host.openshell.internal:11434/v1",
      ncpPartner: null,
      model: "qwen3:32b",
      profile: "ollama",
      credentialEnv: "OPENAI_API_KEY",
      provider: "ollama-local",
      providerLabel: "Local Ollama",
      availableModels: ["nemotron-3-nano:30b", "qwen3:32b"],
      onboardedAt: "2026-03-20T22:00:00.000Z",
    });

    const result = await handleSlashCommand({ args: "onboard" }, {} as never);

    expect(result.text).toContain("**NemoClaw Onboard Status**");
    expect(result.text).toContain("**Local Model Workflow**");
    expect(result.text).toContain("Default: qwen3:32b");
    expect(result.text).toContain("Provider: Local Ollama (ollama-local)");
    expect(result.text).toContain("Endpoint: http://host.openshell.internal:11434/v1");
    expect(result.text).toContain("Catalog: active route is in saved catalog");
    expect(result.text).toContain("Saved Models: qwen3:32b, nemotron-3-nano:30b");
  });

  it("shows live local route drift in slash status when OpenShell inference differs from the saved default", async () => {
    vi.mocked(loadOnboardConfig).mockReturnValue({
      endpointType: "ollama",
      endpointUrl: "http://host.openshell.internal:11434/v1",
      ncpPartner: null,
      model: "qwen3:32b",
      profile: "ollama",
      credentialEnv: "OPENAI_API_KEY",
      provider: "ollama-local",
      providerLabel: "Local Ollama",
      availableModels: ["nemotron-3-nano:30b", "qwen3:32b"],
      onboardedAt: "2026-03-20T22:00:00.000Z",
    });
    vi.mocked(getInferenceStatus).mockResolvedValue({
      configured: true,
      provider: "vllm-local",
      model: "nemotron-3-nano:30b",
      endpoint: "http://host.openshell.internal:8000/v1",
    });

    const result = await handleSlashCommand({ args: "status" }, {} as never);

    expect(result.text).toContain("Active: nemotron-3-nano:30b");
    expect(result.text).not.toContain("Active: nemotron-3-nano:30b (saved default)");
    expect(result.text).toContain("Provider: Local vLLM (vllm-local)");
    expect(result.text).toContain("Endpoint: http://host.openshell.internal:8000/v1");
    expect(result.text).toContain("Source: inference");
    expect(result.text).toContain(
      "Drift: active model differs from saved default; provider differs from saved onboarding provider; endpoint differs from saved onboarding endpoint",
    );
  });

  it("routes slash set-local-model through the local model command", async () => {
    vi.mocked(cliSetLocalModel).mockImplementation(({ logger }) => {
      logger.info("NemoClaw Local Model Route");
      logger.info("Active:   nemotron-3-nano:30b");
    });

    const result = await handleSlashCommand(
      { args: "set-local-model nemotron-3-nano:30b --allow-outside-catalog" },
      {} as never,
    );

    expect(cliSetLocalModel).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "nemotron-3-nano:30b",
        allowOutsideCatalog: true,
        json: false,
      }),
    );
    expect(result.text).toContain("NemoClaw Local Model Route");
    expect(result.text).toContain("Active:   nemotron-3-nano:30b");
  });

  it("routes slash restore-local-model through the restore command", async () => {
    vi.mocked(cliRestoreLocalModel).mockImplementation(({ logger }) => {
      logger.info("NemoClaw Local Model Route");
      logger.info("Active:   qwen3:32b");
    });

    const result = await handleSlashCommand({ args: "restore-local-model" }, {} as never);

    expect(cliRestoreLocalModel).toHaveBeenCalledWith(
      expect.objectContaining({
        json: false,
      }),
    );
    expect(result.text).toContain("NemoClaw Local Model Route");
    expect(result.text).toContain("Active:   qwen3:32b");
  });

  it("shows usage when slash set-local-model is missing the model argument", async () => {
    const result = await handleSlashCommand({ args: "set-local-model" }, {} as never);

    expect(cliSetLocalModel).not.toHaveBeenCalled();
    expect(result.text).toContain("Usage: `/nemoclaw set-local-model <model> [--allow-outside-catalog]`");
  });
});
