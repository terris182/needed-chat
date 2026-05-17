import { Card } from "@/components/ui/card";

const plans = [
  {
    name: "Free",
    price: "$0",
    period: "",
    features: [
      "3 rooms",
      "Daily question + matching",
      "1-week journal lookback",
      "Ads in eligible rooms",
    ],
    cta: "Get started",
    href: "/auth",
    highlight: false,
  },
  {
    name: "Plus",
    price: "$4.99",
    period: "/mo",
    features: [
      "25 rooms",
      "No ads anywhere",
      "Full journal archive",
      "Monthly + yearly On This Day",
      "Weekly AI synthesis",
    ],
    cta: "Upgrade to Plus",
    href: "/api/checkout?plan=plus",
    highlight: true,
  },
  {
    name: "Host",
    price: "$19",
    period: "/mo",
    features: [
      "Everything in Plus",
      "Create branded rooms",
      "Pin custom prompts",
      "Room analytics dashboard",
      "Priority matching for your rooms",
    ],
    cta: "Become a Host",
    href: "/api/checkout?plan=host",
    highlight: false,
  },
];

export default function PricingPage() {
  return (
    <main className="min-h-dvh px-4 py-12 max-w-3xl mx-auto">
      <div className="text-center mb-10">
        <h1 className="text-2xl font-bold text-text-primary">Simple plans</h1>
        <p className="text-sm text-text-secondary mt-2">
          Start free. Upgrade when you want more rooms and deeper reflection.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {plans.map((plan) => (
          <Card
            key={plan.name}
            className={plan.highlight ? "border-accent ring-1 ring-accent/20" : ""}
          >
            <div className="mb-4">
              <h2 className="font-semibold text-text-primary">{plan.name}</h2>
              <p className="text-2xl font-bold text-text-primary mt-1">
                {plan.price}
                <span className="text-sm font-normal text-text-tertiary">{plan.period}</span>
              </p>
            </div>

            <ul className="space-y-2 mb-6">
              {plan.features.map((f) => (
                <li key={f} className="text-sm text-text-secondary flex items-start gap-2">
                  <span className="text-green mt-0.5">✓</span>
                  {f}
                </li>
              ))}
            </ul>

            <a
              href={plan.href}
              className={`block w-full text-center rounded-md py-2.5 text-sm font-medium transition-colors ${
                plan.highlight
                  ? "bg-accent text-white hover:bg-accent-hover"
                  : "bg-surface border border-border text-text-primary hover:bg-border-light"
              }`}
            >
              {plan.cta}
            </a>
          </Card>
        ))}
      </div>
    </main>
  );
}
