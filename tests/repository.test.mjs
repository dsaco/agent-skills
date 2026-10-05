import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile, readdir, lstat, symlink, mkdtemp, mkdir, copyFile, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';

const root = fileURLToPath(new URL('../', import.meta.url));
const skill = path.join(root, 'skills/fal-ai');
const expected = [
  'LICENSE', 'README.md', 'SKILL.md',
  'references/background.md', 'references/consultation.md', 'references/images.md',
  'references/jobs.md', 'references/structure.md',
  'scripts/errors.mjs', 'scripts/fal.mjs', 'scripts/models.mjs', 'tests/fal.test.mjs',
].sort();
async function files(dir, base = dir) {
  const result = [];
  for (const name of await readdir(dir)) {
    const file = path.join(dir, name), info = await lstat(file);
    assert.equal(info.isSymbolicLink(), false, `No symlink: ${file}`);
    if (info.isDirectory()) result.push(...await files(file, base));
    else { assert(info.isFile()); result.push(path.relative(base, file).split(path.sep).join('/')); }
  }
  return result.sort();
}

test('独立 Skill 文件白名单、许可、元数据与本地引用', async () => {
  assert.deepEqual(await files(skill), expected);
  assert.equal(await readFile(path.join(skill, 'LICENSE'), 'utf8'), await readFile(path.join(root, 'LICENSE'), 'utf8'));
  const text = await readFile(path.join(skill, 'SKILL.md'), 'utf8');
  assert.match(text, /^---\r?\nname: fal-ai\r?\ndescription: .+\r?\ncompatibility: .+\r?\n---/);
  const manifest = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
  assert.equal(manifest.private, true); assert.equal(manifest.license, 'MIT');
  assert.equal(manifest.dependencies, undefined); assert.equal(manifest.devDependencies, undefined);
  for (const rel of expected.filter(x => x.endsWith('.md'))) {
    const source = await readFile(path.join(skill, rel), 'utf8');
    assert(!/\/Users\/[^\s/]+\//.test(source), `Machine path in ${rel}`);
    for (const [, href] of source.matchAll(/\]\(([^)]+)\)/g)) {
      if (/^(https?:|#)/.test(href)) continue;
      const target = path.resolve(path.dirname(path.join(skill, rel)), href.split('#')[0]);
      assert(target.startsWith(skill + path.sep), `Reference escapes skill: ${rel}`);
      assert((await lstat(target)).isFile(), `Missing reference in ${rel}`);
    }
  }
});

test('移动到含空格与中文的新目录后独立 CLI 可用，无 Key／依赖／网络／产物', async () => {
  const tmp = await mkdtemp(path.join(os.tmpdir(), 'agent-skills-portable-'));
  try {
    const installed = path.join(tmp, '技能 安装', 'fal-ai'), cwd = path.join(tmp, '任务 工作区');
    await mkdir(cwd, { recursive: true });
    for (const rel of expected.filter(x => x !== 'tests/fal.test.mjs')) {
      const dest = path.join(installed, rel);
      await mkdir(path.dirname(dest), { recursive: true }); await copyFile(path.join(skill, rel), dest);
    }
    const env = { PATH: process.env.PATH, HOME: tmp, USERPROFILE: tmp };
    const cli = path.join(installed, 'scripts/fal.mjs');
    const run = args => spawnSync(process.execPath, [cli, ...args], { cwd, env, encoding: 'utf8', timeout: 10000 });
    const help = run(['--help']);
    assert.equal(help.status, 0); assert.match(help.stdout, /text-to-image/);
    // Directory aliases occur naturally on macOS; exercise an explicit alias too.
    const alias = path.join(tmp, 'alias');
    await symlink(installed, alias, process.platform === 'win32' ? 'junction' : 'dir');
    const aliased = spawnSync(process.execPath, [path.join(alias, 'scripts/fal.mjs'), 'text-to-image', '--prompt', 'alias', '--dry-run'], { cwd, env, encoding: 'utf8', timeout: 10000 });
    assert.equal(aliased.status, 0, aliased.stderr); assert.equal(JSON.parse(aliased.stdout).dryRun, true);
    for (const task of ['text-to-image', 'image-to-image', 'remove-background', 'image-to-depth', 'image-to-pose']) {
      const args = [task];
      if (task.includes('to-image')) args.push('--prompt', '本地预检');
      if (task !== 'text-to-image') args.push('--image', 'https://never-fetch.invalid/input.png');
      const result = run([...args, '--dry-run']);
      assert.equal(result.status, 0, result.stderr);
      const data = JSON.parse(result.stdout);
      assert.equal(data.task, task); assert.equal(data.dryRun, true); assert.equal(data.remoteMediaValidated, false);
    }
    const missing = run(['text-to-image', '--prompt', '不应提交']);
    assert.equal(missing.status, 1); assert.match(missing.stderr, /FAL_KEY/);
    assert.deepEqual(await readdir(cwd), []);
    assert.deepEqual(await files(installed), expected.filter(x => x !== 'tests/fal.test.mjs'));
  } finally { await rm(tmp, { recursive: true, force: true }); }
});

test('Ark 独立分发白名单、CommonJS 边界、许可与相对引用', async () => {
  const ark = path.join(root, 'skills/volcengine-ark-media');
  const allowed = [
    'LICENSE', 'README.md', 'SKILL.md', 'package.json',
    'references/jobs.md', 'references/prompt-guide.md', 'references/seedance-2.0.md', 'references/seedance-2.5.md', 'references/seedream-image.md',
    'scripts/ark-media.js', 'scripts/create-video.js', 'scripts/generate-image.js', 'scripts/download-images.js',
    'scripts/query-video.js', 'scripts/runtime.js', 'tests/ark-media.test.cjs',
  ].sort();
  assert.deepEqual(await files(ark), allowed);
  assert.equal(await readFile(path.join(ark, 'LICENSE'), 'utf8'), await readFile(path.join(root, 'LICENSE'), 'utf8'));
  const manifest = JSON.parse(await readFile(path.join(ark, 'package.json'), 'utf8'));
  assert.equal(manifest.type, 'commonjs'); assert.equal(manifest.private, true);
  assert.equal(manifest.dependencies, undefined); assert.equal(manifest.devDependencies, undefined);
  assert.match(await readFile(path.join(ark, 'SKILL.md'), 'utf8'), /^---\nname: volcengine-ark-media\ndescription: .+\ncompatibility: .+\n---/);
  for (const rel of allowed.filter(x => x.endsWith('.md'))) {
    const source = await readFile(path.join(ark, rel), 'utf8');
    assert(!/\/Users\/[^\s/]+\//.test(source), `Machine path in ${rel}`);
    assert(!source.includes('"skills/volcengine-ark-media/scripts/'), `cwd-bound invocation in ${rel}`);
    for (const [, href] of source.matchAll(/\]\(([^)]+)\)/g)) {
      if (/^(https?:|#)/.test(href)) continue;
      const target = path.resolve(path.dirname(path.join(ark, rel)), href.split('#')[0]);
      assert(target.startsWith(ark + path.sep), `Reference escapes skill: ${rel}`);
      assert((await lstat(target)).isFile(), `Missing reference in ${rel}`);
    }
  }
});

test('百炼独立分发白名单、许可、元数据、本地引用与宿主无关性', async () => {
  const dir = path.join(root, 'skills/dashscope-tts');
  const allowed = ['LICENSE', 'README.md', 'SKILL.md', 'references/jobs.md',
    'references/models-and-voices.md', 'references/qwen-tts-api.md', 'references/speech-synthesizer-api.md',
    'scripts/models.mjs', 'scripts/tts.mjs', 'tests/tts.test.mjs'].sort();
  assert.deepEqual(await files(dir), allowed);
  assert.equal(await readFile(path.join(dir, 'LICENSE'), 'utf8'), await readFile(path.join(root, 'LICENSE'), 'utf8'));
  assert.match(await readFile(path.join(dir, 'SKILL.md'), 'utf8'), /^---\nname: dashscope-tts\ndescription: .+\ncompatibility: .+\n---/);
  for (const rel of allowed.filter(x => x.endsWith('.md'))) {
    const source = await readFile(path.join(dir, rel), 'utf8');
    assert(!/\/Users\/[^\s/]+\//.test(source));
    assert(!/AuroraPlatformWeb|ai-pi|DSH/.test(source));
    for (const [, href] of source.matchAll(/\]\(([^)]+)\)/g)) {
      if (/^(https?:|#)/.test(href)) continue;
      const target = path.resolve(path.dirname(path.join(dir, rel)), href.split('#')[0]);
      assert(target.startsWith(dir + path.sep)); assert((await lstat(target)).isFile());
    }
  }
});

test('七牛独立文件、许可、SDK声明、四变量文档与引用', async () => {
  const dir = path.join(root, 'skills/qiniu');
  const allowed = ['LICENSE','README.md','SKILL.md','package.json','references/upload.md','scripts/upload.js','tests/upload.test.cjs'].sort();
  assert.deepEqual(await files(dir), allowed);
  assert.equal(await readFile(path.join(dir,'LICENSE'),'utf8'),await readFile(path.join(root,'LICENSE'),'utf8'));
  const manifest=JSON.parse(await readFile(path.join(dir,'package.json'),'utf8'));
  assert.equal(manifest.type,'commonjs');assert.equal(manifest.private,true);assert.deepEqual(manifest.dependencies,{qiniu:'7.15.2'});
  const skillText=await readFile(path.join(dir,'SKILL.md'),'utf8');assert.match(skillText,/^---\nname: qiniu\ndescription: .+\ncompatibility: .+\n---/);
  for(const variable of ['QINIU_ACCESS_KEY','QINIU_SECRET_KEY','QINIU_BUCKET','QINIU_DOMAIN']) assert(skillText.includes(variable));
  for(const rel of allowed.filter(x=>x.endsWith('.md'))){
    const source=await readFile(path.join(dir,rel),'utf8');assert(!/\/Users\/[^\s/]+\//.test(source));
    for(const [,href] of source.matchAll(/\]\(([^)]+)\)/g)){
      if(/^(https?:|#)/.test(href))continue;
      const target=path.resolve(path.dirname(path.join(dir,rel)),href.split('#')[0]);assert(target.startsWith(dir+path.sep));assert((await lstat(target)).isFile());
    }
  }
});
