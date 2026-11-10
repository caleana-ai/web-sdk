import type { PluginConfig, PluginLifecycle, PluginSDKOptions } from '../types.js'

export interface CreatePluginOptions {
  config: PluginConfig
  lifecycle: PluginLifecycle
  sdkOptions?: PluginSDKOptions
}

export const createPlugin = ({
  config,
  lifecycle,
  sdkOptions = {}
}: CreatePluginOptions) => {
  return {
    config,
    lifecycle,
    sdkOptions,
  }
}
