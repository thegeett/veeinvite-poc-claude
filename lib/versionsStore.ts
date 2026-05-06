import { promises as fs } from "fs";
import path from "path";
import type { AIProvider, HeroResult } from "./ai/types";

const VERSIONS_DIR = path.join(process.cwd(), "all_generated_version");
const PROVIDERS: readonly AIProvider[] = ["openai", "anthropic"];

export interface StoredVersion {
  id: string;
  label: string;
  hero: HeroResult;
  provider: AIProvider;
  createdAt: string;
}

function providerDir(provider: AIProvider): string {
  return path.join(VERSIONS_DIR, provider);
}

async function ensureDir(provider: AIProvider): Promise<void> {
  await fs.mkdir(providerDir(provider), { recursive: true });
}

function parseSeq(name: string): number | null {
  const match = name.match(/^v(\d+)$/);
  return match ? Number.parseInt(match[1], 10) : null;
}

async function listForProvider(provider: AIProvider): Promise<StoredVersion[]> {
  await ensureDir(provider);
  const entries = await fs.readdir(providerDir(provider), { withFileTypes: true });
  const ordered = entries
    .filter((e) => e.isDirectory())
    .map((e) => ({ name: e.name, seq: parseSeq(e.name) }))
    .filter((e): e is { name: string; seq: number } => e.seq !== null)
    .sort((a, b) => a.seq - b.seq);

  const versions: StoredVersion[] = [];
  for (const { name } of ordered) {
    try {
      const raw = await fs.readFile(
        path.join(providerDir(provider), name, "metadata.json"),
        "utf8",
      );
      versions.push(JSON.parse(raw) as StoredVersion);
    } catch {
      // Skip directories without a readable metadata.json rather than failing
      // the whole listing.
    }
  }
  return versions;
}

export async function listVersions(): Promise<StoredVersion[]> {
  const all: StoredVersion[] = [];
  for (const p of PROVIDERS) {
    const list = await listForProvider(p);
    all.push(...list);
  }
  all.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return all;
}

// Atomically claim the next vN/ directory inside the provider folder.
// `mkdir({ recursive: false })` fails with EEXIST if a concurrent caller
// already won the race for this seq; we bump and retry until we get a
// fresh dir. Bounded so a corrupted tree doesn't loop forever.
async function claimNextVersionDir(
  provider: AIProvider,
  startingSeq: number,
): Promise<{ seq: number; dir: string }> {
  let seq = startingSeq;
  const baseDir = providerDir(provider);
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

export async function saveVersion(input: {
  label: string;
  hero: HeroResult;
  provider: AIProvider;
  systemPrompt: string;
  userPrompt: string;
  previewHtml: string;
}): Promise<StoredVersion> {
  await ensureDir(input.provider);
  const entries = await fs.readdir(providerDir(input.provider), { withFileTypes: true });
  const maxSeq = entries
    .filter((e) => e.isDirectory())
    .reduce((max, e) => {
      const seq = parseSeq(e.name);
      return seq !== null && seq > max ? seq : max;
    }, 0);
  const { seq, dir: versionDir } = await claimNextVersionDir(
    input.provider,
    maxSeq + 1,
  );

  const stored: StoredVersion = {
    id: `${input.provider}/v${seq}`,
    label: input.label,
    hero: input.hero,
    provider: input.provider,
    createdAt: new Date().toISOString(),
  };

  await Promise.all([
    fs.writeFile(
      path.join(versionDir, "metadata.json"),
      JSON.stringify(stored, null, 2),
      "utf8",
    ),
    fs.writeFile(
      path.join(versionDir, "system_prompt.txt"),
      input.systemPrompt,
      "utf8",
    ),
    fs.writeFile(
      path.join(versionDir, "user_prompt.txt"),
      input.userPrompt,
      "utf8",
    ),
    fs.writeFile(path.join(versionDir, "hero.html"), input.previewHtml, "utf8"),
  ]);

  return stored;
}
