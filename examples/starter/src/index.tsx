import { useEffect, useState } from "react"
import { createRoot } from "react-dom/client"
import {
  PluginProvider,
  useAutoResize,
  useExportRequest,
  useHostTheme,
  usePluginContext,
  usePluginData,
  type PluginLifecycle,
} from "@caleana-ai/web-sdk"
import "./style.css"

const lifecycle: PluginLifecycle = {
  init: () => {},
  onDataUpdate: () => {},
}

const readMessage = (value: unknown): string | null => {
  if (
    typeof value !== "object" || value === null ||
    !("message" in value) || typeof value.message !== "string"
  ) return null
  return value.message
}

const MessageEditor = ({ initialMessage }: { initialMessage: string }) => {
  const [message, setMessage] = useState(initialMessage)
  useEffect(() => setMessage(initialMessage), [initialMessage])
  const { reportOutputChange } = usePluginContext()
  useAutoResize([message])
  useExportRequest((request) => {
    if (request.runtimeVersion) throw new Error("Pinned renderer runtime is not supported")
    if (request.format !== "txt") throw new Error("Unsupported native format")
    return new Blob([message], { type: "text/plain" })
  })

  return (
    <label>
      Message
      <textarea
        value={message}
        onChange={(event) => {
          setMessage(event.target.value)
          reportOutputChange({ message: event.target.value })
        }}
      />
    </label>
  )
}

const App = () => {
  const data = usePluginData()
  const theme = useHostTheme()
  const message = data ? readMessage(data.transformerOutput.data) : null
  return (
    <main data-theme={theme}>
      <h1>{data?.templateName ?? "My Plugin"}</h1>
      {!data ? <p>Waiting for data from Caleana...</p> : message === null ? (
        <p role="alert">Expected a message string in the plugin input.</p>
      ) : (
        <MessageEditor initialMessage={message} />
      )}
    </main>
  )
}

const container = document.getElementById("root")
if (!container) throw new Error("Missing root element")
createRoot(container).render(
  <PluginProvider lifecycle={lifecycle}><App /></PluginProvider>,
)
