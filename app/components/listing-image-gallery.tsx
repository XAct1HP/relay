"use client";

import { useState } from "react";

type ListingImage = {
  id: string;
  image_url: string;
  sort_order: number;
};

type ListingImageGalleryProps = {
  brand: string;
  model: string;
  coverImageUrl: string | null;
  images: ListingImage[];
};

export default function ListingImageGallery({
  brand,
  model,
  coverImageUrl,
  images,
}: ListingImageGalleryProps) {
  const allImages = images.length
    ? images
    : coverImageUrl
      ? [
          {
            id: "cover",
            image_url: coverImageUrl,
            sort_order: 0,
          },
        ]
      : [];

  const [selectedImageUrl, setSelectedImageUrl] = useState<string | null>(
    coverImageUrl || allImages[0]?.image_url || null
  );

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        {selectedImageUrl ? (
          <img
            src={selectedImageUrl}
            alt={`${brand} ${model}`}
            className="h-full min-h-[520px] w-full object-cover"
          />
        ) : (
          <div className="flex min-h-[520px] items-center justify-center bg-slate-100 text-slate-400">
            No image
          </div>
        )}
      </div>

      {allImages.length > 1 && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {allImages.map((image) => {
            const isSelected = image.image_url === selectedImageUrl;

            return (
              <button
                key={image.id}
                type="button"
                onClick={() => setSelectedImageUrl(image.image_url)}
                className={`overflow-hidden rounded-2xl border bg-white shadow-sm transition ${
                  isSelected
                    ? "border-slate-900 ring-2 ring-slate-900"
                    : "border-slate-200 hover:border-slate-400"
                }`}
              >
                <img
                  src={image.image_url}
                  alt={`${brand} ${model} thumbnail`}
                  className="h-28 w-full object-cover"
                />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}