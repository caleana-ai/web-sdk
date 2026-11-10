import assert from "node:assert/strict"
import { chromium, expect } from "@playwright/test"
import { build } from "esbuild"
import { createServer } from "node:http"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { extname, resolve, sep } from "node:path"
import { fileURLToPath } from "node:url"

const root = fileURLToPath(new URL("../", import.meta.url))
const consumer = resolve(root, "artifacts/consumer/dist")
const output = resolve(root, "artifacts/browser")
await mkdir(output, { recursive: true })
const manifest = JSON.parse(await readFile(resolve(consumer, "manifest.json"), "utf8"))
const hostSource = process.env.CALEANA_HOST_MESSAGING_SOURCE
const hostImport = hostSource
  ? `import { readPluginMessage as parseMessage } from ${JSON.stringify(hostSource)};`
  : `import { parsePluginToHostMessage as parseMessage } from './dist/protocol.js';`
const bundled = await build({
  stdin: {
    sourcefile: "sdk-host-check.js", resolveDir: root,
    contents: `${hostImport}
      const frame = document.querySelector('iframe');
      const origin = new URL(frame.src).origin;
      window.responses = [];
      window.send = (message) => frame.contentWindow.postMessage(message, origin);
      addEventListener('message', async (event) => {
        if (event.source !== frame.contentWindow || event.origin !== origin) return;
        const message = parseMessage(event.data);
        if (!message) return;
        const result = structuredClone(message);
        if (message.type === 'EXPORT_READY') result.text = await message.payload.exportData.blob.text();
        window.responses.push(result);
      });`,
  },
  bundle: true, format: "esm", platform: "browser", write: false,
})
const server = createServer(async (request, response) => {
  try {
    const path = new URL(request.url, "http://localhost").pathname
    if (path === "/host.js") {
      response.setHeader("Content-Type", "text/javascript")
      response.end(bundled.outputFiles[0].contents)
      return
    }
    if (path === "/") {
      response.setHeader("Content-Type", "text/html")
      const address = server.address()
      response.end(`<!doctype html><title>Caleana SDK compatibility</title><h1>External plugin compatibility</h1><iframe title="Plugin" sandbox="allow-scripts allow-same-origin" src="http://localhost:${address.port}/plugin/index.html" style="width:95%;height:440px;border:1px solid #888"></iframe><script type="module" src="/host.js"></script>`)
      return
    }
    const file = resolve(consumer, "." + path.replace(/^\/plugin/, ""))
    if (!file.startsWith(consumer + sep)) { response.writeHead(403); response.end(); return }
    const content = await readFile(file)
    response.setHeader("Content-Type", {".html":"text/html", ".js":"text/javascript", ".css":"text/css"}[extname(file)] ?? "application/octet-stream")
    response.end(content)
  } catch {
    response.writeHead(404)
    response.end("Not found")
  }
})
await new Promise((done) => server.listen(0, done))
const browser = await chromium.launch({ headless: true })
try {
  const page = await browser.newPage({ viewport: {width:1000, height:700} })
  const errors = []
  page.on("pageerror", error => errors.push(error.message))
  await page.goto(`http://127.0.0.1:${server.address().port}/`)
  const frame = page.frameLocator('iframe')
  await expect(frame.getByText("Waiting for data from Caleana...")).toBeVisible()
  await expect.poll(() => page.evaluate(() => window.responses.some(message => message.type === "READY"))).toBe(true)
  const config = theme => ({type:"PLUGIN_CONFIG", payload:{config:{name:manifest.name, version:manifest.version, inputSchema:manifest.inputSchema, displayOptions:{theme}}}})
  const data = value => ({type:"DATA_STREAM", payload:{data:{templateId:"external-plugin", templateName:"Public SDK plugin", transformerOutput:{schema:manifest.inputSchema, data:value}}}})
  const send = message => page.evaluate(message => window.send(message), message)
  await send(config("dark"))
  await send(data({message:"Hello from Caleana"}))
  await expect(frame.getByRole("textbox", {name:"Message"})).toHaveValue("Hello from Caleana")
  await expect(frame.locator("html")).toHaveAttribute("data-theme", "dark")
  await frame.getByRole("textbox", {name:"Message"}).fill("Edited inside the public plugin")
  await expect.poll(() => page.evaluate(() => window.responses.filter(message => message.type === "OUTPUT_CHANGED").at(-1)?.payload.data.message)).toBe("Edited inside the public plugin")
  await send({type:"REQUEST_EXPORT", payload:{exportRequest:{requestId:"public-export", format:"txt", targetFormat:"txt"}}})
  await expect.poll(() => page.evaluate(() => window.responses.find(message => message.type === "EXPORT_READY" && message.payload.exportData.requestId === "public-export")?.text)).toBe("Edited inside the public plugin")
  await send(config("light"))
  await expect(frame.locator("html")).toHaveAttribute("data-theme", "light")
  await expect(frame.getByRole("textbox")).toHaveValue("Edited inside the public plugin")
  await page.screenshot({path:resolve(output,"public-plugin.png"), fullPage:true})
  await send({type:"REQUEST_EXPORT", payload:{exportRequest:{requestId:"unsupported-export", format:"missing", targetFormat:"missing"}}})
  await expect.poll(() => page.evaluate(() => window.responses.find(message => message.type === "EXPORT_ERROR" && message.payload.requestId === "unsupported-export")?.payload.error)).toBe("Unsupported native format")
  await send(data({message:123}))
  await expect(frame.getByRole("alert")).toHaveText("Expected a message string in the plugin input.")
  await page.screenshot({path:resolve(output,"invalid-input.png"), fullPage:true})
  await send(data({message:"Recovered input"}))
  await expect(frame.getByRole("textbox")).toHaveValue("Recovered input")
  await page.screenshot({path:resolve(output,"recovered-input.png"), fullPage:true})
  assert.deepEqual(errors, [])
  await writeFile(resolve(output,"result.json"), JSON.stringify({host:hostSource ?? "public protocol", checks:["cross-origin initialization","schema-labelled input","editing","correlated Blob export","theme update","export failure","invalid input","recovery"], errors},null,2))
  console.log("Browser passed: cross-origin handshake, data, edits, theme, Blob export, failure and recovery")
} finally {
  await browser.close()
  await new Promise(done => server.close(done))
}
