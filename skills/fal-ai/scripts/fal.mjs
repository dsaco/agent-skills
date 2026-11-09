import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { InputError, fail } from './errors.mjs';
import { createClient, writeJson } from './client.mjs';

const help = `fal.ai 通用生成 CLI（Node.js 22+，无依赖）
node fal.mjs search --query TEXT [--category CATEGORY] [--limit 10] [--cursor CURSOR]
node fal.mjs schema --endpoint ID [--out NEW-FILE.json]
node fal.mjs submit --endpoint ID --input INPUT.json [--out-dir NEW-DIR] [--output /video/url ...] [--dry-run [--schema SNAPSHOT.json]]
node fal.mjs <status|result|cancel> --request REQUEST.json
node fal.mjs download --request REQUEST.json [--output /path/to/file ...]
node fal.mjs wait --request REQUEST.json [--timeout 40] [--interval 5]
输入 JSON 中用 {"$file":"本地路径","content_type":"video/mp4"} 上传任意字段的本地素材。
search/schema 无需 Key；submit dry-run 默认只联网读 schema，不上传、不提交、不写文件。
--schema 仅供离线 dry-run；实际提交重新读取实时 schema。结果与任务文件保存在用户 cwd。`;
export function parse(argv) {
  const [command, ...args] = argv, flags = {};
  for (let i = 0; i < args.length; i++) {
    if (!/^--[a-z-]+$/.test(args[i])) fail('参数需要 --名称 值。');
    const name = args[i].slice(2);
    if (name === 'dry-run') { if (flags[name]) fail('重复参数。'); flags[name] = true; continue; }
    const value = args[++i]; if (value === undefined || value.startsWith('--')) fail(`--${name} 缺少值。`);
    if (name === 'output') (flags.output ??= []).push(value);
    else { if (Object.hasOwn(flags, name)) fail(`重复参数 --${name}。`); flags[name] = value; }
  }
  return { command, flags };
}
export async function main(argv = process.argv.slice(2)) {
  if (!argv.length || argv.includes('--help')) { console.log(help); return; }
  const { command, flags: f } = parse(argv);
  const allowed = {
    search: ['query', 'category', 'limit', 'cursor'], schema: ['endpoint', 'out'],
    submit: ['endpoint', 'input', 'out-dir', 'output', 'dry-run', 'schema'],
    status: ['request'], result: ['request'], cancel: ['request'], download: ['request', 'output'], wait: ['request', 'timeout', 'interval'],
  };
  if (!Object.hasOwn(allowed, command)) fail('未知操作，使用 --help 查看通用命令。');
  for (const key of Object.keys(f)) if (!allowed[command].includes(key)) fail(`此操作不接受 --${key}。`);
  const requireFlag = key => { if (!f[key]) fail(`缺少 --${key}。`); return f[key]; };
  const client = createClient(); let result;
  if (command === 'search') result = await client.search({ query: f.query, category: f.category, cursor: f.cursor, limit: f.limit === undefined ? 10 : Number(f.limit) });
  else if (command === 'schema') {
    result = await client.schema(requireFlag('endpoint'));
    if (f.out) { const target = path.resolve(f.out); await writeJson(target, result, true); result = { endpoint: result.endpoint, schemaFile: target }; }
  } else if (command === 'submit') {
    const options = { endpoint: requireFlag('endpoint'), inputFile: requireFlag('input'), outDir: f['out-dir'], outputs: f.output, schemaFile: f.schema };
    if (!f['dry-run']) { options.outDir ??= path.resolve('output', `fal-${randomUUID()}`); console.error(`计划任务目录：${path.resolve(options.outDir)}（失败时检查 request.json）`); }
    result = f['dry-run'] ? { ...await client.prepare(options), dryRun: true } : await client.submit(options);
    if (f['dry-run']) delete result.contract;
  } else {
    const file = path.resolve(requireFlag('request'));
    result = command === 'wait' ? await client.wait(file, { timeout: f.timeout === undefined ? 40 : Number(f.timeout), interval: f.interval === undefined ? 5 : Number(f.interval) }) : command === 'download' ? await client.download(file, f.output) : await client[command](file);
  }
  console.log(JSON.stringify(result, null, 2));
  if (result.failures?.length) process.exitCode = 1;
}
const entry = process.argv[1] ? await fs.realpath(path.resolve(process.argv[1])).catch(() => null) : null;
if (entry === await fs.realpath(fileURLToPath(import.meta.url))) main().catch(e => { console.error(e instanceof InputError ? e.message : '文件或网络操作失败；保留任务记录，勿自动重新提交。'); process.exitCode = 1; });
