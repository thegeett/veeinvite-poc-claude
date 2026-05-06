import { NextResponse } from "next/server";
import { listDnaVersions, saveDnaVersion } from "@/lib/design-dna/dnaStore";
import type {
  DesignDNAVersionSource,
  SiteDesignDNA,
} from "@/lib/design-dna/types";
import { validateProvider } from "@/lib/validateIntake";

export const runtime = "nodejs";

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

// Light shape check — DNA payloads come from our own AI pipeline, but a
// malformed POST shouldn't crash the route or write garbage to disk.
function looksLikeDesignDNA(value: unknown): value is SiteDesignDNA {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.concept === "string" &&
    typeof v.tone === "string" &&
    typeof v.community === "string" &&
    typeof v.styleDirection === "string" &&
    !!v.palette &&
    typeof v.palette === "object" &&
    !!v.fonts &&
    typeof v.fonts === "object" &&
    Array.isArray(v.visualMotifs) &&
    Array.isArray(v.sectionRules) &&
    !!v.cssVariables &&
    typeof v.cssVariables === "object"
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

  if (!looksLikeDesignDNA(designDNA)) {
    return NextResponse.json(
      { success: false, message: "designDNA does not match the expected shape." },
      { status: 400 },
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
      designDNA,
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
