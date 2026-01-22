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

export async function GET() {
  if (process.env.NODE_ENV !== "production") {
    const devVersion = process.env.NEXT_PUBLIC_APP_VERSION || "development";
    return NextResponse.json(
      { version: devVersion, at: new Date().toISOString() },
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
