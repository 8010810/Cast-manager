import Stripe from 'stripe';

const ACCOUNT_ADD_PRICE = 'price_1TXgqSQaq3EwNY4QdQVc6rNT';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    var stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    var subscriptionId = req.body.subscriptionId;
    var quantity = Number(req.body.quantity) || 0;

    if (!subscriptionId) {
      return res.status(400).json({ error: 'subscriptionId is required' });
    }

    var subscription = await stripe.subscriptions.retrieve(subscriptionId);
    var item = subscription.items.data.find(function(i) {
      return i.price.id === ACCOUNT_ADD_PRICE;
    });

    if (!item) {
      return res.status(404).json({ error: 'ACCOUNT_ADD item not found in subscription' });
    }

    var updated = await stripe.subscriptionItems.update(item.id, {
      quantity: Math.max(0, quantity),
    });

    return res.status(200).json({ subscriptionItemId: updated.id, quantity: updated.quantity });
  } catch (_e) {
    return res.status(500).json({ error: _e.message });
  }
}
