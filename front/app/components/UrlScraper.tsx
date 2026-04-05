import React, { useState } from "react";
import { Icon } from "@iconify/react";

interface ScrapedImage {
  url: string;
  width: number;
  height: number;
  index: number;
}

interface ScrapeResponse {
  images: ScrapedImage[];
  total: number;
  source_url: string;
}

interface UrlScraperProps {
  onTranslateImages: (files: File[]) => Promise<void>;
  isProcessing: boolean;
}

export const UrlScraper: React.FC<UrlScraperProps> = ({ onTranslateImages, isProcessing }) => {
  const [url, setUrl] = useState("");
  const [isFetching, setIsFetching] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scrapedImages, setScrapedImages] = useState<ScrapedImage[]>([]);

  const apiBaseUrl = typeof window !== "undefined"
    ? (import.meta.env.DEV ? "/api" : `http://${window.location.hostname}:8000`)
    : "";

  /** Build a backend proxy URL for any external image URL */
  const proxyUrl = (imageUrl: string, sourceUrl?: string): string => {
    const params = new URLSearchParams({ url: imageUrl });
    if (sourceUrl) params.set("referer", sourceUrl);
    return `${apiBaseUrl}/proxy-image?${params.toString()}`;
  };

  const handleFetch = async () => {
    if (!url) return;
    if (!url.startsWith("http://") && !url.startsWith("https://")) {
      setError("Please enter a valid URL starting with http:// or https://");
      return;
    }

    setIsFetching(true);
    setError(null);
    setScrapedImages([]);

    try {
      const response = await fetch(`${apiBaseUrl}/scrape-url`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, min_width: 400 }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.detail || "Failed to fetch images from URL");
      }

      const data: ScrapeResponse = await response.json();
      setScrapedImages(data.images);
      if (data.images.length === 0) {
        setError("No images with width ≥ 400px found at this URL.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setIsFetching(false);
    }
  };

  const handleTranslateAll = async () => {
    if (scrapedImages.length === 0) return;

    setIsDownloading(true);
    setError(null);
    const files: File[] = [];

    try {
      for (const img of scrapedImages) {
        // Download via backend proxy — avoids CORS entirely
        const downloadUrl = proxyUrl(img.url, url);
        const resp = await fetch(downloadUrl);
        if (!resp.ok) {
          console.warn(`Skipping image ${img.index + 1}: server returned ${resp.status}`);
          continue;
        }
        const blob = await resp.blob();

        // Derive a filename from the original URL
        const urlParts = img.url.split("/");
        let fileName = urlParts[urlParts.length - 1].split("?")[0];
        if (!fileName || !fileName.match(/\.(jpe?g|png|webp|gif|bmp)$/i)) {
          const ext = blob.type.split("/")[1] || "jpg";
          fileName = `image_${String(img.index + 1).padStart(3, "0")}.${ext}`;
        }

        files.push(new File([blob], fileName, { type: blob.type }));
      }

      if (files.length > 0) {
        await onTranslateImages(files);
      } else {
        setError("Could not download any images. They may be behind authentication or bot protection.");
      }
    } catch (err) {
      setError(
        "Failed to download images: " +
          (err instanceof Error ? err.message : "Unknown error")
      );
    } finally {
      setIsDownloading(false);
    }
  };

  const clear = () => {
    setUrl("");
    setScrapedImages([]);
    setError(null);
  };

  const isBusy = isFetching || isDownloading || isProcessing;

  return (
    <div className="w-full space-y-4 p-4 bg-white border rounded-lg shadow-sm">
      <div className="flex items-center space-x-2 text-gray-700 font-medium mb-2">
        <Icon icon="carbon:link" className="w-5 h-5" />
        <span>Translate from Web URL</span>
      </div>

      <div className="flex flex-col md:flex-row gap-2">
        <input
          type="text"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !isBusy && url && handleFetch()}
          placeholder="https://example.com/manga-chapter-1"
          className="flex-1 p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-700"
          disabled={isBusy}
        />
        <div className="flex gap-2">
          <button
            onClick={handleFetch}
            disabled={isBusy || !url}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400 transition-colors flex items-center justify-center min-w-[130px]"
          >
            {isFetching ? (
              <>
                <Icon icon="carbon:progress-bar-round" className="w-5 h-5 animate-spin mr-2" />
                Fetching…
              </>
            ) : (
              <>
                <Icon icon="carbon:fetch-upload" className="w-5 h-5 mr-2" />
                Fetch Images
              </>
            )}
          </button>
          {(url || scrapedImages.length > 0) && (
            <button
              onClick={clear}
              disabled={isBusy}
              className="px-4 py-2 border border-gray-300 text-gray-600 rounded-md hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="text-red-500 text-sm flex items-start space-x-1 py-1">
          <Icon icon="carbon:warning" className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {scrapedImages.length > 0 && (
        <div className="mt-4 space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <span className="text-sm font-medium text-gray-600">
              Found {scrapedImages.length} image{scrapedImages.length !== 1 ? "s" : ""} (≥ 400px)
            </span>
            <button
              onClick={handleTranslateAll}
              disabled={isBusy}
              className="px-6 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:bg-gray-400 transition-colors flex items-center shadow-sm"
            >
              {isDownloading ? (
                <>
                  <Icon icon="carbon:progress-bar-round" className="w-5 h-5 animate-spin mr-2" />
                  Downloading…
                </>
              ) : (
                <>
                  <Icon icon="carbon:language" className="w-5 h-5 mr-2" />
                  Translate All {scrapedImages.length} Images
                </>
              )}
            </button>
          </div>

          {/* Thumbnail grid — images loaded via backend proxy, so no CORS issues */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 max-h-[300px] overflow-y-auto p-2 border rounded-md bg-gray-50">
            {scrapedImages.map((img) => (
              <div
                key={img.url}
                className="relative group aspect-[2/3] bg-gray-200 rounded overflow-hidden border border-gray-300 shadow-sm"
              >
                <img
                  src={proxyUrl(img.url, url)}
                  alt={`Page ${img.index + 1}`}
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
                <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-[10px] p-1 text-center">
                  {img.width}×{img.height}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
