const sharp = require('sharp');
const toIco = require('to-ico');
const fs = require('fs');
const path = require('path');

const svgPath = path.join(__dirname, '..', 'public', 'crystal-icon.svg');
const icoPath = path.join(__dirname, '..', 'public', 'crystal.ico');

async function main() {
  const svgBuffer = fs.readFileSync(svgPath);
  const sizes = [16, 32, 48, 64, 128, 256];

  const pngBuffers = await Promise.all(
    sizes.map(size =>
      sharp(svgBuffer, { density: 300 })
        .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .png()
        .toBuffer()
    )
  );

  const ico = await toIco(pngBuffers);
  fs.writeFileSync(icoPath, ico);
  console.log(`Created ${icoPath} with sizes: ${sizes.join(', ')}`);

  // Also save a 256px PNG for electron-builder
  const png256Path = path.join(__dirname, '..', 'public', 'crystal-256.png');
  fs.writeFileSync(png256Path, pngBuffers[5]);
  console.log(`Created ${png256Path}`);
}

main().catch(err => { console.error(err); process.exit(1); });
