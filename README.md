# Caleana Web SDK

Build interactive tools and document output plugins that run inside Caleana. The SDK connects a React application to its host through a validated iframe messaging protocol, with hooks for generated data, appearance, resizing, editing and exports.

## Requirements

- Node.js 22 or newer
- React and React DOM 19
- A Caleana account with permission to publish plugins to a team

## Installation

```sh
npm install @caleana-ai/web-sdk@0.3.0 react@^19 react-dom@^19
```

The SDK and its shared protocol dependency are public npm packages. Installing them does not require a GitHub account, a personal access token or access to Caleana's internal repositories. Remove any old `@caleana-ai` registry mapping to GitHub Packages from your project's `.npmrc` before installing.

## Start with an example

The [starter plugin](examples/starter) includes a complete React entry point, a manifest, a Vite build and a text export handler. The first install creates your project's lockfile; commit it and use `npm ci` for subsequent builds.

```sh
git clone https://github.com/caleana-ai/web-sdk.git
cp -R web-sdk/examples/starter my-plugin
cd my-plugin
npm install
npm run typecheck
npm run build
```

Open the plugin inside Caleana to receive host configuration and data. Opening its HTML file alone does not provide a host connection.

## Render host data

Wrap your application in `PluginProvider` and supply its lifecycle handlers. The host sends schema-labelled data through `usePluginData()`.

```tsx
import { createRoot } from "react-dom/client"
import {
  PluginProvider,
  useAutoResize,
  useHostTheme,
  usePluginData,
  type PluginLifecycle,
} from "@caleana-ai/web-sdk"

const lifecycle: PluginLifecycle = {
  init: () => {},
  onDataUpdate: () => {},
}

const MyPlugin = () => {
  const data = usePluginData()
  const theme = useHostTheme()
  useAutoResize([data])

  if (!data) return <p>Waiting for data from Caleana...</p>

  return (
    <main data-theme={theme}>
      <h1>{data.templateName}</h1>
      <pre>{JSON.stringify(data.transformerOutput.data, null, 2)}</pre>
    </main>
  )
}

const container = document.getElementById("root")
if (!container) throw new Error("Missing root element")

createRoot(container).render(
  <PluginProvider lifecycle={lifecycle}>
    <MyPlugin />
  </PluginProvider>,
)
```

Treat `transformerOutput.data` as unknown until you validate it against your plugin's declared input schema. Generated content belongs inside that field; arbitrary top-level properties are rejected.

## Declare your plugin

Put `manifest.json` in the plugin source root and copy it into `dist/` during the build. The [starter manifest](examples/starter/manifest.json) is a complete example.

```json
{
  "name": "My Plugin",
  "version": "1.0.0",
  "generationMode": "supports-update",
  "hostGeneration": "transformer",
  "inputSchema": {
    "schemaId": "my-plugin-v1",
    "schemaVersion": "1.0.0",
    "jsonSchema": {
      "type": "object",
      "properties": { "message": { "type": "string" } },
      "required": ["message"],
      "additionalProperties": false
    }
  },
  "nativeOutputs": [{ "format": "txt", "mimeType": "text/plain" }],
  "exports": [{ "format": "txt", "label": "Download text", "source": "txt" }]
}
```

Validate declarations with the same schema used by Caleana:

```ts
import { pluginManifestSchema } from "@caleana-ai/web-sdk/manifest"

const manifest = pluginManifestSchema.parse(manifestJson)
```

`hostGeneration: "transformer"` asks Caleana to generate input for the plugin. Use `"none"` for a self-contained tool that owns its data and interactions. `generationMode` is either `"regenerate-only"` or `"supports-update"`. Optional `editableOutput`, `layoutMode` and template `parameters` describe additional capabilities; see [the usage guide](USAGE.md).

## Export content

Register an export handler in a component inside `PluginProvider`:

```tsx
import { useExportRequest } from "@caleana-ai/web-sdk"

useExportRequest((request, data) => {
  if (request.format !== "txt" || request.targetFormat !== "txt") {
    throw new Error("Unsupported export format")
  }
  return new Blob(
    [JSON.stringify(data?.transformerOutput.data ?? {}, null, 2)],
    { type: "text/plain" },
  )
})
```

The SDK echoes the host's `requestId` automatically. Exports cross the iframe boundary as Blobs. Your handler returns the requested native source format; Caleana handles any supported conversion declared in the manifest. If a request supplies `runtimeVersion`, verify that it matches the renderer runtime you are running before returning an export.

## Build and upload

1. Pin the SDK version and commit the plugin's `package-lock.json`.
2. Run `npm ci`, `npm run typecheck` and `npm run build` locally.
3. Make sure the build creates `dist/index.html`, its referenced assets and `dist/manifest.json`. Use relative asset paths, as the starter does.
4. ZIP the plugin source with `package.json`, `package-lock.json`, `manifest.json`, source files and build configuration at the archive root. Exclude `node_modules`, `.git`, credentials and local environment files.
5. Upload the source ZIP through Caleana's plugin publishing interface. Caleana installs dependencies, runs your build in isolation and publishes the resulting assets.
6. Install the published plugin for the workspace and add it to a session output.

The dependency-install stage disables package lifecycle scripts. The build stage has no network access. Use registry dependencies, keep assets local to the project and avoid build-time downloads. Plugin archives cannot depend on workspace, local-file or Git packages.

The public SDK lets anyone develop plugins. Publishing, installing and using a plugin inside a particular team or workspace still requires that workspace's permissions.

## API reference

| Export | Purpose |
| --- | --- |
| `PluginProvider` | Connect React components to the host and plugin lifecycle |
| `usePluginData()` | Read the latest schema-labelled host data |
| `usePluginConfig()` | Read plugin identity, input schema and display options |
| `usePluginReady()` | Read initialization state |
| `useHostTheme()` | Follow Caleana's resolved light or dark appearance |
| `useAutoResize()` | Report content-height changes automatically |
| `usePluginResize()` | Request a specific iframe height |
| `usePluginContext()` | Report edited output and access host messaging |
| `useExportRequest()` | Handle native export requests and report progress |
| `createPlugin()` | Use the SDK without the React provider |
| `@caleana-ai/web-sdk/protocol` | Parse host/plugin messages without React |
| `@caleana-ai/web-sdk/manifest` | Validate plugin manifests without React |

See [USAGE.md](USAGE.md) for lifecycle, editing and protocol details.

## Developing the SDK

```sh
npm ci
npm run build
npm test
npm run test:package
npx playwright install chromium
npm run test:browser
```

The shared public protocol lives in `packages/integration-protocol`. Both packages build from this checkout without private registry access. Release commits and GitHub publication use the `caleana-engineering` account.

## License

MIT
