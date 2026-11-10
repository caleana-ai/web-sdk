import { useContext, useEffect, useState } from "react"
import type {
  ExportHandler,
  HostTheme,
  PluginContext,
  PluginData,
} from "../types.js"
import { PluginReactContext, type PluginReactContextValue } from "./provider.js"

const usePluginReactContext = (): PluginReactContextValue => {
  const context = useContext(PluginReactContext)
  if (!context) {
    throw new Error("usePluginContext must be used within a PluginProvider")
  }
  return context
}

export const usePluginContext = (): PluginContext => {
  return usePluginReactContext()
}

export const usePluginData = (): PluginData | null => {
  const { data } = usePluginContext()
  return data
}

export const usePluginConfig = () => {
  const { config } = usePluginContext()
  return config
}

const prefersDark = (): boolean =>
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-color-scheme: dark)").matches

/**
 * The theme the plugin should render in.
 *
 * The host resolves the user's appearance setting and sends the concrete
 * answer as `PLUGIN_CONFIG.displayOptions.theme`, re-sending it whenever it
 * changes. Follow that rather than `prefers-color-scheme`, which only sees the
 * operating system and would ignore an in-app override. The media query is
 * used only until the first config arrives.
 *
 * The resolved theme is mirrored onto `document.documentElement.dataset.theme`
 * so a plugin can theme entirely in CSS with `:root[data-theme="dark"]`.
 */
export const useHostTheme = (): HostTheme => {
  const config = usePluginConfig()
  const hostTheme = config?.displayOptions?.theme
  const [systemTheme, setSystemTheme] = useState<HostTheme>(() =>
    prefersDark() ? "dark" : "light"
  )

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return
    }
    const query = window.matchMedia("(prefers-color-scheme: dark)")
    const onChange = (event: MediaQueryListEvent) => {
      setSystemTheme(event.matches ? "dark" : "light")
    }
    query.addEventListener("change", onChange)
    return () => {
      query.removeEventListener("change", onChange)
    }
  }, [])

  const theme = hostTheme ?? systemTheme

  useEffect(() => {
    if (typeof document === "undefined") return
    document.documentElement.dataset.theme = theme
  }, [theme])

  return theme
}

export const usePluginResize = () => {
  const { requestResize } = usePluginContext()
  return requestResize
}

export const useAutoResize = (dependencies: any[] = []) => {
  const requestResize = usePluginResize()

  useEffect(() => {
    const resizeObserver = new ResizeObserver(() => {
      requestResize()
    })

    resizeObserver.observe(document.body)

    // Also trigger resize when dependencies change
    requestResize()

    return () => {
      resizeObserver.disconnect()
    }
  }, dependencies)
}

export const usePluginReady = () => {
  const { isReady } = usePluginContext()
  const [hasRendered, setHasRendered] = useState(false)

  useEffect(() => {
    if (isReady && !hasRendered) {
      setHasRendered(true)
    }
  }, [isReady, hasRendered])

  return { isReady, hasRendered }
}

export const useDataStream = (callback: (data: PluginData) => void) => {
  const { manager } = usePluginReactContext()

  useEffect(() => {
    return manager.onDataUpdate(callback)
  }, [callback, manager])
}

export const useExportRequest = (handler: ExportHandler) => {
  const { manager } = usePluginReactContext()

  useEffect(() => {
    manager.registerExportHandler(handler)
    return () => {
      manager.unregisterExportHandler(handler)
    }
  }, [handler, manager])

  const reportProgress = (percent: number, message: string) => {
    manager.reportExportProgress(percent, message)
  }

  return { reportProgress }
}
