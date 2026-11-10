# Starter plugin

A small editable output plugin built with React, Vite and the public Caleana Web SDK.

```sh
npm install
npm run typecheck
npm run build
```

Commit the generated `package-lock.json` and use `npm ci` for subsequent builds.

The plugin expects `{ "message": "Hello" }` in `transformerOutput.data`. It follows the host theme, reports text edits, resizes with its content and returns a text Blob for export. An invalid input displays an explicit error.

For upload, ZIP this directory's source files with `package.json`, `package-lock.json` and `manifest.json` at the ZIP root. Exclude `node_modules`, `dist`, `.git`, ZIPs and local environment files. Caleana installs registry dependencies and runs the build; `dist/index.html` and `dist/manifest.json` are the resulting entry points.

Opening the output HTML outside Caleana shows a waiting state because no host is connected.
