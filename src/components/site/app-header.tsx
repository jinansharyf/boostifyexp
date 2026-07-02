import { Link, useRouter, useRouterState } from "@tanstack/react-router";
import { ArrowLeft, Home } from "lucide-react";
import { BoltLogo } from "@/components/site/public-shell";

// Root pages (no back button, show as top-level)
const ROOT_PATHS = new Set([
  "/dashboard",
  "/customer",
  "/admin",
  "/vendor",
  "/staff",
]);

// Explicit parent overrides for nested paths
const PARENT_OVERRIDES: Record<string, string> = {
  "/vendor/orders/new": "/vendor/orders",
  "/profile": "/dashboard",
  "/messages": "/dashboard",
};

// Pretty titles per route
const TITLES: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/customer": "My account",
  "/admin": "Admin",
  "/vendor": "Partner",
  "/staff": "Deliveries",
  "/messages": "Messages",
  "/profile": "Profile",
  "/admin/settings": "System settings",
  "/admin/setup": "Setup",
  "/admin/users": "Users & roles",
  "/admin/partners": "Partner applications",
  "/admin/vendors": "Vendors",
  "/admin/vendor-requests": "Change requests",
  "/admin/staff": "Delivery staff",
  "/admin/orders": "Orders",
  "/admin/pricing": "Pricing",
  "/admin/billing": "Billing",
  "/admin/order-fields": "Order form",
  "/admin/landing": "Landing content",
  "/vendor/orders": "My orders",
  "/vendor/orders/new": "New order",
  "/vendor/billing": "Billing",
  "/vendor/settings": "Business settings",
};

function getParent(pathname: string): string | null {
  if (ROOT_PATHS.has(pathname)) return null;
  if (PARENT_OVERRIDES[pathname]) return PARENT_OVERRIDES[pathname];
  const idx = pathname.lastIndexOf("/");
  if (idx <= 0) return null;
  const parent = pathname.slice(0, idx);
  return parent || "/dashboard";
}

function getTitle(pathname: string): string {
  if (TITLES[pathname]) return TITLES[pathname];
  const seg = pathname.split("/").filter(Boolean).pop() ?? "";
  return seg
    .replace(/-/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase()) || "App";
}

function homeFor(pathname: string): string {
  if (pathname.startsWith("/admin")) return "/admin";
  if (pathname.startsWith("/vendor")) return "/vendor";
  if (pathname.startsWith("/staff")) return "/staff";
  if (pathname.startsWith("/customer")) return "/customer";
  return "/dashboard";
}

export function AppHeader() {
  const router = useRouter();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  // Don't render on the auth page or unknown paths
  if (pathname === "/" || pathname.startsWith("/auth")) return null;

  const parent = getParent(pathname);
  const title = getTitle(pathname);
  const home = homeFor(pathname);
  const isRoot = parent === null;

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70">
      <div className="mx-auto flex h-14 max-w-5xl items-center gap-2 px-3 sm:px-6">
        {isRoot ? (
          <Link to={home} aria-label="Home" className="shrink-0">
            <BoltLogo className="h-9 w-9 rounded-[28%] object-contain" />
          </Link>
        ) : (
          <button
            type="button"
            onClick={() => {
              if (parent) router.navigate({ to: parent });
              else router.history.back();
            }}
            aria-label="Back"
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border bg-background text-foreground transition hover:bg-muted active:scale-95"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
        )}
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-base font-semibold leading-tight sm:text-lg">
            {title}
          </h1>
        </div>
        {!isRoot && home !== pathname && (
          <Link
            to={home}
            aria-label="Home"
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border bg-background text-muted-foreground transition hover:bg-muted hover:text-foreground active:scale-95"
          >
            <Home className="h-4 w-4" />
          </Link>
        )}
      </div>
    </header>
  );
}

export default AppHeader;