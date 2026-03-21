---
title:
  page: "NemoClaw CLI Commands Reference"
  nav: "Commands"
description: "Full CLI reference for plugin and standalone NemoClaw commands."
keywords: ["nemoclaw cli commands", "nemoclaw command reference"]
topics: ["generative_ai", "ai_agents"]
tags: ["openclaw", "openshell", "nemoclaw", "cli"]
content:
  type: reference
  difficulty: technical_beginner
  audience: ["developer", "engineer"]
status: published
---

<!--
  SPDX-FileCopyrightText: Copyright (c) 2025-2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
  SPDX-License-Identifier: Apache-2.0
-->

# Commands

NemoClaw provides two command interfaces.
The plugin commands run under the `openclaw nemoclaw` namespace inside the OpenClaw CLI.
The standalone `nemoclaw` binary handles host-side setup, deployment, and service management.
Both interfaces are installed when you run `npm install -g nemoclaw`.

## Plugin Commands

### `openclaw nemoclaw launch`

Bootstrap OpenClaw inside an OpenShell sandbox.
If NemoClaw detects an existing host installation, `launch` stops unless you pass `--force`.

```console
$ openclaw nemoclaw launch [--force] [--profile <profile>]
```

`--force`
: Skip the ergonomics warning and force plugin-driven bootstrap. Without this flag,
  NemoClaw recommends using `openshell sandbox create` directly for new installs.

`--profile <profile>`
: Blueprint profile to use. Default: `default`.

### `nemoclaw <name> connect`

Open an interactive shell inside the OpenClaw sandbox.
Use this after launch to connect and chat with the agent through the TUI or CLI.

```console
$ nemoclaw my-assistant connect
```

If the TUI view is not a good fit for very long responses, use the CLI form instead:

```console
$ openclaw agent --agent main --local -m "<prompt>" --session-id <id>
```

This is the recommended workaround when you need the full response printed directly in the terminal.

### `openclaw nemoclaw status`

Display sandbox health, blueprint run state, and inference configuration.

```console
$ openclaw nemoclaw status [--json]
```

`--json`
: Output as JSON for programmatic consumption.

When running inside an active OpenShell sandbox, the status command detects the sandbox context and reports "active (inside sandbox)" instead of false negatives.
Host-side sandbox state and inference configuration are not inspectable from inside the sandbox.
Run `openshell sandbox list` on the host to check the underlying sandbox state.

### `openclaw nemoclaw onboard-status`

Display the saved onboarding configuration and local-model workflow metadata without querying sandbox health.
This is intended for local dashboard or control-plane consumers that only need the operator-facing inference configuration.

```console
$ openclaw nemoclaw onboard-status [--json]
```

`--json`
: Output only the onboarding/control-plane payload as JSON.

For local inference onboarding, the output includes the saved local model catalog, default model, dashboard-friendly `localModelWorkflow` metadata, a machine-readable `localModelWorkflow.liveRouteStatus` field (`live-openshell` vs `saved-onboarding-fallback`), an `actions` block describing the supported read/write commands for single-user local dashboards, and per-choice `command` / `argv` / `requiresAllowOutsideCatalog` fields plus dashboard-friendly `badges` / `summary` metadata so a local dashboard can wire model-picker buttons without inventing CLI strings or shell parsing. Each choice now also carries `targetProvider` / `targetProviderLabel` plus `targetEndpoint` / `targetEndpointType`, so the model picker can show or audit exactly which saved OpenShell-backed route a click will retarget even when the live route has drifted elsewhere. The saved `onboarding` block also exposes both human-readable labels (`endpoint`, `provider`) and machine-stable fields (`endpointUrl`, `providerName`) so a dashboard can bind OpenShell-backed workflow actions without scraping display text. Each choice now also exposes `isSelectable` plus machine-readable `selectableReason`, so a control surface can disable the already-active model and explain why without recomputing route drift state. `localModelWorkflow.drift` gives the dashboard a precomputed summary of model/catalog/provider/endpoint drift so the UI does not need to diff those fields manually. The `actions.setActiveModel` block now also exposes both the normal and `--allow-outside-catalog` command/argv templates plus resolved `targetProvider` / `targetProviderLabel` and `targetEndpoint` / `targetEndpointType` fields so a control surface can execute either path directly while still showing the operator which saved onboarding route the write path will retarget, even if the live OpenShell route has drifted elsewhere. `actions.restoreDefaultModel` now resolves to `openclaw nemoclaw restore-local-model --json`, with `enabled` / `reason` fields for restore-button state plus `targetModel` / `targetProvider` / `targetProviderLabel` / `targetEndpoint` / `targetEndpointType` metadata for confirmation UI or audit logs. The `onboarding.actions.configure` block exposes a stable re-entry command for first-run setup or reconfiguration, and now also reports `stateScope` plus `mutatesSavedDefault`, so a single-user dashboard can classify onboarding as a saved-config write instead of a live-route-only change. The top-level `inference` block now reports whether the live OpenShell route query succeeded (`query.ok/code/message`) so control-plane consumers can distinguish live active-route data from saved onboarding fallback.
Unlike `status`, this command does not depend on OpenShell sandbox introspection.
The richer `status --json` payload now also includes the same machine-stable onboarding fields (`endpointUrl`, `providerName`), `onboarding.actions.configure`, `localModelWorkflow.defaultChoice`, `localModelWorkflow.activeChoice`, and `localModelWorkflow.actions` blocks for local workflows, but `onboard-status --json` remains the narrower control-plane read when you do not need sandbox health.

### `openclaw nemoclaw set-local-model`

Switch the active OpenShell inference route for a local-model workflow without changing the saved onboarding default.
This is intended for single-user local dashboards or operators who want a safe write path backed by the saved onboarding catalog.

```console
$ openclaw nemoclaw set-local-model <model> [--json] [--allow-outside-catalog]
```

`--json`
: Output the resulting active-route summary as JSON. Success and recoverable error payloads include a stable `setup.configure` onboarding action, and recoverable local-workflow responses also include a stable `actions` block, so a local dashboard can recover without hardcoding CLI strings.

`--allow-outside-catalog`
: Permit a one-off route change to a model that is not in the saved onboarding catalog.

By default, the command only accepts models from the saved local catalog to reduce accidental route drift.

### `openclaw nemoclaw restore-local-model`

Restore the active OpenShell local-model route to the saved onboarding default model.
This gives single-user dashboards and operators an explicit reset command instead of requiring them to replay `set-local-model` with the saved default model manually.

```console
$ openclaw nemoclaw restore-local-model [--json]
```

`--json`
: Output the resulting active-route summary as JSON using the same success and recoverable error shape as `set-local-model`.

### `openclaw nemoclaw logs`

Stream blueprint execution and sandbox logs.

```console
$ openclaw nemoclaw logs [-f] [-n <count>] [--run-id <id>]
```

`-f, --follow`
: Follow log output, similar to `tail -f`.

`-n, --lines <count>`
: Number of lines to show. Default: `50`.

`--run-id <id>`
: Show logs for a specific blueprint run instead of the latest.

### `/nemoclaw` Slash Command

The `/nemoclaw` slash command is available inside the OpenClaw chat interface for quick actions:

| Subcommand | Description |
|---|---|
| `/nemoclaw status` | Show sandbox and inference state |

## Standalone Host Commands

The `nemoclaw` binary handles host-side operations that run outside the OpenClaw plugin context.

### `nemoclaw onboard`

Run the interactive setup wizard.
The wizard creates an OpenShell gateway, registers inference providers, builds the sandbox image, and creates the sandbox.
Use this command for new installs and for recreating a sandbox after changes to policy or configuration.

```console
$ nemoclaw onboard
```

The first run prompts for your NVIDIA API key and saves it to `~/.nemoclaw/credentials.json`.

The wizard prompts for a sandbox name.
Names must follow RFC 1123 subdomain rules: lowercase alphanumeric characters and hyphens only, and must start and end with an alphanumeric character.
Uppercase letters are automatically lowercased.

Before creating the gateway, the wizard runs preflight checks.
On systems with cgroup v2 (Ubuntu 24.04, DGX Spark, WSL2), it verifies that Docker is configured with `"default-cgroupns-mode": "host"` and provides fix instructions if the setting is missing.

### `nemoclaw list`

List all registered sandboxes with their model, provider, and policy presets.

```console
$ nemoclaw list
```

### `nemoclaw deploy`

:::{warning}
The `nemoclaw deploy` command is experimental and may not work as expected.
:::

Deploy NemoClaw to a remote GPU instance through [Brev](https://brev.nvidia.com).
The deploy script installs Docker, NVIDIA Container Toolkit if a GPU is present, and OpenShell on the VM, then runs the nemoclaw setup and connects to the sandbox.

```console
$ nemoclaw deploy <instance-name>
```

### `nemoclaw <name> connect`

Connect to a sandbox by name.

```console
$ nemoclaw my-assistant connect
```

### `nemoclaw <name> status`

Show sandbox status, health, and inference configuration.

```console
$ nemoclaw my-assistant status
```

### `nemoclaw <name> logs`

View sandbox logs.
Use `--follow` to stream output in real time.

```console
$ nemoclaw my-assistant logs [--follow]
```

### `nemoclaw <name> destroy`

Stop the NIM container and delete the sandbox.
This removes the sandbox from the registry.

```console
$ nemoclaw my-assistant destroy
```

### `nemoclaw <name> policy-add`

Add a policy preset to a sandbox.
Presets extend the baseline network policy with additional endpoints.

```console
$ nemoclaw my-assistant policy-add
```

### `nemoclaw <name> policy-list`

List available policy presets and show which ones are applied to the sandbox.

```console
$ nemoclaw my-assistant policy-list
```

### `openshell term`

Open the OpenShell TUI to monitor sandbox activity and approve network egress requests.
Run this on the host where the sandbox is running.

```console
$ openshell term
```

For a remote Brev instance, SSH to the instance and run `openshell term` there, or use a port-forward to the gateway.

### `nemoclaw start`

Start auxiliary services, such as the Telegram bridge and cloudflared tunnel.

```console
$ nemoclaw start
```

Requires `TELEGRAM_BOT_TOKEN` for the Telegram bridge.

### `nemoclaw stop`

Stop all auxiliary services.

```console
$ nemoclaw stop
```

### `nemoclaw status`

Show the sandbox list and the status of auxiliary services.

```console
$ nemoclaw status
```

### `nemoclaw setup-spark`

Set up NemoClaw on DGX Spark.
This command applies cgroup v2 and Docker fixes required for Ubuntu 24.04.
Run with `sudo` on the Spark host.
After the fixes complete, the script prompts you to run `nemoclaw onboard` to continue setup.

```console
$ sudo nemoclaw setup-spark
```
