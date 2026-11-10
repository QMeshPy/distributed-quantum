import { createHash } from 'node:crypto';
import { openSync, writeSync, fsyncSync, closeSync } from 'node:fs';
import { isIP } from 'node:net';
import { pathToFileURL } from 'node:url';
import { Synapse, calibration, TOKENS } from '@filoz/synapse-sdk';
import * as Piece from '@filoz/synapse-core/piece';
import * as PDP from '@filoz/synapse-core/pdp-verifier';
import * as WarmStorage from '@filoz/synapse-core/warm-storage';
import { http, isAddress, parseUnits, zeroAddress } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

export const MAX_BYTES = 16 * 1024 * 1024;
const MAX_USDFC = 10n * 10n ** 18n;
const EPOCHS_DAY = 2880n;
const EPOCHS_MONTH = 86400n;
const NETWORK = {network:'calibration', chain_id:314159};
const MUTATIONS = new Set(['upload','deposit','approve','withdraw','revoke','terminate']);
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

function fail(code, message, details={}) {
  const error = new Error(message);
  Object.assign(error, {code, details, safe:true});
  throw error;
}
function integer(value, min, max, name) {
  if (!Number.isSafeInteger(value) || value < min || value > max) fail('invalid_request',`Invalid ${name}`);
  return value;
}
function id(value) {
  if (typeof value !== 'string' || !/^(0|[1-9][0-9]{0,76})$/.test(value)) fail('invalid_request','Invalid decimal identifier');
  return BigInt(value);
}
function amount(value) {
  if (typeof value !== 'string' || !/^(0|[1-9][0-9]*)(\.[0-9]{1,18})?$/.test(value)) fail('invalid_request','Use a decimal USDFC string');
  const parsed=parseUnits(value,18);
  if (parsed <= 0n || parsed > MAX_USDFC) fail('invalid_request','Amount must be greater than zero and at most 10 test USDFC');
  return parsed;
}

export function parseRequest(input) {
  if (input == null || Array.isArray(input) || typeof input !== 'object') fail('invalid_request','Expected a JSON object');
  if ((input.network != null && input.network !== 'calibration') || (input.chain_id != null && input.chain_id !== 314159)) {
    fail('wrong_network','Only Filecoin Calibration is supported');
  }
  const request={...input};
  if (request.payer_address != null && !isAddress(request.payer_address)) fail('invalid_request','Invalid payer address');
  if (request.command === 'upload') {
    if (typeof request.data_base64 !== 'string' || request.data_base64.length > Math.ceil(MAX_BYTES/3)*4 ||
        !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(request.data_base64)) {
      fail('invalid_request','Invalid or oversized base64 payload');
    }
    request.bytes=Buffer.from(request.data_base64,'base64');
    integer(request.bytes.length,127,MAX_BYTES,'payload size');
    if (request.bytes.toString('base64') !== request.data_base64) fail('invalid_request','Non-canonical base64 payload');
    request.copies=integer(request.copies ?? 2,1,2,'copies');
    request.retention_days=integer(request.retention_days,1,30,'retention_days');
    request.monthly=amount(request.max_monthly_usdfc);
    request.lockup=amount(request.max_lockup_usdfc);
  } else if (request.command === 'download') {
    integer(request.size_bytes,127,MAX_BYTES,'size_bytes');
    if (!/^[0-9a-f]{64}$/.test(request.sha256 ?? '')) fail('invalid_request','Expected SHA256 digest');
    const piece=Piece.tryFrom(request.piece_cid);
    if (!piece || piece.size !== request.size_bytes) fail('invalid_request','PieceCID and size disagree');
    if (request.provider_address != null && !isAddress(request.provider_address)) fail('invalid_request','Invalid provider address');
    if (!request.provider_address && !request.payer_address) fail('invalid_request','Supply provider_address or payer_address');
  } else if (request.command === 'status') {
    if (!Array.isArray(request.copies) || request.copies.length < 1 || request.copies.length > 2) fail('invalid_request','Expected one or two copies');
    if (!Piece.tryFrom(request.piece_cid)) fail('invalid_request','Invalid PieceCID');
    for (const copy of request.copies) {id(copy.provider_id);id(copy.data_set_id);id(copy.piece_id);}
  } else if (request.command === 'payments') {
    if (request.action === 'approve') {
      request.monthly=amount(request.max_monthly_usdfc);
      request.lockup=amount(request.max_lockup_usdfc);
      request.days=integer(request.max_lockup_days,1,30,'max_lockup_days');
    } else if (request.action === 'deposit' || request.action === 'withdraw') request.amount=amount(request.amount_usdfc);
    else if (request.action === 'terminate') request.dataset=id(request.data_set_id);
    else if (!['balance','revoke'].includes(request.action)) fail('invalid_request','Unknown payment action');
  } else fail('invalid_request','Unknown command');
  return request;
}

export function makeSynapse(request, env=process.env) {
  if (env.QMESH_FILECOIN_NETWORK && env.QMESH_FILECOIN_NETWORK !== 'calibration') fail('wrong_network','Only Filecoin Calibration is supported');
  const needsKey=MUTATIONS.has(request.command) || MUTATIONS.has(request.action);
  const privateKey=env.QMESH_FILECOIN_PRIVATE_KEY;
  if (needsKey && !/^0x[0-9a-fA-F]{64}$/.test(privateKey ?? '')) fail('key_required','Configure a Calibration signing key');
  const rpc=env.QMESH_FILECOIN_RPC_URL ?? 'https://api.calibration.node.glif.io/rpc/v1';
  let url;
  try {url=new URL(rpc);} catch {fail('invalid_config','Invalid RPC URL');}
  if (url.protocol !== 'https:' || url.username || url.password) fail('invalid_config','RPC must use HTTPS without URL credentials');
  const keyAccount=/^0x[0-9a-fA-F]{64}$/.test(privateKey ?? '') ? privateKeyToAccount(privateKey) : null;
  if (needsKey && env.QMESH_FILECOIN_EXPECTED_ADDRESS &&
      keyAccount.address.toLowerCase() !== env.QMESH_FILECOIN_EXPECTED_ADDRESS.toLowerCase()) {
    fail('wrong_signer','Configured signer does not match the expected agent wallet');
  }
  if (needsKey && request.payer_address && keyAccount.address.toLowerCase() !== request.payer_address.toLowerCase()) {
    fail('wrong_signer','Requested payer does not match the configured signing key');
  }
  const account=needsKey ? keyAccount : (request.payer_address ?? keyAccount?.address ?? zeroAddress);
  return Synapse.create({account,chain:calibration,transport:http(rpc,{retryCount:0,timeout:30000}),
    source:'qmeshpy',withCDN:false,pieceBatching:false});
}

export function createJournal(path) {
  const descriptor=openSync(path,'ax',0o600);
  return {
    append(event) {
      const bytes=Buffer.from(JSON.stringify(event)+'\n');
      let offset=0;
      while(offset<bytes.length) offset+=writeSync(descriptor,bytes,offset,bytes.length-offset);
      fsyncSync(descriptor);
    },
    close:()=>closeSync(descriptor),
  };
}

async function confirmed(sdk, hash, recordHash) {
  recordHash(hash);
  const receipt=await sdk.readClient.waitForTransactionReceipt({hash,confirmations:1,timeout:120000});
  if (receipt.status !== 'success') fail('transaction_reverted','Calibration transaction reverted',{transaction_hash:hash});
  return {...NETWORK,transaction_hash:hash,block_number:receipt.blockNumber.toString()};
}

async function upload(request,sdk,hashes,startWrite,recordHash,setStage) {
  const contexts=await sdk.storage.createContexts({copies:request.copies,metadata:{application:'qmeshpy'}});
  const costs=await sdk.storage.calculateMultiContextCosts(contexts,{pieceSizes:[BigInt(request.bytes.length)],
    extraRunwayEpochs:BigInt(request.retention_days)*EPOCHS_DAY});
  if (costs.depositNeeded > 0n) fail('funding_required','Deposit test USDFC explicitly before upload',
    {deposit_needed_base_units:costs.depositNeeded.toString()});
  if (costs.rates.perMonth > request.monthly || costs.lockups.total > request.lockup) {
    fail('budget_exceeded','Quoted storage cost exceeds the requested budget');
  }
  const priceList=await sdk.readClient.readContract({
    address:calibration.contracts.fwssView.address,abi:calibration.contracts.fwssView.abi,
    functionName:'getPriceList'});
  const requiredLockup=priceList.lockups.defaultLockupPeriod;
  const approval=await sdk.payments.serviceApproval();
  if (!approval.isApproved || approval.rateAllowance > MAX_USDFC/EPOCHS_MONTH || approval.lockupAllowance > MAX_USDFC ||
      approval.rateAllowance > request.monthly/EPOCHS_MONTH || approval.lockupAllowance > request.lockup ||
      approval.rateUsage+costs.lockups.rateDeltaPerEpoch > approval.rateAllowance ||
      approval.lockupUsage+costs.lockups.total > approval.lockupAllowance ||
      approval.maxLockupPeriod > 30n*EPOCHS_DAY) {
    fail('approval_required','Configure a sufficient finite operator approval within the upload budget');
  }
  if (approval.maxLockupPeriod < requiredLockup) {
    fail('approval_required','Operator lockup period is shorter than the current storage contract requirement',
      {required_lockup_epochs:requiredLockup.toString()});
  }
  const copies=[];
  let pieceCid;
  for (const context of contexts) {
    // Explicit contexts avoid the high-level SDK's replacement-provider retries.
    setStage('store');
    startWrite();
    const stored=await context.store(request.bytes);
    if (stored.size !== request.bytes.length || (pieceCid && stored.pieceCid.toString() !== pieceCid)) {
      fail('integrity_error','Provider returned an inconsistent piece');
    }
    pieceCid=stored.pieceCid.toString();
    setStage('commit');
    const commit=await context.commit({pieces:[{pieceCid:stored.pieceCid}],onSubmitted:recordHash});
    const hash=commit.confirmedTxHash ?? commit.txHash;
    setStage('receipt');
    await confirmed(sdk,hash,recordHash);
    copies.push({provider_id:context.provider.id.toString(),provider_address:context.provider.serviceProvider,
      data_set_id:commit.dataSetId.toString(),piece_id:commit.pieceIds[0].toString(),transaction_hash:hash,
      retrieval_url:context.getPieceUrl(stored.pieceCid)});
  }
  return {...NETWORK,piece_cid:pieceCid,payer_address:sdk.client.account.address,
    sha256:sha256(request.bytes),size_bytes:request.bytes.length,complete:copies.length===request.copies,
    copies,transaction_hashes:[...new Set(hashes)]};
}

function retrievalUrl(serviceURL,pieceCid) {
  let url;
  try {url=new URL(Piece.createPieceUrlPDP({serviceURL,cid:pieceCid}));}
  catch {fail('unsafe_provider_url','Invalid registered provider URL');}
  const hostname=url.hostname.toLowerCase().replace(/\.$/,'');
  if (url.protocol!=='https:' || url.username || url.password || isIP(hostname) || hostname.includes(':') ||
      !hostname.includes('.') || /\.(localhost|local|internal|lan|home)$/.test(hostname)) {
    fail('unsafe_provider_url','Provider retrieval requires an HTTPS public DNS name without credentials');
  }
  return url;
}

async function downloadBytes(url,expectedSize) {
  // The SDK's convenience download buffers an unbounded response before checking its PieceCID.
  const response=await fetch(url,{redirect:'error',signal:AbortSignal.timeout(60000)});
  if (!response.ok || !response.body) {
    await response.body?.cancel();
    fail('retrieval_unavailable','Registered provider did not return the piece');
  }
  const length=response.headers.get('content-length');
  if (length!==null && (!/^[0-9]+$/.test(length) || BigInt(length)>BigInt(expectedSize))) {
    await response.body.cancel();
    fail('integrity_error','Provider response exceeds the expected piece size');
  }
  const reader=response.body.getReader();
  const chunks=[];
  let size=0;
  try {
    while (true) {
      const {done,value}=await reader.read();
      if (done) break;
      size+=value.length;
      if (size>expectedSize) {
        await reader.cancel();
        fail('integrity_error','Provider response exceeds the expected piece size');
      }
      chunks.push(value);
    }
  } finally {reader.releaseLock();}
  return Buffer.concat(chunks,size);
}

async function download(request,sdk) {
  const addresses=request.provider_address ? [request.provider_address] : [...new Set(
    (await sdk.storage.findDataSets({address:request.payer_address}))
      .filter(dataset=>dataset.isLive && dataset.isManaged && dataset.pdpEndEpoch===0n)
      .map(dataset=>dataset.serviceProvider))];
  for (const address of addresses) {
    const provider=await sdk.getProviderInfo(address);
    const url=retrievalUrl(provider.pdp.serviceURL,request.piece_cid);
    let bytes;
    try {bytes=await downloadBytes(url,request.size_bytes);}
    catch(error) {
      if (error.code==='integrity_error' || request.provider_address) throw error;
      continue;
    }
    if (bytes.length !== request.size_bytes || sha256(bytes) !== request.sha256 ||
        (await Piece.calculate(bytes)).toString() !== request.piece_cid) {
      fail('integrity_error','Retrieved bytes do not match the expected PieceCID, size and SHA256');
    }
    return {...NETWORK,data_base64:bytes.toString('base64'),sha256:request.sha256,size_bytes:bytes.length};
  }
  fail('retrieval_unavailable','No registered provider returned the requested piece');
}

async function status(request,sdk) {
  const block=await sdk.readClient.getBlockNumber({cacheTime:0});
  const copies=[];
  for (const copy of request.copies) {
    const dataSetId=id(copy.data_set_id);
    const [dataset,live,pieces,nextChallenge,removals]=await Promise.all([
      WarmStorage.getDataSet(sdk.readClient,{dataSetId}),PDP.dataSetLive(sdk.readClient,{dataSetId}),
      PDP.getActivePiecesByCursor(sdk.readClient,{dataSetId,cursor:id(copy.piece_id),limit:1n}),
      PDP.getNextChallengeEpoch(sdk.readClient,{dataSetId}),PDP.getScheduledRemovals(sdk.readClient,{dataSetId}),
    ]);
    const registered=dataset != null && dataset.providerId===id(copy.provider_id) &&
      pieces.items.some(piece=>piece.id===id(copy.piece_id) && piece.cid.toString()===request.piece_cid) &&
      !removals.includes(id(copy.piece_id));
    // A current period without a proof is pending, not a claim of a failed or missing historic proof.
    const proof=dataset == null ? null : await sdk.readClient.readContract({
      address:calibration.contracts.fwssView.address,abi:calibration.contracts.fwssView.abi,
      functionName:'provenThisPeriod',args:[dataSetId]});
    copies.push({...copy,registered,live,service_end_epoch:dataset?.pdpEndEpoch.toString() ?? null,
      next_challenge_epoch:nextChallenge?.toString() ?? null,
      proof_status:proof===true?'proven_this_period':proof===false?'pending_this_period':'unknown',
      payer_address:dataset?.payer ?? null});
  }
  return {...NETWORK,observed_block:block.toString(),observed_at:new Date().toISOString(),copies};
}

async function payments(request,sdk,startWrite,recordHash) {
  const service=sdk.payments;
  if (request.action==='balance') {
    const [fil,usdfc,account,approval]=await Promise.all([service.walletBalance({token:TOKENS.FIL}),
      service.walletBalance({token:TOKENS.USDFC}),service.accountSummary(),service.serviceApproval()]);
    return {...NETWORK,address:sdk.client.account.address,tfil_base_units:fil.toString(),
      usdfc_base_units:usdfc.toString(),account,approval};
  }
  if (request.action==='terminate') {
    startWrite();
    const result=await sdk.storage.terminateService({dataSetId:request.dataset,skipProvider:true,onSubmitted:recordHash});
    const hash=result.confirmedTxHash ?? result.txHash;
    if (hash) await confirmed(sdk,hash,recordHash);
    return {...NETWORK,data_set_id:request.data_set_id,end_epoch:result.endEpoch.toString(),transaction_hash:hash ?? null};
  }
  let hash;
  if (request.action==='deposit') {
    const account=await service.accountInfo();
    if (account.funds+request.amount > MAX_USDFC) fail('budget_exceeded','Total account funding may not exceed 10 test USDFC');
    if (await service.walletBalance({token:TOKENS.USDFC}) < request.amount) {
      fail('funding_required','Wallet has insufficient test USDFC for the requested deposit');
    }
    startWrite();
    hash=await service.deposit({amount:request.amount,onApprovalTransaction:recordHash});
  } else if (request.action==='approve') {
    startWrite();
    hash=await service.approveService({rateAllowance:request.monthly/EPOCHS_MONTH,lockupAllowance:request.lockup,
      maxLockupPeriod:BigInt(request.days)*EPOCHS_DAY});
  } else if (request.action==='withdraw') {
    const account=await service.accountInfo();
    if (account.availableFunds<request.amount) fail('funding_required','Insufficient unlocked test USDFC to withdraw');
    startWrite();
    hash=await service.withdraw({amount:request.amount});
  } else if (request.action==='revoke') {
    startWrite();
    hash=await service.revokeService();
  }
  return confirmed(sdk,hash,recordHash);
}

export async function execute(request,sdk,recordEvent=()=>{}) {
  const hashes=[];
  let started=false;
  let stage='preflight';
  const setStage=value=>{stage=value;};
  const startWrite=()=>{
    recordEvent({type:'write_started'});
    started=true;
  };
  const recordHash=hash=>{
    if (!/^0x[0-9a-fA-F]{64}$/.test(hash)) fail('invalid_receipt','Invalid transaction hash returned by Filecoin service');
    hashes.push(hash);
    recordEvent({type:'transaction_submitted',transaction_hash:hash});
  };
  try {
    if (await sdk.readClient.getChainId() !== 314159) fail('wrong_network','RPC is not Filecoin Calibration');
    if (request.command==='download') return await download(request,sdk);
    if (request.command==='status') return await status(request,sdk);
    if (request.command==='upload') return await upload(request,sdk,hashes,startWrite,recordHash,setStage);
    setStage('payment');
    return await payments(request,sdk,startWrite,recordHash);
  } catch(error) {
    error.transaction_hashes=[...new Set(hashes)];
    error.uncertain=started || hashes.length>0;
    error.operation_stage=stage;
    throw error;
  }
}

export function safeError(error) {
  const errorTypes=[];
  const httpStatuses=[];
  const seen=new Set();
  for (let cause=error;cause instanceof Error && !seen.has(cause) && seen.size<5;cause=cause.cause) {
    seen.add(cause);
    // Class names are local diagnostics; do not serialize messages, details or request/response bodies.
    const name=cause.constructor?.name;
    if (typeof name==='string' && /^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(name)) errorTypes.push(name);
    for (const status of [cause.status,cause.statusCode,cause.response?.status]) {
      if (Number.isInteger(status) && status>=100 && status<=599) httpStatuses.push(status);
    }
  }
  return {error:{code:error.safe?error.code:'operation_failed',
    message:error.safe?error.message:'Filecoin operation failed; inspect recorded transaction hashes before retrying a write',
    uncertain:error.uncertain ?? false,transaction_hashes:error.transaction_hashes ?? [],
    ...(['preflight','store','commit','receipt','payment'].includes(error.operation_stage)?{operation_stage:error.operation_stage}:{}),
    error_types:errorTypes,http_statuses:[...new Set(httpStatuses)],...(error.safe?error.details:{})}};
}
const json=value=>JSON.stringify(value,(_,item)=>typeof item==='bigint'?item.toString():item);

if (process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  // Keep SDK diagnostics (which can include signed payloads) out of the wire protocol and logs.
  console.log=console.warn=console.error=()=>{};
  let journal;
  try {
    let input='';
    for await (const chunk of process.stdin) {
      input+=chunk;
      if (input.length>Math.ceil(MAX_BYTES/3)*4+16384) fail('invalid_request','Request exceeds maximum size');
    }
    const request=parseRequest(JSON.parse(input));
    if (process.env.QMESH_FILECOIN_JOURNAL_PATH) journal=createJournal(process.env.QMESH_FILECOIN_JOURNAL_PATH);
    process.stdout.write(json(await execute(request,makeSynapse(request),journal?.append))+'\n');
  } catch(error) {
    process.stdout.write(json(safeError(error))+'\n');
    process.exitCode=1;
  } finally {journal?.close();}
}
