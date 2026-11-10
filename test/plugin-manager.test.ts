import assert from "node:assert/strict"
import { afterEach, beforeEach, test } from "node:test"
import { PluginManager } from "../src/core/plugin-manager"
import { parsePluginToHostMessage } from "../src/protocol"
import type { PluginConfig } from "../src/types"

const HOST_ORIGIN = "https://host.example"

type Listener = (event: MessageEvent) => void

const createFrame = () => {
  const sent: unknown[] = []
  const listeners = new Set<Listener>()
  const parent = {
    postMessage: (message: unknown) => {
      sent.push(message)
    },
  }
  const frame = {
    parent,
    location: { ancestorOrigins: [HOST_ORIGIN] },
    addEventListener: (_type: string, listener: Listener) => {
      listeners.add(listener)
    },
    removeEventListener: (_type: string, listener: Listener) => {
      listeners.delete(listener)
    },
  }
  const receive = (data: unknown, origin = HOST_ORIGIN) => {
    for (const listener of listeners) {
      listener({ source: parent, origin, data } as MessageEvent)
    }
  }
  return { frame, sent, receive }
}

const config: PluginConfig = {
  name: "Plugin",
  version: "1.0.0",
  inputSchema: {
    schemaId: "schema",
    schemaVersion: "1.0.0",
    jsonSchema: { type: "object" },
  },
  displayOptions: { theme: "light" },
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

let frame: ReturnType<typeof createFrame>

beforeEach(() => {
  frame = createFrame()
  Object.assign(globalThis, {
    window: frame.frame,
    document: { referrer: "", body: { scrollHeight: 0 } },
  })
})

afterEach(() => {
  Reflect.deleteProperty(globalThis, "window")
  Reflect.deleteProperty(globalThis, "document")
})

const startPlugin = async () => {
  const manager = new PluginManager({ autoResize: false })
  manager.registerLifecycle({ init: () => {}, onDataUpdate: () => {} })
  frame.receive({ type: "PLUGIN_CONFIG", payload: { config } })
  await settle()
  return manager
}

test("echoes the host request id on export results", async () => {
  const manager = await startPlugin()
  manager.registerExportHandler(() => new Blob(["%PDF"]))

  frame.receive({
    type: "REQUEST_EXPORT",
    payload: {
      exportRequest: {
        requestId: "delivery-1",
        format: "pdf",
        targetFormat: "pdf",
      },
    },
  })
  await settle()

  const reply = parsePluginToHostMessage(frame.sent.at(-1))
  assert.equal(reply?.type, "EXPORT_READY")
  assert.equal(
    reply?.type === "EXPORT_READY" && reply.payload.exportData.requestId,
    "delivery-1"
  )
})

test("echoes the host request id on export failures", async () => {
  const manager = await startPlugin()
  manager.registerExportHandler(() => {
    throw new Error("render failed")
  })

  frame.receive({
    type: "REQUEST_EXPORT",
    payload: {
      exportRequest: {
        requestId: "delivery-2",
        format: "pdf",
        targetFormat: "pdf",
      },
    },
  })
  await settle()

  assert.deepEqual(parsePluginToHostMessage(frame.sent.at(-1)), {
    type: "EXPORT_ERROR",
    payload: { requestId: "delivery-2", error: "render failed" },
  })
})

test("every message the manager sends satisfies the host schema", async () => {
  const manager = await startPlugin()
  manager.registerExportHandler(() => "text")
  manager.reportOutputChange({ fields: [] })
  manager.requestResize(320)
  frame.receive({
    type: "REQUEST_EXPORT",
    payload: {
      exportRequest: { requestId: "r", format: "txt", targetFormat: "txt" },
    },
  })
  await settle()

  assert.ok(frame.sent.length > 0)
  for (const message of frame.sent) {
    assert.notEqual(parsePluginToHostMessage(message), null)
  }
})

test("later configs update display options only", async () => {
  const manager = await startPlugin()

  frame.receive({
    type: "PLUGIN_CONFIG",
    payload: {
      config: {
        ...config,
        name: "Renamed",
        displayOptions: { theme: "dark" },
      },
    },
  })
  await settle()

  const current = manager.getContext().config
  assert.equal(current?.name, "Plugin")
  assert.deepEqual(current?.displayOptions, { theme: "dark" })
})

test("ignores messages from other origins", async () => {
  const manager = await startPlugin()
  manager.registerExportHandler(() => new Blob(["x"]))
  const before = frame.sent.length

  frame.receive(
    {
      type: "REQUEST_EXPORT",
      payload: {
        exportRequest: { requestId: "x", format: "pdf", targetFormat: "pdf" },
      },
    },
    "https://attacker.example"
  )
  await settle()

  assert.equal(frame.sent.length, before)
})

const deferred = <T>() => {
  let resolve!: (value: T) => void
  let reject!: (error: Error) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

for (const outcome of ["success", "failure"] as const) {
  test(`cleanup suppresses a late export ${outcome} and its progress`, async () => {
    const manager = await startPlugin()
    const exportResult = deferred<Blob>()
    manager.registerExportHandler(() => exportResult.promise)
    frame.receive({
      type: "REQUEST_EXPORT",
      payload: {
        exportRequest: { requestId: "old", format: "pdf", targetFormat: "pdf" },
      },
    })
    await settle()

    const before = frame.sent.length
    const cleanup = manager.cleanup()
    manager.reportExportProgress(50, "Old render")
    if (outcome === "success") exportResult.resolve(new Blob(["old"]))
    else exportResult.reject(new Error("Old render failed"))
    await cleanup

    assert.equal(frame.sent.length, before)
    assert.equal(manager.getContext().isReady, false)
  })
}

test("re-registering the same lifecycle cannot revive an old initialization", async () => {
  const initialization = deferred<void>()
  let attempts = 0
  const lifecycle = {
    init: () => (++attempts === 1 ? initialization.promise : undefined),
    onDataUpdate: () => {},
  }
  const manager = new PluginManager({ autoResize: false })
  manager.registerLifecycle(lifecycle)
  frame.receive({ type: "PLUGIN_CONFIG", payload: { config } })
  await settle()
  const before = frame.sent.length

  const cleanup = manager.cleanup()
  manager.registerLifecycle(lifecycle)
  initialization.resolve()
  await cleanup
  await settle()

  assert.equal(attempts, 2)
  assert.equal(manager.getContext().isReady, true)
  assert.deepEqual(frame.sent.slice(before), [{ type: "READY" }])
})

test("cleanup suppresses an in-flight data update failure", async () => {
  const update = deferred<void>()
  const manager = new PluginManager({ autoResize: false })
  manager.registerLifecycle({ init: () => {}, onDataUpdate: () => update.promise })
  frame.receive({ type: "PLUGIN_CONFIG", payload: { config } })
  await settle()
  frame.receive({
    type: "DATA_STREAM",
    payload: {
      data: {
        templateId: "template",
        templateName: "Template",
        transformerOutput: { schema: config.inputSchema, data: {} },
      },
    },
  })
  await settle()
  const before = frame.sent.length
  const cleanup = manager.cleanup()
  update.reject(new Error("Old update failed"))
  await cleanup
  assert.equal(frame.sent.length, before)
})

test("repeated cleanup still tears down the detached lifecycle exactly once", async () => {
  const initialized = deferred<void>()
  let cleanups = 0
  const manager = new PluginManager({ hostOrigin: HOST_ORIGIN })
  manager.registerLifecycle({
    init: () => initialized.promise,
    onDataUpdate: () => {},
    cleanup: () => { cleanups += 1 },
  })
  frame.receive({ type: "PLUGIN_CONFIG", payload: { config } })
  await settle()
  const first = manager.cleanup()
  const second = manager.cleanup()
  initialized.resolve()
  await Promise.all([first, second])
  assert.equal(cleanups, 1)
  assert.equal(manager.getContext().isReady, false)
})
