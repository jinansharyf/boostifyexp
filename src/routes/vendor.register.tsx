import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { PublicShell } from "@/components/site/public-shell";
import { useServerFn } from "@tanstack/react-start";
import { submitPartnerApplication } from "@/lib/partner-applications.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/vendor/register")({
  head: () => ({
    meta: [
      { title: "Become a Boostify business partner" },
      {
        name: "description",
        content:
          "Apply to sell on Boostify. We review every restaurant application and get back to you within 24 hours.",
      },
    ],
  }),
  component: PartnerApply,
});

function PartnerApply() {
  const navigate = useNavigate();
  const submitFn = useServerFn(submitPartnerApplication);
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [form, setForm] = useState({
    applicant_name: "",
    applicant_email: "",
    applicant_phone: "",
    store_name: "",
    cuisine: "",
    address: "",
    notes: "",
  });

  const update =
    (k: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm({ ...form, [k]: e.target.value });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await submitFn({
        data: {
          applicant_name: form.applicant_name.trim(),
          applicant_email: form.applicant_email.trim().toLowerCase(),
          applicant_phone: form.applicant_phone.trim(),
          store_name: form.store_name.trim(),
          cuisine: form.cuisine.trim() || null,
          address: form.address.trim() || null,
          notes: form.notes.trim() || null,
        },
      });
      setSubmitted(true);
      toast.success("Application received! Our team will be in touch.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <PublicShell>
        <section className="mx-auto max-w-xl px-4 py-16 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-3xl">
            ✓
          </div>
          <h1 className="mt-6 font-display text-3xl font-bold">Application received</h1>
          <p className="mt-3 text-muted-foreground">
            Thanks {form.applicant_name.split(" ")[0]}! Our partnerships team reviews every
            application and will contact you at <strong>{form.applicant_email}</strong> within 24
            hours. Once approved, you'll receive login details to manage your kitchen on Boostify.
          </p>
          <div className="mt-8 flex justify-center gap-3">
            <Link
              to="/"
              className="rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground"
            >
              Back to home
            </Link>
            <button
              onClick={() => {
                setSubmitted(false);
                setForm({
                  applicant_name: "",
                  applicant_email: "",
                  applicant_phone: "",
                  store_name: "",
                  cuisine: "",
                  address: "",
                  notes: "",
                });
              }}
              className="rounded-full border border-border px-5 py-2.5 text-sm font-semibold"
            >
              Submit another
            </button>
          </div>
        </section>
      </PublicShell>
    );
  }

  return (
    <PublicShell>
      <section className="mx-auto max-w-3xl px-4 py-10 md:py-16">
        <div className="mb-8 text-center">
          <p className="text-sm font-semibold uppercase tracking-wider text-primary">
            Partner application
          </p>
          <h1 className="mt-2 font-display text-3xl font-bold md:text-4xl">
            Grow your kitchen with Boostify
          </h1>
          <p className="mt-3 text-muted-foreground">
            Restaurants apply by request — tell us about your kitchen and we'll review within 24
            hours. Approved partners get a free dashboard to manage menu, orders, and deliveries.
          </p>
        </div>

        <form
          onSubmit={submit}
          className="space-y-6 rounded-3xl border border-border bg-card p-6 shadow-sm md:p-8"
        >
          <fieldset className="grid gap-4 md:grid-cols-2">
            <legend className="col-span-full font-display text-lg font-semibold">
              Contact person
            </legend>
            <Field
              label="Full name"
              required
              value={form.applicant_name}
              onChange={update("applicant_name")}
            />
            <Field
              label="Email"
              type="email"
              required
              value={form.applicant_email}
              onChange={update("applicant_email")}
            />
            <Field
              label="Phone"
              type="tel"
              required
              placeholder="7770000"
              value={form.applicant_phone}
              onChange={update("applicant_phone")}
            />
          </fieldset>

          <fieldset className="grid gap-4 md:grid-cols-2">
            <legend className="col-span-full font-display text-lg font-semibold">
              Restaurant details
            </legend>
            <Field
              label="Restaurant / store name"
              required
              value={form.store_name}
              onChange={update("store_name")}
            />
            <Field
              label="Cuisine"
              placeholder="e.g. Maldivian, Indian, Pizza"
              value={form.cuisine}
              onChange={update("cuisine")}
            />
            <div className="md:col-span-2">
              <label className="text-sm font-medium">Address</label>
              <textarea
                rows={2}
                value={form.address}
                onChange={update("address")}
                placeholder="e.g. M. Sunset Villa, Majeedhee Magu, Malé"
                className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
            </div>
            <div className="md:col-span-2">
              <label className="text-sm font-medium">Anything we should know?</label>
              <textarea
                rows={3}
                value={form.notes}
                onChange={update("notes")}
                placeholder="Opening hours, peak demand, special requests..."
                className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
            </div>
          </fieldset>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-full bg-primary py-3.5 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-60"
          >
            {loading ? "Submitting..." : "Submit application"}
          </button>
          <p className="text-center text-xs text-muted-foreground">
            By submitting you agree to be contacted by the Boostify partnerships team.
          </p>
        </form>
      </section>
    </PublicShell>
  );
}

function Field({ label, ...props }: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div>
      <label className="text-sm font-medium">{label}</label>
      <input
        {...props}
        className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
      />
    </div>
  );
}
