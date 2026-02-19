import { redirect } from "next/navigation";

export default function ChatConfirmAliasPage() {
  redirect("/capture?mode=talk");
}
