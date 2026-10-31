import { Suspense } from "react";
import { Workbooks } from "@/features/spreadsheets";
export default function Page() {
  return (
    <Suspense>
      <Workbooks />
    </Suspense>
  );
}
