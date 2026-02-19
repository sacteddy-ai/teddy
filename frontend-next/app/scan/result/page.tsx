import { redirect } from "next/navigation";

export default function ScanResultAliasPage() {
  redirect("/capture?mode=photo");
}
