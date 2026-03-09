"use client";

import { ChangeEvent, FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const BUCKET_NAME = "listing-images";
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB
const MAX_FILES = 5;

export default function SellPage() {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();

  const [brand, setBrand] = useState("");
  const [model, setModel] = useState("");
  const [nickname, setNickname] = useState("");
  const [size, setSize] = useState("");
  const [condition, setCondition] = useState("New");
  const [price, setPrice] = useState("");
  const [description, setDescription] = useState("");
  const [shippingWeightOz, setShippingWeightOz] = useState("32");

  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [imagePreviewUrls, setImagePreviewUrls] = useState<string[]>([]);

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);

    if (files.length === 0) {
      setImageFiles([]);
      setImagePreviewUrls([]);
      return;
    }

    if (files.length > MAX_FILES) {
      setMessage(`Please choose no more than ${MAX_FILES} images.`);
      e.target.value = "";
      return;
    }

    for (const file of files) {
      if (!file.type.startsWith("image/")) {
        setMessage("All selected files must be images.");
        e.target.value = "";
        return;
      }

      if (file.size > MAX_FILE_SIZE_BYTES) {
        setMessage("Each image must be smaller than 5 MB.");
        e.target.value = "";
        return;
      }
    }

    setMessage("");
    setImageFiles(files);
    setImagePreviewUrls(files.map((file) => URL.createObjectURL(file)));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMessage("");

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setMessage("You must be logged in to create a listing.");
      setLoading(false);
      return;
    }

    const parsedPrice = Math.round(Number(price) * 100);
    const parsedSize = Number(size);
    const parsedShippingWeightOz = Number(shippingWeightOz);

    if (!brand.trim() || !model.trim()) {
      setMessage("Brand and model are required.");
      setLoading(false);
      return;
    }

    if (!parsedPrice || parsedPrice <= 0) {
      setMessage("Enter a valid price.");
      setLoading(false);
      return;
    }

    if (!parsedSize || parsedSize <= 0) {
      setMessage("Enter a valid shoe size.");
      setLoading(false);
      return;
    }

    if (!parsedShippingWeightOz || parsedShippingWeightOz <= 0) {
      setMessage("Choose a valid shipping weight.");
      setLoading(false);
      return;
    }

    if (imageFiles.length === 0) {
      setMessage("Please choose at least one image.");
      setLoading(false);
      return;
    }

    const uploadedImageUrls: string[] = [];

    for (const file of imageFiles) {
      const fileExtension = file.name.split(".").pop() || "jpg";
      const filePath = `${user.id}/${crypto.randomUUID()}.${fileExtension}`;

      const { error: uploadError } = await supabase.storage
        .from(BUCKET_NAME)
        .upload(filePath, file, {
          cacheControl: "3600",
          upsert: false,
        });

      if (uploadError) {
        setMessage(uploadError.message);
        setLoading(false);
        return;
      }

      const { data: publicUrlData } = supabase.storage
        .from(BUCKET_NAME)
        .getPublicUrl(filePath);

      uploadedImageUrls.push(publicUrlData.publicUrl);
    }

    const coverImageUrl = uploadedImageUrls[0] ?? null;

    const { data: listingData, error: listingError } = await supabase
      .from("listings")
      .insert({
        seller_id: user.id,
        brand: brand.trim(),
        model: model.trim(),
        nickname: nickname.trim() || null,
        size: parsedSize,
        condition,
        price_cents: parsedPrice,
        description: description.trim() || null,
        cover_image_url: coverImageUrl,
        shipping_weight_oz: parsedShippingWeightOz,
        status: "active",
      })
      .select("id")
      .single();

    if (listingError) {
      setMessage(listingError.message);
      setLoading(false);
      return;
    }

    const imageRows = uploadedImageUrls.map((url, index) => ({
      listing_id: listingData.id,
      image_url: url,
      sort_order: index,
    }));

    const { error: imageInsertError } = await supabase
      .from("listing_images")
      .insert(imageRows);

    if (imageInsertError) {
      setMessage(imageInsertError.message);
      setLoading(false);
      return;
    }

    setLoading(false);
    router.push(`/listings/${listingData.id}`);
    router.refresh();
  }

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-12 text-slate-900">
      <div className="mx-auto max-w-2xl">
        <p className="text-sm font-medium uppercase tracking-[0.2em] text-slate-500">
          Relay
        </p>
        <h1 className="mt-2 text-4xl font-bold tracking-tight">Create Listing</h1>
        <p className="mt-3 text-slate-600">
          Post a sneaker listing to the Relay marketplace.
        </p>

        <form
          onSubmit={handleSubmit}
          className="mt-8 space-y-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
        >
          <div>
            <label className="mb-2 block text-sm font-medium">Brand</label>
            <input
              type="text"
              value={brand}
              onChange={(e) => setBrand(e.target.value)}
              placeholder="Nike"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-slate-500"
              required
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium">Model</label>
            <input
              type="text"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="Jordan 4"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-slate-500"
              required
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium">Nickname</label>
            <input
              type="text"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              placeholder="Bred"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-slate-500"
            />
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-medium">Size</label>
              <input
                type="number"
                step="0.5"
                value={size}
                onChange={(e) => setSize(e.target.value)}
                placeholder="10.5"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-slate-500"
                required
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium">Condition</label>
              <select
                value={condition}
                onChange={(e) => setCondition(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-slate-500"
              >
                <option>New</option>
                <option>VNDS</option>
                <option>Used</option>
              </select>
            </div>
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium">Price (USD)</label>
            <input
              type="number"
              step="0.01"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="315.00"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-slate-500"
              required
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium">Shipping Weight</label>
            <select
              value={shippingWeightOz}
              onChange={(e) => setShippingWeightOz(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-slate-500"
            >
              <option value="24">Light pair / no heavy extras</option>
              <option value="32">Standard sneakers with box</option>
              <option value="48">Heavy pair / boots / bulky box</option>
            </select>
            <p className="mt-2 text-xs text-slate-500">
              This is used to estimate the prepaid shipping label the buyer will pay for.
            </p>
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium">Listing Images</label>
            <input
              type="file"
              accept="image/*"
              multiple
              onChange={handleFileChange}
              className="block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              required
            />
            <p className="mt-2 text-xs text-slate-500">
              Upload up to {MAX_FILES} images. The first image will be used as the cover photo.
            </p>

            {imagePreviewUrls.length > 0 && (
              <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
                {imagePreviewUrls.map((previewUrl, index) => (
                  <div
                    key={previewUrl}
                    className="overflow-hidden rounded-xl border border-slate-200"
                  >
                    <img
                      src={previewUrl}
                      alt={`Preview ${index + 1}`}
                      className="h-40 w-full object-cover"
                    />
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Clean pair, ships next day, OG all."
              className="min-h-28 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-slate-500"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-slate-900 px-4 py-2 font-medium text-white hover:bg-slate-800 disabled:opacity-50"
          >
            {loading ? "Creating listing..." : "Create Listing"}
          </button>

          {message && <p className="text-sm text-slate-600">{message}</p>}
        </form>
      </div>
    </main>
  );
}