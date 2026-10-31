import { Suspense } from "react";
import { Workbooks } from "@/features/spreadsheets";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <Suspense>
      <Workbooks id={(await params).id} />
    </Suspense>
  );
}
