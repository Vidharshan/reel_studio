import * as tus from "tus-js-client";

export interface TusUploadOptions {
  onProgress?: (bytesUploaded: number, bytesTotal: number, percentage: number) => void;
  onError?: (error: Error) => void;
  onSuccess?: (url: string) => void;
  endpoint?: string;
  metadata?: Record<string, string>;
}

export interface TusUploadResult {
  url: string;
  fileId: string;
}

/**
 * Upload a file directly to the tusd server on the VPS/local host using tus-js-client.
 * Chunked, resumable, with progress reporting and automatic reconnect retry delays.
 */
export function uploadFileWithTus(
  file: File,
  options: TusUploadOptions = {}
): Promise<TusUploadResult> {
  return new Promise((resolve, reject) => {
    const endpoint =
      options.endpoint ||
      process.env.NEXT_PUBLIC_TUSD_ENDPOINT ||
      "http://localhost:1080/files/";

    const upload = new tus.Upload(file, {
      endpoint,
      retryDelays: [0, 1000, 3000, 5000],
      chunkSize: 5 * 1024 * 1024, // 5MB chunks for reliable streaming
      metadata: {
        filename: file.name,
        filetype: file.type,
        ...options.metadata,
      },
      onError: (error) => {
        console.error("[tus-upload] Upload failed:", error);
        if (options.onError) options.onError(error);
        reject(error);
      },
      onProgress: (bytesUploaded, bytesTotal) => {
        const percentage = Math.round((bytesUploaded / bytesTotal) * 100);
        if (options.onProgress) {
          options.onProgress(bytesUploaded, bytesTotal, percentage);
        }
      },
      onSuccess: () => {
        const url = upload.url || "";
        const fileId = url.split("/").pop() || "";
        console.log(`[tus-upload] Upload complete: ${url} (id: ${fileId})`);
        if (options.onSuccess) options.onSuccess(url);
        resolve({ url, fileId });
      },
    });

    // Check for previous uncompleted upload to resume
    upload.findPreviousUploads().then((previousUploads) => {
      if (previousUploads.length > 0) {
        console.log("[tus-upload] Resuming previous upload session...");
        upload.resumeFromPreviousUpload(previousUploads[0]);
      }
      upload.start();
    }).catch(() => {
      upload.start();
    });
  });
}
