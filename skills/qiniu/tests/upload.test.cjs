'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { run } = require('../scripts/upload.js');
const root = path.resolve(__dirname, '..');
const config = { QINIU_ACCESS_KEY:'test-access-key', QINIU_SECRET_KEY:'test-secret-key', QINIU_BUCKET:'test-bucket', QINIU_DOMAIN:'https://cdn.example.com/' };
function fixture(t) {
  const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'qiniu-offline-'));
  t.after(()=>fs.rmSync(tmp,{recursive:true,force:true}));
  const file=path.join(tmp,'文件 image.png'); fs.writeFileSync(file,'test-image');
  return {tmp,file};
}
function sdkMock(calls, fail=false) {
  return {
    auth:{digest:{Mac:class {constructor(ak,sk){ calls.mac={ak,sk}; }}}},
    rs:{PutPolicy:class {constructor(opts){calls.policy=opts;} uploadToken(){return 'test-upload-token';}}},
    conf:{Config:class {constructor(opts){calls.config=opts;}}},
    form_up:{PutExtra:class {}, FormUploader:class {async putFile(token,key,file){calls.upload={token,key,file}; if(fail) throw new Error('test-access-key test-secret-key test-upload-token'); return {resp:{statusCode:200},data:{key,hash:'fake-etag',secret:'must-not-print'}};}}}
  };
}
const noSdk=()=>{throw new Error('SDK must not load');};

test('真实上传四个变量全部必填，逐项缺失和空白在加载 SDK 前失败',async t=>{
 const {file}=fixture(t);
 for(const name of Object.keys(config)) for(const value of [undefined,'   ']) {
  const env={...config,[name]:value}; await assert.rejects(run(['--file',file],{env,sdkLoader:noSdk,log:()=>{}}),new RegExp(name));
 }
 await assert.rejects(run(['--file',file],{env:{},sdkLoader:noSdk,log:()=>{}}),/QINIU_ACCESS_KEY.*QINIU_SECRET_KEY.*QINIU_BUCKET.*QINIU_DOMAIN/);
});

test('dry-run 仅读取 Bucket/Domain，无密钥/SDK/网络/文件写入',async t=>{
 const {tmp,file}=fixture(t), logs=[];
 const env=new Proxy(config,{get(target,key){assert(['QINIU_BUCKET','QINIU_DOMAIN'].includes(key));return target[key];}});
 const plan=await run(['--file',file,'--dry-run'],{env,sdkLoader:noSdk,now:new Date(2026,0,2),uuid:'fixed-uuid',log:x=>logs.push(x)});
 assert.equal(plan.key,'ai/2026-01-02/fixed-uuid.png');assert.equal(plan.https,true);assert.equal(plan.bucket,'test-bucket');
 assert(!logs.join('').includes('test-access-key'));assert.deepEqual(fs.readdirSync(tmp),['文件 image.png']);
});

test('环境校验拒绝非 HTTPS/凭据/路径/查询域名及非法 Bucket',async t=>{
 const {file}=fixture(t);
 for(const domain of ['http://cdn.example.com','https://user:pass@cdn.example.com','https://cdn.example.com/path','https://cdn.example.com/?token=x','https://cdn.example.com/#x','invalid']) await assert.rejects(run(['--file',file,'--dry-run'],{env:{...config,QINIU_DOMAIN:domain},sdkLoader:noSdk,log:()=>{}}),/QINIU_DOMAIN/);
 await assert.rejects(run(['--file',file,'--dry-run'],{env:{...config,QINIU_BUCKET:'INVALID'},sdkLoader:noSdk,log:()=>{}}),/QINIU_BUCKET/);
});

test('命名与 URL 编码、name 优先、前缀及文件类型保护',async t=>{
 const {tmp,file}=fixture(t), options={env:config,sdkLoader:noSdk,log:()=>{}};
 const p=await run(['--file',file,'--dir','/指定/目录/','--keep-name','--name','图 #?.png','--dry-run'],options);
 assert.equal(p.key,'指定/目录/图 #?.png');assert.equal(p.url,'https://cdn.example.com/%E6%8C%87%E5%AE%9A/%E7%9B%AE%E5%BD%95/%E5%9B%BE%20%23%3F.png');
 for(const args of [['--name','../x'],['--dir','a//b'],['--dir','..'],['--dir','/'],['--bucket','x'],['--file',file]]) await assert.rejects(run(['--file',file,...args,'--dry-run'],options));
 await assert.rejects(run(['--file',tmp,'--dry-run'],options),/regular file/);
 const link=path.join(tmp,'link.png');fs.symlinkSync(file,link);await assert.rejects(run(['--file',link,'--dry-run'],options),/regular file/);
});

test('SDK 上传 HTTPS、仅新增 token、环境目标与白名单结果；加速显式启用',async t=>{
 const {file}=fixture(t), calls={},logs=[];
 const out=await run(['--file',file,'--name','keep.png','--accelerate'],{env:config,sdkLoader:()=>sdkMock(calls),log:x=>logs.push(x)});
 assert.deepEqual(calls.mac,{ak:'test-access-key',sk:'test-secret-key'});
 assert.equal(calls.policy.scope,`test-bucket:${out.key}`);assert.equal(calls.policy.insertOnly,1);assert.equal(calls.policy.expires,600);
 assert.deepEqual(calls.config,{useHttpsDomain:true,accelerateUploading:true});assert.equal(out.urlVerified,false);
 assert.equal(JSON.parse(logs[0]).state,'uploading');assert.equal(out.state,'uploaded');
 for(const secret of ['test-access-key','test-secret-key','test-upload-token','must-not-print']) assert(!logs.join('').includes(secret));
});

test('SDK 错误不泄漏凭据、不额外重跑；异常响应拒绝成功',async t=>{
 const {file}=fixture(t),calls={},logs=[];
 await assert.rejects(run(['--file',file],{env:config,sdkLoader:()=>sdkMock(calls,true),log:x=>logs.push(x)}),e=>e.message.includes('outcome unknown')&&!e.message.includes('test-secret-key'));
 assert.equal(logs.length,1);assert.equal(JSON.parse(logs[0]).state,'uploading');
 const sdk=sdkMock({});sdk.form_up.FormUploader=class {async putFile(){return {resp:{statusCode:200},data:{key:'wrong',hash:'hash'}};}};
 await assert.rejects(run(['--file',file],{env:config,sdkLoader:()=>sdk,log:()=>{}}),/unknown/);
});

test('复制到中文空格目录、ESM 宿主下无依赖 help/dry-run；缺 SDK 仅提示安装',async t=>{
 const {tmp,file}=fixture(t),installed=path.join(tmp,'技能 安装');fs.cpSync(root,installed,{recursive:true});
 fs.writeFileSync(path.join(tmp,'package.json'),'{"type":"module"}');
 const cli=path.join(installed,'scripts/upload.js');
 const env={PATH:process.env.PATH,HOME:tmp,QINIU_BUCKET:config.QINIU_BUCKET,QINIU_DOMAIN:config.QINIU_DOMAIN};
 for(const args of [['--help'],['--file',file,'--dry-run']]){
  const r=spawnSync(process.execPath,[cli,...args],{cwd:tmp,env,encoding:'utf8',timeout:10000});assert.equal(r.status,0,r.stderr);
 }
 const r=spawnSync(process.execPath,[cli,'--file',file],{cwd:tmp,env:{...env,...config},encoding:'utf8',timeout:10000});
 assert.equal(r.status,1);assert.match(r.stderr,/Missing qiniu SDK/);assert(!fs.existsSync(path.join(installed,'node_modules')));
});
