#!/usr/bin/env node
/*
  Renders YouTube channel art from the actual fireplace shader + typography.

    node scripts/render_branding.js

  Outputs (branding/):
    banner_2560x1440.png      channel banner (text + fire inside the 1546x423 safe area)
    avatar_800x800.png        profile picture (YouTube crops to a circle)
    watermark_150x150.png     video watermark (transparent)
    thumb_24h_live.png        1280x720 thumbnail for the 24/7 livestream
    thumb_24h.png             1280x720 thumbnail for the 24-hour fireplace
    thumb_10h.png             1280x720 thumbnail for the 10-hour upload
    thumb_1h.png              1280x720 thumbnail for the 1-hour upload
*/
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'branding');
const PAGE = path.join(ROOT, 'fireplace', 'index.html');
const NAME = process.env.CHANNEL_NAME || 'EMBER NOIR';

const FONTS = `<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,500;1,300;1,400&family=Inter:wght@300;400;500&display=block" rel="stylesheet">`;

const BASE_CSS = `
  *{margin:0;padding:0;box-sizing:border-box}
  body{background:#000;overflow:hidden;-webkit-font-smoothing:antialiased}
  .stage{position:relative;overflow:hidden}
  .bg{position:absolute;inset:0;width:100%;height:100%}
  .serif{font-family:'Cormorant Garamond',serif;color:#f3e6da}
  .sans{font-family:Inter,sans-serif;color:#c9a98e;text-transform:uppercase}
  .gold{background:linear-gradient(180deg,#fff3e4 0%,#f1c79c 55%,#b9794a 100%);-webkit-background-clip:text;background-clip:text;color:transparent}
  .rule{height:1px;background:linear-gradient(90deg,transparent,#c58a5a,transparent)}
`;

async function fireFrame(browser, w, h, { zoom = 1, ox = 0, oy = 0, t = 7.3 } = {}) {
  const page = await browser.newPage({ viewport: { width: 400, height: 300 } });
  await page.goto(`file://${PAGE}?w=${w}&h=${h}&render=1&loop=60&zoom=${zoom}&ox=${ox}&oy=${oy}`);
  const url = await page.evaluate(t => { window.renderFrame(t); return document.getElementById('c').toDataURL('image/png'); }, t);
  await page.close();
  return url;
}

async function shoot(browser, w, h, html, file, transparent = false) {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  await page.setContent(`<!doctype html><html><head><meta charset="utf-8">${FONTS}<style>${BASE_CSS}</style></head><body${transparent ? ' style="background:transparent"' : ''}>${html}</body></html>`);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(OUT, file), omitBackground: transparent });
  await page.close();
  console.log('  branding/' + file);
}

const spaced = s => s.split('').join(' ').replace(/ {3}/g, '   ');

function thumb(bg, big, small) {
  return `
  <div class="stage" style="width:1280px;height:720px">
    <img class="bg" src="${bg}">
    <div style="position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,.55) 0%,rgba(0,0,0,0) 42%)"></div>
    <div style="position:absolute;top:44px;left:0;right:0;text-align:center">
      <div class="sans" style="font-size:17px;letter-spacing:.55em;font-weight:400;color:#d9b391">${NAME}</div>
      <div class="serif gold" style="font-size:132px;line-height:1;font-weight:300;margin-top:12px;letter-spacing:.02em">${big}</div>
      <div class="sans" style="font-size:18px;letter-spacing:.42em;margin-top:16px;color:#e8cdb4;font-weight:300">${small}</div>
    </div>
  </div>`;
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  });

  // ---- banner: wordmark + fireplace both inside the safe area (1546x423, centered)
  const bannerBg = await fireFrame(browser, 2560, 1440, { zoom: 2.2, oy: 0.142 });
  await shoot(browser, 2560, 1440, `
  <div class="stage" style="width:2560px;height:1440px">
    <img class="bg" src="${bannerBg}">
    <div style="position:absolute;left:0;right:0;top:492px;text-align:center">
      <div class="serif gold" style="font-size:118px;font-weight:300;letter-spacing:.34em;line-height:1;padding-left:.34em">${NAME}</div>
      <div class="sans" style="font-size:21px;letter-spacing:.62em;margin-top:22px;font-weight:300;color:#d6b496;padding-left:.62em">24 / 7 &nbsp;Modern Fireplace &nbsp;·&nbsp; Real Crackle</div>
    </div>
  </div>`, 'banner_2560x1440.png');

  // ---- avatar: close-up flames, bronze ring, serif monogram
  const avatarBg = await fireFrame(browser, 800, 800, { zoom: 0.62, ox: 0.12, oy: 0.06, t: 21.4 });
  const mono = NAME.split(/\s+/).map(w => w[0]).join('');
  await shoot(browser, 800, 800, `
  <div class="stage" style="width:800px;height:800px">
    <img class="bg" src="${avatarBg}" style="filter:brightness(.85) contrast(1.1)">
    <div style="position:absolute;inset:0;background:radial-gradient(circle at 50% 60%,rgba(0,0,0,0) 0%,rgba(0,0,0,.15) 50%,rgba(0,0,0,.9) 74%)"></div>
    <div style="position:absolute;inset:30px;border-radius:50%;border:2px solid rgba(214,160,112,.55)"></div>
    <div class="serif gold" style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:300px;font-weight:300;letter-spacing:-.02em;padding-bottom:120px;text-shadow:0 0 60px rgba(0,0,0,.6)">${mono}</div>
  </div>`, 'avatar_800x800.png');

  // ---- watermark (transparent)
  await shoot(browser, 150, 150, `
  <div style="width:150px;height:150px;border-radius:50%;border:2px solid rgba(240,200,160,.85);display:flex;align-items:center;justify-content:center">
    <span class="serif" style="font-size:66px;font-weight:400;color:#f6e3cf;letter-spacing:-.02em;padding-bottom:8px">${mono}</span>
  </div>`, 'watermark_150x150.png', true);

  // ---- thumbnails
  const thumbBg = await fireFrame(browser, 1280, 720, { zoom: 0.92, oy: 0.10, t: 33.1 });
  await shoot(browser, 1280, 720, thumb(thumbBg, `<span style="font-style:italic">Live</span> 24/7`, 'Modern Fireplace · Real Crackle'), 'thumb_24h_live.png');
  await shoot(browser, 1280, 720, thumb(thumbBg, '24 Hours', 'Modern Fireplace · Real Crackle'), 'thumb_24h.png');
  await shoot(browser, 1280, 720, thumb(thumbBg, '10 Hours', 'Modern Fireplace · Real Crackle'), 'thumb_10h.png');
  await shoot(browser, 1280, 720, thumb(thumbBg, '1 Hour', 'Fireplace for Sleep &amp; Focus'), 'thumb_1h.png');

  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
