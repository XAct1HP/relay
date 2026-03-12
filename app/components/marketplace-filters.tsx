"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { FormEvent, useMemo, useState } from "react";

type FilterFieldsProps = {
  query: string;
  setQuery: (value: string) => void;
  brand: string;
  setBrand: (value: string) => void;
  condition: string;
  setCondition: (value: string) => void;
  size: string;
  setSize: (value: string) => void;
  min: string;
  setMin: (value: string) => void;
  max: string;
  setMax: (value: string) => void;
  sort: string;
  setSort: (value: string) => void;
  inputClassName: string;
  selectClassName: string;
  labelClassName: string;
};

function FilterFields({
  query,
  setQuery,
  brand,
  setBrand,
  condition,
  setCondition,
  size,
  setSize,
  min,
  setMin,
  max,
  setMax,
  sort,
  setSort,
  inputClassName,
  selectClassName,
  labelClassName,
}: FilterFieldsProps) {
  return (
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
          className={selectClassName}
        >
          <option value="" className="bg-[#0f1117] text-white">
            Any
          </option>
          <option value="New" className="bg-[#0f1117] text-white">
            New
          </option>
          <option value="Used" className="bg-[#0f1117] text-white">
            Used
          </option>
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
        <label className={labelClassName}>Min Price</label>
        <input
          type="number"
          value={min}
          onChange={(e) => setMin(e.target.value)}
          placeholder="100"
          className={inputClassName}
        />
      </div>

      <div>
        <label className={labelClassName}>Max Price</label>
        <input
          type="number"
          value={max}
          onChange={(e) => setMax(e.target.value)}
          placeholder="400"
          className={inputClassName}
        />
      </div>

      <div className="md:col-span-2 xl:col-span-3">
        <label className={labelClassName}>Sort</label>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value)}
          className={selectClassName}
        >
          <option value="newest" className="bg-[#0f1117] text-white">
            Newest
          </option>
          <option value="price_asc" className="bg-[#0f1117] text-white">
            Price: Low to High
          </option>
          <option value="price_desc" className="bg-[#0f1117] text-white">
            Price: High to Low
          </option>
        </select>
      </div>
    </div>
  );
}

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
  const [mobileOpen, setMobileOpen] = useState(false);

  const activeFilterCount = useMemo(
    () =>
      [query, brand, condition, size, min, max, sort !== "newest" ? sort : ""].filter(
        Boolean
      ).length,
    [query, brand, condition, size, min, max, sort]
  );

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

    const nextUrl = `${pathname}?${params.toString()}`;
    router.push(nextUrl);
    setMobileOpen(false);
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
    setMobileOpen(false);
  }

  const inputClassName =
    "w-full rounded-2xl border border-white/10 bg-white/[0.045] px-4 py-3 text-white outline-none transition placeholder:text-white/30 focus:border-white/20 focus:bg-white/[0.06]";
  const selectClassName =
    "w-full appearance-none rounded-2xl border border-white/10 bg-[#0f1117] px-4 py-3 text-white outline-none transition focus:border-white/20 focus:bg-[#151922]";
  const labelClassName = "mb-2 block text-sm font-medium text-white/72";

  return (
    <>
      <div className="mt-6 flex items-center justify-between gap-3 md:hidden">
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          className="inline-flex min-h-11 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.05] px-4 py-3 text-sm font-semibold text-white shadow-[0_24px_70px_rgba(0,0,0,0.22)] backdrop-blur-2xl transition hover:bg-white/[0.08]"
        >
          Filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ""}
        </button>

        <div className="rounded-2xl border border-white/10 bg-white/[0.05] px-4 py-3 text-sm text-white/65 shadow-[0_24px_70px_rgba(0,0,0,0.22)] backdrop-blur-2xl">
          Sort: <span className="text-white">{sort.replace("_", " ")}</span>
        </div>
      </div>

      <form
        onSubmit={handleSubmit}
        className="mt-6 hidden rounded-[2rem] border border-white/10 bg-white/[0.05] p-5 shadow-[0_24px_70px_rgba(0,0,0,0.22)] backdrop-blur-2xl sm:p-6 md:block"
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

        <FilterFields
          query={query}
          setQuery={setQuery}
          brand={brand}
          setBrand={setBrand}
          condition={condition}
          setCondition={setCondition}
          size={size}
          setSize={setSize}
          min={min}
          setMin={setMin}
          max={max}
          setMax={setMax}
          sort={sort}
          setSort={setSort}
          inputClassName={inputClassName}
          selectClassName={selectClassName}
          labelClassName={labelClassName}
        />
      </form>

      {mobileOpen && (
        <div className="fixed inset-0 z-[130] md:hidden">
          <button
            type="button"
            aria-label="Close filters"
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
          />

          <div className="absolute inset-x-0 bottom-0 max-h-[88dvh] overflow-y-auto rounded-t-[2rem] border-t border-white/10 bg-[#090b10] p-4 shadow-[0_-24px_80px_rgba(0,0,0,0.45)]">
            <div className="mx-auto mb-4 h-1.5 w-14 rounded-full bg-white/15" />

            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs uppercase tracking-[0.22em] text-white/38">
                    Filter marketplace
                  </p>
                  <p className="mt-2 text-lg font-semibold text-white">
                    Refine the listings you see
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setMobileOpen(false)}
                  className="inline-flex min-h-10 items-center justify-center rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm font-medium text-white transition hover:bg-white/10"
                >
                  Close
                </button>
              </div>

              <FilterFields
                query={query}
                setQuery={setQuery}
                brand={brand}
                setBrand={setBrand}
                condition={condition}
                setCondition={setCondition}
                size={size}
                setSize={setSize}
                min={min}
                setMin={setMin}
                max={max}
                setMax={setMax}
                sort={sort}
                setSort={setSort}
                inputClassName={inputClassName}
                selectClassName={selectClassName}
                labelClassName={labelClassName}
              />

              <div className="grid grid-cols-2 gap-3 pb-2">
                <button
                  type="button"
                  onClick={handleClear}
                  className="inline-flex min-h-12 items-center justify-center rounded-2xl border border-white/12 bg-white/[0.05] px-5 py-3 text-sm font-semibold text-white transition hover:border-white/20 hover:bg-white/[0.08]"
                >
                  Clear
                </button>

                <button
                  type="submit"
                  className="inline-flex min-h-12 items-center justify-center rounded-2xl bg-white px-5 py-3 text-sm font-semibold text-black transition hover:bg-white/90"
                >
                  Apply
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}