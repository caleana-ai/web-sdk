import type { ReactNode } from "react"
import { createContext, useEffect, useMemo, useState } from "react"
import { PluginManager } from "../core/plugin-manager.js"
import type { PluginContext, PluginLifecycle, PluginSDKOptions } from "../types.js"

export interface PluginReactContextValue extends PluginContext {
  manager: PluginManager
}

export const PluginReactContext = createContext<PluginReactContextValue | null>(
  null
)

interface PluginProviderProps {
  children: ReactNode
  lifecycle: PluginLifecycle
  options?: PluginSDKOptions
}

export const PluginProvider = ({
  children,
  lifecycle,
  options = {},
}: PluginProviderProps) => {
  const [manager] = useState(() => new PluginManager(options))
  const [context, setContext] = useState<PluginContext>(() => manager.getContext())

  useEffect(() => {
    const unsubscribe = manager.subscribe(() => {
      setContext(manager.getContext())
    })
    manager.registerLifecycle(lifecycle)
    setContext(manager.getContext())

    return () => {
      unsubscribe()
      void manager.cleanup()
    }
  }, [manager, lifecycle])

  const contextWithManager = useMemo(
    () => ({ ...context, manager }),
    [context, manager]
  )

  return (
    <PluginReactContext.Provider value={contextWithManager}>
      {children}
    </PluginReactContext.Provider>
  )
}
