# Plugin development guide

Use the [starter](examples/starter) for a complete project and the [README](README.md) for installation and upload instructions.

## Lifecycle

`PluginProvider` owns the connection to the embedding host. Define the lifecycle outside the component so it stays stable across React renders:

```tsx
import type { PluginLifecycle } from "@caleana-ai/web-sdk"

const lifecycle: PluginLifecycle = {
  init: async (config) => {
    // Initialize resources for this iframe.
  },
  onDataUpdate: async (data) => {
    // Respond to a new schema-labelled input snapshot.
  },
  cleanup: async () => {
    // Release subscriptions and other resources.
  },
}
```

`init` receives the plugin's name, version, input schema and display options. Later configuration messages update display options without restarting the lifecycle. `onDataUpdate` receives the latest input; React hooks update automatically. Cleanup invalidates pending operations so they cannot complete an old host request.

Hooks must run inside `PluginProvider`. Use `createPlugin()` and `PluginManager` when integrating without React.

## Data

The host supplies these fields:

```ts
{
  templateId: string
  templateName: string
  transformerOutput: {
    schema: {
      schemaId: string
      schemaVersion: string
      jsonSchema: Record<string, unknown>
    }
    data: unknown
  }
}
```

The SDK adds a local `timestamp` after reception. Validate `data` against your declared schema before using it. Do not attach arbitrary configuration or content properties to the top-level payload.

For `hostGeneration: "none"`, render your local interface without waiting for generated input. The host still initializes the iframe connection.

## Theme and size

`useHostTheme()` returns `"light"` or `"dark"` and mirrors it to `document.documentElement.dataset.theme`. It follows the host's appearance setting; system appearance is only an initial fallback.

Use `useAutoResize([dependencies])` for content-height layouts or `usePluginResize()` for explicit height requests. `layoutMode: "viewport"` asks the host for a viewport-oriented layout. The host owns final size constraints.

## Editable output

Declare `editableOutput: true` only when the plugin reports user-authored edits. Get `reportOutputChange` from `usePluginContext()` and send the complete edited object:

```tsx
const { reportOutputChange } = usePluginContext()
reportOutputChange({ message: nextMessage })
```

The host validates edits against its canonical output schema and owns persistence. Declaring an editable plugin does not grant access to other resources or introduce a custom persistence API.

## Exports

Declare every native format under `nativeOutputs`. An `exports` entry names the user's target format and an existing native source. For example, a PDF export may use an HTML source if that conversion is available in the host.

The handler receives `requestId`, native `format`, `targetFormat`, optional `runtimeVersion` and optional `options`. Return a Blob containing the native format requested by `format`; do not perform host-owned conversion to the target. Throw for unsupported native formats, and verify a supplied `runtimeVersion` against your renderer's runtime.

`useExportRequest()` returns `reportProgress(percent, message)`. Call it while an export is active. The SDK correlates progress and terminal responses with the original request. It accepts strings as plain-text results and converts them to Blobs, but explicit Blob MIME types are preferable. Export URLs are not supported.

## Template parameters

Optional `parameters` in the manifest declare user inputs collected when an output is added to a session. The public manifest validator supports `text`, `multiline`, `date` and `select` controls, unique parameter keys, validated defaults and static options. Integration-backed options use an explicit source reference and require host support and workspace configuration.

```json
{
  "key": "tone",
  "label": "Tone",
  "required": true,
  "control": {
    "component": "select",
    "defaultValue": "concise",
    "options": {
      "source": "static",
      "items": [
        { "label": "Concise", "value": "concise" },
        { "label": "Detailed", "value": "detailed" }
      ]
    }
  }
}
```

These values are generation context, not extra iframe configuration. The renderer continues to receive its normal schema-labelled data.

## Messaging and security

The authoritative runtime schemas are exported from `@caleana-ai/web-sdk/protocol`.

| Direction | Message | Purpose |
| --- | --- | --- |
| Host to plugin | `PLUGIN_CONFIG` | Initialize the plugin or update display options |
| Host to plugin | `DATA_STREAM` | Deliver schema-labelled input |
| Host to plugin | `RESIZE_REQUEST` | Request the current content height |
| Host to plugin | `REQUEST_EXPORT` | Request a correlated native export |
| Plugin to host | `READY` | Signal the connection or initialized plugin |
| Plugin to host | `RESIZE` | Report content height |
| Plugin to host | `ERROR` | Report initialization or input-update failure |
| Plugin to host | `OUTPUT_CHANGED` | Report user-authored output |
| Plugin to host | `EXPORT_READY` | Return a Blob export |
| Plugin to host | `EXPORT_ERROR` | Report a correlated export failure |
| Plugin to host | `EXPORT_PROGRESS` | Report correlated export progress |

The SDK checks that messages come from the parent frame and binds communication to the configured or detected host origin. Supply `options.hostOrigin` when you know it explicitly. The host controls iframe sandbox policy, permissions, edit validation and export conversion. A plugin manifest declares capabilities; it does not grant authority.

## Release process

The public SDK depends on the public `@caleana-ai/integration-protocol` package. Publish a changed protocol version before an SDK version that depends on it. Run `npm run verify` before publishing. The release workflow accepts only `caleana-engineering`, a public repository and a tag matching `package.json`; npm publication uses public access and provenance.

Never commit npm credentials or add registry authentication to plugin source archives. SDK users install from public npm without registry credentials.
