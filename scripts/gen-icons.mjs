import * as fs from 'fs';
import { execSync } from 'child_process';

// Notion 风格扩展图标：暖炭灰圆角方块 + 白色极简公文包线稿（与 Web 端品牌 icon 一致）
const svg = `<svg width="512" height="512" viewBox="0 0 512 512" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect width="512" height="512" rx="112" fill="#37352F"/>
  <rect x="112" y="196" width="288" height="208" rx="28" stroke="#FFFFFF" stroke-width="26"/>
  <path d="M204 196v-32a28 28 0 0 1 28-28h48a28 28 0 0 1 28 28v32" stroke="#FFFFFF" stroke-width="26" stroke-linecap="round"/>
  <path d="M112 286h288" stroke="#FFFFFF" stroke-width="26" stroke-linecap="round"/>
</svg>`;

fs.writeFileSync('extension/icons/icon.svg', svg, 'utf-8');

try {
  execSync(`qlmanage -t -s 512 -o extension/icons extension/icons/icon.svg && mv extension/icons/icon.svg.png extension/icons/icon512.png`);
  execSync(`sips -z 128 128 extension/icons/icon512.png --out extension/icons/icon128.png >/dev/null`);
  execSync(`sips -z 48 48 extension/icons/icon512.png --out extension/icons/icon48.png >/dev/null`);
  execSync(`sips -z 16 16 extension/icons/icon512.png --out extension/icons/icon16.png >/dev/null`);
  console.log('✅ 扩展图标已重新生成（Notion 风格公文包）');
} catch (e) {
  console.log('⚠️ 图标生成失败:', e.message);
}
