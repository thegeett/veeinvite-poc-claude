import { NextResponse } from "next/server";
import { listDnaVersions, saveDnaVersion } from "@/lib/design-dna/dnaStore";
import type {
  DesignDNAVersionSource,
  SiteDesignDNA,
} from "@/lib/design-dna/types";
import { validateSiteDesignDNA } from "@/lib/design-dna/validateSiteDesignDNA";
import { validateProvider } from "@/lib/validateIntake";

export const runtime = "nodejs";

// 256KB cap on the serialized DNA payload. Real DNA serializes to ~10–50KB;
// this leaves plenty of headroom while preventing a runaway model output (or
// a hand-crafted POST) from filling disk.
const MAX_DNA_PAYLOAD_BYTES = 256 * 1024;

const VALID_SOURCES: DesignDNAVersionSource[] = [
  "initial_generation",
  "manual_refresh",
  "global_design_edit",
  "intake_change",
];

function isValidSource(value: unknown): value is DesignDNAVersionSource {
  return (
    typeof value === "string" &&
    (VALID_SOURCES as string[]).includes(value)
  );
}

export async function GET() {
  try {
    const versions = await listDnaVersions();
    return NextResponse.json({ success: true, versions });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { success: false, message: `Failed to list DNA versions: ${message}` },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { success: false, message: "Request body must be valid JSON." },
      { status: 400 },
    );
  }

  const { label, designDNA, source, provider, model } = (body || {}) as {
    label?: unknown;
    designDNA?: unknown;
    source?: unknown;
    provider?: unknown;
    model?: unknown;
  };

  if (typeof label !== "string" || label.trim().length === 0) {
    return NextResponse.json(
      { success: false, message: "label must be a non-empty string." },
      { status: 400 },
    );
  }

  if (!isValidSource(source)) {
    return NextResponse.json(
      {
        success: false,
        message: `source must be one of: ${VALID_SOURCES.join(", ")}.`,
      },
      { status: 400 },
    );
  }

  const dnaCheck = validateSiteDesignDNA(designDNA);
  if (!dnaCheck.ok) {
    return NextResponse.json(
      {
        success: false,
        message: `designDNA does not match the expected shape: ${dnaCheck.errors.join(" ")}`,
      },
      { status: 400 },
    );
  }

  // Cheap upper bound on payload size before disk write.
  const serialized = JSON.stringify(designDNA);
  if (serialized.length > MAX_DNA_PAYLOAD_BYTES) {
    return NextResponse.json(
      {
        success: false,
        message: `designDNA exceeds the ${MAX_DNA_PAYLOAD_BYTES}-byte cap.`,
      },
      { status: 413 },
    );
  }

  // Provider is optional metadata, but if supplied must be valid.
  if (provider !== undefined && !validateProvider(provider)) {
    return NextResponse.json(
      { success: false, message: 'provider, if provided, must be "openai" or "anthropic".' },
      { status: 400 },
    );
  }

  try {
    const version = await saveDnaVersion({
      label: label.trim(),
      designDNA: designDNA as SiteDesignDNA,
      source,
      provider: provider as "openai" | "anthropic" | undefined,
      model: typeof model === "string" ? model : undefined,
    });
    return NextResponse.json({ success: true, version });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { success: false, message: `Failed to save DNA version: ${message}` },
      { status: 500 },
    );
  }
}
