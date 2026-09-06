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

async function saveWaitlistEntry(entry: WaitlistEntry) {
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    await put(getWaitlistPathname(entry.email), JSON.stringify(entry), {
      access: "public",
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: "application/json",
    });
    return;
  }

  let entries: WaitlistEntry[] = [];
  if (fs.existsSync(WAITLIST_FILE)) {
    const fileData = fs.readFileSync(WAITLIST_FILE, "utf-8");
    try {
      entries = JSON.parse(fileData);
      if (!Array.isArray(entries)) {
        entries = [];
      }
    } catch {
      entries = [];
    }
  }

  const isDuplicate = entries.some((existingEntry) => existingEntry.email === entry.email);
  if (!isDuplicate) {
    entries.push(entry);
    fs.writeFileSync(WAITLIST_FILE, JSON.stringify(entries, null, 2), "utf-8");
  }
}

export async function POST(req: Request) {
  try {
    const { email } = await req.json();

    if (typeof email !== "string" || !EMAIL_PATTERN.test(email.trim())) {
      return NextResponse.json({ error: "Invalid email address" }, { status: 400 });
    }

    const newEntry = {
      email: email.trim().toLowerCase(),
      timestamp: new Date().toISOString()
    };

    await saveWaitlistEntry(newEntry);

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { error: "The waitlist service is temporarily unavailable. Please try again shortly." },
      { status: 500 }
    );
  }
}
