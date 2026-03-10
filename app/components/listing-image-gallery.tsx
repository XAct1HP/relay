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
      <div className="overflow-hidden rounded-[2rem] border border-white/10 bg-white/[0.04] shadow-[0_24px_70px_rgba(0,0,0,0.22)] backdrop-blur-xl">
        {selectedImageUrl ? (
          <div className="relative min-h-[540px]">
            <img
              src={selectedImageUrl}
              alt={`${brand} ${model}`}
              className="h-full min-h-[540px] w-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/18 via-transparent to-transparent" />
          </div>
        ) : (
          <div className="flex min-h-[540px] items-center justify-center bg-white/[0.03] text-white/35">
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
                className={`group overflow-hidden rounded-[1.35rem] border bg-white/[0.04] transition ${
                  isSelected
                    ? "border-white/30 ring-1 ring-white/25"
                    : "border-white/10 hover:border-white/20"
                }`}
              >
                <img
                  src={image.image_url}
                  alt={`${brand} ${model} thumbnail`}
                  className="h-28 w-full object-cover transition duration-300 group-hover:scale-[1.02]"
                />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}