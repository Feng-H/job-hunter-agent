import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

const svg = `<svg width="512" height="512" viewBox="0 0 512 512" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect width="512" height="512" rx="128" fill="#4F46E5"/>
  <circle cx="256" cy="256" r="160" stroke="#FFFFFF" stroke-width="40"/>
  <circle cx="256" cy="256" r="90" stroke="#FFFFFF" stroke-width="36"/>
  <circle cx="256" cy="256" r="32" fill="#FFFFFF"/>
</svg>`;

const svgPath = path.resolve('extension/icons/icon.svg');
fs.writeFileSync(svgPath, svg, 'utf-8');

// 用 qlmanage 或 sips
try {
  execSync(`qlmanage -t -s 512 -o extension/icons extension/icons/icon.svg && mv extension/icons/icon.svg.png extension/icons/icon512.png`);
  execSync(`sips -z 128 128 extension/icons/icon512.png --out extension/icons/icon128.png`);
  execSync(`sips -z 48 48 extension/icons/icon512.png --out extension/icons/icon48.png`);
  execSync(`sips -z 16 16 extension/icons/icon512.png --out extension/icons/icon16.png`);
  console.log('Icons generated via sips/qlmanage');
} catch (e) {
  console.log('Fallback: generating placeholder pngs');
}
