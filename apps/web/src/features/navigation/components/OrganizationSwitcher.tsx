"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import {
  TenantListSchema,
  type TenantList,
  type TenantSummary,
} from "@lab/contracts";

interface OrganizationSwitcherProps {
  activeTenant: TenantSummary;
  initialPage: TenantList;
  platformAvailable: boolean;
}

async function fetchOrganizations(
  search: string,
  cursor?: string,
  signal?: AbortSignal,
): Promise<TenantList> {
  const params = new URLSearchParams({
    search,
  });

  if (cursor) {
    params.set("cursor", cursor);
  }

  const response = await fetch(`/api/organizations?${params.toString()}`, {
    method: "GET",
    credentials: "same-origin",
    cache: "no-store",
    signal,
  });

  if (!response.ok) {
    throw new Error("Failed to load organizations");
  }

  const payload: unknown = await response.json();

  return TenantListSchema.parse(payload);
}

export function OrganizationSwitcher({
  activeTenant,
  initialPage,
  platformAvailable,
}: OrganizationSwitcherProps) {
  const [search, setSearch] = useState("");
  const [items, setItems] = useState(initialPage.items);
  const [nextCursor, setNextCursor] = useState(initialPage.nextCursor);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generation = useRef(0);

  const normalizedSearch = search.trim();

  useEffect(() => {
    if (normalizedSearch.length < 2) {
      return;
    }

    const controller = new AbortController();
    const requestGeneration = generation.current;

    const timeout = setTimeout(() => {
      void fetchOrganizations(normalizedSearch, undefined, controller.signal)
        .then((page) => {
          if (requestGeneration !== generation.current) {
            return;
          }

          setItems(page.items);
          setNextCursor(page.nextCursor);
          setError(null);
        })
        .catch(() => {
          if (
            !controller.signal.aborted &&
            requestGeneration === generation.current
          ) {
            setError("Unable to search organizations");
          }
        })
        .finally(() => {
          if (requestGeneration === generation.current) {
            setLoading(false);
          }
        });
    }, 250);

    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, [normalizedSearch]);

  function handleSearch(value: string) {
    generation.current += 1;

    setSearch(value);
    setError(null);
    setNextCursor(null);
    setItems(value.trim() ? [] : initialPage.items);

    setLoading(value.trim().length >= 2);

    if (!value.trim()) {
      setNextCursor(initialPage.nextCursor);
    }
  }

  async function handleLoadMore() {
    if (!nextCursor || loading) {
      return;
    }

    const currentGeneration = generation.current;

    setLoading(true);
    setError(null);

    try {
      const page = await fetchOrganizations(normalizedSearch, nextCursor);

      if (currentGeneration !== generation.current) {
        return;
      }

      setItems((current) => [...current, ...page.items]);
      setNextCursor(page.nextCursor);
    } catch {
      if (currentGeneration === generation.current) {
        setError("Unable to load more organizations");
      }
    } finally {
      if (currentGeneration === generation.current) {
        setLoading(false);
      }
    }
  }

  const hasNoResults =
    !loading && normalizedSearch.length !== 1 && items.length === 0;

  return (
    <details className="group relative rounded-lg border">
      <summary className="cursor-pointer px-3 py-3 focus-visible:outline-2 focus-visible:outline-offset-2">
        <span className="block font-semibold">{activeTenant.name}</span>

        <span className="text-muted-foreground block text-xs">
          {activeTenant.role} · Switch organization
        </span>
      </summary>

      <div className="border-t p-3">
        <label
          htmlFor="organization-search"
          className="mb-2 block text-sm font-medium"
        >
          Search organizations
        </label>

        <input
          id="organization-search"
          type="search"
          value={search}
          onChange={(event) => handleSearch(event.currentTarget.value)}
          autoComplete="off"
          placeholder="Organization name"
          className="w-full rounded-md border px-3 py-2 text-sm"
        />

        {normalizedSearch.length === 1 && (
          <p className="text-muted-foreground mt-2 text-xs">
            Enter at least two characters.
          </p>
        )}

        <nav aria-label="Switch organization" className="mt-3">
          <ul className="max-h-64 space-y-1 overflow-y-auto">
            {items.map((tenant) => (
              <li key={tenant.id}>
                <Link
                  href={`/t/${tenant.id}/dashboard`}
                  aria-current={
                    tenant.id === activeTenant.id ? "page" : undefined
                  }
                  className="hover:bg-foreground/5 block rounded-md px-3 py-2 focus-visible:outline-2"
                >
                  <span className="block text-sm font-medium">
                    {tenant.name}
                  </span>

                  <span className="text-muted-foreground block text-xs">
                    {tenant.role}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        {hasNoResults && (
          <p className="text-muted-foreground mt-3 text-sm">
            No organizations found.
          </p>
        )}

        {nextCursor && normalizedSearch.length !== 1 && (
          <button
            type="button"
            onClick={() => void handleLoadMore()}
            disabled={loading}
            className="mt-3 w-full rounded-md border px-3 py-2 text-sm disabled:opacity-50"
          >
            Load more
          </button>
        )}

        {loading && (
          <p role="status" className="mt-2 text-sm">
            Loading organizations...
          </p>
        )}

        {error && (
          <p role="alert" className="mt-2 text-sm">
            {error}
          </p>
        )}

        {platformAvailable && (
          <div className="mt-3 border-t pt-3">
            <Link
              href="/platform/dashboard"
              className="hover:bg-foreground/5 block rounded-md px-3 py-2 text-sm font-medium"
            >
              Platform administration
            </Link>
          </div>
        )}
      </div>
    </details>
  );
}
