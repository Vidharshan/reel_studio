import { NextResponse } from "next/server";

/**
 * Upload-video route endpoint configuration.
 *
 * NOTE: Raw video file bodies are NO LONGER proxied through Vercel Serverless functions
 * (which enforce a hard 4.5 MB request body limit).
 * Browser clients upload directly to tusd on the VPS via tus-js-client.
 */
export async function GET() {
  const endpoint = process.env.NEXT_PUBLIC_TUSD_ENDPOINT || "http://localhost:1080/files/";
  return NextResponse.json({ uploadEndpoint: endpoint });
}

export async function POST() {
  const endpoint = process.env.NEXT_PUBLIC_TUSD_ENDPOINT || "http://localhost:1080/files/";
  return NextResponse.json({
    message: "Direct file body upload is deprecated. Use tus-js-client to upload directly to tusd.",
    uploadEndpoint: endpoint,
  });
}
