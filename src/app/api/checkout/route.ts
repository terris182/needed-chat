import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "@/lib/supabase/server";

let _stripe: Stripe | null = null;
function getStripe() {
  if (!_stripe) _stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
  return _stripe;
}

const PRICES: Record<string, { price: number; name: string }> = {
  plus: { price: 499, name: "needed.chat Plus" },
  host: { price: 1900, name: "needed.chat Host" },
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const plan = searchParams.get("plan");

  if (!plan || !PRICES[plan]) {
    return NextResponse.json({ error: "Invalid plan" }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(new URL("/auth", request.url));
  }

  const session = await getStripe().checkout.sessions.create({
    payment_method_types: ["card"],
    mode: "subscription",
    line_items: [
      {
        price_data: {
          currency: "usd",
          product_data: { name: PRICES[plan].name },
          unit_amount: PRICES[plan].price,
          recurring: { interval: "month" },
        },
        quantity: 1,
      },
    ],
    metadata: { user_id: user.id, plan },
    success_url: `${process.env.NEXT_PUBLIC_APP_URL}/settings?upgraded=${plan}`,
    cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/pricing`,
  });

  return NextResponse.redirect(session.url!);
}
