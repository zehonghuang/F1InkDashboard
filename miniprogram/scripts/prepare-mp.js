const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { execFileSync } = require('child_process');

const projectRoot = path.resolve(__dirname, '..');

function ensureDirSync(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function copyDirSync(srcDir, dstDir) {
  const stat = fs.statSync(srcDir);
  if (!stat.isDirectory()) throw new Error(`Not a directory: ${srcDir}`);

  ensureDirSync(dstDir);

  const entries = fs.readdirSync(srcDir, { withFileTypes: true });
  for (const ent of entries) {
    const src = path.join(srcDir, ent.name);
    const dst = path.join(dstDir, ent.name);
    if (ent.isDirectory()) {
      copyDirSync(src, dst);
      continue;
    }
    if (ent.isFile()) {
      ensureDirSync(path.dirname(dst));
      fs.copyFileSync(src, dst);
      continue;
    }
  }
}

function crc32Table() {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    table[i] = c >>> 0;
  }
  return table;
}

const CRC_TABLE = crc32Table();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.alloc(4);
  const crcVal = crc32(Buffer.concat([typeBuf, data]));
  crcBuf.writeUInt32BE(crcVal, 0);
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

function createPngRGBA(width, height, rgbaAt) {
  const rowSize = 1 + width * 4;
  const raw = Buffer.alloc(rowSize * height);
  let o = 0;
  for (let y = 0; y < height; y++) {
    raw[o++] = 0;
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = rgbaAt(x, y);
      raw[o++] = r & 255;
      raw[o++] = g & 255;
      raw[o++] = b & 255;
      raw[o++] = a & 255;
    }
  }

  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const compressed = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([
    signature,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', compressed),
    pngChunk('IEND', Buffer.alloc(0))
  ]);
}

function writePngIcon(dstPath, kind, selected) {
  const W = 81;
  const H = 81;

  const base = selected ? [0x1c, 0x24, 0x38, 0xff] : [0x7a, 0x7e, 0x83, 0xff];
  const fill = selected ? [0x1c, 0x24, 0x38, 0x1a] : [0x7a, 0x7e, 0x83, 0x14];

  const img = createPngRGBA(W, H, (x, y) => {
    const setPixel = (rgba) => rgba;
    const empty = [0, 0, 0, 0];

    const drawRect = (x0, y0, x1, y1, rgba) =>
      x >= x0 && x <= x1 && y >= y0 && y <= y1 ? rgba : null;
    const drawBorder = (x0, y0, x1, y1, rgba) =>
      (x >= x0 && x <= x1 && (y === y0 || y === y1)) || (y >= y0 && y <= y1 && (x === x0 || x === x1)) ? rgba : null;

    const cx = 40;
    const cy = 28;

    if (kind === 'archive') {
      const tab = drawRect(18, 20, 42, 30, fill) || drawBorder(18, 20, 42, 30, base);
      if (tab) return setPixel(tab);
      const body = drawRect(14, 30, 66, 62, fill) || drawBorder(14, 30, 66, 62, base);
      if (body) return setPixel(body);
      const line = drawRect(22, 40, 58, 40, base);
      if (line) return setPixel(line);
      return empty;
    }

    if (kind === 'compare') {
      const axis = drawRect(18, 62, 64, 62, base) || drawRect(18, 26, 18, 62, base);
      if (axis) return setPixel(axis);
      const b1 = drawRect(24, 48, 30, 61, fill) || drawBorder(24, 48, 30, 61, base);
      if (b1) return setPixel(b1);
      const b2 = drawRect(38, 40, 44, 61, fill) || drawBorder(38, 40, 44, 61, base);
      if (b2) return setPixel(b2);
      const b3 = drawRect(52, 32, 58, 61, fill) || drawBorder(52, 32, 58, 61, base);
      if (b3) return setPixel(b3);
      return empty;
    }

    if (kind === 'mine') {
      const dx = x - cx;
      const dy = y - cy;
      const head = dx * dx + dy * dy <= 12 * 12 ? fill : null;
      const headBorder = dx * dx + dy * dy <= 12 * 12 && dx * dx + dy * dy >= 11 * 11 ? base : null;
      if (headBorder) return setPixel(headBorder);
      if (head) return setPixel(head);
      const body = drawRect(22, 46, 58, 64, fill) || drawBorder(22, 46, 58, 64, base);
      if (body) return setPixel(body);
      return empty;
    }

    return empty;
  });

  ensureDirSync(path.dirname(dstPath));
  fs.writeFileSync(dstPath, img);
}

function main() {
  const pkgRoot = path.join(projectRoot, 'node_modules', 'iview-weapp');
  const srcDist = path.join(pkgRoot, 'dist');
  const outPkgRoot = path.join(projectRoot, 'miniprogram_npm', 'iview-weapp');
  const outDist = path.join(outPkgRoot, 'dist');
  const repoRoot = path.resolve(projectRoot, '..');

  if (!fs.existsSync(srcDist)) {
    throw new Error(`iview-weapp dist not found: ${srcDist}`);
  }

  const components = [
    'panel',
    'cell',
    'cell-group',
    'input',
    'button',
    'divider',
    'card',
    'tab-bar',
    'tab-bar-item',
    'icon',
    'badge'
  ];

  ensureDirSync(outDist);
  for (const c of components) {
    copyDirSync(path.join(srcDist, c), path.join(outDist, c));
  }

  const pkgJsonSrc = path.join(pkgRoot, 'package.json');
  const pkgJsonDst = path.join(outPkgRoot, 'package.json');
  ensureDirSync(path.dirname(pkgJsonDst));
  fs.copyFileSync(pkgJsonSrc, pkgJsonDst);

  const iconsDir = path.join(projectRoot, 'assets', 'tabbar');
  writePngIcon(path.join(iconsDir, 'archive.png'), 'archive', false);
  writePngIcon(path.join(iconsDir, 'archive_selected.png'), 'archive', true);
  writePngIcon(path.join(iconsDir, 'compare.png'), 'compare', false);
  writePngIcon(path.join(iconsDir, 'compare_selected.png'), 'compare', true);
  writePngIcon(path.join(iconsDir, 'mine.png'), 'mine', false);
  writePngIcon(path.join(iconsDir, 'mine_selected.png'), 'mine', true);

  const circuitsRawSrcDir = path.join(repoRoot, 'backend', 'static', 'circuits', '2026', 'raw');
  const circuitsDstDir = path.join(projectRoot, 'assets', 'circuits', '2026');
  const circuitsRawDstDir = path.join(circuitsDstDir, 'raw');

  if (!fs.existsSync(circuitsRawSrcDir)) {
    throw new Error(`Circuit raw dir not found: ${circuitsRawSrcDir}`);
  }

  fs.rmSync(circuitsRawDstDir, { recursive: true, force: true });
  ensureDirSync(circuitsRawDstDir);
  const rawEntries = fs.readdirSync(circuitsRawSrcDir, { withFileTypes: true });
  for (const ent of rawEntries) {
    if (!ent.isFile()) continue;
    if (!ent.name.endsWith('_map.webp')) continue;
    fs.copyFileSync(path.join(circuitsRawSrcDir, ent.name), path.join(circuitsRawDstDir, ent.name));
  }

  const circuitsPngDstDir = path.join(circuitsDstDir, 'maps');
  fs.rmSync(circuitsPngDstDir, { recursive: true, force: true });
  ensureDirSync(circuitsPngDstDir);
  const copiedWebps = fs.readdirSync(circuitsRawDstDir, { withFileTypes: true });
  for (const ent of copiedWebps) {
    if (!ent.isFile()) continue;
    if (!ent.name.endsWith('_map.webp')) continue;
    const src = path.join(circuitsRawDstDir, ent.name);
    const dst = path.join(circuitsPngDstDir, ent.name.replace(/\.webp$/i, '.png'));
    execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', src, '-vf', 'scale=320:-1', dst], {
      stdio: 'inherit'
    });
  }

  const fontSrc = path.join(repoRoot, 'font', 'Formula1-Bold_web_0.ttf');
  const fontDst = path.join(projectRoot, 'assets', 'fonts', 'Formula1-Bold.ttf');
  if (!fs.existsSync(fontSrc)) {
    throw new Error(`Font not found: ${fontSrc}`);
  }
  ensureDirSync(path.dirname(fontDst));
  fs.copyFileSync(fontSrc, fontDst);

  const base64Dst = path.join(projectRoot, 'assets', 'fonts', 'formula1_base64.js');
  const base64 = fs.readFileSync(fontDst).toString('base64');
  fs.writeFileSync(base64Dst, `module.exports = "${base64}";\n`);
}

main();
