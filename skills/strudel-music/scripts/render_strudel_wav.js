#!/usr/bin/env node
'use strict';

// Drives the Strudel REPL (strudel.cc by default) in headless Chrome:
// preflight-checks a pattern, then renders it with the REPL's own "Export to WAV".

const fs = require('fs');
const path = require('path');

const USAGE = `Usage:
  render_strudel_wav.js --source <track.strudel.js> --start-cycle <n> --end-cycle <n>
      (--output <track.wav> | --check-only) [--loop] [--overwrite]
      [--sample-rate 48000] [--polyphony 256] [--timeout-seconds 600]
      [--repl-url https://strudel.cc/] [--chrome <path>] [--playwright <module-path>]
  render_strudel_wav.js --list-sounds <regex> [--repl-url ...] [--chrome ...] [--playwright ...]

Every run evaluates the source first and checks: evaluation errors, events in the
range, sound names missing from the REPL sound map, orbit-global effect conflicts,
and with --loop whether cycles [end, 2*end-start) repeat [start, end) exactly.
A failed preflight never starts the export. One JSON report goes to stdout,
progress to stderr. Existing output files are kept unless --overwrite is given.`;

const FLAGS = new Set(['check-only', 'loop', 'overwrite', 'help']);
const VALUES = new Set([
  'source', 'output', 'start-cycle', 'end-cycle', 'sample-rate', 'polyphony',
  'timeout-seconds', 'repl-url', 'chrome', 'playwright', 'list-sounds',
]);

class UsageError extends Error {}
// Expected runtime problems: reported as one line, without a stack trace.
class CliError extends Error {}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith('--')) throw new UsageError(`Unexpected argument: ${arg}`);
    const key = arg.slice(2);
    if (FLAGS.has(key)) {
      out[key] = true;
      continue;
    }
    if (!VALUES.has(key)) throw new UsageError(`Unknown option: ${arg}`);
    if (i + 1 >= argv.length || argv[i + 1].startsWith('--')) throw new UsageError(`Missing value for ${arg}`);
    out[key] = argv[++i];
  }
  return out;
}

function resolveOptions(args, cwd = process.cwd()) {
  if (args.help) return { mode: 'help' };
  const common = {
    replUrl: args['repl-url'] || 'https://strudel.cc/',
    chrome: args.chrome,
    playwright: args.playwright,
  };
  if (args['list-sounds'] != null) {
    try {
      new RegExp(args['list-sounds'], 'i');
    } catch (error) {
      throw new UsageError(`Invalid --list-sounds pattern: ${error.message}`);
    }
    return { ...common, mode: 'list-sounds', filter: args['list-sounds'] };
  }
  for (const key of ['source', 'start-cycle', 'end-cycle']) {
    if (args[key] == null) throw new UsageError(`Missing --${key}`);
  }
  const checkOnly = Boolean(args['check-only']);
  if (!checkOnly && args.output == null) throw new UsageError('Missing --output (or pass --check-only)');
  if (checkOnly && args.output != null) throw new UsageError('--check-only writes no audio; remove --output');

  const num = (key, fallback) => {
    const value = args[key] == null ? fallback : Number(args[key]);
    if (!Number.isFinite(value)) throw new UsageError(`--${key} must be numeric`);
    return value;
  };
  const startCycle = num('start-cycle');
  const endCycle = num('end-cycle');
  if (endCycle <= startCycle) throw new UsageError('--end-cycle must be greater than --start-cycle');
  const sampleRate = num('sample-rate', 48000);
  const polyphony = num('polyphony', 256);
  const timeoutSeconds = num('timeout-seconds', 600);
  for (const [key, value] of [['sample-rate', sampleRate], ['polyphony', polyphony], ['timeout-seconds', timeoutSeconds]]) {
    if (value <= 0) throw new UsageError(`--${key} must be positive`);
  }
  const outputPath = args.output == null ? null : path.resolve(cwd, args.output);
  if (outputPath && path.extname(outputPath).toLowerCase() !== '.wav') throw new UsageError('--output must end with .wav');
  return {
    ...common,
    mode: checkOnly ? 'check' : 'render',
    sourcePath: path.resolve(cwd, args.source),
    outputPath,
    startCycle,
    endCycle,
    loop: Boolean(args.loop),
    overwrite: Boolean(args.overwrite),
    sampleRate,
    polyphony,
    timeoutMs: timeoutSeconds * 1000,
  };
}

// "1-4,9,11-12" from 1-based bar numbers.
function formatBars(bars) {
  const sorted = [...new Set(bars)].sort((a, b) => a - b);
  const parts = [];
  for (let i = 0; i < sorted.length; i++) {
    let j = i;
    while (j + 1 < sorted.length && sorted[j + 1] === sorted[j] + 1) j++;
    parts.push(i === j ? String(sorted[i]) : `${sorted[i]}-${sorted[j]}`);
    i = j;
  }
  return parts.join(',');
}

// Mirrors superdough: bank + "_" + s, looked up case-insensitively; no s means the default synth.
function soundKey(value) {
  if (value == null) return null;
  if (typeof value !== 'object') return String(value);
  if (value.s == null) return null;
  return value.bank ? `${value.bank}_${value.s}` : String(value.s);
}

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

// Room size/fade and delay time/feedback are shared per orbit; sends (room, delay) are per event.
const ORBIT_GLOBALS = [
  ['room', ['roomsize', 'roomfade', 'roomlp', 'roomdim']],
  ['delay', ['delaytime', 'delayfeedback']],
];

function analyzeEvents({ events, loopEvents = null, soundKeys = null, cps, startCycle, endCycle }) {
  const failures = [];
  const warnings = [];
  const span = endCycle - startCycle;
  const barCount = Math.ceil(span - 1e-9);
  const barOf = (begin, offset = 0) => Math.floor(begin - offset - startCycle + 1e-9) + 1;
  const known = soundKeys ? new Set(soundKeys.map(key => key.toLowerCase())) : null;
  const sounds = new Map();
  const orbitParams = new Map();
  const barsWithEvents = new Set();

  for (const event of events) {
    const bar = barOf(event.b);
    barsWithEvents.add(bar);
    const key = soundKey(event.v);
    if (key != null) {
      const record = sounds.get(key) || { events: 0, bars: [] };
      record.events++;
      record.bars.push(bar);
      sounds.set(key, record);
    }
    const value = event.v && typeof event.v === 'object' ? event.v : {};
    const orbit = value.orbit ?? 1;
    for (const [send, params] of ORBIT_GLOBALS) {
      if (!(Number(value[send]) > 0)) continue;
      for (const param of params) {
        const id = `${orbit}\u0000${param}`;
        if (!orbitParams.has(id)) orbitParams.set(id, { orbit, param, values: new Set() });
        orbitParams.get(id).values.add(value[param] == null ? 'default' : String(value[param]));
      }
    }
  }

  const soundSummary = {};
  for (const key of [...sounds.keys()].sort()) {
    soundSummary[key] = { events: sounds.get(key).events, bars: formatBars(sounds.get(key).bars) };
  }

  const unknownSounds = known
    ? Object.entries(soundSummary).filter(([key]) => !known.has(key.toLowerCase())).map(([sound, info]) => ({ sound, ...info }))
    : [];
  if (!known) warnings.push('sound map unavailable; unknown-sound check skipped');
  if (unknownSounds.length) {
    failures.push(`unknown sounds (silent when rendered): ${unknownSounds.map(item => `${item.sound} [bars ${item.bars}]`).join('; ')}; search with --list-sounds`);
  }

  const orbitConflicts = [...orbitParams.values()]
    .filter(item => item.values.size > 1)
    .map(item => ({ orbit: item.orbit, param: item.param, values: [...item.values] }));
  for (const item of orbitConflicts) {
    warnings.push(`orbit ${item.orbit}: ${item.param} differs (${item.values.join(' / ')}); layers sharing an orbit override each other's ${item.param}`);
  }

  const emptyBars = [];
  for (let bar = 1; bar <= barCount; bar++) if (!barsWithEvents.has(bar)) emptyBars.push(bar);
  if (!events.length) failures.push('no events in the requested cycle range');
  else if (emptyBars.length) warnings.push(`bars without new events: ${formatBars(emptyBars)}`);

  let loop = { checked: false };
  if (loopEvents) {
    const perBar = (list, offset) => {
      const map = new Map();
      for (const event of list) {
        const bar = barOf(event.b, offset);
        const sig = `${Math.round((event.b - offset) * 1e6)}|${Math.round((event.e - offset) * 1e6)}|${stableStringify(event.v)}`;
        if (!map.has(bar)) map.set(bar, []);
        map.get(bar).push(sig);
      }
      for (const list of map.values()) list.sort();
      return map;
    };
    const first = perBar(events, 0);
    const second = perBar(loopEvents, span);
    const mismatch = [];
    for (let bar = 1; bar <= barCount; bar++) {
      if ((first.get(bar) || []).join('\n') !== (second.get(bar) || []).join('\n')) mismatch.push(bar);
    }
    loop = { checked: true, mismatchBars: formatBars(mismatch) };
    if (mismatch.length) {
      failures.push(`loop: the next pass differs from the first in bars ${formatBars(mismatch)}; make every layer ${span} bars long (or a divisor) and remove time-based randomness`);
    }
  }

  const round = value => Math.round(value * 1e6) / 1e6;
  return {
    ok: failures.length === 0,
    cps,
    secondsPerCycle: cps > 0 ? round(1 / cps) : null,
    cycles: { start: startCycle, end: endCycle, count: span },
    durationSeconds: cps > 0 ? round(span / cps) : null,
    events: events.length,
    sounds: soundSummary,
    unknownSounds,
    orbitConflicts,
    emptyBars: formatBars(emptyBars),
    loop,
    failures,
    warnings,
  };
}

function findChrome(explicit) {
  const candidates = [
    explicit,
    process.env.CHROME_PATH,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  ].filter(Boolean);
  const found = candidates.find(candidate => fs.existsSync(candidate));
  if (!found) throw new CliError('Chrome/Chromium executable not found. Set CHROME_PATH or pass --chrome.');
  return found;
}

function findPlaywright(explicit) {
  const globalRoots = [
    path.join(path.dirname(process.execPath), '..', 'lib', 'node_modules'),
    path.join(path.dirname(process.execPath), 'node_modules'),
    process.env.APPDATA && path.join(process.env.APPDATA, 'npm', 'node_modules'),
  ].filter(Boolean);
  const candidates = [explicit, process.env.PLAYWRIGHT_MODULE].filter(Boolean);
  for (const name of ['playwright', 'playwright-core']) {
    try {
      candidates.push(require.resolve(name, { paths: [process.cwd()] }));
    } catch (_) {}
    candidates.push(name, ...globalRoots.map(root => path.join(root, name)));
  }
  for (const candidate of candidates) {
    try {
      const module = require(candidate);
      if (module && module.chromium) return module;
    } catch (_) {}
  }
  throw new CliError('Playwright not found. Install playwright or playwright-core (global or in the task project), or pass --playwright <module-path>.');
}

function progress(message) {
  console.error(`[strudel-render] ${message}`);
}

async function closeBrowser(browser) {
  await Promise.race([browser.close(), new Promise(resolve => setTimeout(resolve, 5000).unref())]);
}

// process.exit() can cut off large output on a pipe; wait until stdout has taken it.
function writeStdout(text) {
  return new Promise(resolve => process.stdout.write(text, resolve));
}

async function openRepl(options) {
  const { chromium } = findPlaywright(options.playwright);
  const browser = await chromium.launch({
    headless: true,
    executablePath: findChrome(options.chrome),
    args: ['--autoplay-policy=no-user-gesture-required'],
  });
  try {
    const page = await browser.newPage({ acceptDownloads: true });
    const consoleIssues = [];
    page.on('pageerror', error => consoleIssues.push(`pageerror: ${error.message}`));
    page.on('console', message => {
      const text = message.text();
      if (message.type() === 'error' || /not found|failed|error/i.test(text)) consoleIssues.push(text.replace(/%c/g, '').slice(0, 300));
    });
    progress(`opening ${options.replUrl}`);
    // DOMContentLoaded can hang on slow third-party resources; editor readiness is the real requirement.
    await page.goto(options.replUrl, { waitUntil: 'commit', timeout: 60000 });
    await page.waitForFunction(
      () => globalThis.strudelMirror && globalThis.strudelMirror.repl && typeof globalThis.strudelMirror.setCode === 'function',
      null,
      { timeout: 120000 },
    );
    await page.evaluate(() => globalThis.strudelMirror.prebaked);
    return { browser, page, consoleIssues };
  } catch (error) {
    await closeBrowser(browser);
    throw error;
  }
}

// The REPL holds every evaluation until a trusted click unlocks audio.
async function unlockAudio(page) {
  const editor = page.locator('.cm-content').first();
  if (await editor.count()) await editor.click();
  else await page.mouse.click(2, 2);
}

function withTimeout(promise, ms, message) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function evaluateAndCollect(page, { code, startCycle, endCycle, loop }) {
  return withTimeout(page.evaluate(async ({ code, startCycle, endCycle, loop }) => {
    const mirror = globalThis.strudelMirror;
    mirror.setCode(code);
    await mirror.repl.evaluate(code, false);
    const state = mirror.repl.state;
    if (state.evalError || !state.pattern) {
      const error = state.evalError;
      return { evalError: error ? String(error.message || error) : 'evaluation produced no pattern' };
    }
    const clean = value => JSON.parse(JSON.stringify(value === undefined ? null : value,
      (key, item) => (typeof item === 'function' ? '[function]' : typeof item === 'bigint' ? String(item) : item)));
    const query = (from, to) => state.pattern.queryArc(from, to)
      .filter(hap => hap.hasOnset())
      .map(hap => ({ b: hap.whole.begin.valueOf(), e: hap.whole.end.valueOf(), v: clean(hap.value) }));
    let soundKeys = null;
    try {
      soundKeys = Object.keys(globalThis.soundMap.get());
    } catch (_) {}
    return {
      cps: mirror.repl.scheduler.cps,
      events: query(startCycle, endCycle),
      loopEvents: loop ? query(endCycle, endCycle + (endCycle - startCycle)) : null,
      soundKeys,
    };
  }, { code, startCycle, endCycle, loop }), 90000, 'Strudel evaluation did not finish within 90s (audio unlock or REPL change)');
}

async function preflight(page, options) {
  progress('evaluating source and running preflight');
  const code = fs.readFileSync(options.sourcePath, 'utf8');
  await unlockAudio(page);
  const data = await evaluateAndCollect(page, { code, startCycle: options.startCycle, endCycle: options.endCycle, loop: options.loop });
  if (data.evalError) {
    return { ok: false, failures: [`Strudel evaluation failed: ${data.evalError}`], warnings: [] };
  }
  let report = analyzeEvents({ ...data, startCycle: options.startCycle, endCycle: options.endCycle });
  if (report.unknownSounds.length && data.soundKeys) {
    // samples() calls in the source may still be registering; read the sound map once more.
    await page.waitForTimeout(3000);
    const soundKeys = await page.evaluate(() => Object.keys(globalThis.soundMap.get()));
    report = analyzeEvents({ ...data, soundKeys, startCycle: options.startCycle, endCycle: options.endCycle });
  }
  return report;
}

async function fillExportPanel(page, options) {
  await page.getByRole('button', { name: 'export' }).click();
  await page.getByRole('button', { name: 'Export to WAV' }).waitFor({ timeout: 30000 });
  const fields = await page.evaluate(() => [...document.querySelectorAll('input')].map(input => ({
    type: input.type,
    label: (input.closest('label')?.innerText || input.parentElement?.innerText || '').replace(/\s+/g, ' ').trim(),
  })));
  const inputs = page.locator('input');
  const wanted = [
    [/file name/i, path.basename(options.outputPath, path.extname(options.outputPath))],
    [/start cycle/i, String(options.startCycle)],
    [/end cycle/i, String(options.endCycle)],
    [/sample rate/i, String(options.sampleRate)],
    [/polyphony/i, String(options.polyphony)],
  ];
  for (const [label, value] of wanted) {
    const index = fields.findIndex(field => field.type !== 'checkbox' && label.test(field.label));
    if (index < 0) throw new Error(`Strudel export panel changed: no field matching ${label}; found ${JSON.stringify(fields)}`);
    await inputs.nth(index).fill(value);
  }
  const multi = fields.findIndex(field => field.type === 'checkbox' && /multi.?channel/i.test(field.label));
  if (multi >= 0 && await inputs.nth(multi).isChecked()) await inputs.nth(multi).setChecked(false);
}

async function listSounds(options) {
  const { browser, page } = await openRepl(options);
  try {
    return await page.evaluate(filter => {
      const pattern = new RegExp(filter, 'i');
      const map = globalThis.soundMap.get();
      const sounds = Object.keys(map).filter(name => pattern.test(name)).sort().map(name => {
        const data = (map[name] && map[name].data) || {};
        const entry = { name, type: data.type || null };
        if (Array.isArray(data.samples)) entry.variants = data.samples.length;
        else if (data.samples && typeof data.samples === 'object') entry.pitched = true;
        if (data.baseUrl) entry.library = String(data.baseUrl).replace(/^https?:\/\/[^/]+\//, '').replace(/\/$/, '');
        return entry;
      });
      return { filter, count: sounds.length, sounds };
    }, options.filter);
  } finally {
    await closeBrowser(browser);
  }
}

async function run(options) {
  if (options.mode === 'list-sounds') return { exitCode: 0, report: await listSounds(options) };
  if (!fs.existsSync(options.sourcePath)) throw new CliError(`Source not found: ${options.sourcePath}`);
  if (options.outputPath && fs.existsSync(options.outputPath) && !options.overwrite) {
    throw new CliError(`Output already exists: ${options.outputPath}. Choose a new file name or pass --overwrite.`);
  }

  const { browser, page, consoleIssues } = await openRepl(options);
  try {
    const report = await preflight(page, options);
    if (!report.ok || options.mode === 'check') {
      return { exitCode: report.ok ? 0 : 1, report: { mode: options.mode, source: options.sourcePath, preflight: report } };
    }

    fs.mkdirSync(path.dirname(options.outputPath), { recursive: true });
    progress('opening export panel');
    await fillExportPanel(page, options);
    progress(`rendering cycles ${options.startCycle}-${options.endCycle} (${report.durationSeconds}s); timeout ${Math.round(options.timeoutMs / 1000)}s`);
    const issuesBefore = consoleIssues.length;
    const downloadPromise = page.waitForEvent('download', { timeout: options.timeoutMs });
    await page.getByRole('button', { name: 'Export to WAV' }).click();
    const download = await downloadPromise;
    progress('download received; saving file');
    const failure = await download.failure();
    if (failure) throw new Error(`Strudel download failed: ${failure}`);
    await download.saveAs(options.outputPath);
    const bytes = fs.existsSync(options.outputPath) ? fs.statSync(options.outputPath).size : 0;
    if (bytes < 44) throw new Error(`Rendered WAV is missing or empty: ${options.outputPath}`);
    return {
      exitCode: 0,
      report: {
        mode: 'render',
        source: options.sourcePath,
        output: options.outputPath,
        startCycle: options.startCycle,
        endCycle: options.endCycle,
        sampleRate: options.sampleRate,
        polyphony: options.polyphony,
        bytes,
        preflight: report,
        exportConsoleIssues: consoleIssues.slice(issuesBefore, issuesBefore + 20),
      },
    };
  } finally {
    await closeBrowser(browser);
  }
}

async function main(argv = process.argv.slice(2)) {
  let options;
  try {
    options = resolveOptions(parseArgs(argv));
  } catch (error) {
    if (!(error instanceof UsageError)) throw error;
    console.error(`Error: ${error.message}\n\n${USAGE}`);
    return 64;
  }
  if (options.mode === 'help') {
    await writeStdout(`${USAGE}\n`);
    return 0;
  }
  const { exitCode, report } = await run(options);
  await writeStdout(`${JSON.stringify(report, null, 2)}\n`);
  return exitCode;
}

module.exports = { parseArgs, resolveOptions, analyzeEvents, formatBars, soundKey, UsageError, CliError };

if (require.main === module) {
  main().then(code => process.exit(code), error => {
    console.error(error instanceof CliError ? `Error: ${error.message}` : (error && error.stack) || String(error));
    process.exit(1);
  });
}
