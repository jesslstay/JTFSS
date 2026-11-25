#!/usr/bin/env node
/*
  Renders the seamless fireplace loop (fireplace/index.html) to an H.264 MP4.

  Frames are drawn in headless Chromium, read back as raw RGB and piped into
  ffmpeg — no PNGs on disk. Work is split across N parallel workers, each
  encoding a segment that starts on a keyframe; segments are then joined
  losslessly with ffmpeg's concat demuxer.

  node scripts/render_loop.js --loop 60 --fps 30 --w 1920 --h 1080 \
       --workers 4 --out build/fire_loop.mp4

  Encoding is YouTube-friendly: yuv420p, 2s GOP (keyframe every 2s, required
  for live streaming), CRF 17 capped at ~6.8 Mbps.
*/
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, v, i, a) => (v.startsWith('--') ? acc.concat([[v.slice(2), a[i + 1]]]) : acc), [])
);
const LOOP = parseFloat(args.loop || '60');
const FPS = parseInt(args.fps || '30');
const W = parseInt(args.w || '1920');
const H = parseInt(args.h || '1080');
const WORKERS = parseInt(args.workers || '4');
const OUT = path.resolve(args.out || 'build/fire_loop.mp4');
const PAGE = path.resolve(__dirname, '..', 'fireplace', 'index.html');

const TOTAL = Math.round(LOOP * FPS);
const GOP = FPS * 2;

function encoder(file) {
  const ff = spawn('ffmpeg', [
    '-hide_banner', '-loglevel', 'error', '-y',
    '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', `${W}x${H}`, '-r', String(FPS), '-i', '-',
    '-vf', 'vflip',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-tune', 'grain',
    '-maxrate', '6800k', '-bufsize', '13600k',
    '-g', String(GOP), '-keyint_min', String(GOP), '-sc_threshold', '0',
    '-pix_fmt', 'yuv420p', '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709',
    '-movflags', '+faststart',
    file,
  ], { stdio: ['pipe', 'inherit', 'inherit'] });
  return ff;
}

const write = (stream, buf) => new Promise((res, rej) => (stream.write(buf) ? res() : stream.once('drain', res)));

async function renderSegment(browser, idx, from, to, file, progress) {
  const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
  page.on('pageerror', e => console.error('page error:', e.message));
  await page.goto(`file://${PAGE}?w=${W}&h=${H}&loop=${LOOP}&render=1`);
  const ff = encoder(file);
  const done = new Promise((res, rej) => ff.on('close', c => (c === 0 ? res() : rej(new Error('ffmpeg exit ' + c)))));
  for (let f = from; f < to; f++) {
    const b64 = await page.evaluate(t => window.renderFrame(t), f / FPS);
    await write(ff.stdin, Buffer.from(b64, 'base64'));
    progress();
  }
  ff.stdin.end();
  await done;
  await page.close();
}

(async () => {
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  const tmp = fs.mkdtempSync(path.join(path.dirname(OUT), '.seg-'));
  // segment boundaries on GOP multiples so every segment starts with a keyframe
  const gops = Math.ceil(TOTAL / GOP);
  const per = Math.ceil(gops / WORKERS) * GOP;
  const segs = [];
  for (let s = 0, i = 0; s < TOTAL; s += per, i++) segs.push({ i, from: s, to: Math.min(TOTAL, s + per), file: path.join(tmp, `seg${i}.mp4`) });

  console.log(`Rendering ${TOTAL} frames (${LOOP}s @ ${FPS}fps, ${W}x${H}) with ${segs.length} workers…`);
  const browser = await chromium.launch({
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  });
  let n = 0;
  const t0 = Date.now();
  const progress = () => {
    n++;
    if (n % 30 === 0 || n === TOTAL) {
      const el = (Date.now() - t0) / 1000;
      process.stdout.write(`  ${n}/${TOTAL} frames  ${(n / el).toFixed(2)} fps  ETA ${Math.round((TOTAL - n) / (n / el))}s\n`);
    }
  };
  await Promise.all(segs.map(s => renderSegment(browser, s.i, s.from, s.to, s.file, progress)));
  await browser.close();

  const list = path.join(tmp, 'list.txt');
  fs.writeFileSync(list, segs.map(s => `file '${s.file}'`).join('\n'));
  await new Promise((res, rej) =>
    spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', '-movflags', '+faststart', OUT], { stdio: 'inherit' })
      .on('close', c => (c === 0 ? res() : rej(new Error('concat failed')))));
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(`Done: ${OUT}`);
})().catch(e => { console.error(e); process.exit(1); });
