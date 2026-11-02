import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import getClient, { getDatabase } from "../src/shared/lib/mongodb.ts";
import {
  claimPayment,
  replayPayment,
  finishPayment,
  saveReceipt,
} from "../src/features/x402/server/payment-store.ts";

(process.env.X402_TEST_MONGO_URI ? test : test.skip)(
  "mongo payment claims are atomic and retain replay receipts",
  async () => {
    process.env.MONGODB_URI = process.env.X402_TEST_MONGO_URI;
    process.env.MONGODB_DB_NAME = `qmesh_x402_test_${randomUUID().replaceAll("-", "")}`;
    const database = await getDatabase();
    try {
      const claims = await Promise.all(
        Array.from({ length: 12 }, () =>
          claimPayment("payment", "body", "proof"),
        ),
      );
      assert.equal(claims.filter(Boolean).length, 1);
      assert.equal(
        (await replayPayment("payment", "body", "proof"))?.status,
        409,
      );
      await saveReceipt("payment", {
        success: true,
        network: "eip155:84532",
        transaction: "tx",
      });
      await finishPayment(
        "payment",
        Response.json(
          { job_id: "job-paid" },
          { status: 201, headers: { "PAYMENT-RESPONSE": "receipt" } },
        ),
      );
      const replay = await replayPayment("payment", "body", "proof");
      assert.equal(replay?.status, 201);
      assert.equal(replay?.headers.get("PAYMENT-RESPONSE"), "receipt");
      assert.deepEqual(await replay?.json(), { job_id: "job-paid" });
      await assert.rejects(finishPayment("payment", new Response(null, { status: 503 }), true));
      await assert.rejects(saveReceipt("payment", {
        success: false,
        network: "eip155:84532",
        transaction: "replacement",
      }));
      assert.equal((await replayPayment("payment", "body", "proof"))?.status, 201);
      assert.equal(
        (await replayPayment("payment", "other-body", "proof"))?.status,
        409,
      );
      assert.equal(
        (await replayPayment("payment", "body", "other-proof"))?.status,
        409,
      );
      assert.equal(
        (
          await database
            .collection<{
              _id: string;
              receipt: { transaction: string };
            }>("x402_gateway_payments")
            .findOne({ _id: "payment" })
        )?.receipt.transaction,
        "tx",
      );
      assert.equal(await claimPayment("uncertain", "body", "proof"), true);
      await finishPayment("uncertain", new Response(null, { status: 503 }), true);
      assert.equal(await claimPayment("uncertain", "body", "proof"), false);
      assert.equal((await replayPayment("uncertain", "body", "proof"))?.status, 503);
    } finally {
      try {
        await database.dropDatabase();
      } finally {
        await (await getClient()).close();
      }
    }
  },
);
