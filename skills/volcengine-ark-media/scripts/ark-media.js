#!/usr/bin/env node
'use strict';

const path = require('path');
const { spawnSync } = require('child_process');

const ACTIONS = {
  image: { script: 'generate-image.js', args: [] },
  'image-download': { script: 'download-images.js', args: [] },
  'video-create': { script: 'create-video.js', args: [] },
  'video-query': { script: 'query-video.js', args: [] },
  models: { script: 'generate-image.js', args: ['--list-models'] },
};

function printHelp(stream = process.stdout) {
  stream.write(`Usage:\n`);
  stream.write(`  ark-media.js image [image options]\n`);
  stream.write(`  ark-media.js image-download --result <json> --out-dir <new-directory> [--dry-run]\n`);
  stream.write(`  ark-media.js video-create [video creation options]\n`);
  stream.write(`  ark-media.js video-query [video query options]\n`);
  stream.write(`  ark-media.js models\n\n`);
  stream.write(`Actions:\n`);
  stream.write(`  image         Generate or edit Seedream images synchronously and download results.\n`);
  stream.write(`  image-download Download images from a saved response, without generation or API key.\n`);
  stream.write(`  video-create  Create an asynchronous Seedance 2.0 video task.\n`);
  stream.write(`  video-query   Query a Seedance 2.0 task and download completed output.\n`);
  stream.write(`  models        List supported Seedream image models. Video currently supports Seedance 2.0 only.\n\n`);
  stream.write(`Pass --help after an action to see that action's options.\n`);
}

function main() {
  const [action, ...args] = process.argv.slice(2);
  if (!action || action === '--help' || action === '-h') {
    printHelp();
    return;
  }

  const route = Object.hasOwn(ACTIONS, action) ? ACTIONS[action] : null;
  if (!route) {
    process.stderr.write(`Error: Unknown action: ${action}\n\n`);
    printHelp(process.stderr);
    process.exitCode = 2;
    return;
  }

  const result = spawnSync(
    process.execPath,
    [path.join(__dirname, route.script), ...route.args, ...args],
    { cwd: process.cwd(), stdio: 'inherit' },
  );

  if (result.error) {
    process.stderr.write(`Error: Failed to run ${action}: ${result.error.message}\n`);
    process.exitCode = 1;
    return;
  }

  process.exitCode = result.status === null ? 1 : result.status;
}

main();
