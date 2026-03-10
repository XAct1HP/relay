"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { FormEvent, useState } from "react";

export default function MarketplaceFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [query, setQuery] = useState(searchParams.get("query") ?? "");
  const [brand, setBrand] = useState(searchParams.get("brand") ?? "");
  const [condition, setCondition] = useState(searchParams.get("condition") ?? "");
  const [size, setSize] = useState(searchParams.get("size") ?? "");
  const [min, setMin] = useState(searchParams.get("min") ?? "");
  const [max, setMax] = useState(searchParams.get("max") ?? "");
  const [sort, setSort] = useState(searchParams.get("sort") ?? "newest");

  function handleSubmit(e: FormEvent) {
    e.preventDefault();

    const params = new URLSearchParams(searchParams.toString());

    if (query.trim()) params.set("query", query.trim());
    else params.delete("query");

    if (brand.trim()) params.set("brand", brand.trim());
    else params.delete("brand");

    if (condition.trim()) params.set("condition", condition.trim());
    else params.delete("condition");

    if (size.trim()) params.set("size", size.trim());
    else params.delete("size");

    if (min.trim()) params.set("min", min.trim());
    else params.delete("min");

    if (max.trim()) params.set("max", max.trim());
    else params.delete("max");

    if (sort.trim()) params.set("sort", sort);
    else params.delete("sort");

    router.push(`${pathname}?${params.toString()}`);
  }

  function handleClear() {
    setQuery("");
    setBrand("");
    setCondition("");
    setSize("");
    setMin("");
    setMax("");
    setSort("newest");
    router.push(pathname);
  }

  const inputClassName =
    "w-full rounded-2xl border border-white/10 bg-white/[0.045] px-4 py-3 text-white outline-none transition placeholder:text-white/30 focus:border-white/20 focus:bg-white/[0.06]";
  const labelClassName = "mb-2 block text-sm font-medium text-white/72";

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-[2rem] border border-white/10 bg-white/[0.05] p-5 shadow-[0_24px_70px_rgba(0,0,0,0.22)] backdrop-blur-2xl sm:p-6"
    >
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.22em] text-white/38">
            Filter marketplace
          </p>
          <p className="mt-2 text-lg font-semibold text-white">
            Refine the listings you see
          </p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-7">
        <div className="xl:col-span-2">
          <label className={labelClassName}>Search</label>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Jordan 4, Bred, Dunk..."
            className={inputClassName}
          />
        </div>

        <div>
          <label className={labelClassName}>Brand</label>
          <input
            type="text"
            value={brand}
            onChange={(e) => setBrand(e.target.value)}
            placeholder="Nike"
            className={inputClassName}
          />
        </div>

        <div>
          <label className={labelClassName}>Condition</label>
          <select
            value={condition}
            onChange={(e) => setCondition(e.target.value)}
            className={inputClassName}
          >
            <option value="">Any</option>
            <option value="New">New</option>
            <option value="VNDS">VNDS</option>
            <option value="Used">Used</option>
          </select>
        </div>

        <div>
          <label className={labelClassName}>Size</label>
          <input
            type="number"
            step="0.5"
            value={size}
            onChange={(e) => setSize(e.target.value)}
            placeholder="10.5"
            className={inputClassName}
          />
        </div>

        <div>
          <label className={labelClassName}>Min $</label>
          <input
            type="number"
            step="0.01"
            value={min}
            onChange={(e) => setMin(e.target.value)}
            placeholder="200"
            className={inputClassName}
          />
        </div>

        <div>
          <label className={labelClassName}>Max $</label>
          <input
            type="number"
            step="0.01"
            value={max}
            onChange={(e) => setMax(e.target.value)}
            placeholder="400"
            className={inputClassName}
          />
        </div>
      </div>

      <div className="mt-5 flex flex-col gap-4 border-t border-white/10 pt-5 md:flex-row md:items-end md:justify-between">
        <div className="w-full max-w-xs">
          <label className={labelClassName}>Sort</label>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            className={inputClassName}
          >
            <option value="newest">Newest</option>
            <option value="price_asc">Price: Low to High</option>
            <option value="price_desc">Price: High to Low</option>
          </select>
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            type="submit"
            className="rounded-full bg-white px-5 py-3 text-sm font-semibold text-black transition hover:bg-white/90"
          >
            Apply filters
          </button>

          <button
            type="button"
            onClick={handleClear}
            className="rounded-full border border-white/12 bg-white/[0.05] px-5 py-3 text-sm font-semibold text-white transition hover:border-white/20 hover:bg-white/[0.08]"
          >
            Clear
          </button>
        </div>
      </div>
    </form>
  );
}