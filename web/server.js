import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '127.0.0.1';

const PUBLIC_DIR = path.join(__dirname, 'public');
const THREE_DIR = path.join(__dirname, 'node_modules', 'three');
const REPO_ROOT = path.resolve(__dirname, '..');
const ASSETS_DIR = path.join(REPO_ROOT, 'Assets');
const DEMO_DIR = path.join(REPO_ROOT, 'Demo');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.fbx': 'application/octet-stream',
  '.obj': 'text/plain; charset=utf-8',
  '.mp4': 'video/mp4',
  '.woff2': 'font/woff2',
};

function isInsideDir(targetPath, baseDir) {
  const resolvedTarget = path.resolve(targetPath);
  const resolvedBase = path.resolve(baseDir);
  return resolvedTarget === resolvedBase || resolvedTarget.startsWith(resolvedBase + path.sep);
}

function parseTargetSizes() {
  const fallback = {
    astonmartin: { width: 0.2, height: 0.355435 },
    defender: { width: 0.2, height: 0.3 },
    rollsroyce: { width: 0.2, height: 0.204348 },
  };
  const xmlPath = path.join(ASSETS_DIR, 'StreamingAssets', 'Vuforia', 'ARCarTargets.xml');
  try {
    const xml = fs.readFileSync(xmlPath, 'utf8');
    const regex = /<ImageTarget\s+name="([^"]+)"\s+size="([0-9.]+)\s+([0-9.]+)"\s*\/>/g;
    let match;
    while ((match = regex.exec(xml)) !== null) {
      const [, name, w, h] = match;
      fallback[name] = { width: Number(w), height: Number(h) };
    }
  } catch {
    // Use fallback dimensions if XML cannot be read
  }
  return fallback;
}

function getVehiclesCatalog() {
  const targets = parseTargetSizes();
  return [
    {
      id: 'astonmartin',
      name: 'Aston Martin',
      subtitle: 'Grand Tourer · Primary Unity Scene Vehicle',
      format: 'fbx',
      modelUrl: '/assets/Models/AstonMartin/FINAL_MDOEL_V.fbx',
      resourcePath: '/assets/Models/AstonMartin/',
      textureUrl: null,
      targetImageUrl: '/assets/Editor/Vuforia/ImageTargetTextures/ARCarTargets/astonmartin_scaled.jpg',
      targetName: 'astonmartin',
      targetSize: targets.astonmartin,
      defaultRotationY: 0,
    },
    {
      id: 'defender',
      name: 'Land Rover Defender',
      subtitle: '4x4 Off-Roader · Textured OBJ Model',
      format: 'obj',
      modelUrl: '/assets/Models/Defender/LandRover_RC_2.obj',
      resourcePath: '/assets/Models/Defender/',
      textureUrl: '/assets/Models/Defender/LandRover_RC_2_u1_v1.png',
      targetImageUrl: '/assets/Editor/Vuforia/ImageTargetTextures/ARCarTargets/defender_scaled.jpg',
      targetName: 'defender',
      targetSize: targets.defender,
      defaultRotationX: -Math.PI / 2,
      defaultRotationY: (128.5 * Math.PI) / 180,
      stripGroundSkirt: true,
    },
    {
      id: 'rollsroyce',
      name: 'Rolls-Royce Ghost',
      subtitle: 'Ultra-Luxury Saloon · FBX Model',
      format: 'fbx',
      modelUrl: '/assets/Models/RollsRoyce/RR%20GHOST.fbx',
      resourcePath: '/assets/Models/RollsRoyce/',
      textureUrl: null,
      targetImageUrl: '/assets/Editor/Vuforia/ImageTargetTextures/ARCarTargets/rollsroyce_scaled.jpg',
      targetName: 'rollsroyce',
      targetSize: targets.rollsroyce,
      defaultRotationY: 0,
    },
  ];
}

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-cache',
  });
  res.end(body);
}

let desktopChild = null;

function pipeFileStream(req, res, filePath, options) {
  const stream = fs.createReadStream(filePath, options);
  const cleanup = () => {
    if (!stream.destroyed) stream.destroy();
  };
  res.on('close', cleanup);
  stream.on('error', (streamErr) => {
    cleanup();
    if (!res.headersSent) {
      sendJson(res, 500, { error: streamErr?.message || 'Read error' });
    } else {
      res.end();
    }
  });
  stream.pipe(res);
}

function serveFile(req, res, filePath, baseDir) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { Allow: 'GET, HEAD', 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  if (!isInsideDir(filePath, baseDir)) {
    sendJson(res, 403, { error: 'Forbidden' });
    return;
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      sendJson(res, 404, { error: 'Not found' });
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    const range = req.headers.range;

    if (range) {
      if (stats.size === 0) {
        res.writeHead(416, { 'Content-Range': 'bytes */0' });
        res.end();
        return;
      }
      const match = /^bytes=(\d*)-(\d*)$/.exec(range);
      if (!match) {
        res.writeHead(416, { 'Content-Range': `bytes */${stats.size}` });
        res.end();
        return;
      }
      const start = match[1] ? Number(match[1]) : 0;
      const end = match[2] ? Math.min(Number(match[2]), stats.size - 1) : stats.size - 1;
      if (start > end || start >= stats.size) {
        res.writeHead(416, { 'Content-Range': `bytes */${stats.size}` });
        res.end();
        return;
      }

      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${stats.size}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': end - start + 1,
        'Content-Type': contentType,
      });
      if (req.method === 'HEAD') {
        res.end();
        return;
      }
      pipeFileStream(req, res, filePath, { start, end });
      return;
    }

    const noCacheExts = new Set(['.html', '.css', '.js', '.mjs']);
    res.writeHead(200, {
      'Content-Type': contentType,
      'Content-Length': stats.size,
      'Accept-Ranges': 'bytes',
      'Cache-Control': noCacheExts.has(ext) ? 'no-cache' : 'public, max-age=300',
    });
    if (req.method === 'HEAD') {
      res.end();
      return;
    }
    pipeFileStream(req, res, filePath);
  });
}

async function resolveElectronBinary() {
  const { default: electronBinary } = await import('electron');
  return electronBinary;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  let pathname;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    sendJson(res, 400, { error: 'Invalid URL encoding' });
    return;
  }

  if (pathname === '/api/health') {
    sendJson(res, 200, { ok: true, project: 'AR Car Showroom', port: PORT });
    return;
  }

  if (pathname === '/api/vehicles') {
    sendJson(res, 200, { vehicles: getVehiclesCatalog() });
    return;
  }

  if (pathname === '/api/launch-desktop' && req.method === 'POST') {
    try {
      if (desktopChild && !desktopChild.killed && desktopChild.exitCode === null) {
        sendJson(res, 200, { ok: true, pid: desktopChild.pid, alreadyRunning: true });
        return;
      }
      const electronBinary = await resolveElectronBinary();
      const child = spawn(
        electronBinary,
        [path.join(__dirname, 'desktop', 'main.cjs')],
        {
          cwd: __dirname,
          detached: true,
          stdio: 'ignore',
          env: {
            ...process.env,
            SHOWROOM_URL: `http://${HOST}:${PORT}/?desktop=1`,
          },
        }
      );
      desktopChild = child;
      child.once('exit', () => {
        if (desktopChild === child) desktopChild = null;
      });
      child.unref();
      sendJson(res, 200, { ok: true, pid: child.pid });
    } catch (err) {
      sendJson(res, 500, { ok: false, error: err?.message || 'Failed to launch desktop overlay' });
    }
    return;
  }

  if (pathname.startsWith('/assets/')) {
    const rel = pathname.slice('/assets/'.length);
    serveFile(req, res, path.join(ASSETS_DIR, rel), ASSETS_DIR);
    return;
  }

  if (pathname.startsWith('/demo/')) {
    const rel = pathname.slice('/demo/'.length);
    serveFile(req, res, path.join(DEMO_DIR, rel), DEMO_DIR);
    return;
  }

  if (pathname.startsWith('/vendor/three/')) {
    const rel = pathname.slice('/vendor/three/'.length);
    serveFile(req, res, path.join(THREE_DIR, rel), THREE_DIR);
    return;
  }

  const publicRel = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  serveFile(req, res, path.join(PUBLIC_DIR, publicRel), PUBLIC_DIR);
});

server.listen(PORT, HOST, () => {
  console.log(`AR Car Showroom running at http://localhost:${PORT}`);
});
