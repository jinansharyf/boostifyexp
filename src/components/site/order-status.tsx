// Shared order status labels + read-only badge.
// DB enum values: pending | accepted | rejected | preparing | picked_up | on_the_way | delivered | cancelled

export type OrderStatus =
  | "pending"
  | "accepted"
  | "rejected"
  | "preparing"
  | "picked_up"
  | "on_the_way"
  | "delivered"
  | "cancelled";

export const STATUS_LABEL: Record<OrderStatus, string> = {
  pending: "Pending",
  accepted: "Approved",
  rejected: "Rejected",
  preparing: "Preparing",
  picked_up: "Picked",
  on_the_way: "On the way",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

// Filter options exposed in admin/staff/partner dropdowns.
export const STATUS_FILTERS: OrderStatus[] = [
  "pending",
  "accepted",
  "rejected",
  "picked_up",
  "delivered",
  "cancelled",
];

// What partners and customers are allowed to *see* — everything else falls
// back to a friendly label, but we intentionally show the same badges.
const TONE: Record<OrderStatus, string> = {
  pending: "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/30",
  accepted: "bg-sky-100 text-sky-800 border-sky-200 dark:bg-sky-500/15 dark:text-sky-300 dark:border-sky-500/30",
  rejected: "bg-rose-100 text-rose-800 border-rose-200 dark:bg-rose-500/15 dark:text-rose-300 dark:border-rose-500/30",
  preparing: "bg-slate-100 text-slate-800 border-slate-200 dark:bg-slate-500/15 dark:text-slate-200 dark:border-slate-500/30",
  picked_up: "bg-indigo-100 text-indigo-800 border-indigo-200 dark:bg-indigo-500/15 dark:text-indigo-300 dark:border-indigo-500/30",
  on_the_way: "bg-indigo-100 text-indigo-800 border-indigo-200 dark:bg-indigo-500/15 dark:text-indigo-300 dark:border-indigo-500/30",
  delivered: "bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/30",
  cancelled: "bg-rose-100 text-rose-800 border-rose-200 dark:bg-rose-500/15 dark:text-rose-300 dark:border-rose-500/30",
};

export function StatusBadge({ status }: { status: string }) {
  const key = (status as OrderStatus) in STATUS_LABEL ? (status as OrderStatus) : "pending";
  const label = STATUS_LABEL[key] ?? String(status);
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${TONE[key]}`}>
      {label}
    </span>
  );
}