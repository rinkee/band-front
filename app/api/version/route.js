import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const readBuildId = async () => {
  try {
    const buildIdPath = path.join(process.cwd(), ".next", "BUILD_ID");
    const data = await fs.readFile(buildIdPath, "utf8");
    return data?.trim() || null;
  } catch (_) {
    return null;
  }
};

const readVersionFile = async () => {
  try {
    const versionPath = path.join(process.cwd(), "public", "version.json");
    const raw = await fs.readFile(versionPath, "utf8");
    const data = JSON.parse(raw);
    if (data?.latest?.version) {
      return {
        version: data.latest.version,
        summary: data.latest.summary || null,
        date: data.latest.date || null,
      };
    }
    if (Array.isArray(data?.releases) && data.releases.length > 0) {
      const first = data.releases.find((item) => item?.version);
      if (first?.version) {
        return {
          version: first.version,
          summary: first.summary || null,
          date: first.date || null,
        };
      }
    }
    if (data?.version) {
      return {
        version: data.version,
        summary: data.summary || null,
        date: data.date || null,
      };
    }
  } catch (_) {
    // ignore
  }
  return null;
};

export async function GET() {
  const fileVersion = await readVersionFile();
  if (fileVersion?.version) {
    return NextResponse.json(
      { ...fileVersion, at: new Date().toISOString() },
      {
        headers: {
          "Cache-Control": "no-store, max-age=0",
        },
      }
    );
  }

  const envVersion =
    process.env.NEXT_PUBLIC_APP_VERSION ||
    process.env.VERCEL_GIT_COMMIT_SHA ||
    process.env.VERCEL_DEPLOYMENT_ID ||
    process.env.GIT_COMMIT_SHA ||
    null;

  const version = envVersion || (await readBuildId()) || "unknown";

  return NextResponse.json(
    { version, at: new Date().toISOString() },
    {
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    }
  );
}
