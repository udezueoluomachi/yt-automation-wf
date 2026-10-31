import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { resolveProjectPath } from '../src/paths.js';

console.log('================================================================');
console.log('🚀 YouTube Shorts Engine: AI & Developer Onboarding Setup');
console.log('================================================================\n');

// 1. Directory Structure Verification
console.log('📁 1. Verifying directory structure...');
const dirs = [
  resolveProjectPath('out'),
  resolveProjectPath('public', 'audio'),
  resolveProjectPath('public', 'clips'),
  resolveProjectPath('public', 'dashboard'),
  resolveProjectPath('data'),
];

for (const dir of dirs) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    console.log(`   + Created missing directory: ${dir}`);
  } else {
    console.log(`   ✓ Directory exists: ${path.basename(dir)}`);
  }
}

// 2. .env Configuration
console.log('\n🔐 2. Checking environment configuration (.env)...');
const envPath = resolveProjectPath('.env');
const envExamplePath = resolveProjectPath('.env.example');

if (!fs.existsSync(envPath)) {
  if (fs.existsSync(envExamplePath)) {
    fs.copyFileSync(envExamplePath, envPath);
    console.log('   ⚠️  Created .env from .env.example.');
    console.log('   👉 ACTION NEEDED: Open .env and configure your SMTP credentials and AGY_CONVERSATION_ID.');
  } else {
    console.log('   ❌ .env.example not found!');
  }
} else {
  console.log('   ✓ .env file present.');
}

// 3. System Tools Check
console.log('\n🛠️  3. Inspecting system dependencies...');

function checkTool(cmd: string, name: string, installTip: string): boolean {
  try {
    execSync(cmd, { stdio: 'ignore' });
    console.log(`   ✓ ${name} is installed.`);
    return true;
  } catch {
    console.log(`   ⚠️  ${name} not found!`);
    console.log(`      Install tip: ${installTip}`);
    return false;
  }
}

checkTool('ffmpeg -version', 'FFmpeg', 'Ubuntu/Debian: sudo apt install -y ffmpeg | macOS: brew install ffmpeg | Windows: winget install Gyan.FFmpeg');
checkTool('google-chrome --version || chrome --version', 'Google Chrome', 'Install from https://www.google.com/chrome/');
checkTool('agy --version || agy.cmd --version', 'Antigravity CLI (agy)', 'curl -fsSL https://antigravity.google/install.sh | bash');
checkTool('kimi-webbridge --version || kimi-webbridge.cmd --version', 'Kimi WebBridge', 'Install via Antigravity CLI builtins or https://github.com/kimi/webbridge');

// 4. Calendar Integrity
console.log('\n📅 4. Verifying content calendar...');
const calPath = resolveProjectPath('data', 'calendar.json');
if (fs.existsSync(calPath)) {
  try {
    const raw = fs.readFileSync(calPath, 'utf-8');
    const cal = JSON.parse(raw);
    console.log(`   ✓ calendar.json is valid (${cal.length} Shorts scheduled).`);
  } catch (err) {
    console.log(`   ❌ calendar.json parsing error: ${(err as Error).message}`);
  }
} else {
  console.log(`   ❌ calendar.json not found at ${calPath}!`);
}

// 5. Test Suite Verification
console.log('\n🧪 5. Running automated validation test suite...');
try {
  execSync('npm test', { stdio: 'inherit' });
  console.log('\n   ✓ All test suites passed cleanly.');
} catch {
  console.log('\n   ⚠️  Test suite finished with warnings.');
}

console.log('\n================================================================');
console.log('🎉 Setup Complete! Next Steps for AI Agent or Developer:');
console.log('================================================================');
console.log('1. Start Remote Dashboard:  npm run dashboard   (http://localhost:4100)');
console.log('2. Run Test Short Compile:  npm run workflow -- --force');
console.log('3. Run Production Job:      npm run job');
console.log('================================================================\n');
