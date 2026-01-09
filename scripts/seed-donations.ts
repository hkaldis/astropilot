import Stripe from 'stripe';

async function getCredentials() {
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY
    ? 'repl ' + process.env.REPL_IDENTITY
    : process.env.WEB_REPL_RENEWAL
      ? 'depl ' + process.env.WEB_REPL_RENEWAL
      : null;

  if (!xReplitToken) {
    throw new Error('X_REPLIT_TOKEN not found for repl/depl');
  }

  const connectorName = 'stripe';
  // Force production mode when SEED_PRODUCTION=1, otherwise check REPLIT_DEPLOYMENT
  const isProduction = process.env.SEED_PRODUCTION === '1' || process.env.REPLIT_DEPLOYMENT === '1';
  const targetEnvironment = isProduction ? 'production' : 'development';
  console.log(`Using Stripe ${targetEnvironment} environment`);

  const url = new URL(`https://${hostname}/api/v2/connection`);
  url.searchParams.set('include_secrets', 'true');
  url.searchParams.set('connector_names', connectorName);
  url.searchParams.set('environment', targetEnvironment);

  const response = await fetch(url.toString(), {
    headers: {
      'Accept': 'application/json',
      'X_REPLIT_TOKEN': xReplitToken
    }
  });

  const data = await response.json();
  
  const connectionSettings = data.items?.[0];

  if (!connectionSettings || (!connectionSettings.settings.publishable || !connectionSettings.settings.secret)) {
    throw new Error(`Stripe ${targetEnvironment} connection not found`);
  }

  return {
    publishableKey: connectionSettings.settings.publishable,
    secretKey: connectionSettings.settings.secret,
  };
}

const DONATION_PRODUCTS = [
  {
    name: 'Small Beer',
    description: 'A small token of appreciation for clear skies!',
    amount: 500, // 5 EUR in cents
    lookupKey: 'donation_5',
  },
  {
    name: 'Medium Beer',
    description: 'Support the development of AstroPilot!',
    amount: 1000, // 10 EUR
    lookupKey: 'donation_10',
  },
  {
    name: 'Large Beer',
    description: 'Generous support for astronomy enthusiasts!',
    amount: 5000, // 50 EUR
    lookupKey: 'donation_50',
  },
];

async function seedDonationProducts() {
  console.log('Seeding donation products...');
  
  const { secretKey } = await getCredentials();
  const stripe = new Stripe(secretKey, {
    apiVersion: '2025-11-17.clover' as any,
  });

  for (const donation of DONATION_PRODUCTS) {
    try {
      // Check if product already exists
      const existingProducts = await stripe.products.search({
        query: `metadata['type']:'donation' AND metadata['lookup_key']:'${donation.lookupKey}'`,
      });

      if (existingProducts.data.length > 0) {
        console.log(`Product "${donation.name}" already exists, skipping...`);
        continue;
      }

      // Create product
      const product = await stripe.products.create({
        name: donation.name,
        description: donation.description,
        metadata: {
          type: 'donation',
          lookup_key: donation.lookupKey,
        },
      });

      // Create price
      await stripe.prices.create({
        product: product.id,
        unit_amount: donation.amount,
        currency: 'eur',
        lookup_key: donation.lookupKey,
        metadata: {
          type: 'donation',
        },
      });

      console.log(`Created donation product: ${donation.name} (${donation.amount / 100} EUR)`);
    } catch (error) {
      console.error(`Error creating ${donation.name}:`, error);
    }
  }

  console.log('Donation products seeded successfully!');
}

seedDonationProducts().catch(console.error);
