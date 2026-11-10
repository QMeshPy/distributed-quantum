import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { calibration } from '@filoz/synapse-sdk';
import { calculate as pieceCalculate } from '@filoz/synapse-core/piece';
import { parseRequest, execute, safeError, makeSynapse, createJournal, MAX_BYTES } from './bridge.mjs';

const data = Buffer.alloc(256, 7);
const digest = createHash('sha256').update(data).digest('hex');
const upload = {command: 'upload', data_base64: data.toString('base64'), copies: 1,
  retention_days: 7, max_monthly_usdfc: '1', max_lockup_usdfc: '1'};
const address = '0x1111111111111111111111111111111111111111';
const hash = `0x${'a'.repeat(64)}`;

test('reject unsupported network, malformed bytes and unbounded budgets before RPC', () => {
  for (const request of [
    {...upload, network: 'mainnet'}, {...upload, chain_id: 314},
    {...upload, data_base64: '!!!'}, {...upload, data_base64: 'YQ=='},
    {...upload, copies: 3}, {...upload, retention_days: 31},
    {...upload, max_monthly_usdfc: '11'}, {...upload, max_lockup_usdfc: 'Infinity'},
  ]) assert.throws(() => parseRequest(request));
  assert.equal(parseRequest(upload).bytes.length, 256);
});

test('real SDK import uses Calibration contract addresses', () => {
  assert.equal(calibration.id, 314159);
  const sdk = makeSynapse({command: 'status'}, {});
  assert.equal(sdk.chain.id, 314159);
  assert.equal(sdk.storage.withCDN, false);
  assert.throws(() => makeSynapse(upload, {}), /signing key/);
  assert.throws(() => makeSynapse({command:'status'}, {QMESH_FILECOIN_NETWORK:'mainnet'}));
});

function fake() {
  const calls = [];
  const ctx = {provider: {id: 3n, serviceProvider: address},
    store: async bytes => {calls.push('store'); return {pieceCid: {toString:()=> 'piece'}, size: bytes.length};},
    commit: async opts => { calls.push('commit'); opts.onSubmitted(hash); return {
      txHash: hash, confirmedTxHash: hash, dataSetId: 5n, pieceIds:[0n]}; },
    getPieceUrl: () => 'https://provider.example/piece/piece'};
  const sdk = {client: {account: {address}}, readClient: {
    getChainId: async()=>314159, waitForTransactionReceipt: async()=>({status:'success',blockNumber:10n}),
    readContract: async()=>({lockups:{defaultLockupPeriod:86400n}}),
  }, storage: {createContexts: async()=>[ctx], calculateMultiContextCosts: async()=>({
    rates:{perEpoch:1n,perMonth:86400n}, lockups:{total:1n,rateDeltaPerEpoch:1n}, depositNeeded:0n}),
  }, payments: {serviceApproval: async()=>({isApproved:true,rateAllowance:100000n,rateUsage:0n,
    lockupAllowance:100n,lockupUsage:0n,maxLockupPeriod:86400n})}};
  return {sdk,calls};
}

test('upload uses funded finite allowance and records confirmed copy receipt', async()=> {
  const {sdk,calls} = fake();
  const result = await execute(parseRequest(upload), sdk);
  assert.deepEqual(calls,['store','commit']);
  assert.equal(result.sha256,digest);
  assert.equal(result.payer_address,address);
  assert.equal(result.copies[0].data_set_id,'5');
  assert.equal(result.copies[0].transaction_hash,hash);
  assert.equal(result.complete,true);
});

test('wrong RPC chain and insufficient funding cause no storage mutation', async()=> {
  const a = fake(); a.sdk.readClient.getChainId=async()=>314;
  await assert.rejects(execute(parseRequest(upload),a.sdk),/Calibration/);
  assert.deepEqual(a.calls,[]);
  const b = fake(); b.sdk.storage.calculateMultiContextCosts=async()=>({depositNeeded:1n,rates:{perMonth:1n}});
  await assert.rejects(execute(parseRequest(upload),b.sdk), e=>e.code==='funding_required');
  assert.deepEqual(b.calls,[]);
});

test('unbounded approval and over-budget estimate never upload', async()=> {
  const a=fake(); a.sdk.payments.serviceApproval=async()=>({isApproved:true,rateAllowance:2n**256n-1n,
    lockupAllowance:2n**256n-1n});
  await assert.rejects(execute(parseRequest(upload),a.sdk),e=>e.code==='approval_required');
  assert.deepEqual(a.calls,[]);
  const b=fake(); b.sdk.storage.calculateMultiContextCosts=async()=>({depositNeeded:0n,rates:{perMonth:2n*10n**18n}});
  await assert.rejects(execute(parseRequest(upload),b.sdk),e=>e.code==='budget_exceeded');
  assert.deepEqual(b.calls,[]);
});

test('operator lockup shorter than live contract requirement is rejected before store',async()=>{
  const {sdk,calls}=fake();
  sdk.payments.serviceApproval=async()=>({isApproved:true,rateAllowance:100000n,rateUsage:0n,
    lockupAllowance:100n,lockupUsage:0n,maxLockupPeriod:20160n});
  await assert.rejects(execute(parseRequest(upload),sdk),e=>e.code==='approval_required' &&
    e.uncertain===false && e.transaction_hashes.length===0 && e.details.required_lockup_epochs==='86400');
  assert.deepEqual(calls,[]);
});

test('diagnostics retain stage and error classes without leaking SDK messages',async()=>{
  const {sdk}=fake();
  sdk.storage.createContexts=async()=>[{
    provider:{id:3n,serviceProvider:address},store:async()=>{
      const cause=new TypeError('signedpayload and secret must remain private');
      cause.response={status:403};
      throw new Error('private SDK message',{cause});
    },
  }];
  try {await execute(parseRequest(upload),sdk);assert.fail('expected failure');}
  catch(error){
    const serialized=safeError(error);
    assert.equal(serialized.error.operation_stage,'store');
    assert.deepEqual(serialized.error.error_types,['Error','TypeError']);
    assert.deepEqual(serialized.error.http_statuses,[403]);
    assert.ok(!JSON.stringify(serialized).includes('private'));
    assert.equal(serialized.error.uncertain,true);
  }
});

test('uncertain commit preserves submitted hashes and never retries', async()=> {
  const a=fake(); a.sdk.storage.createContexts=async()=>[{
    provider:{id:3n,serviceProvider:address}, store:async()=>({pieceCid:{toString:()=> 'piece'},size:256}),
    commit:async opts=>{a.calls.push('commit');opts.onSubmitted(hash);throw Error('secret=never echo');}
  }];
  try {await execute(parseRequest(upload),a.sdk); assert.fail('expected failure');}
  catch(error) {
    const result=safeError(error); assert.equal(result.error.uncertain,true);
    assert.deepEqual(result.error.transaction_hashes,[hash]);
    assert.ok(!JSON.stringify(result).includes('secret'));
  }
  assert.deepEqual(a.calls,['commit']);
});

test('payment approval uses finite supplied limits', async()=> {
  const {sdk}=fake(); let options;
  sdk.payments.approveService=async p=>{options=p;return hash;};
  const result=await execute(parseRequest({command:'payments',action:'approve',max_monthly_usdfc:'1',
    max_lockup_usdfc:'2',max_lockup_days:30}),sdk);
  assert.equal(options.rateAllowance,10n**18n/86400n);
  assert.equal(options.lockupAllowance,2n*10n**18n);
  assert.equal(options.maxLockupPeriod,86400n);
  assert.equal(result.transaction_hash,hash);
});

test('explicit deposit rejects total account funding over test-token cap', async()=> {
  const {sdk}=fake(); sdk.payments.accountInfo=async()=>({funds:10n**19n});
  sdk.payments.deposit=async()=>assert.fail('deposit must not run');
  await assert.rejects(execute(parseRequest({command:'payments',action:'deposit',amount_usdfc:'1'}),sdk),
    e=>e.code==='budget_exceeded');
});

test('download requires expected size and digest',()=>{
  assert.throws(()=>parseRequest({command:'download',piece_cid:'bad',sha256:digest,size_bytes:MAX_BYTES+1}));
  assert.throws(()=>parseRequest({command:'download',piece_cid:'bad',size_bytes:256}));
});

test('agent wallet binding rejects a different signer before RPC',()=>{
  const env={QMESH_FILECOIN_PRIVATE_KEY:`0x${'1'.repeat(64)}`,QMESH_FILECOIN_EXPECTED_ADDRESS:address};
  assert.throws(()=>makeSynapse(upload,env),e=>e.code==='wrong_signer');
});

test('fresh key-free download validates real piece shape and rejects mismatched bytes',async t=>{
  const cid=await pieceCalculate(data);
  const request=parseRequest({command:'download',piece_cid:cid.toString(),sha256:digest,size_bytes:data.length,
    provider_address:address});
  const {sdk}=fake();
  sdk.getProviderInfo=async()=>({pdp:{serviceURL:'https://provider.example/'}});
  t.mock.method(globalThis,'fetch',async()=>new Response(data));
  const result=await execute(request,sdk);
  assert.equal(result.data_base64,data.toString('base64'));
  t.mock.method(globalThis,'fetch',async()=>new Response(Buffer.alloc(data.length,8)));
  await assert.rejects(execute(request,sdk),e=>e.code==='integrity_error');
});

test('provider piece redirect to same-origin public path is followed with integrity checks',async t=>{
  const cid=await pieceCalculate(data);
  const request=parseRequest({command:'download',piece_cid:cid.toString(),sha256:digest,size_bytes:data.length,
    provider_address:address});
  const {sdk}=fake(); sdk.getProviderInfo=async()=>({pdp:{serviceURL:'https://provider.example/'}});
  const paths=[];
  t.mock.method(globalThis,'fetch',async(url,options)=>{
    assert.equal(options.redirect,'manual');
    paths.push(url.pathname);
    return paths.length===1 ? new Response(null,{status:301,headers:{location:`/public/${cid}`}}) : new Response(data);
  });
  assert.equal((await execute(request,sdk)).data_base64,data.toString('base64'));
  assert.deepEqual(paths,[`/piece/${cid}`,`/public/${cid}`]);
});

test('cross-origin and unsafe redirects are rejected before fetching their target',async t=>{
  const cid=await pieceCalculate(data);
  const request=parseRequest({command:'download',piece_cid:cid.toString(),sha256:digest,size_bytes:data.length,
    provider_address:address});
  const {sdk}=fake(); sdk.getProviderInfo=async()=>({pdp:{serviceURL:'https://provider.example/'}});
  for (const location of ['https://other.example/public/piece','http://provider.example/public/piece',
    'https://user:secret@provider.example/public/piece','https://127.0.0.1/piece','https://localhost/piece']) {
    let requests=0;
    t.mock.method(globalThis,'fetch',async()=>{
      requests++;
      return new Response(null,{status:302,headers:{location}});
    });
    await assert.rejects(execute(request,sdk),e=>e.code==='unsafe_provider_url');
    assert.equal(requests,1);
  }
});

test('redirect loops and more than three same-origin redirects are bounded',async t=>{
  const cid=await pieceCalculate(data);
  const request=parseRequest({command:'download',piece_cid:cid.toString(),sha256:digest,size_bytes:data.length,
    provider_address:address});
  const {sdk}=fake(); sdk.getProviderInfo=async()=>({pdp:{serviceURL:'https://provider.example/'}});
  let requests=0;
  t.mock.method(globalThis,'fetch',async url=>{
    requests++;
    return new Response(null,{status:307,headers:{location:url.href}});
  });
  await assert.rejects(execute(request,sdk),e=>e.code==='retrieval_unavailable');
  assert.equal(requests,1);
  requests=0;
  t.mock.method(globalThis,'fetch',async()=>{
    requests++;
    return new Response(null,{status:308,headers:{location:`/hop/${requests}`}});
  });
  await assert.rejects(execute(request,sdk),e=>e.code==='retrieval_unavailable');
  assert.equal(requests,4);
});

test('oversized provider stream is cancelled before buffering its remaining chunks',async t=>{
  const cid=await pieceCalculate(data);
  const request=parseRequest({command:'download',piece_cid:cid.toString(),sha256:digest,size_bytes:data.length,
    provider_address:address,retrieval_url:'http://localhost:1234/untrusted'});
  const {sdk}=fake();
  sdk.getProviderInfo=async()=>({pdp:{serviceURL:'https://provider.example/'}});
  let pulled=0;
  let cancelled=false;
  const stream=new ReadableStream({
    pull(controller) {
      pulled++;
      controller.enqueue(new Uint8Array(128));
      if (pulled===100) controller.close();
    },
    cancel(){cancelled=true;},
  },{highWaterMark:0});
  t.mock.method(globalThis,'fetch',async(url,options)=>{
    assert.ok(url.toString().startsWith('https://provider.example/'));
    assert.equal(options.redirect,'manual');
    return new Response(stream);
  });
  await assert.rejects(execute(request,sdk),e=>e.code==='integrity_error' && e.uncertain===false);
  assert.equal(cancelled,true);
  assert.equal(pulled,3);
});

test('PieceCID is checked independently when size and SHA256 match supplied bytes',async t=>{
  const cid=await pieceCalculate(data);
  const different=Buffer.alloc(data.length,8);
  const request=parseRequest({command:'download',piece_cid:cid.toString(),sha256:createHash('sha256').update(different).digest('hex'),
    size_bytes:data.length,provider_address:address});
  const {sdk}=fake(); sdk.getProviderInfo=async()=>({pdp:{serviceURL:'https://provider.example/'}});
  t.mock.method(globalThis,'fetch',async()=>new Response(different));
  await assert.rejects(execute(request,sdk),e=>e.code==='integrity_error');
});

test('payer-only discovery uses registered providers and tries another provider after 404',async t=>{
  const cid=await pieceCalculate(data);
  const request=parseRequest({command:'download',piece_cid:cid.toString(),sha256:digest,size_bytes:data.length,
    payer_address:address});
  const {sdk}=fake();
  sdk.storage.findDataSets=async()=>[
    {isLive:true,isManaged:true,pdpEndEpoch:0n,serviceProvider:address},
    {isLive:true,isManaged:true,pdpEndEpoch:0n,serviceProvider:'0x2222222222222222222222222222222222222222'},
  ];
  sdk.getProviderInfo=async address=>({pdp:{serviceURL:address.startsWith('0x1')?'https://first.example/':'https://second.example/'}});
  t.mock.method(globalThis,'fetch',async url=>url.hostname==='first.example'?new Response('',{status:404}):new Response(data));
  assert.equal((await execute(request,sdk)).data_base64,data.toString('base64'));
});

test('untrusted registry retrieval URLs are rejected before HTTP',async t=>{
  const cid=await pieceCalculate(data);
  const request=parseRequest({command:'download',piece_cid:cid.toString(),sha256:digest,size_bytes:data.length,
    provider_address:address});
  const {sdk}=fake();
  t.mock.method(globalThis,'fetch',async()=>assert.fail('must not fetch rejected URL'));
  for (const serviceURL of ['http://provider.example/','https://127.0.0.1/','https://[::1]/',
    'https://10.0.0.1/','https://169.254.169.254/','https://localhost/','https://storage.local/',
    'https://user:password@provider.example/']) {
    sdk.getProviderInfo=async()=>({pdp:{serviceURL}});
    await assert.rejects(execute(request,sdk),e=>e.code==='unsafe_provider_url');
  }
});

test('preflight RPC errors release write journal but store failures remain uncertain',async()=>{
  const a=fake(); a.sdk.storage.calculateMultiContextCosts=async()=>{throw Error('read failed');};
  await assert.rejects(execute(parseRequest(upload),a.sdk),e=>e.uncertain===false && e.transaction_hashes.length===0);
  assert.deepEqual(a.calls,[]);
  const b=fake(); b.sdk.storage.createContexts=async()=>[{
    provider:{id:3n,serviceProvider:address},store:async()=>{throw Error('provider connection lost');},
  }];
  await assert.rejects(execute(parseRequest(upload),b.sdk),e=>e.uncertain===true && e.transaction_hashes.length===0);
});

test('deterministic insufficient wallet balance never invokes deposit',async()=>{
  const {sdk}=fake(); sdk.payments.accountInfo=async()=>({funds:0n});
  sdk.payments.walletBalance=async()=>0n;
  sdk.payments.deposit=async()=>assert.fail('deposit must not run');
  await assert.rejects(execute(parseRequest({command:'payments',action:'deposit',amount_usdfc:'1'}),sdk),
    e=>e.code==='funding_required' && e.uncertain===false && e.transaction_hashes.length===0);
});

test('broadcast failure before a hash is returned remains uncertain',async()=>{
  const {sdk}=fake(); sdk.payments.approveService=async()=>{throw Error('send disconnected');};
  await assert.rejects(execute(parseRequest({command:'payments',action:'approve',max_monthly_usdfc:'1',
    max_lockup_usdfc:'1',max_lockup_days:30}),sdk),e=>e.uncertain===true && e.transaction_hashes.length===0);
});

test('transaction events are durable before the receipt wait starts',async t=>{
  const dir=mkdtempSync(join(tmpdir(),'qmesh-filecoin-journal-'));
  const path=join(dir,'operation.ndjson');
  const journal=createJournal(path);
  t.after(()=>{journal.close();rmSync(path);rmdirSync(dir);});
  const {sdk}=fake();
  const read=()=>readFileSync(path,'utf8').trim().split('\n').map(line=>JSON.parse(line));
  sdk.payments.approveService=async()=>{
    assert.deepEqual(read(),[{type:'write_started'}]);
    return hash;
  };
  sdk.readClient.waitForTransactionReceipt=async()=>{
    assert.deepEqual(read(),[{type:'write_started'},{type:'transaction_submitted',transaction_hash:hash}]);
    return {status:'success',blockNumber:10n};
  };
  await execute(parseRequest({command:'payments',action:'approve',max_monthly_usdfc:'1',
    max_lockup_usdfc:'1',max_lockup_days:30}),sdk,journal.append);
  assert.throws(()=>createJournal(path));
});

test('journal failure before a write prevents submission',async()=>{
  const {sdk}=fake(); sdk.payments.approveService=async()=>assert.fail('must not submit without journal');
  await assert.rejects(execute(parseRequest({command:'payments',action:'approve',max_monthly_usdfc:'1',
    max_lockup_usdfc:'1',max_lockup_days:30}),sdk,()=>{throw Error('fsync failed');}),
    e=>e.uncertain===false && e.transaction_hashes.length===0);
});

test('journal failure after broadcast preserves uncertain hash in final error',async()=>{
  const {sdk}=fake(); sdk.payments.approveService=async()=>hash;
  await assert.rejects(execute(parseRequest({command:'payments',action:'approve',max_monthly_usdfc:'1',
    max_lockup_usdfc:'1',max_lockup_days:30}),sdk,event=>{
      if(event.type==='transaction_submitted') throw Error('fsync failed');
    }),e=>e.uncertain===true && e.transaction_hashes[0]===hash);
});

test('reverted transaction is never returned as a successful upload',async()=>{
  const {sdk}=fake(); sdk.readClient.waitForTransactionReceipt=async()=>({status:'reverted'});
  await assert.rejects(execute(parseRequest(upload),sdk),e=>e.code==='transaction_reverted' && e.uncertain);
});
