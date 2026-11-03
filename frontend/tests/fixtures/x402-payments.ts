import {
  address,
  blockhash,
  compileTransaction,
  createTransactionMessage,
  getBase64EncodedWireTransaction,
  setTransactionMessageFeePayer,
  setTransactionMessageLifetimeUsingBlockhash,
} from "@solana/kit";
import { encodeMsgpack } from "@algorandfoundation/algokit-utils/common";

// These wire-format fixtures exercise decoding; they are not valid signed payments.
export function simulatedTransactionPayments() {
  const message = setTransactionMessageLifetimeUsingBlockhash(
    {
      blockhash: blockhash("11111111111111111111111111111111"),
      lastValidBlockHeight: BigInt(100),
    },
    setTransactionMessageFeePayer(
      address("CKPKJWNdJEqa81x7CkZ14BVPiY6y16Sxs7owznqtWYp5"),
      createTransactionMessage({ version: 0 }),
    ),
  );
  return {
    solana: { transaction: getBase64EncodedWireTransaction(compileTransaction(message)) },
    algorand: {
      paymentGroup: [Buffer.from(encodeMsgpack({
        txn: {
          type: "axfer",
          snd: new Uint8Array(32).fill(1),
          arcv: new Uint8Array(32).fill(2),
          xaid: 10458941,
          aamt: 25000,
          fv: 1,
          lv: 100,
          gh: Buffer.from("SGO1GKSzyE7IEPItTxCByw9x8FmnrCDexi9/cOUJOiI=", "base64"),
        },
        sig: new Uint8Array(64).fill(1),
      })).toString("base64")],
      paymentIndex: 0,
    },
  };
}
