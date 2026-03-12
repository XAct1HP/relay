"use client";

import Link from "next/link";
import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const BUCKET_NAME = "listing-images";
const MAX_FILES = 8;
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;

function hasRequiredShippingProfile(profile: {
  ship_from_name?: string | null;
  ship_from_street1?: string | null;
  ship_from_city?: string | null;
  ship_from_state?: string | null;
  ship_from_zip?: string | null;
  ship_from_country?: string | null;
}) {
  return Boolean(
    profile.ship_from_name?.trim() &&
      profile.ship_from_street1?.trim() &&
      profile.ship_from_city?.trim() &&
      profile.ship_from_state?.trim() &&
      profile.ship_from_zip?.trim() &&
      profile.ship_from_country?.trim()
  );
}

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
  const [checkingProfile, setCheckingProfile] = useState(true);
  const [hasShippingProfile, setHasShippingProfile] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    async function loadShippingProfile() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.push("/auth/login");
        return;
      }

      const { data, error } = await supabase
        .from("profiles")
        .select(
          "ship_from_name, ship_from_street1, ship_from_city, ship_from_state, ship_from_zip, ship_from_country"
        )
        .eq("id", user.id)
        .single();

      if (error) {
        setMessage(error.message);
        setCheckingProfile(false);
        return;
      }

      setHasShippingProfile(
        hasRequiredShippingProfile({
          ship_from_name: data?.ship_from_name,
          ship_from_street1: data?.ship_from_street1,
          ship_from_city: data?.ship_from_city,
          ship_from_state: data?.ship_from_state,
          ship_from_zip: data?.ship_from_zip,
          ship_from_country: data?.ship_from_country,
        })
      );

      setCheckingProfile(false);
    }

    loadShippingProfile();
  }, [router, supabase]);

  useEffect(() => {
    return () => {
      imagePreviewUrls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [imagePreviewUrls]);

  function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);

    if (files.length === 0) {
      imagePreviewUrls.forEach((url) => URL.revokeObjectURL(url));
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

    imagePreviewUrls.forEach((url) => URL.revokeObjectURL(url));
    setMessage("");
    setImageFiles(files);
    setImagePreviewUrls(files.map((file) => URL.createObjectURL(file)));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();

    if (!hasShippingProfile) {
      setMessage("Complete your full ship-from profile before creating a listing.");
      return;
    }

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

  const inputClassName =
    "w-full min-h-12 rounded-[1rem] border border-white/10 bg-white/[0.04] px-4 py-3 text-white outline-none placeholder:text-white/30 focus:border-white/20";
  const selectClassName =
    "w-full min-h-12 appearance-none rounded-[1rem] border border-white/10 bg-[#0f1117] px-4 py-3 text-white outline-none focus:border-white/20 focus:bg-[#151922]";
  const labelClassName = "mb-2 block text-sm font-medium text-white/75";

  if (checkingProfile) {
    return (
      <main className="relay-page">
        <div className="relay-site-bg" />
        <div className="relay-page-shell">
          <div className="mx-auto max-w-2xl">
            <p className="text-white">Loading seller profile...</p>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="relay-page">
      <div className="relay-site-bg" />
      <div className="relay-page-shell">
        <div className="mx-auto max-w-4xl">
          <div className="relay-page-header">
            <div>
              <p className="relay-eyebrow">Relay</p>
              <h1 className="relay-title">Create Listing</h1>
              <p className="relay-subtitle">
                Post a sneaker listing to the Relay marketplace.
              </p>
            </div>
          </div>

          {!hasShippingProfile && (
            <div className="mt-6 rounded-[1.25rem] border border-amber-300/20 bg-amber-300/[0.08] p-4 text-sm text-amber-100 backdrop-blur-xl">
              <p className="font-medium">Complete your shipping profile first.</p>
              <p className="mt-1 text-amber-100/80">
                You need your full ship-from details before you can create a listing.
              </p>
              <Link
                href="/onboarding"
                className="mt-3 inline-flex min-h-11 items-center justify-center rounded-full border border-amber-200/20 bg-amber-200/[0.10] px-4 py-2 text-sm font-medium text-amber-50 transition hover:bg-amber-200/[0.16]"
              >
                Complete Ship-From Details
              </Link>
            </div>
          )}

          <form
            onSubmit={handleSubmit}
            className="mt-8 rounded-[1.75rem] border border-white/10 bg-white/[0.04] p-4 text-white shadow-[0_10px_40px_rgba(0,0,0,0.18)] backdrop-blur-xl sm:p-6"
          >
            <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
              <div className="space-y-5">
                <div>
                  <label className={labelClassName}>Brand</label>
                  <input
                    type="text"
                    value={brand}
                    onChange={(e) => setBrand(e.target.value)}
                    placeholder="Nike"
                    className={inputClassName}
                    required
                  />
                </div>

                <div>
                  <label className={labelClassName}>Model</label>
                  <input
                    type="text"
                    value={model}
                    onChange={(e) => setModel(e.target.value)}
                    placeholder="Jordan 4"
                    className={inputClassName}
                    required
                  />
                </div>

                <div>
                  <label className={labelClassName}>Nickname</label>
                  <input
                    type="text"
                    value={nickname}
                    onChange={(e) => setNickname(e.target.value)}
                    placeholder="Bred"
                    className={inputClassName}
                  />
                </div>

                <div className="grid gap-5 sm:grid-cols-2">
                  <div>
                    <label className={labelClassName}>Size</label>
                    <input
                      type="number"
                      step="0.5"
                      value={size}
                      onChange={(e) => setSize(e.target.value)}
                      placeholder="10.5"
                      className={inputClassName}
                      required
                    />
                  </div>

                  <div>
                    <label className={labelClassName}>Condition</label>
                    <select
                      value={condition}
                      onChange={(e) => setCondition(e.target.value)}
                      className={selectClassName}
                    >
                      <option className="bg-[#0f1117] text-white">New</option>
                      <option className="bg-[#0f1117] text-white">VNDS</option>
                      <option className="bg-[#0f1117] text-white">Used</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className={labelClassName}>Price (USD)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    placeholder="315.00"
                    className={inputClassName}
                    required
                  />
                </div>

                <div>
                  <label className={labelClassName}>Shipping Weight</label>
                  <select
                    value={shippingWeightOz}
                    onChange={(e) => setShippingWeightOz(e.target.value)}
                    className={selectClassName}
                  >
                    <option value="24" className="bg-[#0f1117] text-white">
                      Light pair / no heavy extras
                    </option>
                    <option value="32" className="bg-[#0f1117] text-white">
                      Standard sneakers with box
                    </option>
                    <option value="48" className="bg-[#0f1117] text-white">
                      Heavy pair / boots / bulky box
                    </option>
                  </select>
                  <p className="mt-2 text-xs leading-5 text-white/45">
                    This is used to estimate the prepaid shipping label the buyer will pay for.
                  </p>
                </div>

                <div>
                  <label className={labelClassName}>Description</label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Clean pair, ships next day, OG all."
                    className="min-h-32 w-full rounded-[1rem] border border-white/10 bg-white/[0.04] px-4 py-3 text-white outline-none placeholder:text-white/30 focus:border-white/20"
                  />
                </div>
              </div>

              <div className="space-y-5">
                <div className="rounded-[1.35rem] border border-white/10 bg-white/[0.03] p-4">
                  <label className={labelClassName}>Listing Images</label>
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={handleFileChange}
                    className="block w-full rounded-[1rem] border border-white/10 bg-white/[0.03] px-3 py-3 text-sm text-white file:mr-4 file:rounded-full file:border-0 file:bg-white/10 file:px-3 file:py-2 file:text-white"
                    required
                  />
                  <p className="mt-2 text-xs leading-5 text-white/45">
                    Upload up to {MAX_FILES} images. The first image will be used as the cover photo.
                  </p>

                  {imagePreviewUrls.length > 0 ? (
                    <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
                      {imagePreviewUrls.map((previewUrl, index) => (
                        <div
                          key={previewUrl}
                          className="overflow-hidden rounded-[1rem] border border-white/10"
                        >
                          <img
                            src={previewUrl}
                            alt={`Preview ${index + 1}`}
                            className="h-28 w-full object-cover sm:h-32"
                          />
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="mt-4 flex min-h-[180px] items-center justify-center rounded-[1rem] border border-dashed border-white/10 bg-white/[0.02] text-sm text-white/40">
                      Your image previews will appear here.
                    </div>
                  )}
                </div>

                <div className="rounded-[1.35rem] border border-white/10 bg-white/[0.03] p-4">
                  <p className="text-sm font-medium text-white/70">Listing checklist</p>
                  <div className="mt-3 space-y-2 text-sm text-white/55">
                    <p>• Add a clear cover image</p>
                    <p>• Use the exact brand and model name</p>
                    <p>• Pick the right size and condition</p>
                    <p>• Set a realistic shipping weight</p>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading || !hasShippingProfile}
                  className="inline-flex min-h-12 w-full items-center justify-center rounded-full border border-white/10 bg-white px-4 py-3 font-semibold text-black transition hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {loading ? "Creating listing..." : "Create Listing"}
                </button>

                {message && <p className="text-sm text-white/65">{message}</p>}
              </div>
            </div>
          </form>
        </div>
      </div>
    </main>
  );
}