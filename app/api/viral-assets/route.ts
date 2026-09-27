import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

export async function GET() {
  try {
    const dataDir = path.join(process.cwd(), "data");

    const sfxPath = path.join(dataDir, "sfx_catalog.json");
    const brollPath = path.join(dataDir, "broll_catalog.json");
    const templatesPath = path.join(dataDir, "viral_templates.json");

    const sfx = fs.existsSync(sfxPath)
      ? JSON.parse(fs.readFileSync(sfxPath, "utf-8"))
      : [];
    const broll = fs.existsSync(brollPath)
      ? JSON.parse(fs.readFileSync(brollPath, "utf-8"))
      : [];
    const templates = fs.existsSync(templatesPath)
      ? JSON.parse(fs.readFileSync(templatesPath, "utf-8"))
      : [];

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      counts: {
        sfx: sfx.length,
        broll: broll.length,
        templates: templates.length,
      },
      sfx,
      broll,
      templates,
    });
  } catch (error) {
    console.error("Failed to load viral assets:", error);
    return NextResponse.json(
      { error: "Failed to load viral assets" },
      { status: 500 }
    );
  }
}
