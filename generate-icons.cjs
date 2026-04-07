const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const SOURCE = path.join(__dirname, 'icon-source.png');

async function generate() {
  const configs = [
    { name: 'icon-192.png', size: 192, maskable: false },
    { name: 'icon-512.png', size: 512, maskable: false },
    { name: 'icon-maskable-192.png', size: 192, maskable: true },
    { name: 'icon-maskable-512.png', size: 512, maskable: true },
  ];

  for (const cfg of configs) {
    const { size, maskable } = cfg;

    if (maskable) {
      // maskable: 안전 영역(80%) 안에 캐릭터 배치, 배경 채움
      const innerSize = Math.round(size * 0.7);
      const resized = await sharp(SOURCE)
        .resize(innerSize, innerSize, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .toBuffer();

      await sharp({
        create: {
          width: size,
          height: size,
          channels: 4,
          background: { r: 253, g: 240, b: 240, alpha: 255 } // #fdf0f0
        }
      })
        .composite([{ input: resized, gravity: 'centre' }])
        .png()
        .toFile(cfg.name);
    } else {
      // any: 투명 배경 + 여백 포함해서 가운데 정렬
      const innerSize = Math.round(size * 0.85);
      const resized = await sharp(SOURCE)
        .resize(innerSize, innerSize, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
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
        .toFile(cfg.name);
    }

    console.log(`Generated ${cfg.name}`);
  }

  // favicon용 32x32 PNG 생성
  await sharp(SOURCE)
    .resize(32, 32, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toFile('favicon.png');
  console.log('Generated favicon.png');

  // favicon.svg - 64x64 PNG를 base64로 임베드한 SVG
  const favicon64 = await sharp(SOURCE)
    .resize(56, 56, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
  const b64 = favicon64.toString('base64');
  const svgFavicon = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="64" height="64" viewBox="0 0 64 64">
  <image x="4" y="4" width="56" height="56" href="data:image/png;base64,${b64}"/>
</svg>`;
  fs.writeFileSync('favicon.svg', svgFavicon);
  console.log('Generated favicon.svg');

  // www 디렉토리에도 복사
  const wwwDir = path.join(__dirname, 'www');
  if (fs.existsSync(wwwDir)) {
    for (const cfg of configs) {
      fs.copyFileSync(cfg.name, path.join(wwwDir, cfg.name));
      console.log(`Copied ${cfg.name} -> www/`);
    }
  }

  console.log('Done!');
}

generate().catch(console.error);
