import { redirect } from "next/navigation";
import { ROUTES } from "@/constants";

export default function PharmaJobsPage() {
  redirect(ROUTES.PHARMA_HISTORY);
}
