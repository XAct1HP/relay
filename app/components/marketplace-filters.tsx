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

  return (
    <form
      onSubmit={handleSubmit}
      className="mt-8 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"
    >
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-7">
        <div className="xl:col-span-2">
          <label className="mb-2 block text-sm font-medium text-slate-700">Search</label>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Jordan 4, Bred, Dunk..."
            className="w-full rounded-xl border border-slate-300 px-3 py-2.5 outline-none focus:border-slate-500"
          />
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-slate-700">Brand</label>
          <input
            type="text"
            value={brand}
            onChange={(e) => setBrand(e.target.value)}
            placeholder="Nike"
            className="w-full rounded-xl border border-slate-300 px-3 py-2.5 outline-none focus:border-slate-500"
          />
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-slate-700">Condition</label>
          <select
            value={condition}
            onChange={(e) => setCondition(e.target.value)}
            className="w-full rounded-xl border border-slate-300 px-3 py-2.5 outline-none focus:border-slate-500"
          >
            <option value="">Any</option>
            <option value="New">New</option>
            <option value="VNDS">VNDS</option>
            <option value="Used">Used</option>
          </select>
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-slate-700">Size</label>
          <input
            type="number"
            step="0.5"
            value={size}
            onChange={(e) => setSize(e.target.value)}
            placeholder="10.5"
            className="w-full rounded-xl border border-slate-300 px-3 py-2.5 outline-none focus:border-slate-500"
          />
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-slate-700">Min $</label>
          <input
            type="number"
            step="0.01"
            value={min}
            onChange={(e) => setMin(e.target.value)}
            placeholder="200"
            className="w-full rounded-xl border border-slate-300 px-3 py-2.5 outline-none focus:border-slate-500"
          />
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-slate-700">Max $</label>
          <input
            type="number"
            step="0.01"
            value={max}
            onChange={(e) => setMax(e.target.value)}
            placeholder="400"
            className="w-full rounded-xl border border-slate-300 px-3 py-2.5 outline-none focus:border-slate-500"
          />
        </div>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-[1fr_auto] md:items-end">
        <div className="max-w-xs">
          <label className="mb-2 block text-sm font-medium text-slate-700">Sort</label>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            className="w-full rounded-xl border border-slate-300 px-3 py-2.5 outline-none focus:border-slate-500"
          >
            <option value="newest">Newest</option>
            <option value="price_asc">Price: Low to High</option>
            <option value="price_desc">Price: High to Low</option>
          </select>
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            type="submit"
            className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800"
          >
            Apply Filters
          </button>

          <button
            type="button"
            onClick={handleClear}
            className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-900 hover:bg-slate-100"
          >
            Clear
          </button>
        </div>
      </div>
    </form>
  );
}