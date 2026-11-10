import {
  parseHostToPluginMessage,
  type ExportRequest,
  type PluginConfig,
  type PluginDataPayload,
  type PluginToHostMessage,
} from "../protocol.js"
import type {
  ExportHandler,
  PluginContext,
  PluginData,
  PluginLifecycle,
  PluginSDKOptions,
} from "../types.js"

const detectHostOrigin = (): string | null => {
  try {
    const ancestor = window.location.ancestorOrigins?.[0]
    if (ancestor && ancestor !== "null") {
      return ancestor
    }

    if (document.referrer) {
      return new URL(document.referrer).origin
    }
  } catch {
    // fall through to null; the origin is pinned from the first valid message
  }

  return null
}

export class PluginManager {
  private config: PluginConfig | null = null
  private data: PluginData | null = null
  private isReady = false
  private isInitialized = false
  private lifecycle: PluginLifecycle | null = null
  private options: PluginSDKOptions
  private dataUpdateListeners = new Set<(data: PluginData) => void>()
  private contextListeners = new Set<() => void>()
  private exportHandler: ExportHandler | null = null
  private hostOrigin: string | null = null
  private isListening = false
  private operationQueue: Promise<void> = Promise.resolve()
  private operationGeneration = 0
  private activeExportRequestId: string | null = null

  constructor(options: PluginSDKOptions = {}) {
    this.options = {
      debug: false,
      timeoutMs: 30000,
      autoResize: true,
      ...options,
    }

    this.hostOrigin = this.options.hostOrigin ?? detectHostOrigin()

    this.setupMessageListener()
    this.sendReady()
  }

  private setupMessageListener = () => {
    if (this.isListening) {
      return
    }
    window.addEventListener("message", this.handleMessage)
    this.isListening = true
  }

  private enqueueOperation = (operation: () => void | Promise<void>) => {
    const generation = this.operationGeneration
    const run = () => {
      if (generation === this.operationGeneration) {
        return operation()
      }
    }
    this.operationQueue = this.operationQueue.then(run, run)
  }

  private handleMessage = (event: MessageEvent) => {
    // Only the embedding host may drive the plugin.
    if (event.source !== window.parent || window.parent === window) {
      return
    }

    if (this.hostOrigin && event.origin !== this.hostOrigin) {
      this.debugLog("Dropping message from unexpected origin:", event.origin)
      return
    }

    const message = parseHostToPluginMessage(event.data)
    if (!message) {
      this.debugLog("Dropping malformed host message:", event.data)
      return
    }

    // No explicit/detectable origin: pin the origin of the first valid host
    // message so every later message — and every outgoing send — is bound
    // to a single host.
    if (!this.hostOrigin) {
      this.hostOrigin = event.origin
      this.debugLog("Pinned host origin:", this.hostOrigin)
    }

    this.debugLog("Received message:", message.type)

    switch (message.type) {
      case "PLUGIN_CONFIG":
        this.enqueueOperation(() =>
          this.handlePluginConfig(message.payload.config)
        )
        break
      case "DATA_STREAM":
        this.enqueueOperation(() => this.handleDataStream(message.payload.data))
        break
      case "RESIZE_REQUEST":
        this.enqueueOperation(() =>
          this.handleResizeRequest(message.payload?.height)
        )
        break
      case "REQUEST_EXPORT":
        this.enqueueOperation(() =>
          this.handleExportRequest(message.payload.exportRequest)
        )
        break
    }
  }

  private handlePluginConfig = async (config: PluginConfig) => {
    if (this.isInitialized && this.config) {
      // Identity and input schema are fixed per iframe; only presentation
      // follows later configs so appearance changes need no lifecycle restart.
      this.config = { ...this.config, displayOptions: config.displayOptions }
      this.notifyContextListeners()
      return
    }

    this.config = config
    this.notifyContextListeners()

    await this.initializeIfPossible()
  }

  private initializeIfPossible = async () => {
    if (!this.lifecycle || !this.config || this.isInitialized) {
      if (this.isInitialized) {
        this.debugLog("Plugin already initialized, ignoring duplicate config")
      }
      return
    }

    const generation = this.operationGeneration
    try {
      this.isInitialized = true
      const lifecycle = this.lifecycle
      await lifecycle.init(this.config)
      if (generation !== this.operationGeneration || this.lifecycle !== lifecycle) {
        return
      }
      this.isReady = true
      this.notifyContextListeners()
      this.sendMessage({ type: "READY" })
      this.debugLog("Plugin initialized and ready")

      if (this.data) {
        await this.deliverDataUpdate(this.data)
      }
    } catch (error) {
      if (generation !== this.operationGeneration) return
      this.isInitialized = false
      this.sendError(`Plugin initialization error: ${error}`)
    }
  }

  private deliverDataUpdate = async (data: PluginData) => {
    if (!this.lifecycle) {
      return
    }

    const generation = this.operationGeneration
    try {
      const lifecycle = this.lifecycle
      await lifecycle.onDataUpdate(data)
      if (generation !== this.operationGeneration || this.lifecycle !== lifecycle) {
        return
      }

      this.dataUpdateListeners.forEach((listener) => {
        try {
          listener(data)
        } catch (error) {
          this.debugLog("Data update listener error:", error)
        }
      })

      if (this.options.autoResize) {
        this.requestResize()
      }

      this.debugLog("Data updated")
    } catch (error) {
      if (generation !== this.operationGeneration) return
      this.sendError(`Data update error: ${error}`)
    }
  }

  private handleDataStream = async (data: PluginDataPayload) => {
    this.data = {
      ...data,
      timestamp: Date.now(),
    }
    this.notifyContextListeners()

    if (this.isReady) {
      await this.deliverDataUpdate(this.data)
    }
  }

  private handleResizeRequest = (height?: number) => {
    this.requestResize(height)
  }

  private handleExportRequest = async (request: ExportRequest) => {
    const generation = this.operationGeneration
    const { requestId } = request
    if (!this.exportHandler) {
      this.sendExportError(requestId, "No export handler registered")
      return
    }

    this.activeExportRequestId = requestId
    try {
      this.debugLog("Processing export request:", request)

      const result = await this.exportHandler(request, this.data)
      if (generation !== this.operationGeneration) return
      const blob =
        typeof result === "string"
          ? new Blob([result], { type: "text/plain" })
          : result

      this.sendMessage({
        type: "EXPORT_READY",
        payload: {
          exportData: {
            requestId,
            format: request.format,
            targetFormat: request.targetFormat,
            blob,
            filename: `export.${request.targetFormat}`,
          },
        },
      })

      this.debugLog("Export completed successfully")
    } catch (error) {
      if (generation !== this.operationGeneration) return
      this.debugLog("Export error:", error)
      this.sendExportError(
        requestId,
        error instanceof Error ? error.message : "Export failed"
      )
    } finally {
      if (generation === this.operationGeneration) {
        this.activeExportRequestId = null
      }
    }
  }

  private sendMessage = (message: PluginToHostMessage) => {
    if (window.parent === window) {
      return
    }

    if (this.hostOrigin) {
      window.parent.postMessage(message, this.hostOrigin)
      this.debugLog("Sent message:", message.type)
      return
    }

    // Narrow exception: before the host origin is known (no option, no
    // detectable ancestor origin, no host message yet) only the payload-free
    // READY handshake may broadcast — the host cannot send PLUGIN_CONFIG
    // until it sees READY. Everything carrying data waits for a pinned origin.
    if (message.type === "READY") {
      window.parent.postMessage({ type: "READY" }, "*")
      this.debugLog("Sent READY handshake without pinned host origin")
      return
    }

    this.debugLog("Dropping message: host origin not yet pinned", message.type)
  }

  private sendReady = () => {
    this.sendMessage({ type: "READY" })
  }

  private sendError = (error: string) => {
    this.sendMessage({
      type: "ERROR",
      payload: { error },
    })
  }

  private sendExportError = (requestId: string, error: string) => {
    this.sendMessage({
      type: "EXPORT_ERROR",
      payload: { requestId, error },
    })
  }

  private sendExportProgress = (percent: number, message: string) => {
    const requestId = this.activeExportRequestId
    if (!requestId) {
      this.debugLog("Dropping export progress outside an export request")
      return
    }
    this.sendMessage({
      type: "EXPORT_PROGRESS",
      payload: {
        requestId,
        progress: { percent, message },
      },
    })
  }

  private debugLog = (...args: unknown[]) => {
    if (this.options.debug) {
      console.log("[Caleana Plugin SDK]", ...args)
    }
  }

  private notifyContextListeners = () => {
    this.contextListeners.forEach((listener) => {
      listener()
    })
  }

  public registerLifecycle = (lifecycle: PluginLifecycle) => {
    this.lifecycle = lifecycle
    this.setupMessageListener()
    this.enqueueOperation(this.initializeIfPossible)
  }

  public onDataUpdate = (listener: (data: PluginData) => void) => {
    this.dataUpdateListeners.add(listener)
    return () => {
      this.dataUpdateListeners.delete(listener)
    }
  }

  public subscribe = (listener: () => void) => {
    this.contextListeners.add(listener)
    return () => {
      this.contextListeners.delete(listener)
    }
  }

  public registerExportHandler = (handler: ExportHandler) => {
    this.exportHandler = handler
    this.debugLog("Export handler registered")
  }

  public unregisterExportHandler = (handler: ExportHandler) => {
    if (this.exportHandler === handler) {
      this.exportHandler = null
      this.debugLog("Export handler unregistered")
    }
  }

  public reportExportProgress = (percent: number, message: string) => {
    this.sendExportProgress(percent, message)
  }

  /**
   * Reports a user-authored output payload to hosts whose manifest declares
   * editableOutput. The host owns validation and persistence semantics.
   */
  public reportOutputChange = (data: Record<string, unknown>) => {
    this.sendMessage({
      type: "OUTPUT_CHANGED",
      payload: { data },
    })
  }

  public getContext = (): PluginContext => ({
    config: this.config,
    data: this.data,
    isReady: this.isReady,
    sendMessage: this.sendMessage,
    reportOutputChange: this.reportOutputChange,
    requestResize: this.requestResize,
  })

  public requestResize = (height?: number) => {
    if (height) {
      this.sendMessage({
        type: "RESIZE",
        payload: { height },
      })
    } else {
      const bodyHeight = document.body.scrollHeight
      this.sendMessage({
        type: "RESIZE",
        payload: { height: bodyHeight },
      })
    }
  }

  public cleanup = async () => {
    const lifecycle = this.lifecycle
    this.operationGeneration += 1
    this.lifecycle = null
    this.isInitialized = false
    this.isReady = false
    this.activeExportRequestId = null
    this.dataUpdateListeners.clear()
    this.contextListeners.clear()
    if (this.isListening) {
      window.removeEventListener("message", this.handleMessage)
      this.isListening = false
    }
    const teardown = async () => {
      await lifecycle?.cleanup?.()
    }
    this.operationQueue = this.operationQueue.then(teardown, teardown)
    await this.operationQueue
  }
}
