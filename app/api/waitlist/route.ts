import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const WAITLIST_FILE = path.join(process.cwd(), "waitlist.json");

export async function POST(req: Request) {
  try {
    const { email } = await req.json();

    if (!email || typeof email !== "string" || !email.includes("@")) {
      return NextResponse.json({ error: "Invalid email address" }, { status: 400 });
    }

    const newEntry = {
      email: email.trim().toLowerCase(),
      timestamp: new Date().toISOString()
    };

    let entries = [];
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

    // Prevent duplicate entries
    const isDuplicate = entries.some((entry: any) => entry.email === newEntry.email);
    if (!isDuplicate) {
      entries.push(newEntry);
      fs.writeFileSync(WAITLIST_FILE, JSON.stringify(entries, null, 2), "utf-8");
    }

    return NextResponse.json({ success: true, count: entries.length });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Server error" }, { status: 500 });
  }
}
