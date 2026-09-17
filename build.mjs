/**
 * Build the company-facing TSP4OGP runtime from the private original sources.
 * Reads TSP4OGPOriginal (sibling, or TSP4OGP_ORIGINAL). Does not modify Original.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';
import JavaScriptObfuscator from 'javascript-obfuscator';

const HERE = path.dirname(fileURLToPath(import.meta.url));

function resolveOrigRoot() {
  if (process.env.TSP4OGP_ORIGINAL) {
    return path.resolve(process.env.TSP4OGP_ORIGINAL);
  }
  const sibling = path.resolve(HERE, '..', 'TSP4OGPOriginal');
  if (
    fs.existsSync(path.join(sibling, 'store-editor', 'client')) &&
    fs.existsSync(path.join(sibling, 'gtsp-server'))
  ) {
    return sibling;
  }
  const parent = path.resolve(HERE, '..');
  if (
    parent !== HERE &&
    fs.existsSync(path.join(parent, 'store-editor', 'client')) &&
    fs.existsSync(path.join(parent, 'gtsp-server'))
  ) {
    return parent;
  }
  throw new Error(
    'TSP4OGPOriginal not found. Place it as a sibling of this repo or set TSP4OGP_ORIGINAL.'
  );
}

const ORIG_ROOT = resolveOrigRoot();
const ORIG_EDITOR = path.join(ORIG_ROOT, 'store-editor');
const ORIG_CLIENT = path.join(ORIG_EDITOR, 'client');
const ORIG_SERVER = path.join(ORIG_EDITOR, 'server');
const ORIG_GTSP = path.join(ORIG_ROOT, 'gtsp-server');
const OUT_EDITOR = path.join(HERE, 'store-editor');
const OUT_CLIENT = path.join(OUT_EDITOR, 'client');
const OUT_SERVER = path.join(OUT_EDITOR, 'server');
const OUT_GTSP = path.join(HERE, 'gtsp-server');
const TMP = path.join(HERE, '.tmp');

const KEEP_PYTHON = ['app.py', 'pathfinder_config.py', 'walkability.py', 'debug_log.py'];

function rmrf(p) {
  fs.rmSync(p, { recursive: true, force: true });
}

function mkdirp(p) {
  fs.mkdirSync(p, { recursive: true });
}

function copyFile(src, dest) {
  mkdirp(path.dirname(dest));
  fs.copyFileSync(src, dest);
}

function copyDirIfExists(src, dest) {
  if (!fs.existsSync(src)) return;
  mkdirp(path.dirname(dest));
  fs.cpSync(src, dest, { recursive: true });
}

const reservedNames = [
  'require',
  'exports',
  'module',
  'process',
  'Buffer',
  'global',
  'globalThis',
  '__dirname',
  '__filename',
  '__import_meta_url',
  'console',
  'io',
  'Konva',
  'PF',
  'window',
  'document',
  'fetch',
  'performance',
];

function obfuscateOptions(target) {
  return {
    compact: true,
    target,
    identifierNamesGenerator: 'hexadecimal',
    // CJS top-level bindings look like globals to the obfuscator.
    renameGlobals: target === 'node',
    stringArray: true,
    stringArrayRotate: true,
    stringArrayShuffle: true,
    stringArrayIndexShift: true,
    stringArrayEncoding: ['base64'],
    stringArrayThreshold: 0.75,
    splitStrings: false,
    selfDefending: false,
    controlFlowFlattening: false,
    deadCodeInjection: false,
    debugProtection: false,
    disableConsoleOutput: false,
    transformObjectKeys: false,
    unicodeEscapeSequence: false,
    simplify: true,
    reservedNames,
    reservedStrings: ['__dirname', '__filename', 'import.meta'],
  };
}

function obfuscate(code, target) {
  return JavaScriptObfuscator.obfuscate(code, obfuscateOptions(target)).getObfuscatedCode();
}

async function bundleClient() {
  // Original client/package.json is an empty tracked file; esbuild cannot parse it.
  // Bundle from a temp copy so the original tree is never modified.
  const clientSrc = path.join(TMP, 'client-src');
  rmrf(clientSrc);
  fs.cpSync(ORIG_CLIENT, clientSrc, { recursive: true });
  fs.writeFileSync(
    path.join(clientSrc, 'package.json'),
    `${JSON.stringify({ private: true, type: 'module' })}\n`
  );
  const outfile = path.join(TMP, 'client.bundle.js');
  await esbuild.build({
    absWorkingDir: clientSrc,
    entryPoints: [path.join(clientSrc, 'app.js')],
    bundle: true,
    format: 'iife',
    platform: 'browser',
    target: ['es2020'],
    outfile,
    legalComments: 'none',
    logLevel: 'info',
  });
  const code = fs.readFileSync(outfile, 'utf8');
  const out = obfuscate(code, 'browser');
  fs.writeFileSync(path.join(OUT_CLIENT, 'app.js'), out);
  console.log(`client app.js obfuscated (${out.length} chars)`);
}

const importMetaUrlPlugin = {
  name: 'import-meta-url-cjs',
  setup(build) {
    build.onLoad({ filter: /\.[cm]?js$/ }, async (args) => {
      if (args.path.includes(`${path.sep}node_modules${path.sep}`)) return undefined;
      const contents = await fs.promises.readFile(args.path, 'utf8');
      if (!contents.includes('import.meta.url')) return undefined;
      return {
        contents: contents.replace(/import\.meta\.url/g, '__import_meta_url'),
        loader: 'js',
      };
    });
  },
};

async function bundleNodeEntry(entry, outfileRel) {
  const outfile = path.join(TMP, path.basename(outfileRel).replace(/\.js$/, '.bundle.js'));
  await esbuild.build({
    absWorkingDir: ORIG_SERVER,
    entryPoints: [entry],
    bundle: true,
    format: 'cjs',
    platform: 'node',
    packages: 'external',
    outfile,
    legalComments: 'none',
    logLevel: 'info',
    banner: {
      js: 'var __import_meta_url = require("url").pathToFileURL(__filename).href;',
    },
    plugins: [importMetaUrlPlugin],
  });
  const code = fs.readFileSync(outfile, 'utf8');
  const out = obfuscate(code, 'node');
  const dest = path.join(OUT_SERVER, outfileRel);
  mkdirp(path.dirname(dest));
  fs.writeFileSync(dest, out);
  console.log(`${outfileRel} obfuscated (${out.length} chars)`);
}

function writeServerPackageJson() {
  const orig = JSON.parse(
    fs.readFileSync(path.join(ORIG_SERVER, 'package.json'), 'utf8')
  );
  const pkg = {
    name: orig.name || 'store-editor-server',
    version: orig.version || '1.0.0',
    private: true,
    main: 'index.js',
    type: 'commonjs',
    scripts: { start: 'node index.js' },
    dependencies: orig.dependencies,
  };
  fs.writeFileSync(path.join(OUT_SERVER, 'package.json'), JSON.stringify(pkg, null, 2) + '\n');
}

function writeIndexHtml() {
  let html = fs.readFileSync(path.join(ORIG_CLIENT, 'index.html'), 'utf8');
  html = html.replace(
    '<script type="module" src="app.js"></script>',
    '<script src="app.js"></script>'
  );
  fs.writeFileSync(path.join(OUT_CLIENT, 'index.html'), html);
}

function copyGlue() {
  copyFile(path.join(ORIG_CLIENT, 'style.css'), path.join(OUT_CLIENT, 'style.css'));
  writeIndexHtml();
  const origEntrypoint = path.join(ORIG_EDITOR, 'docker-entrypoint.sh');
  if (fs.existsSync(origEntrypoint)) {
    copyFile(origEntrypoint, path.join(OUT_EDITOR, 'docker-entrypoint.sh'));
  }
  copyDirIfExists(path.join(ORIG_SERVER, 'data'), path.join(OUT_SERVER, 'data'));
  copyDirIfExists(path.join(ORIG_SERVER, 'maps'), path.join(OUT_SERVER, 'maps'));
  writeServerPackageJson();
  copyFile(path.join(ORIG_GTSP, 'requirements.txt'), path.join(OUT_GTSP, 'requirements.txt'));
  for (const name of KEEP_PYTHON) {
    const src = path.join(ORIG_GTSP, name);
    if (fs.existsSync(src)) {
      copyFile(src, path.join(OUT_GTSP, name));
    }
  }
}

function pythonExecutable() {
  const candidates = process.platform === 'win32' ? ['py', 'python', 'python3'] : ['python3', 'python'];
  for (const cmd of candidates) {
    const args = cmd === 'py' ? ['-3', '--version'] : ['--version'];
    const r = spawnSync(cmd, args, { encoding: 'utf8' });
    if (r.status === 0) {
      return cmd === 'py' ? ['py', '-3'] : [cmd];
    }
  }
  return null;
}

function runCythonPrepare() {
  const py = pythonExecutable();
  if (!py) {
    throw new Error('Python not found; cannot generate Cython C sources');
  }
  const script = path.join(HERE, 'cython_prepare.py');
  const r = spawnSync(py[0], [...py.slice(1), script], {
    cwd: HERE,
    encoding: 'utf8',
    stdio: 'inherit',
    env: { ...process.env, TSP4OGP_ORIGINAL: ORIG_ROOT },
  });
  if (r.status !== 0) {
    throw new Error(`cython_prepare.py exited ${r.status}`);
  }
}

function assertObfuscated() {
  const client = fs.readFileSync(path.join(OUT_CLIENT, 'app.js'), 'utf8');
  const server = fs.readFileSync(path.join(OUT_SERVER, 'index.js'), 'utf8');
  const needles = [
    'export class mapController',
    'function detectCorridorsFromShelves',
    'from flask import Flask',
    'async find_pick_path_bfs',
  ];
  for (const needle of needles) {
    if (client.includes(needle) || server.includes(needle)) {
      throw new Error(`obfuscated JS still contains readable marker: ${needle}`);
    }
  }
  for (const name of [
    'gtsp_solver',
    'corridor_blocks',
    'heuristics',
    'distance_cache',
    'shelf_access',
    'polygon_grid',
    'graphBuilder',
    'store_cache',
    'pathFinder',
  ]) {
    const py = path.join(OUT_GTSP, `${name}.py`);
    const c = path.join(OUT_GTSP, `${name}.c`);
    if (fs.existsSync(py) && !fs.existsSync(c)) {
      console.warn(`WARNING: ${name}.py fallback present (no .c)`);
    } else if (!fs.existsSync(c) && !fs.existsSync(py)) {
      throw new Error(`missing compiled source for ${name}`);
    } else if (fs.existsSync(py) && fs.existsSync(c)) {
      fs.unlinkSync(py);
    }
  }
  for (const extra of [
    'test_gtsp_pathfinding.py',
    'bench_pathfinding.py',
    'OPERATIONS.md',
  ]) {
    const p = path.join(OUT_GTSP, extra);
    if (fs.existsSync(p)) fs.unlinkSync(p);
  }
}

async function main() {
  if (!fs.existsSync(ORIG_CLIENT) || !fs.existsSync(ORIG_SERVER) || !fs.existsSync(ORIG_GTSP)) {
    throw new Error(`Original store-editor / gtsp-server not found at ${ORIG_ROOT}`);
  }
  console.log('Building company tree from', ORIG_ROOT);

  mkdirp(TMP);
  mkdirp(OUT_CLIENT);
  mkdirp(OUT_SERVER);
  mkdirp(OUT_GTSP);

  // Drop previously generated JS so leftover readable modules cannot remain.
  rmrf(path.join(OUT_CLIENT, 'js'));
  for (const rel of ['app.js']) {
    const p = path.join(OUT_CLIENT, rel);
    if (fs.existsSync(p)) fs.unlinkSync(p);
  }
  for (const rel of [
    'index.js',
    path.join('models', 'seed.js'),
    path.join('scripts', 'seedStore3260.js'),
    path.join('scripts', 'seedStore3261.js'),
    path.join('scripts', 'seedStore3262.js'),
  ]) {
    const p = path.join(OUT_SERVER, rel);
    if (fs.existsSync(p)) fs.unlinkSync(p);
  }

  copyGlue();
  await bundleClient();
  await bundleNodeEntry(path.join(ORIG_SERVER, 'index.js'), 'index.js');
  await bundleNodeEntry(path.join(ORIG_SERVER, 'models', 'seed.js'), path.join('models', 'seed.js'));
  await bundleNodeEntry(
    path.join(ORIG_SERVER, 'scripts', 'seedStore3260.js'),
    path.join('scripts', 'seedStore3260.js')
  );
  await bundleNodeEntry(
    path.join(ORIG_SERVER, 'scripts', 'seedStore3261.js'),
    path.join('scripts', 'seedStore3261.js')
  );
  await bundleNodeEntry(
    path.join(ORIG_SERVER, 'scripts', 'seedStore3262.js'),
    path.join('scripts', 'seedStore3262.js')
  );
  runCythonPrepare();
  assertObfuscated();
  console.log('Obfuscated tree ready at', HERE, '(from', ORIG_ROOT + ')');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
