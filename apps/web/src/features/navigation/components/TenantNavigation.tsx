import Link from "next/link";

import type { TenantNavigationItem } from "../config/tenantNavigation";

interface TenantNavigationProps {
  items: readonly TenantNavigationItem[];
}

export function TenantNavigation({ items }: TenantNavigationProps) {
  return (
    <nav aria-label="Organization navigation">
      <ul className="space-y-1">
        {items.map((item) => (
          <li key={item.id}>
            <Link
              href={item.href}
              className="hover:bg-foreground/5 focus-visible:outline-2 focus-visible:outline-offset-2 block rounded-lg px-3 py-2 text-sm font-medium"
            >
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
