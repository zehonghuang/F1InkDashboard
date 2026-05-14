const fs = require("fs")
const path = require("path")

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true })
}

function rmDir(p) {
  if (fs.existsSync(p)) fs.rmSync(p, { recursive: true, force: true })
}

function copyDir(src, dest) {
  rmDir(dest)
  ensureDir(path.dirname(dest))
  fs.cpSync(src, dest, { recursive: true })
}

function copyFile(src, dest) {
  ensureDir(path.dirname(dest))
  fs.copyFileSync(src, dest)
}

function patchEcCanvasIndex(indexJsPath) {
  if (!fs.existsSync(indexJsPath)) return
  const s = fs.readFileSync(indexJsPath, "utf8")
  if (s.includes("WxCanvas.prototype.addEventListener")) return
  const needle = "WxCanvas.prototype.attachEvent = function attachEvent() {\n    // noop\n  };"
  if (!s.includes(needle)) return
  const injected =
    needle +
    "\n\n  WxCanvas.prototype.addEventListener = function addEventListener() {\n    // noop\n  };\n\n  WxCanvas.prototype.removeEventListener = function removeEventListener() {\n    // noop\n  };"
  fs.writeFileSync(indexJsPath, s.replace(needle, injected), "utf8")
}

function main() {
  const root = path.resolve(__dirname, "..")
  const nodeModules = path.join(root, "node_modules")
  const outNpm = path.join(root, "miniprogram_npm")
  const libs = path.join(root, "libs")

  const tdesignSrc = path.join(nodeModules, "tdesign-miniprogram", "miniprogram_dist")
  const tdesignOut = path.join(outNpm, "tdesign-miniprogram")

  const ecSrc = path.join(nodeModules, "echarts-for-weixin", "miniprogram_dist")
  const ecOut = path.join(outNpm, "echarts-for-weixin")

  const echartsSrc = path.join(nodeModules, "echarts", "dist", "echarts.min.js")
  const echartsOut = path.join(libs, "echarts.min.js")

  if (!fs.existsSync(tdesignSrc)) throw new Error("missing: node_modules/tdesign-miniprogram/miniprogram_dist")
  if (!fs.existsSync(ecSrc)) throw new Error("missing: node_modules/echarts-for-weixin/miniprogram_dist")
  if (!fs.existsSync(echartsSrc)) throw new Error("missing: node_modules/echarts/dist/echarts.min.js")

  copyDir(tdesignSrc, tdesignOut)
  copyDir(ecSrc, ecOut)
  copyFile(echartsSrc, echartsOut)

  patchEcCanvasIndex(path.join(ecOut, "index.js"))

  process.stdout.write("prepare-mp ok\n")
}

main()

