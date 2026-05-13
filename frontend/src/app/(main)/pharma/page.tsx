import { redirect } from "next/navigation";
import { ROUTES } from "@/constants";

export default function PharmaRootPage() {
  redirect(ROUTES.PHARMA_HISTORY);
}
