import { promises as fs } from "fs";
import path from "path";
import type { AIProvider } from "../ai/types";
import { buildGlobalDesignTokenCss } from "./buildGlobalDesignTokenCss";
import type { DesignDNAVersion, DesignDNAVersionSource, SiteDesignDNA } from "./types";

const DNA_DIR = path.join(process.cwd(), "all_generated_design_dna");

export interface StoredDnaVersion extends DesignDNAVersion {
  // Audit trail — which provider/model produced this DNA. Optional because
  // older entries (or hand-edits) may not have it.
  provider?: AIProvider;
  model?: string;
}

async function ensureDir(): Promise<void> {
  await fs.mkdir(DNA_DIR, { recursive: true });
}

function parseSeq(name: string): number | null {
  const match = name.match(/^v(\d+)$/);
  return match ? Number.parseInt(match[1], 10) : null;
}

export async function listDnaVersions(): Promise<StoredDnaVersion[]> {
  await ensureDir();
  const entries = await fs.readdir(DNA_DIR, { withFileTypes: true });
  const ordered = entries
    .filter((e) => e.isDirectory())
    .map((e) => ({ name: e.name, seq: parseSeq(e.name) }))
    .filter((e): e is { name: string; seq: number } => e.seq !== null)
    .sort((a, b) => a.seq - b.seq);

  const versions: StoredDnaVersion[] = [];
  for (const { name } of ordered) {
    try {
      const raw = await fs.readFile(
        path.join(DNA_DIR, name, "metadata.json"),
        "utf8",
      );
      versions.push(JSON.parse(raw) as StoredDnaVersion);
    } catch {
      // Skip directories without a readable metadata.json.
    }
  }
  return versions;
}

// Atomically claim the next vN/ directory. `mkdir({ recursive: false })` will
// fail with EEXIST if another caller (e.g. a second tab, an in-flight auto-
// extract racing a manual refresh) already created the same dir. We bump and
// retry until we win the race. Bounded retries so a corrupted directory tree
// doesn't loop forever.
async function claimNextVersionDir(
  baseDir: string,
  startingSeq: number,
): Promise<{ seq: number; dir: string }> {
  let seq = startingSeq;
  for (let attempt = 0; attempt < 16; attempt++) {
    const dir = path.join(baseDir, `v${seq}`);
    try {
      await fs.mkdir(dir, { recursive: false });
      return { seq, dir };
    } catch (err: unknown) {
      const code = (err as NodeJS.ErrnoException)?.code;
      if (code === "EEXIST") {
        seq += 1;
        continue;
      }
      throw err;
    }
  }
  throw new Error(
    `Could not claim a free version directory under ${baseDir} after 16 attempts.`,
  );
}

export async function saveDnaVersion(input: {
  label: string;
  designDNA: SiteDesignDNA;
  source: DesignDNAVersionSource;
  provider?: AIProvider;
  model?: string;
}): Promise<StoredDnaVersion> {
  await ensureDir();
  const entries = await fs.readdir(DNA_DIR, { withFileTypes: true });
  const maxSeq = entries
    .filter((e) => e.isDirectory())
    .reduce((max, e) => {
      const seq = parseSeq(e.name);
      return seq !== null && seq > max ? seq : max;
    }, 0);
  const { seq, dir: versionDir } = await claimNextVersionDir(DNA_DIR, maxSeq + 1);

  const stored: StoredDnaVersion = {
    id: `dna_v${seq}`,
    label: input.label,
    createdAt: new Date().toISOString(),
    designDNA: input.designDNA,
    source: input.source,
    provider: input.provider,
    model: input.model,
  };

  await Promise.all([
    fs.writeFile(
      path.join(versionDir, "metadata.json"),
      JSON.stringify(stored, null, 2),
      "utf8",
    ),
    fs.writeFile(
      path.join(versionDir, "design_dna.json"),
      JSON.stringify(input.designDNA, null, 2),
      "utf8",
    ),
    fs.writeFile(
      path.join(versionDir, "tokens.css"),
      buildGlobalDesignTokenCss(input.designDNA),
      "utf8",
    ),
  ]);

  return stored;
}
