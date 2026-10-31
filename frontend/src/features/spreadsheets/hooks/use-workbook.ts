"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { SPREADSHEETS } from "@/constants/spreadsheets";
import type { Workbook } from "../types";
export async function request(path: string, body?: unknown) {
  const response = await fetch(
    `${SPREADSHEETS.API}${path}`,
    body === undefined
      ? undefined
      : {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
  );
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Request failed");
  return data;
}
export function useWorkbook(id?: string) {
  const router = useRouter();
  const params = useSearchParams();
  const client = useQueryClient();
  const [room, setRoom] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("viewer");
  const [kind, setKind] = useState(params.get("kind") || "pharma");
  const [runId, setRunId] = useState(params.get("run") || "");
  const [consent, setConsent] = useState(false);
  const [publicConsent, setPublicConsent] = useState(false);
  const [range, setRange] = useState("A1:B10");
  const [context, setContext] = useState("");
  const list = useQuery<Workbook[]>({
    queryKey: [...SPREADSHEETS.KEY, "list"],
    queryFn: () => request(""),
    enabled: !id,
  });
  const detail = useQuery<Workbook & { role: string }>({
    queryKey: [...SPREADSHEETS.KEY, id],
    queryFn: () => request(`/${id}`),
    enabled: !!id,
    refetchInterval: 5000,
  });
  const versions = useQuery<{ _id: string; state: string; cid?: string }[]>({
    queryKey: [...SPREADSHEETS.KEY, id, "versions"],
    queryFn: () => request(`/${id}/versions`),
    enabled: !!id,
    refetchInterval: 5000,
  });
  const selected =
    detail.data?.sheets.find((s) => s.room === room) || detail.data?.sheets[0];
  const action = useMutation({
    mutationFn: async (type: string) => {
      if (type === "create") {
        const result = await request("", { kind, runId });
        router.push(`${SPREADSHEETS.PATH}/${result.id}`);
      } else if (type === "invite")
        await request(`/${id}/invite`, { email, role });
      else if (type === "add")
        await request(`/${id}/runs`, { kind, runId, consent });
      else if (type === "save")
        await request(`/${id}/snapshot`, { publicConsent });
      else if (type === "context") {
        const result = await request(`/${id}/context`, {
          room: selected?.room,
          range,
        });
        setContext(result.context);
      } else if (type.startsWith("join:")) {
        const target = type.slice(5);
        await request(`/${target}/join`, {});
        router.push(`${SPREADSHEETS.PATH}/${target}`);
      } else if (type.startsWith("restore:")) {
        const result = await request(`/${id}/restore`, { cid: type.slice(8) });
        router.push(`${SPREADSHEETS.PATH}/${result.id}`);
      }
    },
    onSuccess: () => client.invalidateQueries({ queryKey: SPREADSHEETS.KEY }),
  });
  return {
    id,
    list,
    detail,
    versions,
    selected,
    room,
    setRoom,
    email,
    setEmail,
    role,
    setRole,
    kind,
    setKind,
    runId,
    setRunId,
    consent,
    setConsent,
    publicConsent,
    setPublicConsent,
    range,
    setRange,
    context,
    action,
  };
}
