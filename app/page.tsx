import { CommandCenter } from "@/features/command-center/command-center";

export const metadata = {
  title: "Command Center",
};

export const dynamic = "force-dynamic";

export default function Page() {
  return <CommandCenter />;
}
