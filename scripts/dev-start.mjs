import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDir, '..');
const serverScript = path.join(scriptDir, 'static-dev-server.mjs');
const basePort = 5500;
const maxPort = 5510;
const expectedApp = (() => {
  try {
    const buildInfo = JSON.parse(fs.readFileSync(path.join(root, 'build-info.json'), 'utf8'));
    return String(buildInfo?.app || '').trim();
  } catch {
    return '';
  }
})();

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function fetchText(port, pathname = '/index.html', timeoutMs = 1500) {
  return new Promise((resolve) => {
    const req = http.get({ hostname: 'localhost', port, path: pathname, timeout: timeoutMs }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => {
        body += chunk;
      });
      res.on('end', () => {
        resolve({ statusCode: res.statusCode || 0, body });
      });
    });

    req.on('timeout', () => req.destroy());
    req.on('error', () => resolve(null));
  });
}

// 두 환경이 같은 포트 대역을 쓰기 때문에 앱 식별자까지 확인해야 한다. 확인하지
// 않으면 TomatoDev 서버에 붙은 채로 production 변경을 검증하게 된다.
async function isHealthyTomatoServer(port) {
  const [pageResponse, buildInfoResponse] = await Promise.all([
    fetchText(port),
    fetchText(port, '/build-info.json'),
  ]);
  if (pageResponse?.statusCode !== 200 || !pageResponse.body.includes('토마토 키우기')) return false;
  try {
    const servedApp = String(JSON.parse(buildInfoResponse?.body || '{}')?.app || '').trim();
    return Boolean(expectedApp && servedApp === expectedApp);
  } catch {
    return false;
  }
}

function isPortAvailable(port) {
  return new Promise((resolve) => {
    const tester = net.createServer();
    tester.once('error', () => resolve(false));
    tester.once('listening', () => {
      tester.close(() => resolve(true));
    });
    tester.listen(port);
  });
}

async function waitForHealthyServer(port, attempts = 30) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (await isHealthyTomatoServer(port)) return true;
    await wait(250);
  }
  return false;
}

function startDetachedServer(port) {
  const logDir = path.join(os.tmpdir(), 'tomatofarm-dev');
  fs.mkdirSync(logDir, { recursive: true });

  const outPath = path.join(logDir, `server-${port}.out.log`);
  const errPath = path.join(logDir, `server-${port}.err.log`);
  const outFd = fs.openSync(outPath, 'a');
  const errFd = fs.openSync(errPath, 'a');

  const child = spawn(process.execPath, [serverScript, '--port', String(port), '--root', root], {
    cwd: root,
    detached: true,
    stdio: ['ignore', outFd, errFd],
    windowsHide: true,
  });

  fs.closeSync(outFd);
  fs.closeSync(errFd);
  child.unref();
  return { pid: child.pid, outPath, errPath };
}

function readTail(filePath, maxChars = 4000) {
  try {
    const text = fs.readFileSync(filePath, 'utf8');
    return text.slice(-maxChars);
  } catch {
    return '';
  }
}

async function main() {
  for (let port = basePort; port <= maxPort; port += 1) {
    if (await isHealthyTomatoServer(port)) {
      console.log(`[dev-start] Existing Tomato server on port ${port} is healthy; reusing.`);
      console.log('');
      console.log('=== Dev server running ===');
      console.log(`URL: http://localhost:${port}`);
      return 0;
    }

    if (!(await isPortAvailable(port))) {
      console.error(`[dev-start] Port ${port} is occupied by another program; trying next.`);
      continue;
    }

    const server = startDetachedServer(port);
    console.log(`[dev-start] Starting detached Node HTTP server on port ${port}.`);

    if (await waitForHealthyServer(port)) {
      console.log('');
      console.log('=== Dev server running ===');
      console.log(`URL: http://localhost:${port}`);
      console.log(`Background PID: ${server.pid}`);
      console.log(`Log: ${server.outPath}`);
      return 0;
    }

    console.error(`[dev-start] ERROR: Server on port ${port} did not become healthy.`);
    const errTail = readTail(server.errPath);
    if (errTail) {
      console.error('[dev-start] Error log tail:');
      console.error(errTail);
    }
    return 1;
  }

  console.error(`[dev-start] ERROR: No available port in range ${basePort}-${maxPort}.`);
  return 1;
}

process.exitCode = await main();
