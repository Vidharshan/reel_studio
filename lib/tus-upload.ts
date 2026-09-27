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
 * Upload a file directly to the tusd server using tus-js-client.
 * Chunked, resumable, with progress reporting, automatic reconnect retry delays,
 * and automatic fallback if a previous session fingerprint is stale or expired on tusd.
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

    let isRetryingFresh = false;

    const createAndStartUpload = (resumeUploadObj?: tus.PreviousUpload) => {
      const upload: tus.Upload = new tus.Upload(file, {
        endpoint,
        retryDelays: [0, 1000, 3000, 5000],
        chunkSize: 5 * 1024 * 1024, // 5MB chunks
        removeFingerprintOnSuccess: true,
        metadata: {
          filename: file.name,
          filetype: file.type,
          ...options.metadata,
        },
        onError: async (error) => {
          const errStr = String(error.message || error);
          // If resuming failed due to stale/expired session on server, retry as a fresh upload
          if (!isRetryingFresh && (errStr.includes("failed to resume") || errStr.includes("HEAD"))) {
            console.warn("[tus-upload] Previous upload session expired/stale on server. Restarting fresh upload...");
            isRetryingFresh = true;
            try {
              if (upload.options.fingerprint) {
                const fingerPrintKey = await upload.options.fingerprint(file, upload.options);
                localStorage.removeItem(`tus::${fingerPrintKey}`);
              }
            } catch { /* ignore */ }
            createAndStartUpload();
            return;
          }

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

      if (resumeUploadObj) {
        try {
          upload.resumeFromPreviousUpload(resumeUploadObj);
        } catch { /* fallback to normal start */ }
      }

      upload.start();
    };

    // Find previous uploads, or start new
    const dummyUpload = new tus.Upload(file, { endpoint });
    dummyUpload
      .findPreviousUploads()
      .then((previousUploads) => {
        if (previousUploads.length > 0) {
          console.log("[tus-upload] Found previous upload session, attempting resume...");
          createAndStartUpload(previousUploads[0]);
        } else {
          createAndStartUpload();
        }
      })
      .catch(() => {
        createAndStartUpload();
      });
  });
}
