import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const immutable = process.argv[2];
if (!immutable || !/^https:\/\/[a-z0-9]+\.abyss-hunter-playtest\.pages\.dev\/?$/.test(immutable)) throw new Error('Provide the immutable existing-project deployment URL');
const root = new URL('../build/web-preview/', import.meta.url);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const manifest = JSON.parse(await readFile(new URL('playtest-version.json', root),'utf8'));
assert.equal(manifest.sourceDirty,false); assert.equal(manifest.target,'web-preview');
const checks=[];
for(const host of [immutable,'https://abyss-hunter-playtest.pages.dev/']) {
  for(const [remote,local] of [['','index.html'],['playtest-version.json','playtest-version.json'],['preview/preview-ads.js','preview/preview-ads.js'],['preview/preview-ads.css','preview/preview-ads.css']]) {
    const url=new URL(remote,host.endsWith('/')?host:`${host}/`).href;
    const response=await fetch(url,{headers:{'Cache-Control':'no-cache'}});
    const bytes=Buffer.from(await response.arrayBuffer()),expected=await readFile(new URL(local,root));
    checks.push({url,status:response.status,localSha256:hash(expected),remoteSha256:hash(bytes),matches:response.ok&&hash(expected)===hash(bytes)});
  }
}
const output=new URL('../.artifacts/loo-67/deployment-verification.json',import.meta.url);
await mkdir(new URL('.',output),{recursive:true});
await writeFile(output,JSON.stringify({checkedAt:new Date().toISOString(),immutable,production:'https://abyss-hunter-playtest.pages.dev/',manifest,checks},null,2)+'\n');
checks.forEach(check=>assert.equal(check.matches,true,`Deployment differs: ${check.url}`));
console.log(JSON.stringify({immutable,manifest,verifiedFiles:checks.length,report:fileURLToPath(output)},null,2));
