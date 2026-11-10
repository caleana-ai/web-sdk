# Release maintenance

The Web SDK source and shared public protocol are synchronized from Caleana's canonical SDK contracts. Distribution changes must preserve the host's wire and manifest behavior. `npm run verify` builds both packages, tests the public contracts, installs their archives into an isolated consumer with empty npm configuration, builds the starter and exercises its cross-origin protocol in Chromium.

The protocol test suite covers public validators. Tests of private application-side parameter normalization remain with the application rather than importing private application source into this public repository.

## Package order

1. `@caleana-ai/integration-protocol`
2. `@caleana-ai/web-sdk`

Update the SDK's protocol dependency if the protocol changes. Keep the starter's SDK pin current. Run `npm ci --ignore-scripts` and `npm run verify`, then review both archives under `artifacts/`. Source, tests, local configuration and credentials do not ship in those archives.

## Identity and registry

Use the `caleana-engineering` GitHub account, with commit identity `Caleana Engineering <engineering@caleana.ai>`. Verify the active npm publisher is the authorized engineering account before an initial command-line publication. The registry is `https://registry.npmjs.org` with public access.

For future releases, configure npm trusted publishing for both packages to the repository `caleana-ai/web-sdk`, workflow `publish.yml`. That workflow requires the engineering GitHub actor, a public repository and a version tag matching the SDK package version. It verifies existing package contents before treating a version as already published. Publishing uses npm provenance and GitHub OIDC without a stored npm token.

The first publication may require engineering-account authentication through npm. Do not put credentials in this repository, workflow files, example archives or release notes.

## Runtime compatibility evidence

The standalone browser test covers initialization, schema-labelled input, edited output, appearance changes, correlated Blob export, unsupported export, invalid input and recovery. Release acceptance also exercises the starter against Caleana's actual iframe output runtime, including its schema validation, accepted-edit acknowledgements, edit focus and export correlation. That integration proof belongs to the application environment; the public repository does not import private host implementation files in CI.

## Dependency audit

This release retains Caleana's current Zod 3 contract to preserve exact SDK/host parity. npm audit reports GHSA-mrhx-c7xc-m3w5 against Zod 3.25.76; the suggested fixed version is a Zod 4 major upgrade. That shared-validator upgrade requires a coordinated host and SDK change and has not been performed as part of republication.
