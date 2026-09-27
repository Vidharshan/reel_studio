import { NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { createHmac } from "crypto";
import fs from "fs";
import path from "path";

export const runtime = "nodejs";

const WAITLIST_FILE = path.join(process.cwd(), "waitlist.json");
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type WaitlistEntry = {
  email: string;
  timestamp: string;
};

function getWaitlistPathname(email: string) {
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
  } catch { /* ignore read errors */ }
  return [];
}

async function saveWaitlistEntry(entry: WaitlistEntry): Promise<number> {
  // 1. If Vercel Blob token is configured, write to Vercel Blob
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    try {
      await put(getWaitlistPathname(entry.email), JSON.stringify(entry), {
        access: "public",
        addRandomSuffix: false,
        allowOverwrite: true,
        contentType: "application/json",
      });
    } catch (err) {
      console.error("[waitlist] Blob storage error:", err);
    }
  }

  // 2. Local file storage fallback
  const entries = getLocalEntries();
  const isDuplicate = entries.some((e) => e.email === entry.email);
  if (!isDuplicate) {
    entries.push(entry);
    try {
      fs.writeFileSync(WAITLIST_FILE, JSON.stringify(entries, null, 2), "utf-8");
    } catch {
      // Ignore read-only filesystem errors on Vercel deployment without Blob token
      console.warn("[waitlist] File system read-only or unwritable (Vercel deployment mode).");
    }
  }

  return entries.length;
}

export async function GET() {
  const entries = getLocalEntries();
  return NextResponse.json({ count: entries.length });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const email = body?.email;

    if (typeof email !== "string" || !EMAIL_PATTERN.test(email.trim())) {
      return NextResponse.json({ error: "Please enter a valid email address." }, { status: 400 });
    }

    const newEntry: WaitlistEntry = {
      email: email.trim().toLowerCase(),
      timestamp: new Date().toISOString(),
    };

    const count = await saveWaitlistEntry(newEntry);

    return NextResponse.json({ success: true, count });
  } catch (err) {
    console.error("[waitlist] Error:", err);
    return NextResponse.json(
      { error: "Unable to join waitlist. Please try again." },
      { status: 500 }
    );
  }
}
