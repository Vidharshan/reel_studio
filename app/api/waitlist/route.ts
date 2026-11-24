import { NextResponse } from "next/server";
import { get, head, list, put } from "@vercel/blob";
import { createHmac } from "crypto";
import fs from "fs";
import path from "path";

export const runtime = "nodejs";

const WAITLIST_FILE = path.join(process.cwd(), "waitlist.json");
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_EMAIL_LENGTH = 254;

type WaitlistRole = "founder" | "creator";

type WaitlistEntry = {
  email: string;
  role?: WaitlistRole;
  timestamp: string;
  updatedAt?: string;
};

function getWaitlistPathname(email: string): string {
  const emailHash = createHmac(
    "sha256",
    process.env.BLOB_READ_WRITE_TOKEN ?? "local-development"
  )
    .update(email)
    .digest("hex");
  return `waitlist/${emailHash}.json`;
}

function getLocalEntries(): WaitlistEntry[] {
  try {
    if (fs.existsSync(WAITLIST_FILE)) {
      const fileData = fs.readFileSync(WAITLIST_FILE, "utf-8");
      const parsed = JSON.parse(fileData);
      return Array.isArray(parsed) ? parsed : [];
    }
  } catch (err) {
    console.error("[waitlist] Failed to read local waitlist.json:", err);
  }
  return [];
}

function writeLocalEntries(entries: WaitlistEntry[]): boolean {
  try {
    const tmpPath = path.join(
      process.cwd(),
      `.waitlist.${process.pid}.${Date.now()}.tmp`
    );
    fs.writeFileSync(tmpPath, JSON.stringify(entries, null, 2) + "\n", "utf-8");
    fs.renameSync(tmpPath, WAITLIST_FILE);
    return true;
  } catch {
    console.warn(
      "[waitlist] Local filesystem unavailable for writes (read-only deployment)."
    );
    return false;
  }
}

async function getBlobCount(): Promise<number | null> {
  if (!process.env.BLOB_READ_WRITE_TOKEN) return null;

  try {
    let total = 0;
    let cursor: string | undefined;

    do {
      const page = await list({
        prefix: "waitlist/",
        limit: 1000,
        cursor,
      });
      total += page.blobs.length;
      cursor = page.hasMore ? page.cursor : undefined;
    } while (cursor);

    return total;
  } catch (err) {
    console.error("[waitlist] Blob list error:", err);
    return null;
  }
}

async function readExistingBlob(pathname: string): Promise<WaitlistEntry | null> {
  try {
    const existingMeta = await head(pathname);
    if (existingMeta?.url) {
      const res = await fetch(existingMeta.url, { cache: "no-store" });
      if (res.ok) {
        return (await res.json()) as WaitlistEntry;
      }
    }
  } catch {
    // Public head/fetch failed or blob does not exist; try private get below
  }

  try {
    const privateResult = await get(pathname, {
      access: "private",
      useCache: false,
    });
    if (privateResult?.statusCode === 200 && privateResult.stream) {
      const text = await new Response(privateResult.stream).text();
      return JSON.parse(text) as WaitlistEntry;
    }
  } catch {
    // Blob does not exist yet
  }

  return null;
}

async function putBlobAutoAccess(pathname: string, body: string): Promise<void> {
  try {
    await put(pathname, body, {
      access: "public",
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: "application/json",
    });
  } catch (publicErr) {
    // If the Vercel Blob store is configured as private, retry with private access
    try {
      await put(pathname, body, {
        access: "private",
        addRandomSuffix: false,
        allowOverwrite: true,
        contentType: "application/json",
      });
    } catch {
      throw publicErr;
    }
  }
}

async function saveToBlob(
  email: string,
  role: WaitlistRole | undefined,
  now: string
): Promise<{ saved: boolean; alreadyJoined: boolean; error?: string }> {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return { saved: false, alreadyJoined: false };
  }

  const pathname = getWaitlistPathname(email);
  const existingEntry = await readExistingBlob(pathname);
  const alreadyJoined = Boolean(existingEntry);

  // If already joined in Blob and no new role change, keep the original record intact
  if (alreadyJoined && (!role || existingEntry?.role === role)) {
    return { saved: true, alreadyJoined: true };
  }

  const payload: WaitlistEntry = existingEntry
    ? {
        ...existingEntry,
        email,
        ...(role ? { role } : {}),
        updatedAt: now,
      }
    : {
        email,
        ...(role ? { role } : {}),
        timestamp: now,
      };

  try {
    await putBlobAutoAccess(pathname, JSON.stringify(payload));
    return { saved: true, alreadyJoined };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Blob write failed";
    console.error("[waitlist] Blob write error:", err);
    return { saved: false, alreadyJoined, error: message };
  }
}

export async function GET() {
  const localEntries = getLocalEntries();
  const blobCount = await getBlobCount();
  const count =
    blobCount !== null
      ? Math.max(localEntries.length, blobCount)
      : localEntries.length;

  return NextResponse.json({
    count,
    blobConfigured: Boolean(process.env.BLOB_READ_WRITE_TOKEN),
  });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const rawEmail = body?.email;
    const rawRole = body?.role;

    if (
      typeof rawEmail !== "string" ||
      rawEmail.trim().length > MAX_EMAIL_LENGTH ||
      !EMAIL_PATTERN.test(rawEmail.trim())
    ) {
      return NextResponse.json(
        { error: "Enter a valid email address." },
        { status: 400 }
      );
    }

    let role: WaitlistRole | undefined;
    if (rawRole !== undefined && rawRole !== null && rawRole !== "") {
      if (rawRole === "founder" || rawRole === "creator") {
        role = rawRole;
      } else {
        return NextResponse.json(
          { error: "Invalid role selection." },
          { status: 400 }
        );
      }
    }

    const email = rawEmail.trim().toLowerCase();
    const now = new Date().toISOString();
    const hasBlobToken = Boolean(process.env.BLOB_READ_WRITE_TOKEN);

    // 1. Persist to Vercel Blob if configured (preserving existing entries)
    const blobResult = await saveToBlob(email, role, now);

    // If Blob is configured in this environment, never silently succeed if Blob write failed
    if (hasBlobToken && !blobResult.saved) {
      return NextResponse.json(
        {
          error: "Unable to save your spot to storage. Please try again.",
          storage: "blob_error",
        },
        { status: 500 }
      );
    }

    // 2. Persist to local waitlist.json (preserving all existing entries)
    const entries = getLocalEntries();
    const existingIndex = entries.findIndex(
      (e) => e.email.toLowerCase() === email
    );

    let localSaved = false;
    let alreadyJoined = blobResult.alreadyJoined;

    if (existingIndex >= 0) {
      alreadyJoined = true;
      const existing = entries[existingIndex];
      if (role && existing.role !== role) {
        entries[existingIndex] = {
          ...existing,
          role,
          updatedAt: now,
        };
        localSaved = writeLocalEntries(entries);
      } else {
        localSaved = !hasBlobToken;
      }
    } else {
      const newEntry: WaitlistEntry = {
        email,
        ...(role ? { role } : {}),
        timestamp: now,
      };
      entries.push(newEntry);
      localSaved = writeLocalEntries(entries);
    }

    if (!blobResult.saved && !localSaved) {
      return NextResponse.json(
        { error: "Unable to save your spot right now. Please try again." },
        { status: 500 }
      );
    }

    const blobCount = await getBlobCount();
    const count =
      blobCount !== null ? Math.max(entries.length, blobCount) : entries.length;

    return NextResponse.json({
      success: true,
      alreadyJoined,
      storage: blobResult.saved ? "blob" : "local",
      count,
    });
  } catch (err) {
    console.error("[waitlist] Error:", err);
    return NextResponse.json(
      { error: "Unable to join the waitlist. Please try again." },
      { status: 500 }
    );
  }
}
