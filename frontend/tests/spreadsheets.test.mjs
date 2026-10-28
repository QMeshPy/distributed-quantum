import { describe, expect, test } from "bun:test";
import {
  mapRun,
  nativeSheet,
  workbookKey,
} from "../src/shared/spreadsheets/model";

describe("scientific workbook import", () => {
  test("literal text cannot become a formula or native save directive", () => {
    const save = nativeSheet([
      ['=IMPORT("private")', "a:b\\c\ncell:A1:v:99", 1.25],
    ]);
    expect(save).toContain('cell:A1:t:=IMPORT("private")');
    expect(save).toContain("cell:C1:v:1.25");
    expect(save).not.toContain("\ncell:A1:v:99");
  });
  test("pharma preserves confidence, units, ADMET and descriptors", () => {
    const run = {
      job_id: "p1",
      status: "completed",
      target_pdb_id: "6LU7",
      result: {
        candidates: [
          {
            smiles: "CCO",
            vqc_score: {
              binding_affinity_kcal: -4,
              confidence_interval: [-5, -3],
            },
            admet: { molecular_weight: 46 },
            descriptors: [{ homo_energy_ev: -2 }],
          },
        ],
      },
    };
    const sheets = mapRun("pharma", run);
    const all = sheets.map((s) => s.save).join("\n");
    expect(all).toContain("CCO");
    expect(all).toContain("binding_affinity_kcal");
    expect(all).toContain("confidence_interval");
    expect(all).toContain("homo_energy_ev");
    expect(all).toContain("6LU7");
    expect(sheets.every((s) => s.source)).toBe(true);
  });
  test("circuit bitstrings stay text and probabilities are numeric", () => {
    const all = mapRun("circuit", {
      job_id: "c1",
      status: "COMPLETED",
      result: { quantum_result: { counts: { "00": 3, 11: 1 } } },
    })
      .map((s) => s.save)
      .join("\n");
    expect(all).toContain(":t:00");
    expect(all).toContain(":v:0.75");
  });
  test("finance retains context and literal units without changing original JSON", () => {
    const run = {
      job_id: "f1",
      status: "COMPLETED",
      result: {
        holdings: [{ ticker: "ETH", amount: 2, unit: "ETH" }],
        benchmark: { sharpe: 1.2 },
      },
    };
    const before = JSON.stringify(run);
    const all = mapRun("finance", run)
      .map((s) => s.save)
      .join("\n");
    expect(all).toContain("ETH");
    expect(all).toContain("sharpe");
    expect(JSON.stringify(run)).toBe(before);
  });
  test("unfinished runs fail; identities distinguish owner/run/version", () => {
    expect(() => mapRun("pharma", { status: "running" })).toThrow();
    expect(workbookKey("u", "pharma", "p1", "abc")).toBe(
      workbookKey("u", "pharma", "p1", "abc"),
    );
    expect(workbookKey("u", "pharma", "p1", "abc")).not.toBe(
      workbookKey("v", "pharma", "p1", "abc"),
    );
    expect(workbookKey("u", "pharma", "p1", "abc")).not.toBe(
      workbookKey("u", "pharma", "p1", "def"),
    );
  });
});
