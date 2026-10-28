"use client";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SPREADSHEETS } from "@/constants/spreadsheets";
import { useWorkbook } from "../hooks/use-workbook";

export function Workbooks({ id }: { id?: string }) {
  const w = useWorkbook(id);
  const book = w.detail.data;
  return (
    <main className="flex h-full min-h-screen flex-col gap-4 p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link
            href={SPREADSHEETS.PATH}
            className="text-sm text-muted-foreground"
          >
            {SPREADSHEETS.TITLE}
          </Link>
          <h1 className="text-2xl font-semibold">
            {book?.title || "Experiment workbooks"}
          </h1>
        </div>
        {id ? (
          <Button
            variant="outline"
            onClick={() => navigator.clipboard.writeText(window.location.href)}
          >
            Copy workbook link
          </Button>
        ) : null}
      </header>
      {w.action.error || w.detail.error || w.list.error ? (
        <p role="alert" className="text-destructive">
          {(w.action.error || w.detail.error || w.list.error)?.message}
        </p>
      ) : null}
      {w.action.isPending ? <p role="status">Working…</p> : null}
      {!id || (book && book.role !== "viewer") ? (
        <section className="flex flex-wrap items-end gap-3 rounded-lg border p-4">
          <label>
            Experiment type
            <select
              className="block rounded border bg-background p-2"
              value={w.kind}
              onChange={(e) => w.setKind(e.target.value)}
            >
              <option value="pharma">Pharma</option>
              <option value="finance">Finance</option>
              <option value="circuit">Circuit</option>
            </select>
          </label>
          <label>
            Completed run ID
            <Input
              value={w.runId}
              onChange={(e) => w.setRunId(e.target.value)}
            />
          </label>
          {id ? (
            <label className="max-w-xs text-sm">
              <input
                type="checkbox"
                checked={w.consent}
                onChange={(e) => w.setConsent(e.target.checked)}
              />{" "}
              Share this experiment’s data with every workbook member
            </label>
          ) : null}
          <Button
            disabled={w.action.isPending || !w.runId || (!!id && !w.consent)}
            onClick={() => w.action.mutate(id ? "add" : "create")}
          >
            {id ? "Add experiment results" : "Open in spreadsheet"}
          </Button>
        </section>
      ) : null}
      {!id ? (
        <section className="grid gap-3">
          <h2 className="font-semibold">My workbooks and shared with me</h2>
          {w.list.data?.length === 0 ? <p>No workbooks yet.</p> : null}
          {w.list.data?.map((item) => (
            <article
              key={item._id}
              className="flex items-center justify-between rounded-lg border p-4"
            >
              <Link href={`${SPREADSHEETS.PATH}/${item._id}`}>
                {item.title} · {item.state}
              </Link>
              <Button
                variant="outline"
                onClick={() => w.action.mutate(`join:${item._id}`)}
              >
                Accept invitation
              </Button>
            </article>
          ))}
        </section>
      ) : null}
      {book ? (
        <>
          <p className="text-sm text-muted-foreground">
            {book.role} · Source sheets are read-only. Use Comparison and notes
            for formulas and discussion. Pharma candidates are computational
            results, not validated drugs.
          </p>
          <nav className="flex flex-wrap gap-2" aria-label="Workbook sheets">
            {book.sheets.map((sheet) => (
              <Button
                key={sheet.room}
                variant={
                  w.selected?.room === sheet.room ? "default" : "outline"
                }
                onClick={() => w.setRoom(sheet.room)}
              >
                {sheet.name}
                {sheet.source ? " · source" : ""}
              </Button>
            ))}
          </nav>
          {book.state === "ready" && w.selected ? (
            <iframe
              title={w.selected.name}
              src={`${SPREADSHEETS.ENGINE}/${w.selected.room}`}
              className="min-h-[650px] w-full flex-1 rounded-lg border bg-white"
            />
          ) : (
            <p role="status">
              Workbook {book.state}. {book.error}
            </p>
          )}
          <details className="rounded-lg border p-4">
            <summary>Share and source data</summary>
            <p className="my-2 text-sm">
              Invite by account email, then share the stable workbook link. The
              recipient accepts the invitation in Spreadsheets.
            </p>
            {book.role === "owner" ? (
              <div className="flex flex-wrap gap-2">
                <Input
                  aria-label="Invite email"
                  type="email"
                  value={w.email}
                  onChange={(e) => w.setEmail(e.target.value)}
                />
                <select
                  aria-label="Access role"
                  className="rounded border bg-background p-2"
                  value={w.role}
                  onChange={(e) => w.setRole(e.target.value)}
                >
                  <option value="viewer">Viewer</option>
                  <option value="editor">Editor</option>
                </select>
                <Button
                  disabled={w.action.isPending}
                  onClick={() => w.action.mutate("invite")}
                >
                  Invite
                </Button>
              </div>
            ) : null}
            <a
              className="mt-3 block underline"
              href={`${SPREADSHEETS.API}/${id}/source`}
              target="_blank"
              rel="noreferrer"
            >
              Exact original run JSON
            </a>
          </details>
          <details className="rounded-lg border p-4">
            <summary>Saved versions · IPFS</summary>
            <p className="my-2 text-sm">
              IPFS publication makes every sheet and source result publicly
              retrievable. Restore always creates a new private workbook.
            </p>
            {book.role === "owner" ? (
              <div className="flex flex-wrap gap-3">
                <label>
                  <input
                    type="checkbox"
                    checked={w.publicConsent}
                    onChange={(e) => w.setPublicConsent(e.target.checked)}
                  />{" "}
                  I approve public publication of this workbook’s data
                </label>
                <Button
                  disabled={!w.publicConsent || w.action.isPending}
                  onClick={() => w.action.mutate("save")}
                >
                  Save version to IPFS
                </Button>
              </div>
            ) : null}
            {w.versions.data?.map((version) => (
              <div
                key={version._id}
                className="my-2 flex flex-wrap items-center gap-3"
              >
                <span>{version.state}</span>
                <code className="break-all text-xs">{version.cid}</code>
                {version.cid ? (
                  <Button
                    variant="outline"
                    disabled={w.action.isPending}
                    onClick={() => w.action.mutate(`restore:${version.cid}`)}
                  >
                    Restore as new workbook
                  </Button>
                ) : null}
              </div>
            ))}
          </details>
          <details className="rounded-lg border p-4">
            <summary>Prepare range for agent</summary>
            <p className="my-2 text-sm">
              Choose up to 200 cells. Review and copy this context into your
              existing agent conversation; no message or paid job is submitted
              automatically.
            </p>
            <div className="flex gap-3">
              <Input
                aria-label="Cell range"
                value={w.range}
                onChange={(e) => w.setRange(e.target.value)}
              />
              <Button
                disabled={w.action.isPending}
                onClick={() => w.action.mutate("context")}
              >
                Read range
              </Button>
            </div>
            {w.context ? (
              <>
                <textarea
                  aria-label="Agent context"
                  readOnly
                  value={w.context}
                  rows={8}
                  className="mt-3 w-full rounded border p-3"
                />
                <Button
                  variant="outline"
                  onClick={() => navigator.clipboard.writeText(w.context)}
                >
                  Copy context
                </Button>
              </>
            ) : null}
          </details>
        </>
      ) : null}
    </main>
  );
}
