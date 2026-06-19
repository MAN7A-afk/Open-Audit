import type { Metadata } from "next";
import { SandboxClient } from "@/components/developer/SandboxClient";

export const metadata: Metadata = {
  title: "Translation Sandbox",
  description:
    "Preview how a proposed Translation Registry template renders a raw Soroban event into a plain English sentence — before you open a pull request.",
};

/**
 * Standalone developer sandbox for the Translation Registry.
 *
 * Contract developers preparing a registry PR can paste a raw event
 * (topics + data) alongside their proposed JSON translation template and
 * see the mock plain-English rendering instantly, without running the
 * full dashboard or deploying anything.
 */
export default function SandboxPage(): React.JSX.Element {
  return (
    <main className="container mx-auto px-4 py-8 max-w-5xl">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">Translation Sandbox</h1>
        <p className="text-muted-foreground mt-1">
          Paste a raw event and your proposed JSON template to preview the plain English output
          before opening a Translation Registry pull request.
        </p>
      </div>

      <SandboxClient />
    </main>
  );
}
