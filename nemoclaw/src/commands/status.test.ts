// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NemoClawState } from "../blueprint/state.js";
import type { PluginLogger, NemoClawConfig } from "../index.js";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// Mock node:fs — controls isInsideSandbox() detection
vi.mock("node:fs", () => ({
  existsSync: vi.fn(() => false),
}));

// Mock node:child_process — controls openshell command results
vi.mock("node:child_process", () => ({
  exec: vi.fn(),
}));

// Mock state loader — controls plugin state
vi.mock("../blueprint/state.js", () => ({
  loadState: vi.fn(),
}));

vi.mock("../onboard/config.js", async () => {
  const actual = await vi.importActual<typeof import("../onboard/config.js")>("../onboard/config.js");
  return {
    ...actual,
    loadOnboardConfig: vi.fn(() => null),
  };
});

// Import after mocks are set up
const { existsSync } = await import("node:fs");
const { exec } = await import("node:child_process");
const { loadState } = await import("../blueprint/state.js");
const { loadOnboardConfig } = await import("../onboard/config.js");
const { cliStatus } = await import("./status.js");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function blankState(): NemoClawState {
  return {
    lastRunId: null,
    lastAction: null,
    blueprintVersion: null,
    sandboxName: null,
    migrationSnapshot: null,
    hostBackupPath: null,
    createdAt: null,
    updatedAt: new Date().toISOString(),
  };
}

function populatedState(): NemoClawState {
  return {
    lastRunId: "run-a1b2c3d4",
    lastAction: "migrate",
    blueprintVersion: "0.1.0",
    sandboxName: "openclaw",
    migrationSnapshot: "/root/.nemoclaw/snapshots/pre-migrate.tar.gz",
    hostBackupPath: "/root/.nemoclaw/backups/host-backup",
    createdAt: "2026-03-15T10:30:00.000Z",
    updatedAt: "2026-03-15T10:32:45.000Z",
  };
}

const defaultConfig: NemoClawConfig = {
  blueprintVersion: "latest",
  blueprintRegistry: "ghcr.io/nvidia/nemoclaw-blueprint",
  sandboxName: "openclaw",
  inferenceProvider: "nvidia",
};

/** Create a logger that captures all info() calls into an array. */
function captureLogger(): { lines: string[]; logger: PluginLogger } {
  const lines: string[] = [];
  return {
    lines,
    logger: {
      info: (msg: string) => lines.push(msg),
      warn: (msg: string) => lines.push(`WARN: ${msg}`),
      error: (msg: string) => lines.push(`ERROR: ${msg}`),
      debug: (_msg: string) => {},
    },
  };
}

/**
 * Make the exec mock resolve with the given stdout, or reject if error is set.
 * Routes by command substring so sandbox and inference calls can differ.
 */
function mockExec(responses: Record<string, string | Error>): void {
  vi.mocked(exec).mockImplementation(((
    cmd: string,
    _opts: unknown,
    callback?: (err: Error | null, result: { stdout: string; stderr: string }) => void,
  ) => {
    // promisify(exec)(cmd, opts) calls exec(cmd, opts, callback)
    for (const [substring, response] of Object.entries(responses)) {
      if (cmd.includes(substring)) {
        if (response instanceof Error) {
          callback?.(response, { stdout: "", stderr: response.message });
        } else {
          callback?.(null, { stdout: response, stderr: "" });
        }
        return;
      }
    }
    // Default: command not found
    callback?.(new Error(`command not found: ${cmd}`), { stdout: "", stderr: "" });
  }) as typeof exec);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(existsSync).mockReturnValue(false);
  vi.mocked(loadState).mockReturnValue(blankState());
  vi.mocked(loadOnboardConfig).mockReturnValue(null);
  mockExec({});
});

describe("cliStatus", () => {
  // =========================================================================
  // Scenario 1: Host — no openshell, blank state
  // =========================================================================
  describe("host — no openshell, blank state", () => {
    it("shows OpenShell CLI availability issues in text output", async () => {
      const { lines, logger } = captureLogger();

      await cliStatus({ json: false, logger, pluginConfig: defaultConfig });

      const output = lines.join("\n");
      expect(output).toContain("Status:  unable to query live sandbox state");
      expect(output).toContain("Status:  unable to query live route");
      expect(output).toContain("command not found: openshell sandbox status openclaw --json");
      expect(output).toContain("command not found: openshell inference get --json");
      expect(output).not.toContain("inside sandbox");
      expect(output).not.toContain("active (inside sandbox)");
    });

    it("includes insideSandbox: false in JSON output", async () => {
      const { lines, logger } = captureLogger();

      await cliStatus({ json: true, logger, pluginConfig: defaultConfig });

      const data = JSON.parse(lines.join(""));
      expect(data.setup).toEqual({
        configure: {
          command: "openclaw nemoclaw onboard",
          argv: ["openclaw", "nemoclaw", "onboard"],
          description: "Launch NemoClaw onboarding to create the first saved inference configuration.",
          mode: "initial-setup",
          stateScope: "saved-onboarding-config",
          mutatesSavedDefault: true,
        },
      });
      expect(data.insideSandbox).toBe(false);
      expect(data.sandbox.insideSandbox).toBe(false);
      expect(data.sandbox.running).toBe(false);
      expect(data.sandbox.query.code).toBe("query-failed");
      expect(data.inference.insideSandbox).toBe(false);
      expect(data.inference.configured).toBe(false);
    });

    it("shows 'No operations have been performed yet'", async () => {
      const { lines, logger } = captureLogger();

      await cliStatus({ json: false, logger, pluginConfig: defaultConfig });

      expect(lines.join("\n")).toContain("No operations have been performed yet.");
    });
  });

  // =========================================================================
  // Scenario 2: Host — sandbox running, inference configured
  // =========================================================================
  describe("host — sandbox running, inference configured", () => {
    beforeEach(() => {
      mockExec({
        "sandbox status": JSON.stringify({ state: "running", uptime: "2h 14m" }),
        "inference get": JSON.stringify({
          provider: "nvidia",
          model: "nemotron-3-super-120b",
          endpoint: "https://integrate.api.nvidia.com",
        }),
      });
    });

    it("shows saved local model catalog from onboarding when present", async () => {
      vi.mocked(loadOnboardConfig).mockReturnValue({
        endpointType: "ollama",
        endpointUrl: "http://host.openshell.internal:11434/v1",
        ncpPartner: null,
        model: "qwen3:32b",
        profile: "ollama",
        credentialEnv: "OPENAI_API_KEY",
        provider: "ollama-local",
        providerLabel: "Local Ollama",
        availableModels: ["qwen3:32b", "nemotron-3-nano:30b"],
        onboardedAt: "2026-03-20T22:00:00.000Z",
      });

      const { lines, logger } = captureLogger();

      await cliStatus({ json: false, logger, pluginConfig: defaultConfig });

      const output = lines.join("\n");
      expect(output).toContain("Onboarding:");
      expect(output).toContain("Endpoint:  ollama (http://host.openshell.internal:11434/v1)");
      expect(output).toContain("Provider:  Local Ollama");
      expect(output).toContain("Model:     qwen3:32b");
      expect(output).toContain("Catalog:   qwen3:32b, nemotron-3-nano:30b");
      expect(output).toContain("Saved as the local default/catalog for future dashboard control-plane reads.");
    });

    it("includes onboarding local catalog metadata in JSON output", async () => {
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

      const { lines, logger } = captureLogger();

      await cliStatus({ json: true, logger, pluginConfig: defaultConfig });

      const data = JSON.parse(lines.join(""));
      expect(data.setup).toEqual({
        configure: {
          command: "openclaw nemoclaw onboard",
          argv: ["openclaw", "nemoclaw", "onboard"],
          description: "Launch NemoClaw onboarding to create or update the saved inference configuration.",
          mode: "reconfigure",
          stateScope: "saved-onboarding-config",
          mutatesSavedDefault: true,
        },
      });
      expect(data.onboarding).toEqual({
        endpoint: "ollama (http://host.openshell.internal:11434/v1)",
        endpointUrl: "http://host.openshell.internal:11434/v1",
        provider: "Local Ollama",
        providerName: "ollama-local",
        endpointType: "ollama",
        model: "qwen3:32b",
        credentialEnv: "OPENAI_API_KEY",
        profile: "ollama",
        ncpPartner: null,
        localModelCatalog: ["qwen3:32b", "nemotron-3-nano:30b"],
        isLocalEndpoint: true,
        onboardedAt: "2026-03-20T22:00:00.000Z",
        actions: {
          configure: {
            command: "openclaw nemoclaw onboard",
            argv: ["openclaw", "nemoclaw", "onboard"],
            description: "Launch NemoClaw onboarding to create or update the saved inference configuration.",
            mode: "reconfigure",
            stateScope: "saved-onboarding-config",
            mutatesSavedDefault: true,
          },
        },
      });
      expect(data.localModelWorkflow).toEqual({
        enabled: true,
        liveRouteStatus: "live-openshell",
        selectionScope: "sandbox-global",
        selectionMode: "single-active-route",
        provider: "nvidia",
        providerLabel: "nvidia",
        savedProvider: "ollama-local",
        savedProviderLabel: "Local Ollama",
        endpointType: "ollama",
        endpoint: "https://integrate.api.nvidia.com",
        savedEndpointType: "ollama",
        savedEndpoint: "http://host.openshell.internal:11434/v1",
        defaultModel: "qwen3:32b",
        activeModel: "nemotron-3-super-120b",
        activeModelSource: "inference",
        activeModelMatchesDefault: false,
        activeModelInCatalog: false,
        drift: {
          any: true,
          activeModelDiffersFromDefault: true,
          activeModelOutsideCatalog: true,
          providerDiffersFromOnboarding: true,
          endpointDiffersFromOnboarding: true,
        },
        catalog: ["qwen3:32b", "nemotron-3-nano:30b"],
        choices: [
          {
            model: "qwen3:32b",
            label: "qwen3:32b",
            badges: ["default"],
            summary: "default",
            isDefault: true,
            isActive: false,
          isSelectable: true,
          selectableReason: "would-change-target-route",
          routeChange: { any: true, model: true, provider: true, endpoint: true },
            inCatalog: true,
            source: "default",
            command: 'openclaw nemoclaw set-local-model "qwen3:32b" --json',
            argv: ["openclaw", "nemoclaw", "set-local-model", "qwen3:32b", "--json"],
            requiresAllowOutsideCatalog: false,
            targetProvider: "ollama-local",
            targetProviderLabel: "Local Ollama",
          targetEndpoint: "http://host.openshell.internal:11434/v1",
          targetEndpointType: "ollama",
          },
          {
            model: "nemotron-3-nano:30b",
            label: "nemotron-3-nano:30b",
            badges: [],
            summary: "catalog",
            isDefault: false,
            isActive: false,
          isSelectable: true,
          selectableReason: "would-change-target-route",
          routeChange: { any: true, model: true, provider: true, endpoint: true },
            inCatalog: true,
            source: "catalog",
            command: 'openclaw nemoclaw set-local-model "nemotron-3-nano:30b" --json',
            argv: ["openclaw", "nemoclaw", "set-local-model", "nemotron-3-nano:30b", "--json"],
            requiresAllowOutsideCatalog: false,
            targetProvider: "ollama-local",
            targetProviderLabel: "Local Ollama",
          targetEndpoint: "http://host.openshell.internal:11434/v1",
          targetEndpointType: "ollama",
          },
          {
            model: "nemotron-3-super-120b",
            label: "nemotron-3-super-120b",
            badges: ["active", "outside-catalog"],
            summary: "active, outside-catalog",
            isDefault: false,
            isActive: true,
          isSelectable: true,
          selectableReason: "would-change-target-route",
          routeChange: { any: true, model: false, provider: true, endpoint: true },
            inCatalog: false,
            source: "active-route",
            command: 'openclaw nemoclaw set-local-model "nemotron-3-super-120b" --json --allow-outside-catalog',
            argv: ["openclaw", "nemoclaw", "set-local-model", "nemotron-3-super-120b", "--json", "--allow-outside-catalog"],
            requiresAllowOutsideCatalog: true,
            targetProvider: "ollama-local",
            targetProviderLabel: "Local Ollama",
          targetEndpoint: "http://host.openshell.internal:11434/v1",
          targetEndpointType: "ollama",
          },
        ],
        defaultChoice: {
          model: "qwen3:32b",
          label: "qwen3:32b",
          badges: ["default"],
          summary: "default",
          isDefault: true,
          isActive: false,
          isSelectable: true,
          selectableReason: "would-change-target-route",
          routeChange: { any: true, model: true, provider: true, endpoint: true },
          inCatalog: true,
          source: "default",
          command: 'openclaw nemoclaw set-local-model "qwen3:32b" --json',
          argv: ["openclaw", "nemoclaw", "set-local-model", "qwen3:32b", "--json"],
          requiresAllowOutsideCatalog: false,
            targetProvider: "ollama-local",
            targetProviderLabel: "Local Ollama",
          targetEndpoint: "http://host.openshell.internal:11434/v1",
          targetEndpointType: "ollama",
        },
        activeChoice: {
          model: "nemotron-3-super-120b",
          label: "nemotron-3-super-120b",
          badges: ["active", "outside-catalog"],
          summary: "active, outside-catalog",
          isDefault: false,
          isActive: true,
          isSelectable: true,
          selectableReason: "would-change-target-route",
          routeChange: { any: true, model: false, provider: true, endpoint: true },
          inCatalog: false,
          source: "active-route",
          command: 'openclaw nemoclaw set-local-model "nemotron-3-super-120b" --json --allow-outside-catalog',
          argv: ["openclaw", "nemoclaw", "set-local-model", "nemotron-3-super-120b", "--json", "--allow-outside-catalog"],
          requiresAllowOutsideCatalog: true,
            targetProvider: "ollama-local",
            targetProviderLabel: "Local Ollama",
          targetEndpoint: "http://host.openshell.internal:11434/v1",
          targetEndpointType: "ollama",
        },
        actions: {
          read: {
            command: "openclaw nemoclaw onboard-status --json",
            argv: ["openclaw", "nemoclaw", "onboard-status", "--json"],
            description: "Read saved onboarding and local-model workflow state without querying sandbox health.",
            stateScope: "saved-onboarding-config",
          },
          setActiveModel: {
            command: "openclaw nemoclaw set-local-model <model> --json",
            argvTemplate: ["openclaw", "nemoclaw", "set-local-model", "<model>", "--json"],
            commandAllowOutsideCatalog: "openclaw nemoclaw set-local-model <model> --json --allow-outside-catalog",
            argvTemplateAllowOutsideCatalog: ["openclaw", "nemoclaw", "set-local-model", "<model>", "--json", "--allow-outside-catalog"],
            description: "Switch the active OpenShell local-model route without changing the saved onboarding default.",
            supportsAllowOutsideCatalog: true,
            allowOutsideCatalogFlag: "--allow-outside-catalog",
            stateScope: "openshell-active-route",
            mutatesSavedDefault: false,
            targetProvider: "ollama-local",
            targetProviderLabel: "Local Ollama",
          targetEndpoint: "http://host.openshell.internal:11434/v1",
          targetEndpointType: "ollama",
          },
          restoreDefaultModel: {
            command: "openclaw nemoclaw restore-local-model --json",
            argv: ["openclaw", "nemoclaw", "restore-local-model", "--json"],
            description: "Restore the active OpenShell local-model route to the saved onboarding default.",
            enabled: true,
            reason: null,
            stateScope: "openshell-active-route",
            mutatesSavedDefault: false,
            targetModel: "qwen3:32b",
            targetProvider: "ollama-local",
            targetProviderLabel: "Local Ollama",
          targetEndpoint: "http://host.openshell.internal:11434/v1",
          targetEndpointType: "ollama",
          },
        },
      });
    });

    it("falls back to the active inference provider in local workflow JSON when onboarding omitted a provider name", async () => {
      mockExec({
        "sandbox status": JSON.stringify({ state: "running", uptime: "2h 14m" }),
        "inference get": JSON.stringify({
          provider: "ollama-local",
          model: "nemotron-3-super-120b",
          endpoint: "http://host.openshell.internal:11434/v1",
        }),
      });

      vi.mocked(loadOnboardConfig).mockReturnValue({
        endpointType: "ollama",
        endpointUrl: "http://host.openshell.internal:11434/v1",
        ncpPartner: null,
        model: "qwen3:32b",
        profile: "ollama",
        credentialEnv: "OPENAI_API_KEY",
        providerLabel: "Local Ollama",
        availableModels: ["nemotron-3-nano:30b", "qwen3:32b"],
        onboardedAt: "2026-03-20T22:00:00.000Z",
      });

      const { lines, logger } = captureLogger();

      await cliStatus({ json: true, logger, pluginConfig: defaultConfig });

      const data = JSON.parse(lines.join(""));
      expect(data.onboarding).toMatchObject({
        provider: "Local Ollama",
        providerName: null,
        credentialEnv: "OPENAI_API_KEY",
        profile: "ollama",
      });
      expect(data.localModelWorkflow).toMatchObject({
        provider: "ollama-local",
        providerLabel: "Local Ollama",
      });
    });

    it("shows local model workflow drift in text output for dashboard control-plane consumers", async () => {
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

      const { lines, logger } = captureLogger();

      await cliStatus({ json: false, logger, pluginConfig: defaultConfig });

      const output = lines.join("\n");
      expect(output).toContain("Local Model Workflow:");
      expect(output).toContain("Default:   qwen3:32b");
      expect(output).toContain("Active:    nemotron-3-super-120b");
      expect(output).toContain("Source:    inference");
      expect(output).toContain(
        "Drift:     active model differs from saved default; active model is outside saved catalog",
      );
      expect(output).toContain("Catalog:   active route is outside saved catalog");
      expect(output).toContain("            qwen3:32b, nemotron-3-nano:30b");
      expect(output).toContain("Saved:     Local Ollama (ollama-local) -> http://host.openshell.internal:11434/v1");
    });

    it("shows active route membership in saved catalog when inference matches onboarding catalog", async () => {
      vi.mocked(loadOnboardConfig).mockReturnValue({
        endpointType: "ollama",
        endpointUrl: "http://host.openshell.internal:11434/v1",
        ncpPartner: null,
        model: "qwen3:32b",
        profile: "ollama",
        credentialEnv: "OPENAI_API_KEY",
        provider: "ollama-local",
        providerLabel: "Local Ollama",
        availableModels: ["nemotron-3-super-120b", "qwen3:32b"],
        onboardedAt: "2026-03-20T22:00:00.000Z",
      });

      const { lines, logger } = captureLogger();

      await cliStatus({ json: false, logger, pluginConfig: defaultConfig });

      const output = lines.join("\n");
      expect(output).toContain("Catalog:   active route is in saved catalog");
      expect(output).toContain("            qwen3:32b, nemotron-3-super-120b");
    });

    it("shows running sandbox with uptime in text output", async () => {
      const { lines, logger } = captureLogger();

      await cliStatus({ json: false, logger, pluginConfig: defaultConfig });

      const output = lines.join("\n");
      expect(output).toContain("Status:  running");
      expect(output).toContain("Uptime:  2h 14m");
      expect(output).toContain("Name:    openclaw");
      expect(output).not.toContain("inside sandbox");
    });

    it("shows configured inference in text output", async () => {
      const { lines, logger } = captureLogger();

      await cliStatus({ json: false, logger, pluginConfig: defaultConfig });

      const output = lines.join("\n");
      expect(output).toContain("Provider:  nvidia");
      expect(output).toContain("Model:     nemotron-3-super-120b");
      expect(output).toContain("Endpoint:  https://integrate.api.nvidia.com");
    });

    it("returns correct JSON structure", async () => {
      const { lines, logger } = captureLogger();

      await cliStatus({ json: true, logger, pluginConfig: defaultConfig });

      const data = JSON.parse(lines.join(""));
      expect(data.insideSandbox).toBe(false);
      expect(data.sandbox.running).toBe(true);
      expect(data.sandbox.uptime).toBe("2h 14m");
      expect(data.sandbox.insideSandbox).toBe(false);
      expect(data.sandbox.query.code).toBe("ok");
      expect(data.inference.configured).toBe(true);
      expect(data.inference.provider).toBe("nvidia");
      expect(data.inference.insideSandbox).toBe(false);
    });
  });

  // =========================================================================
  // Scenario 3: Host — sandbox running, no inference
  // =========================================================================
  describe("host — sandbox running, no inference", () => {
    beforeEach(() => {
      mockExec({
        "sandbox status": JSON.stringify({ state: "running", uptime: "45m 12s" }),
        "inference get": new Error("no inference configured"),
      });
    });

    it("shows running sandbox but 'Not configured' inference", async () => {
      const { lines, logger } = captureLogger();

      await cliStatus({ json: false, logger, pluginConfig: defaultConfig });

      const output = lines.join("\n");
      expect(output).toContain("Status:  running");
      expect(output).toContain("Not configured");
      expect(output).not.toContain("unable to query");
    });

    it("JSON shows sandbox running, inference not configured, not inside sandbox", async () => {
      const { lines, logger } = captureLogger();

      await cliStatus({ json: true, logger, pluginConfig: defaultConfig });

      const data = JSON.parse(lines.join(""));
      expect(data.sandbox.running).toBe(true);
      expect(data.inference.configured).toBe(false);
      expect(data.inference.insideSandbox).toBe(false);
    });
  });

  // =========================================================================
  // Scenario 4: Inside sandbox — core bug fix
  // =========================================================================
  describe("inside sandbox — core bug fix", () => {
    beforeEach(() => {
      vi.mocked(existsSync).mockImplementation((p: string | URL | Buffer) => {
        const path = String(p);
        return path === "/sandbox/.openclaw" || path === "/sandbox/.nemoclaw";
      });
    });

    it("shows 'active (inside sandbox)' instead of 'not running'", async () => {
      const { lines, logger } = captureLogger();

      await cliStatus({ json: false, logger, pluginConfig: defaultConfig });

      const output = lines.join("\n");
      expect(output).toContain("active (inside sandbox)");
      expect(output).not.toContain("Status:  not running");
    });

    it("shows sandbox context banner", async () => {
      const { lines, logger } = captureLogger();

      await cliStatus({ json: false, logger, pluginConfig: defaultConfig });

      const output = lines.join("\n");
      expect(output).toContain("Context: running inside an active OpenShell sandbox");
      expect(output).toContain("Host sandbox state is not inspectable from inside the sandbox.");
    });

    it("shows 'unable to query' instead of 'Not configured'", async () => {
      const { lines, logger } = captureLogger();

      await cliStatus({ json: false, logger, pluginConfig: defaultConfig });

      const output = lines.join("\n");
      expect(output).toContain("unable to query from inside sandbox");
      expect(output).not.toContain("Not configured");
    });

    it("does not call openshell commands", async () => {
      const { logger } = captureLogger();

      await cliStatus({ json: false, logger, pluginConfig: defaultConfig });

      expect(exec).not.toHaveBeenCalled();
    });

    it("JSON output has insideSandbox: true everywhere", async () => {
      const { lines, logger } = captureLogger();

      await cliStatus({ json: true, logger, pluginConfig: defaultConfig });

      const data = JSON.parse(lines.join(""));
      expect(data.insideSandbox).toBe(true);
      expect(data.sandbox.insideSandbox).toBe(true);
      expect(data.sandbox.running).toBe(false);
      expect(data.sandbox.query.code).toBe("inside-sandbox");
      expect(data.inference.insideSandbox).toBe(true);
      expect(data.inference.configured).toBe(false);
    });
  });

  // =========================================================================
  // Scenario 5: Inside sandbox with prior plugin state
  // =========================================================================
  describe("inside sandbox — with prior plugin state", () => {
    beforeEach(() => {
      vi.mocked(existsSync).mockImplementation((p: string | URL | Buffer) => {
        const path = String(p);
        return path === "/sandbox/.openclaw" || path === "/sandbox/.nemoclaw";
      });
      vi.mocked(loadState).mockReturnValue(populatedState());
    });

    it("shows plugin state from state file", async () => {
      const { lines, logger } = captureLogger();

      await cliStatus({ json: false, logger, pluginConfig: defaultConfig });

      const output = lines.join("\n");
      expect(output).toContain("Last action:      migrate");
      expect(output).toContain("Blueprint:        0.1.0");
      expect(output).toContain("Run ID:           run-a1b2c3d4");
    });

    it("shows rollback section when migrationSnapshot exists", async () => {
      const { lines, logger } = captureLogger();

      await cliStatus({ json: false, logger, pluginConfig: defaultConfig });

      const output = lines.join("\n");
      expect(output).toContain("Rollback:");
      expect(output).toContain("Snapshot:  /root/.nemoclaw/snapshots/pre-migrate.tar.gz");
      expect(output).toContain("openclaw nemoclaw eject");
    });

    it("JSON includes full nemoclaw state alongside insideSandbox: true", async () => {
      const { lines, logger } = captureLogger();

      await cliStatus({ json: true, logger, pluginConfig: defaultConfig });

      const data = JSON.parse(lines.join(""));
      expect(data.insideSandbox).toBe(true);
      expect(data.nemoclaw.lastAction).toBe("migrate");
      expect(data.nemoclaw.blueprintVersion).toBe("0.1.0");
      expect(data.nemoclaw.lastRunId).toBe("run-a1b2c3d4");
      expect(data.nemoclaw.migrationSnapshot).toBe(
        "/root/.nemoclaw/snapshots/pre-migrate.tar.gz",
      );
    });
  });

  // =========================================================================
  // Edge cases
  // =========================================================================
  describe("edge cases", () => {
    it("uses state.sandboxName when available", async () => {
      vi.mocked(loadState).mockReturnValue({
        ...blankState(),
        sandboxName: "custom-sandbox",
      });
      mockExec({
        "sandbox status": JSON.stringify({ state: "running", uptime: "1m" }),
        "inference get": new Error("not configured"),
      });

      const { lines, logger } = captureLogger();
      await cliStatus({ json: false, logger, pluginConfig: defaultConfig });

      const output = lines.join("\n");
      expect(output).toContain("Name:    custom-sandbox");

      // Verify the exec call used the custom sandbox name
      expect(exec).toHaveBeenCalledWith(
        expect.stringContaining("custom-sandbox"),
        expect.anything(),
        expect.anything(),
      );
    });

    it("defaults sandbox name to 'openclaw' when state has none", async () => {
      mockExec({
        "sandbox status": new Error("not found"),
        "inference get": new Error("not configured"),
      });

      const { lines, logger } = captureLogger();
      await cliStatus({ json: true, logger, pluginConfig: defaultConfig });

      // Verify exec was called with default name
      expect(exec).toHaveBeenCalledWith(
        expect.stringContaining("openclaw"),
        expect.anything(),
        expect.anything(),
      );
    });

    it("only detects sandbox via /sandbox/.openclaw", async () => {
      vi.mocked(existsSync).mockImplementation((p: string | URL | Buffer) => {
        return String(p) === "/sandbox/.openclaw";
      });

      const { lines, logger } = captureLogger();
      await cliStatus({ json: true, logger, pluginConfig: defaultConfig });

      const data = JSON.parse(lines.join(""));
      expect(data.insideSandbox).toBe(true);
    });

    it("only detects sandbox via /sandbox/.nemoclaw", async () => {
      vi.mocked(existsSync).mockImplementation((p: string | URL | Buffer) => {
        return String(p) === "/sandbox/.nemoclaw";
      });

      const { lines, logger } = captureLogger();
      await cliStatus({ json: true, logger, pluginConfig: defaultConfig });

      const data = JSON.parse(lines.join(""));
      expect(data.insideSandbox).toBe(true);
    });

    it("handles sandbox running but with missing uptime field", async () => {
      mockExec({
        "sandbox status": JSON.stringify({ state: "running" }),
        "inference get": new Error("not configured"),
      });

      const { lines, logger } = captureLogger();
      await cliStatus({ json: false, logger, pluginConfig: defaultConfig });

      const output = lines.join("\n");
      expect(output).toContain("Status:  running");
      expect(output).toContain("Uptime:  unknown");
    });

    it("no rollback section when migrationSnapshot is null", async () => {
      vi.mocked(loadState).mockReturnValue({
        ...populatedState(),
        migrationSnapshot: null,
      });

      const { lines, logger } = captureLogger();
      await cliStatus({ json: false, logger, pluginConfig: defaultConfig });

      expect(lines.join("\n")).not.toContain("Rollback:");
    });
  });
});
