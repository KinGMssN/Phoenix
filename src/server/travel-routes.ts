import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { z } from 'zod';

const planInput = z
  .object({
    origin: z.string().trim().min(2).max(80),
    destination: z.string().trim().min(2).max(80),
    departure: z.string().date(),
    returnDate: z.string().date(),
    travelers: z.number().int().min(1).max(8),
    budget: z.number().int().min(1000).max(10_000_000),
  })
  .refine((trip) => trip.returnDate > trip.departure, {
    message: 'Return date must be after departure.',
    path: ['returnDate'],
  })
  .refine((trip) => trip.departure >= new Date().toISOString().slice(0, 10), {
    message: 'Departure date cannot be in the past.',
    path: ['departure'],
  })
  .refine(
    (trip) =>
      Date.parse(trip.returnDate) - Date.parse(trip.departure) <=
      30 * 86_400_000,
    {
      message: 'Trips can be up to 30 nights in demo mode.',
      path: ['returnDate'],
    },
  );

const bookingInput = z.object({
  itemId: z.string().min(1).max(80),
  itemName: z.string().min(1).max(120),
  category: z.enum(['transport', 'hotel', 'local']),
  price: z.number().int().min(0).max(10_000_000),
  trip: planInput,
});

const assistantInput = z.object({
  message: z.string().trim().min(1).max(1200),
  trip: planInput,
  budget: z.object({
    total: z.number().min(0).max(10_000_000),
    remaining: z.number().min(-10_000_000).max(10_000_000),
    selected: z.array(z.object({ name: z.string().max(120), price: z.number().min(0).max(10_000_000) })).max(8),
  }),
});

type Trip = z.infer<typeof planInput>;
type TravelOption = {
  id: string;
  name: string;
  mode?: string;
  direction?: string;
  depart?: string;
  arrive?: string;
  duration?: string;
  price: number;
  note: string;
  style?: string;
  rating?: string;
  perNight?: number;
};
type Itinerary = {
  days: {
    day: number;
    title: string;
    morning: string;
    afternoon: string;
    evening: string;
  }[];
  source: 'Groq' | 'demo planner';
  warning: string;
};
type Optimization = {
  total: number;
  categories: { transport: number; hotel: number; local: number };
  remaining: number;
  withinBudget: boolean;
  savings: number;
  recommendation: string;
};
type PlanResult = {
  trip: Trip;
  nights: number;
  transport: TravelOption[];
  hotels: TravelOption[];
  local: TravelOption[];
  itinerary: Itinerary;
  optimization: Optimization;
  demo: true;
};
type WorkflowEvent =
  | {
      type: 'stage';
      index: number;
      status: 'in_progress' | 'completed';
      message: string;
      completed: number;
      total: 7;
    }
  | { type: 'result'; plan: PlanResult };

function tripNights(trip: Trip) {
  return Math.max(
    1,
    Math.round(
      (Date.parse(trip.returnDate) - Date.parse(trip.departure)) / 86_400_000,
    ),
  );
}

function transportOptions(trip: Trip): TravelOption[] {
  const people = trip.travelers;
  const distanceFactor = Math.min(
    1.5,
    Math.max(0.7, trip.destination.length / 8),
  );
  return [
    {
      id: 'flight-out',
      name: 'SkyHop Airways',
      mode: 'Flight',
      direction: 'Outbound',
      depart: '08:15',
      arrive: '10:40',
      duration: '2h 25m',
      price: Math.round(4900 * distanceFactor) * people,
      note: 'Direct · cabin bag included',
    },
    {
      id: 'train-out',
      name: 'InterCity Express',
      mode: 'Train',
      direction: 'Outbound',
      depart: '06:30',
      arrive: '13:10',
      duration: '6h 40m',
      price: Math.round(1850 * distanceFactor) * people,
      note: 'AC chair car · limited demo seats',
    },
    {
      id: 'bus-out',
      name: 'RoadRunner Sleeper',
      mode: 'Bus',
      direction: 'Outbound',
      depart: '21:00',
      arrive: '06:15',
      duration: '9h 15m',
      price: Math.round(1250 * distanceFactor) * people,
      note: 'AC sleeper · overnight',
    },
    {
      id: 'flight-back',
      name: 'SkyHop Airways',
      mode: 'Flight',
      direction: 'Return',
      depart: '17:20',
      arrive: '19:45',
      duration: '2h 25m',
      price: Math.round(5100 * distanceFactor) * people,
      note: 'Direct · cabin bag included',
    },
    {
      id: 'train-back',
      name: 'InterCity Express',
      mode: 'Train',
      direction: 'Return',
      depart: '14:00',
      arrive: '20:40',
      duration: '6h 40m',
      price: Math.round(1900 * distanceFactor) * people,
      note: 'AC chair car · limited demo seats',
    },
    {
      id: 'bus-back',
      name: 'RoadRunner Sleeper',
      mode: 'Bus',
      direction: 'Return',
      depart: '20:30',
      arrive: '05:45',
      duration: '9h 15m',
      price: Math.round(1300 * distanceFactor) * people,
      note: 'AC sleeper · overnight',
    },
  ];
}

function hotelOptions(nights: number): TravelOption[] {
  return [
    {
      id: 'hotel-nest',
      name: 'The City Nest',
      style: 'Boutique stay',
      rating: '4.8',
      price: 3200 * nights,
      perNight: 3200,
      note: 'Breakfast · central neighborhood',
    },
    {
      id: 'hotel-garden',
      name: 'Garden House Hotel',
      style: 'Comfort stay',
      rating: '4.6',
      price: 2400 * nights,
      perNight: 2400,
      note: 'Garden view · free cancellation (demo)',
    },
    {
      id: 'hotel-pod',
      name: 'Pod & Go',
      style: 'Smart budget stay',
      rating: '4.4',
      price: 1450 * nights,
      perNight: 1450,
      note: 'Compact rooms · near transit',
    },
  ];
}

function localOptions(nights: number): TravelOption[] {
  return [
    {
      id: 'taxi',
      name: 'City taxi',
      mode: 'Taxi',
      price: 1100 * nights,
      note: 'Airport transfer + daily rides estimate',
    },
    {
      id: 'bike',
      name: 'Rapido-style bike',
      mode: 'Bike ride',
      price: 480 * nights,
      note: 'Short hops · solo rider estimate',
    },
  ];
}

function optimizeBudget(
  trip: Trip,
  transport: TravelOption[],
  hotels: TravelOption[],
  local: TravelOption[],
): Optimization {
  const cheapest = (items: TravelOption[]) =>
    Math.min(...items.map((item) => item.price));
  const outbound = transport.filter((item) => item.direction === 'Outbound');
  const inbound = transport.filter((item) => item.direction === 'Return');
  const categories = {
    transport: cheapest(outbound) + cheapest(inbound),
    hotel: cheapest(hotels),
    local: cheapest(local),
  };
  const total = Object.values(categories).reduce(
    (sum, value) => sum + value,
    0,
  );
  const remaining = trip.budget - total;
  const flightTotal =
    (outbound.find((item) => item.mode === 'Flight')?.price ?? 0) +
    (inbound.find((item) => item.mode === 'Flight')?.price ?? 0);
  const comfortStay =
    hotels.find((item) => item.style === 'Comfort stay')?.price ?? 0;
  const taxi = local.find((item) => item.mode === 'Taxi')?.price ?? 0;
  const savings =
    flightTotal -
    categories.transport +
    comfortStay -
    categories.hotel +
    taxi -
    categories.local;
  return {
    total,
    categories,
    remaining,
    withinBudget: remaining >= 0,
    savings,
    recommendation:
      remaining >= 0
        ? `The value combination leaves ${remaining} within your budget.`
        : `The value combination is still ${Math.abs(remaining)} over budget. Consider shortening the stay.`,
  };
}

async function itineraryFor(trip: Trip, nights: number): Promise<Itinerary> {
  const fallback = Array.from({ length: nights + 1 }, (_, index) => ({
    day: index + 1,
    title:
      index === 0
        ? `Arrive in ${trip.destination}`
        : index === nights
          ? 'A slow morning & return'
          : `Explore ${trip.destination}`,
    morning:
      index === 0
        ? 'Check in, settle in, and get oriented.'
        : 'Start with a local breakfast and a neighborhood walk.',
    afternoon:
      index === nights
        ? 'Enjoy a final local lunch, then head to your return connection.'
        : 'Visit a signature landmark and leave time for a relaxed lunch.',
    evening:
      index === 0
        ? 'Dinner close to your stay; keep the first evening easy.'
        : 'Pick a well-reviewed local dinner and stroll nearby.',
  }));
  const key = process.env.GROQ_API_KEY;
  if (!key) return { days: fallback, source: 'demo planner', warning: '' };
  try {
    const response = await fetch(
      'https://api.groq.com/openai/v1/chat/completions',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json',
        },
        signal: AbortSignal.timeout(12_000),
        body: JSON.stringify({
          model: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
          temperature: 0.4,
          response_format: { type: 'json_object' },
          messages: [
            {
              role: 'system',
              content:
                'Create a practical travel itinerary. Return JSON with a days array. Each day needs day (number), title, morning, afternoon, evening (strings). Do not invent bookings, schedules, opening hours, or claim live research. State suggestions are illustrative.',
            },
            {
              role: 'user',
              content: JSON.stringify({
                origin: trip.origin,
                destination: trip.destination,
                departure: trip.departure,
                returnDate: trip.returnDate,
                travelers: trip.travelers,
                days: nights + 1,
              }),
            },
          ],
        }),
      },
    );
    if (!response.ok) throw new Error(`Groq responded ${response.status}`);
    const payload = (await response.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const content = payload.choices?.[0]?.message?.content;
    if (!content) throw new Error('Groq returned no itinerary');
    const parsed = JSON.parse(content) as { days?: typeof fallback };
    if (!Array.isArray(parsed.days) || parsed.days.length !== nights + 1)
      throw new Error('Groq itinerary has an unexpected shape');
    return {
      days: parsed.days.map((day, index) => ({
        day: index + 1,
        title: String(day.title || `Explore ${trip.destination}`).slice(0, 100),
        morning: String(day.morning || fallback[index].morning).slice(0, 300),
        afternoon: String(day.afternoon || fallback[index].afternoon).slice(
          0,
          300,
        ),
        evening: String(day.evening || fallback[index].evening).slice(0, 300),
      })),
      source: 'Groq',
      warning: '',
    };
  } catch (error) {
    console.error(
      'Groq itinerary request failed:',
      error instanceof Error ? error.message : 'unknown error',
    );
    return {
      days: fallback,
      source: 'demo planner',
      warning:
        'Groq was unavailable, so Phoenix used its built-in demo itinerary. Check GROQ_API_KEY and retry to generate AI itinerary suggestions.',
    };
  }
}

async function* planWorkflow(trip: Trip): AsyncGenerator<WorkflowEvent> {
  let completed = 0;
  const start = (index: number, message: string): WorkflowEvent => ({
    type: 'stage',
    index,
    status: 'in_progress',
    message,
    completed,
    total: 7,
  });
  const done = (index: number, message: string): WorkflowEvent => {
    completed += 1;
    return {
      type: 'stage',
      index,
      status: 'completed',
      message,
      completed,
      total: 7,
    };
  };

  yield start(0, 'Checking route, dates, traveler count, and budget.');
  const nights = tripNights(trip);
  yield done(
    0,
    `Preferences checked for ${trip.travelers} traveler${trip.travelers === 1 ? '' : 's'} and ${nights} night${nights === 1 ? '' : 's'}.`,
  );

  yield start(
    1,
    'Comparing demo flight, train, and bus options in both directions.',
  );
  const transport = transportOptions(trip);
  yield done(
    1,
    `Compared ${transport.length / 2} demo modes outbound and on return.`,
  );

  yield start(2, 'Matching demo stays to the trip length.');
  const hotels = hotelOptions(nights);
  yield done(2, `Found ${hotels.length} demo stays with full-trip prices.`);

  yield start(
    3,
    process.env.GROQ_API_KEY
      ? 'Asking Groq for a day-by-day itinerary.'
      : 'Building an illustrative day-by-day demo itinerary.',
  );
  const itinerary = await itineraryFor(trip, nights);
  yield done(
    3,
    itinerary.warning ||
      `Prepared ${itinerary.days.length} itinerary days using ${itinerary.source}.`,
  );

  yield start(4, 'Preparing taxi and Rapido-style bike ride estimates.');
  const local = localOptions(nights);
  yield done(
    4,
    `Added ${local.map((option) => option.mode).join(' and ')} demo estimates.`,
  );

  yield start(
    5,
    'Adding category totals and finding the lowest-cost combination.',
  );
  const optimization = optimizeBudget(trip, transport, hotels, local);
  yield done(
    5,
    `Lowest demo combination: ₹${optimization.total}. ${optimization.recommendation}`,
  );

  yield start(6, 'Checking every section and assembling the trip plan.');
  const plan: PlanResult = {
    trip,
    nights,
    transport,
    hotels,
    local,
    itinerary,
    optimization,
    demo: true,
  };
  yield done(6, 'All trip sections are ready to review.');
  yield { type: 'result', plan };
}

async function parseTrip(c: { req: { json: () => Promise<unknown> } }) {
  const body = await c.req.json().catch(() => null);
  return planInput.safeParse(body);
}

export function travelRoutes() {
  const app = new Hono();
  app.post('/travel/plan/stream', async (c) => {
    const parsed = await parseTrip(c);
    if (!parsed.success)
      return c.json(
        {
          error: parsed.error.issues[0]?.message || 'Check your trip details.',
        },
        400,
      );
    return streamSSE(c, async (stream) => {
      try {
        for await (const event of planWorkflow(parsed.data)) {
          await stream.writeSSE({
            event: event.type,
            data: JSON.stringify(event),
          });
        }
      } catch {
        await stream.writeSSE({
          event: 'error',
          data: JSON.stringify({
            error: 'Phoenix could not finish planning. Please retry.',
          }),
        });
      }
    });
  });
  app.post('/travel/plan', async (c) => {
    const parsed = await parseTrip(c);
    if (!parsed.success)
      return c.json(
        {
          error: parsed.error.issues[0]?.message || 'Check your trip details.',
        },
        400,
      );
    let result: PlanResult | undefined;
    for await (const event of planWorkflow(parsed.data))
      if (event.type === 'result') result = event.plan;
    return c.json(result);
  });
  app.post('/travel/assistant', async (c) => {
    const parsed = assistantInput.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: 'Send a message about this trip plan.' }, 400);
    const { message, trip, budget } = parsed.data;
    const key = process.env.GROQ_API_KEY;
    if (!key) {
      const lower = message.toLowerCase();
      const reply = lower.includes('budget') || lower.includes('cheap') || lower.includes('cost')
        ? `Your current selected demo estimate is ₹${budget.total.toLocaleString('en-IN')} with ₹${budget.remaining.toLocaleString('en-IN')} ${budget.remaining >= 0 ? 'remaining' : 'over budget'}. Use “Apply lowest-cost demo options” to switch to the cheapest listed transport, stay, and local ride estimates.`
        : `I’m looking at your ${trip.origin} to ${trip.destination} demo trip for ${trip.travelers} traveler${trip.travelers === 1 ? '' : 's'}. You can change route and dates with Edit trip, choose different demo transport, stay, and ride options in the plan, or ask me for a budget suggestion. These are estimates only; I cannot change or make real reservations.`;
      return c.json({ reply, source: 'demo assistant' });
    }
    try {
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(12_000),
        body: JSON.stringify({
          model: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
          temperature: 0.35,
          max_tokens: 350,
          messages: [
            { role: 'system', content: 'You are Phoenix, a concise travel planning assistant. Help the user adjust or understand the supplied illustrative trip. Suggest specific options/actions, but do not claim to modify the plan, make bookings, contact providers, or charge payment. All schedules, prices, and reservations are DEMO data. The UI can apply the lowest-cost listed combination, and the user can edit route/dates or choose options.' },
            { role: 'user', content: JSON.stringify({ request: message, trip, selectedEstimate: budget }) },
          ],
        }),
      });
      if (!response.ok) throw new Error(`Groq responded ${response.status}`);
      const payload = await response.json() as { choices?: { message?: { content?: string } }[] };
      const reply = payload.choices?.[0]?.message?.content?.trim();
      if (!reply) throw new Error('Groq returned no reply');
      return c.json({ reply: reply.slice(0, 1800), source: 'Groq' });
    } catch {
      return c.json({ reply: 'The AI service could not be reached. You can still change options directly, or use “Apply lowest-cost demo options” to update the estimate.', source: 'demo assistant' });
    }
  });
  app.post('/travel/book', async (c) => {
    const parsed = bookingInput.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success)
      return c.json({ error: 'Reservation details are invalid.' }, 400);
    const ref = `DEMO-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
    return c.json(
      {
        demo: true,
        status: 'simulated',
        reference: ref,
        itemName: parsed.data.itemName,
        price: parsed.data.price,
        message:
          'Demo reservation simulated. No real booking or payment was made.',
      },
      201,
    );
  });
  return app;
}
