const fs = require("fs")
const path = require("path")
const https = require("https")

function get(url) {
  return new Promise((resolve, reject) => {
    https
      .get(
        url,
        {
          headers: {
            "user-agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
          }
        },
        (res) => {
          const chunks = []
          res.on("data", (c) => chunks.push(c))
          res.on("end", () => {
            resolve({
              status: res.statusCode || 0,
              headers: res.headers || {},
              body: Buffer.concat(chunks)
            })
          })
        }
      )
      .on("error", reject)
  })
}

async function fetchText(url) {
  const r = await get(url)
  if ([301, 302, 303, 307, 308].includes(r.status)) {
    const loc = String(r.headers.location || "")
    if (!loc) throw new Error("redirect_no_location")
    const next = loc.startsWith("http") ? loc : new URL(loc, url).toString()
    return fetchText(next)
  }
  return r.body.toString("utf8")
}

function findMeta(html, key) {
  const idx = html.toLowerCase().indexOf(key.toLowerCase())
  if (idx < 0) return ""
  const cidx = html.toLowerCase().indexOf("content=", idx)
  if (cidx < 0) return ""
  const q = html[cidx + 8]
  if (q !== '"' && q !== "'") return ""
  const end = html.indexOf(q, cidx + 9)
  if (end < 0) return ""
  return html.slice(cidx + 9, end).trim()
}

async function downloadTo(url, outFile) {
  await new Promise((resolve, reject) => {
    https
      .get(
        url,
        {
          headers: {
            "user-agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
          }
        },
        (res) => {
          if ([301, 302, 303, 307, 308].includes(res.statusCode || 0)) {
            const loc = String(res.headers.location || "")
            res.resume()
            if (!loc) return reject(new Error("redirect_no_location"))
            const next = loc.startsWith("http") ? loc : new URL(loc, url).toString()
            downloadTo(next, outFile).then(resolve, reject)
            return
          }
          if ((res.statusCode || 0) >= 400) {
            res.resume()
            return reject(new Error(`download_failed_${res.statusCode}`))
          }
          fs.mkdirSync(path.dirname(outFile), { recursive: true })
          const ws = fs.createWriteStream(outFile)
          res.pipe(ws)
          ws.on("finish", () => ws.close(resolve))
          ws.on("error", reject)
        }
      )
      .on("error", reject)
  })
}

async function main() {
  const pageUrl = process.argv[2] || ""
  const outFile = process.argv[3] || ""
  if (!pageUrl || !outFile) {
    process.stderr.write("usage: node grab_formula1_og_image.js <pageUrl> <outFile>\\n")
    process.exit(2)
    return
  }
  const html = await fetchText(pageUrl)
  const og = findMeta(html, 'property=\"og:image\"') || findMeta(html, 'name=\"twitter:image\"')
  if (!og) {
    process.stderr.write("no og:image found\\n")
    process.exit(3)
    return
  }
  await downloadTo(og, outFile)
  process.stdout.write(`${og}\\n`)
}

main().catch((err) => {
  process.stderr.write(String(err && err.stack ? err.stack : err) + "\n")
  process.exit(1)
})
