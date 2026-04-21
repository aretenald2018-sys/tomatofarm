const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

// 소스: 루트의 icon.svg (3일차 happy 토마토 캐릭터)
const PROJECT_ROOT = path.resolve(__dirname, '..');
const SOURCE_SVG = path.join(PROJECT_ROOT, 'icon.svg');

async function generate() {
  const svgBuffer = fs.readFileSync(SOURCE_SVG);

  const configs = [
    { name: 'icon-192.png', size: 192, maskable: false },
    { name: 'icon-512.png', size: 512, maskable: false },
    { name: 'icon-maskable-192.png', size: 192, maskable: true },
    { name: 'icon-maskable-512.png', size: 512, maskable: true },
  ];

  for (const cfg of configs) {
    const { size, maskable, name } = cfg;
    const outPath = path.join(PROJECT_ROOT, name);

    if (maskable) {
      // maskable: 안전 영역(70%) 안에 캐릭터 배치, 배경 채움(#fdf0f0)
      const innerSize = Math.round(size * 0.7);
      const resized = await sharp(svgBuffer, { density: 384 })
        .resize(innerSize, innerSize, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .png()
        .toBuffer();

      await sharp({
        create: {
          width: size,
          height: size,
          channels: 4,
          background: { r: 253, g: 240, b: 240, alpha: 1 } // #fdf0f0
        }
      })
        .composite([{ input: resized, gravity: 'centre' }])
        .png()
        .toFile(outPath);
    } else {
      // any: 투명 배경 + 여백 포함해서 가운데 정렬
      const innerSize = Math.round(size * 0.9);
      const resized = await sharp(svgBuffer, { density: 384 })
        .resize(innerSize, innerSize, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .png()
        .toBuffer();

      await sharp({
        create: {
          width: size,
          height: size,
          channels: 4,
          background: { r: 0, g: 0, b: 0, alpha: 0 }
        }
      })
        .composite([{ input: resized, gravity: 'centre' }])
        .png()
        .toFile(outPath);
    }

    console.log(`Generated ${name}`);
  }

  // favicon용 32x32 PNG
  await sharp(svgBuffer, { density: 192 })
    .resize(32, 32, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toFile(path.join(PROJECT_ROOT, 'favicon.png'));
  console.log('Generated favicon.png');

  // favicon.svg 는 루트의 벡터 그대로 사용 — 별도 생성 불필요
  console.log('favicon.svg: using vector source as-is (no regeneration)');

  // www 디렉토리에도 복사
  const wwwDir = path.join(PROJECT_ROOT, 'www');
  if (fs.existsSync(wwwDir)) {
    for (const cfg of configs) {
      const src = path.join(PROJECT_ROOT, cfg.name);
      const dst = path.join(wwwDir, cfg.name);
      fs.copyFileSync(src, dst);
      console.log(`Copied ${cfg.name} -> www/`);
    }
    // favicon.png/svg 도 www 복사
    for (const f of ['favicon.png', 'favicon.svg', 'icon.svg']) {
      const src = path.join(PROJECT_ROOT, f);
      const dst = path.join(wwwDir, f);
      if (fs.existsSync(src)) {
        fs.copyFileSync(src, dst);
        console.log(`Copied ${f} -> www/`);
      }
    }
  }

  console.log('Done!');
}

generate().catch(err => {
  console.error(err);
  process.exit(1);
});
