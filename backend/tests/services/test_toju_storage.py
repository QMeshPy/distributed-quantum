import asyncio,os,uuid
from urllib.parse import urlsplit
from unittest.mock import AsyncMock, MagicMock
import pytest
from motor.motor_asyncio import AsyncIOMotorClient
from services.toju_storage import TojuStorage


def test_owned_proposal_approval_is_immutable_and_exactly_once(monkeypatch):
 uri=os.getenv('QB2_MONGODB_TEST_URI')
 if not uri:
  pytest.skip('Set QB2_MONGODB_TEST_URI to opt into disposable local MongoDB tests')
 parsed=urlsplit(uri)
 if parsed.scheme!='mongodb' or parsed.hostname not in {'localhost','127.0.0.1','::1'} or ',' in parsed.netloc:
  pytest.fail('Toju integration tests accept only local MongoDB')
 async def run():
  client=AsyncIOMotorClient(uri,serverSelectionTimeoutMS=2000)
  db=client['test_toju_'+uuid.uuid4().hex]
  try:
   await db.ai_agents.insert_one({'agent_id':'agent','owner_id':'owner','wallet_address':'0x'+'2'*40})
   await db.chat_sessions.insert_one({'session_id':'session','user_id':'owner','agent_id':'agent'})
   storage=TojuStorage(db)
   storage.quote=AsyncMock(return_value={'amount':'1','usdc':'0.000001','payTo':'0x'+'1'*40})
   storage.upload=AsyncMock(return_value={'verified':True,'cid':'bafytest','transaction':'0x'+'a'*64})
   p=await storage.prepare('owner','agent','session','A report','report',message_index=1)
   assert p['message_index']==1
   assert p['status']=='pending';storage.upload.assert_not_called()
   with pytest.raises(ValueError):await storage.decide('other','agent','session',p['id'],'approve',p['sha256'])
   with pytest.raises(ValueError):await storage.decide('owner','agent','session',p['id'],'approve','wrong')
   results=await asyncio.gather(*[storage.decide('owner','agent','session',p['id'],'approve',p['sha256']) for _ in range(2)])
   assert storage.upload.await_count==1
   assert any(r['status']=='stored' for r in results)
   await db.workflow_runs.insert_one({'_id':'owned-run','owner_user_id':'owner','status':'completed','output_snapshot':{'result':42},'private_token':'do-not-export'})
   run_export=await storage.prepare('owner','agent','session','model must not replace actual results','Run',run_id='owned-run')
   assert '42' in run_export['content'] and 'private_token' not in run_export['content']
   assert run_export['filename']=='run.json'
   await db.workflow_runs.insert_one({'_id':'other-run','owner_user_id':'other'})
   with pytest.raises(ValueError):await storage.prepare('owner','agent','session','','Run',run_id='other-run')
   p2=await storage.prepare('owner','agent','session','Another report','report')
   await storage.decide('owner','agent','session',p2['id'],'cancel',p2['sha256'])
   await storage.decide('owner','agent','session',p2['id'],'approve',p2['sha256'])
   assert storage.upload.await_count==1
   with pytest.raises(ValueError):await storage.prepare('other','agent','session','Private','report')
  finally:
   try:
    await client.drop_database(db.name)
   finally:
    client.close()
 asyncio.run(run())


def test_cdp_domain_type_is_explicit_without_changing_approved_message():
    from services.toju_storage import cdp_typed_data
    data = {"domain": {"chainId": 84532}, "types": {"TransferWithAuthorization": []}, "message": {"value": "1"}}
    normalized = cdp_typed_data(data)
    assert normalized["message"] is data["message"]
    assert normalized["types"]["EIP712Domain"][2] == {"name": "chainId", "type": "uint256"}
    assert "EIP712Domain" not in data["types"]


def test_unsettled_receipt_does_not_sign_or_report_hash_mismatch(monkeypatch):
    db = MagicMock()
    db.toju_exports.find_one = AsyncMock(return_value={"status": "uncertain", "sha256": "hash"})
    storage = TojuStorage(db)
    storage.owned_session = AsyncMock()
    storage.upload = AsyncMock()
    client = MagicMock()
    client.__aenter__ = AsyncMock(return_value=client)
    client.__aexit__ = AsyncMock(return_value=None)
    response = MagicMock(status_code=200)
    response.json.return_value = {"status": "uncertain", "transaction": None}
    client.get = AsyncMock(return_value=response)
    monkeypatch.setattr('services.toju_storage.httpx.AsyncClient', lambda **kwargs: client)
    with pytest.raises(ValueError, match="has not recorded a settled payment"):
        asyncio.run(storage.decide('owner','agent','session','export','reconcile','hash'))
    storage.upload.assert_not_called()
