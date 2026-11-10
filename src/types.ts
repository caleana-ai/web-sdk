import type {
  ExportRequest,
  PluginConfig,
  PluginDataPayload,
  PluginToHostMessage,
} from "./protocol.js"

export type {
  ExportData,
  ExportProgress,
  ExportRequest,
  HostTheme,
  HostToPluginMessage,
  PluginConfig,
  PluginDisplayOptions,
  PluginInputSchema,
  PluginToHostMessage,
  TransformerOutput,
} from "./protocol.js"

export type PluginData = PluginDataPayload & {
  timestamp?: number
}

export type ExportHandler = (
  request: ExportRequest,
  data: PluginData | null,
) => Promise<Blob | string> | Blob | string

export interface PluginLifecycle {
  init: (config: PluginConfig) => void | Promise<void>
  onDataUpdate: (data: PluginData) => void | Promise<void>
  cleanup?: () => void | Promise<void>
}

export interface PluginContext {
  config: PluginConfig | null
  data: PluginData | null
  isReady: boolean
  sendMessage: (message: PluginToHostMessage) => void
  reportOutputChange: (data: Record<string, unknown>) => void
  requestResize: (height?: number) => void
}

export interface PluginSDKOptions {
  debug?: boolean
  timeoutMs?: number
  autoResize?: boolean
  /**
   * Origin of the host application embedding this plugin. When omitted the
   * SDK auto-detects it from `location.ancestorOrigins` / `document.referrer`,
   * falling back to pinning the origin of the first valid host message.
   * All payload-bearing messages are only ever sent to this origin.
   */
  hostOrigin?: string
}
