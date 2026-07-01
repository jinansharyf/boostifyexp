import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/vendor/orders/new")({
  beforeLoad: () => { throw redirect({ to: "/vendor/orders" }); },
  component: () => null,
});
