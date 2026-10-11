import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeftRight,
  ArrowRight,
  Bike,
  Bot,
  CalendarDays,
  Check,
  CircleDollarSign,
  Clock3,
  Compass,
  Hotel,
  MapPin,
  Plane,
  ShieldCheck,
  TrainFront,
  BusFront,
  CarTaxiFront,
  LoaderCircle,
  Sparkles,
  Send,
  Wallet,
  X,
} from 'lucide-react';

type Trip = {
  origin: string;
  destination: string;
  departure: string;
  returnDate: string;
  travelers: number;
  budget: number;
};
type Option = {
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
type Plan = {
  trip: Trip;
  nights: number;
  transport: Option[];
  hotels: Option[];
  local: Option[];
  itinerary: {
    days: {
      day: number;
      title: string;
      morning: string;
      afternoon: string;
      evening: string;
    }[];
    source: string;
    warning?: string;
  };
  optimization: {
    total: number;
    categories: { transport: number; hotel: number; local: number };
    remaining: number;
    withinBudget: boolean;
    savings: number;
    recommendation: string;
  };
  demo: true;
};
type StageStatus = 'pending' | 'in_progress' | 'completed' | 'failed';
type PlanningStage = {
  title: string;
  agent: string;
  task: string;
  status: StageStatus;
  message: string;
};

const stageDefinitions = [
  {
    title: 'Understanding travel preferences',
    agent: 'Travel Coordinator',
    task: 'Validate your route, dates, group size, and budget.',
  },
  {
    title: 'Comparing outbound and return transport',
    agent: 'Transport Planner',
    task: 'Compare demo flight, train, and bus options in both directions.',
  },
  {
    title: 'Finding suitable hotels',
    agent: 'Hotel Planner',
    task: 'Match demo stays to your dates and compare the full stay cost.',
  },
  {
    title: 'Building the daily itinerary',
    agent: 'Itinerary Planner',
    task: 'Create a day-by-day sketch with Groq or the built-in demo planner.',
  },
  {
    title: 'Planning local transportation',
    agent: 'Local Mobility Planner',
    task: 'Estimate demo taxi and Rapido-style bike ride costs.',
  },
  {
    title: 'Optimizing the travel budget',
    agent: 'Budget Optimizer',
    task: 'Calculate category totals and find the lowest-cost demo combination.',
  },
  {
    title: 'Finalizing the travel plan',
    agent: 'Travel Coordinator',
    task: 'Check the completed sections and assemble your results.',
  },
];
const initialStages = (): PlanningStage[] =>
  stageDefinitions.map((stage) => ({
    ...stage,
    status: 'pending',
    message: 'Waiting for planning to start.',
  }));
type Booking = {
  reference: string;
  itemName: string;
  price: number;
  message: string;
  demo: true;
};
const DEMO_AUTHORIZATION_PIN = '2468';

const today = new Date();
const iso = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const departure = new Date(today);
departure.setDate(today.getDate() + 20);
const returnDate = new Date(departure);
returnDate.setDate(departure.getDate() + 3);
const money = (value: number) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(value);
const icons = {
  Flight: Plane,
  Train: TrainFront,
  Bus: BusFront,
  Taxi: CarTaxiFront,
  'Bike ride': Bike,
};

export function TravelPlanner() {
  const [trip, setTrip] = useState<Trip>({
    origin: 'Mumbai',
    destination: 'Delhi',
    departure: iso(departure),
    returnDate: iso(returnDate),
    travelers: 2,
    budget: 42000,
  });
  const [plan, setPlan] = useState<Plan>();
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');
  const [booking, setBooking] = useState<Booking>();
  const [bookedItems, setBookedItems] = useState<Set<string>>(() => new Set());
  const [bookingEmail, setBookingEmail] = useState('');
  const [emailAddress, setEmailAddress] = useState('');
  const [authorizationPin, setAuthorizationPin] = useState('');
  const [checkoutError, setCheckoutError] = useState('');
  const [pending, setPending] = useState<Option>();
  const [activeTab, setActiveTab] = useState('outbound journey');
  const [detailView, setDetailView] = useState<string>();
  const [page, setPage] = useState<'start' | 'plan'>('start');
  const [planReady, setPlanReady] = useState(false);
  const [transitioning, setTransitioning] = useState(false);
  const [budgetOpen, setBudgetOpen] = useState(false);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [assistantDraft, setAssistantDraft] = useState('');
  const [assistantBusy, setAssistantBusy] = useState(false);
  const [assistantMessages, setAssistantMessages] = useState<{ role: 'assistant' | 'user'; text: string }[]>([]);
  const bookingStorageKey = `phoenix-demo-bookings-${trip.origin}-${trip.destination}-${trip.departure}-${trip.returnDate}-${trip.travelers}-${trip.budget}`;
  useEffect(() => {
    try {
      const saved = localStorage.getItem(bookingStorageKey);
      setBookedItems(new Set(saved ? JSON.parse(saved) as string[] : []));
    } catch {
      setBookedItems(new Set());
    }
  }, [bookingStorageKey]);
  useEffect(() => {
    const syncPage = () =>
      setPage(location.pathname === '/travel/plan' ? 'plan' : 'start');
    window.addEventListener('popstate', syncPage);
    return () => window.removeEventListener('popstate', syncPage);
  }, []);
  useEffect(() => {
    if (!detailView) return;
    window.scrollTo({ top: 0, behavior: 'smooth' });
    const modal = document.querySelector<HTMLElement>('.travel-details-modal');
    if (modal) modal.scrollTop = 0;
  }, [detailView]);
  const [selected, setSelected] = useState<Record<string, string>>({
    outbound: 'flight-out',
    inbound: 'flight-back',
    hotel: 'hotel-garden',
    local: 'taxi',
  });
  const [stages, setStages] = useState<PlanningStage[]>(initialStages);
  const [activity, setActivity] = useState<string[]>([]);
  const completedStages = stages.filter(
    (stage) => stage.status === 'completed',
  ).length;
  const planningProgress = Math.round(
    (completedStages / stageDefinitions.length) * 100,
  );
  const agents = [
    {
      name: 'Travel Coordinator',
      stage: stages[6].status === 'pending' ? stages[0] : stages[6],
      badge: 'ORCHESTRATOR',
    },
    { name: 'Transport Planner', stage: stages[1], badge: 'DEMO COMPONENT' },
    { name: 'Hotel Planner', stage: stages[2], badge: 'DEMO COMPONENT' },
    {
      name: 'Itinerary Planner',
      stage: stages[3],
      badge:
        plan?.itinerary.source === 'Groq'
          ? 'GROQ + DEMO DATA'
          : 'DEMO COMPONENT',
    },
    {
      name: 'Local Mobility Planner',
      stage: stages[4],
      badge: 'DEMO COMPONENT',
    },
    { name: 'Budget Optimizer', stage: stages[5], badge: 'DEMO COMPONENT' },
  ];
  const selectedTransport = useMemo(
    () =>
      plan?.transport.filter(
        (item) => item.id === selected.outbound || item.id === selected.inbound,
      ) || [],
    [plan, selected],
  );
  const expenses = plan
    ? [
        ...selectedTransport,
        ...plan.hotels.filter((item) => item.id === selected.hotel),
        ...plan.local.filter((item) => item.id === selected.local),
      ]
    : [];
  const total = expenses.reduce((sum, item) => sum + item.price, 0);
  const remaining = trip.budget - total;
  const progress = Math.min(100, Math.round((total / trip.budget) * 100));
  function isSectionConfirmed(tab: string) {
    if (bookedItems.has('trip-package'))
      return ['outbound journey', 'return journey', 'stays', 'local rides', 'itinerary'].includes(tab);
    if (!plan) return false;
    if (tab === 'outbound journey') return plan.transport.some((item) => item.direction === 'Outbound' && bookedItems.has(item.id));
    if (tab === 'return journey') return plan.transport.some((item) => item.direction === 'Return' && bookedItems.has(item.id));
    if (tab === 'stays') return plan.hotels.some((item) => bookedItems.has(item.id));
    if (tab === 'local rides') return plan.local.some((item) => bookedItems.has(item.id));
    return false;
  }
  const setField = (key: keyof Trip, value: string | number) => {
    setTrip((current) => ({ ...current, [key]: value }));
    setPlan(undefined);
    if (page === 'plan') {
      setPage('start');
      history.pushState(null, '', '/travel');
    }
  };

  async function buildPlan(event: React.FormEvent) {
    event.preventDefault();
    setError('');
    setBooking(undefined);
    if (
      trip.origin.trim().toLowerCase() === trip.destination.trim().toLowerCase()
    ) {
      setError('Choose a destination different from your starting city.');
      return;
    }
    if (trip.returnDate <= trip.departure) {
      setError('Your return date must be after your departure date.');
      return;
    }
    setWorking(true);
    setPlan(undefined);
    setPlanReady(false);
    setStages(initialStages());
    setActivity([]);
    let activeIndex = 0;
    try {
      const response = await fetch('/api/travel/plan/stream', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(trip),
      });
      if (!response.ok) {
        const payload = await response.json();
        throw new Error(payload.error || 'Could not create this trip.');
      }
      if (!response.body)
        throw new Error('Planning updates are unavailable. Please retry.');
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let receivedPlan = false;
      const consumeFrame = async (frame: string) => {
        const data = frame
          .split(/\r?\n/)
          .filter((line) => line.startsWith('data:'))
          .map((line) => line.slice(5).trim())
          .join('\n');
        if (!data) return;
        const event = JSON.parse(data) as
          | {
              type: 'stage';
              index: number;
              status: 'in_progress' | 'completed';
              message: string;
              completed: number;
              total: number;
            }
          | { type: 'result'; plan: Plan }
          | { error: string };
        if ('error' in event) throw new Error(event.error);
        if (event.type === 'stage') {
          activeIndex = event.index;
          setStages((current) =>
            current.map((stage, index) =>
              index === event.index
                ? { ...stage, status: event.status, message: event.message }
                : event.status === 'in_progress' &&
                    index > event.index &&
                    stage.status === 'in_progress'
                  ? {
                      ...stage,
                      status: 'pending',
                      message: 'Waiting for the previous step.',
                    }
                  : stage,
            ),
          );
          if (event.status === 'completed')
            setActivity((current) => [event.message, ...current].slice(0, 7));
          if (event.status === 'in_progress')
            await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
        } else {
          receivedPlan = true;
          setPlan(event.plan);
          setSelected({
            outbound: 'flight-out',
            inbound: 'flight-back',
            hotel: 'hotel-garden',
            local: 'taxi',
          });
        }
      };
      while (true) {
        const { done, value } = await reader.read();
        buffer += decoder.decode(value, { stream: !done });
        const frames = buffer.split(/\r?\n\r?\n/);
        buffer = frames.pop() || '';
        for (const frame of frames) await consumeFrame(frame);
        if (done) break;
      }
      if (buffer.trim()) await consumeFrame(buffer);
      if (!receivedPlan)
        throw new Error(
          'The planning stream ended before the itinerary was ready. Please retry.',
        );
      setActiveTab('outbound journey');
      setTransitioning(true);
      await new Promise<void>((resolve) => window.setTimeout(resolve, 550));
      setPage('plan');
      history.pushState(null, '', '/travel/plan');
      setPlanReady(true);
      setTransitioning(false);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'Could not create this trip.',
      );
      setStages((current) =>
        current.map((stage, index) =>
          index === activeIndex && stage.status !== 'completed'
            ? {
                ...stage,
                status: 'failed',
                message:
                  'This step could not finish. Retry planning to try again.',
              }
            : stage,
        ),
      );
    } finally {
      setWorking(false);
    }
  }

  async function simulateBooking() {
    if (!pending) return;
    try {
      const category = pending.id.startsWith('hotel')
        ? 'hotel'
        : ['taxi', 'bike'].includes(pending.id)
          ? 'local'
          : 'transport';
      const response = await fetch('/api/travel/book', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          itemId: pending.id,
          itemName: pending.name,
          category,
          price: pending.price,
          trip,
        }),
      });
      const payload = await response.json();
      if (!response.ok)
        throw new Error(payload.error || 'Could not simulate reservation.');
      setBookingEmail('');
      setBookedItems((current) => new Set(current).add(pending.id));
      try {
        const saved = JSON.parse(localStorage.getItem(bookingStorageKey) || '[]') as string[];
        localStorage.setItem(bookingStorageKey, JSON.stringify([...new Set([...saved, pending.id])]));
      } catch { /* Keep the confirmation in component state if storage is unavailable. */ }
      setBooking(payload);
      setPending(undefined);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'Could not simulate reservation.',
      );
      setPending(undefined);
    }
  }

  async function authorizeDemoPayment(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCheckoutError('');
    if (!plan || bookedItems.has('trip-package')) return;
    if (authorizationPin !== DEMO_AUTHORIZATION_PIN) {
      setCheckoutError('Use the demo authorization PIN shown below. No bank or card PIN is accepted.');
      return;
    }
    try {
      const response = await fetch('/api/travel/book', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          itemId: 'trip-package',
          itemName: `Round trip: ${trip.origin} to ${trip.destination}`,
          category: 'transport',
          price: total,
          trip,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Could not simulate authorization.');
      setBookedItems((current) => {
        const next = new Set(current);
        next.add('trip-package');
        for (const id of Object.values(selected)) next.add(id);
        try {
          const saved = JSON.parse(localStorage.getItem(bookingStorageKey) || '[]') as string[];
          localStorage.setItem(bookingStorageKey, JSON.stringify([...new Set([...saved, 'trip-package', ...Object.values(selected)])]));
        } catch { /* Keep the confirmation in component state if storage is unavailable. */ }
        return next;
      });
      setBooking(payload);
      setBookingEmail(emailAddress.trim());
      setAuthorizationPin('');
    } catch (caught) {
      setCheckoutError(caught instanceof Error ? caught.message : 'Could not simulate authorization.');
    }
  }

  async function sendAssistantMessage(text = assistantDraft) {
    const message = text.trim();
    if (!message || assistantBusy) return;
    setAssistantDraft('');
    setAssistantMessages((current) => [...current, { role: 'user', text: message }]);
    setAssistantBusy(true);
    try {
      const response = await fetch('/api/travel/assistant', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ message, trip, budget: { total, remaining, selected: expenses.map((item) => ({ name: item.name, price: item.price })) } }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Assistant is unavailable.');
      setAssistantMessages((current) => [...current, { role: 'assistant', text: payload.reply }]);
    } catch (caught) {
      setAssistantMessages((current) => [...current, { role: 'assistant', text: caught instanceof Error ? caught.message : 'Assistant is unavailable. Try again.' }]);
    } finally {
      setAssistantBusy(false);
    }
  }

  function applyLowestCostOptions() {
    if (!plan) return;
    const cheapest = (items: Option[]) => items.reduce((best, item) => item.price < best.price ? item : best);
    const outbound = plan.transport.filter((item) => item.direction === 'Outbound');
    const inbound = plan.transport.filter((item) => item.direction === 'Return');
    setSelected((current) => ({ ...current, outbound: cheapest(outbound).id, inbound: cheapest(inbound).id, hotel: cheapest(plan.hotels).id, local: cheapest(plan.local).id }));
    setAssistantMessages((current) => [...current, { role: 'assistant', text: 'Done. I selected the lowest-priced demo transport, stay, and local ride options. Your estimate has been recalculated; no reservations were changed.' }]);
  }

  const openGmailDraft = () => {
    if (!booking) return;
    const subject = `Phoenix demo trip confirmation ${booking.reference}`;
    const body = `DEMO CONFIRMATION — NOT A REAL BOOKING\n\n${booking.itemName}\nSimulated total: ${money(booking.price)}\nReference: ${booking.reference}\n\nNo payment was taken and no reservation was made.`;
    const url = new URL('https://mail.google.com/mail/');
    url.searchParams.set('view', 'cm');
    url.searchParams.set('fs', '1');
    url.searchParams.set('to', bookingEmail);
    url.searchParams.set('su', subject);
    url.searchParams.set('body', body);
    window.open(url.toString(), '_blank', 'noopener,noreferrer');
  };

  function OptionCard({
    item,
    kind,
    active,
  }: {
    item: Option;
    kind: string;
    active: boolean;
  }) {
    const isBooked = bookedItems.has(item.id);
    const Icon =
      icons[item.mode as keyof typeof icons] ||
      (kind === 'hotel' ? Hotel : Compass);
    return (
      <article className={`travel-option ${active ? 'is-selected' : ''} ${isBooked ? 'is-booked' : ''}`}>
        {isBooked && <span className="travel-option-confirmed-mark" aria-label="Demo reservation confirmed"><Check size={27} strokeWidth={3.5} /></span>}
        <div className="travel-option-icon">
          <Icon size={19} />
        </div>
        <div className="travel-option-content">
          <div className="travel-option-heading">
            <div>
              <strong>{item.name}</strong>
              <span className="travel-demo-tag">{isBooked ? 'DEMO CONFIRMED ✓' : 'DEMO'}</span>
            </div>
            <b>{money(item.price)}</b>
          </div>
          <div className="travel-option-meta">
            {item.direction && <span>{item.direction}</span>}
            {item.depart && (
              <span>
                <Clock3 size={13} /> {item.depart} – {item.arrive} ·{' '}
                {item.duration}
              </span>
            )}
            {item.rating && <span>★ {item.rating}</span>}
            {item.style && <span>{item.style}</span>}
          </div>
          <p>{item.note}</p>
          {kind === 'transport' && (
            <button
              className={active ? 'travel-choice chosen' : 'travel-choice'}
              onClick={() =>
                setSelected((current) => ({
                  ...current,
                  [item.direction === 'Outbound' ? 'outbound' : 'inbound']:
                    item.id,
                }))
              }
            >
              {isBooked ? (
                <><Check size={14} /> Demo confirmed</>
              ) : active ? (
                <>
                  <Check size={14} /> Selected
                </>
              ) : (
                'Choose this'
              )}
            </button>
          )}
          {kind !== 'transport' && (
            <button
              className={active ? 'travel-choice chosen' : 'travel-choice'}
              onClick={() =>
                setSelected((current) => ({ ...current, [kind]: item.id }))
              }
            >
              {active ? (
                <>
                  <Check size={14} /> Selected
                </>
              ) : (
                'Choose this'
              )}
            </button>
          )}
          <button
            className="travel-book-button"
            onClick={() => setPending(item)}
            disabled={isBooked}
          >
            {isBooked ? <>Confirmed <Check size={14} /></> : <>Simulate booking <ArrowRight size={14} /></>}
          </button>
        </div>
      </article>
    );
  }

  return (
    <main className="travel-app">
      <header className="travel-topbar">
        <div className="travel-brand">
          <span className="travel-brand-mark">
            <Sparkles size={19} />
          </span>{' '}
          Phoenix
        </div>
        <span className="travel-top-note">
          <span className="travel-live-dot" /> AI trip planner
          {page === 'plan' && <button type="button" className="travel-edit-trip" onClick={() => { setPage('start'); setPlan(undefined); setPlanReady(false); history.pushState(null, '', '/travel'); }}>Edit trip</button>}
        </span>
      </header>
      <div className="travel-layout">
        <section className="travel-main">
          {page === 'start' && <>
          <div className="travel-eyebrow">
            <Sparkles size={14} /> YOUR NEXT GREAT GETAWAY
          </div>
          <h1>
            Make room for <span>somewhere new.</span>
          </h1>
          <p className="travel-intro">
            Phoenix coordinates a round-trip plan from your preferences. Demo
            transport and stay data pair with a Groq itinerary when configured.
          </p>
          <form id="travel-plan-form" className="travel-form" onSubmit={buildPlan}>
            <div className="travel-form-title">
              <div>
                <span className="travel-step">01</span>
                  <h2>Plan your Mumbai round trip</h2>
              </div>
              <span className="travel-required">All prices are simulated</span>
            </div>
            <div className="travel-route-row">
              <label>
                FROM
                <span className="travel-input-wrap">
                  <MapPin size={16} />
                  <input
                    required
                    minLength={2}
                    maxLength={80}
                    value={trip.origin}
                    onChange={(e) => setField('origin', e.target.value)}
                    placeholder="Starting city"
                  />
                </span>
              </label>
              <div className="travel-swap">
                <ArrowLeftRight size={16} />
              </div>
              <label>
                TO
                <span className="travel-input-wrap">
                  <MapPin size={16} />
                  <input
                    required
                    minLength={2}
                    maxLength={80}
                    value={trip.destination}
                    onChange={(e) => setField('destination', e.target.value)}
                    placeholder="Where to?"
                  />
                </span>
              </label>
            </div>
            <div className="travel-route-presets" aria-label="Demo route presets">
              <span>DEMO ROUTES</span>
              {['Delhi', 'Vizag'].map((destination) => (
                <button
                  type="button"
                  className={trip.origin === 'Mumbai' && trip.destination.toLowerCase() === destination.toLowerCase() ? 'active' : ''}
                  key={destination}
                  onClick={() => {
                    setTrip((current) => ({ ...current, origin: 'Mumbai', destination }));
                    setPlan(undefined);
                  }}
                >
                  Mumbai → {destination}
                </button>
              ))}
            </div>
            <div className="travel-form-row">
              <label>
                DEPARTURE
                <span className="travel-input-wrap">
                  <CalendarDays size={16} />
                  <input
                    required
                    type="date"
                    min={iso(today)}
                    value={trip.departure}
                    onChange={(e) => setField('departure', e.target.value)}
                  />
                </span>
              </label>
              <label>
                RETURN
                <span className="travel-input-wrap">
                  <CalendarDays size={16} />
                  <input
                    required
                    type="date"
                    min={trip.departure}
                    value={trip.returnDate}
                    onChange={(e) => setField('returnDate', e.target.value)}
                  />
                </span>
              </label>
              <label>
                TRAVELERS
                <span className="travel-input-wrap">
                  <input
                    required
                    type="number"
                    min={1}
                    max={8}
                    value={trip.travelers}
                    onChange={(e) =>
                      setField('travelers', Number(e.target.value))
                    }
                  />
                </span>
              </label>
              <label>
                YOUR BUDGET
                <span className="travel-input-wrap">
                  <span className="travel-rupee">₹</span>
                  <input
                    required
                    type="number"
                    min={1000}
                    max={10000000}
                    step={500}
                    value={trip.budget}
                    onChange={(e) => setField('budget', Number(e.target.value))}
                  />
                </span>
              </label>
            </div>
            {error && (
              <p role="alert" className="travel-error">
                <X size={15} />
                {error}
              </p>
            )}
            <div className="travel-form-footer">
              <span>
                <ShieldCheck size={16} /> No payments. Demo bookings only.
              </span>
              <button className="travel-submit" disabled={working}>
                {working ? (
                  <>
                    <LoaderCircle className="travel-spin" size={17} /> Building
                    your plan…
                  </>
                ) : (
                  <>
                    <Sparkles size={16} />{' '}
                    {plan ? 'Plan again' : 'Plan my trip'}{' '}
                    <ArrowRight size={16} />
                  </>
                )}
              </button>
            </div>
          </form>
          </>}

          {page === 'plan' && plan && <section className={`travel-flow-map ${planReady ? 'is-ready' : ''}`} aria-label="Trip planning flow">
            <div className="travel-flow-overview">
              <span className="travel-flow-kicker">ROUND TRIP · DEMO PLAN</span>
              <button type="button" className="travel-flow-edit" onClick={() => { setPage('start'); setPlan(undefined); setPlanReady(false); history.pushState(null, '', '/travel'); }}>Edit trip details</button>
              <h2>{trip.origin} <span>to</span> {trip.destination}</h2>
              <p>Shape your journey one step at a time. Every schedule and price is simulated.</p>
              <div className="travel-flow-meta">
                <span><CalendarDays size={14} /> {trip.departure} — {trip.returnDate}</span>
                <span><Wallet size={14} /> {money(trip.budget)} budget</span>
                <span>{trip.travelers} traveler{trip.travelers === 1 ? '' : 's'}</span>
              </div>
            </div>
            <div
              className="travel-flow-start"
              role="status"
              aria-label={bookedItems.has('trip-package') ? 'Demo trip marked complete' : 'Trip plan ready'}
            >
              {bookedItems.has('trip-package') ? <><Check size={48} strokeWidth={3.5} /><small>DEMO COMPLETE</small></> : <>READY</>}
            </div>
            <svg className="travel-flow-connectors" viewBox="0 0 1000 150" preserveAspectRatio="none" aria-hidden="true">
              <defs><marker id="travel-flow-arrow" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8" fill="none" stroke="currentColor" strokeWidth="1.5" /></marker></defs>
              <path d="M500 0 C500 80 125 10 125 145" markerEnd="url(#travel-flow-arrow)" />
              <path d="M500 0 C500 75 375 70 375 145" markerEnd="url(#travel-flow-arrow)" />
              <path d="M500 0 C500 75 625 70 625 145" markerEnd="url(#travel-flow-arrow)" />
              <path d="M500 0 C500 80 875 10 875 145" markerEnd="url(#travel-flow-arrow)" />
            </svg>
            <div className="travel-flow-steps">
              {([
                ['outbound journey', 'Outbound', `${trip.origin} → ${trip.destination}`, Plane],
                ['return journey', 'Return', `${trip.destination} → ${trip.origin}`, ArrowLeftRight],
                ['stays', 'Stay', 'Hotel options', Hotel],
                ['itinerary', 'Itinerary', 'Day by day', CalendarDays],
              ] as const).map(([tab, title, subtitle, Icon]) => {
                const confirmed = isSectionConfirmed(tab);
                return (
                <button
                  type="button"
                  className={`travel-flow-step${confirmed ? ' is-confirmed' : ''}`}
                  key={tab}
                  disabled={!planReady || confirmed}
                  aria-label={`${title}${confirmed ? ', demo confirmed and locked' : ''}`}
                  onClick={() => {
                    setActiveTab(tab);
                    setDetailView(tab);
                  }}
                >
                  <span className="travel-flow-step-icon"><Icon size={19} /></span>
                  {confirmed && <span className="travel-flow-confirmed-check" aria-hidden="true"><Check size={32} strokeWidth={3.5} /></span>}
                  <strong>{title}</strong>
                  <small>{subtitle}</small>
                  <span className="travel-flow-step-status">{confirmed ? 'DEMO CONFIRMED · LOCKED' : plan ? 'VIEW DEMO OPTIONS' : 'START TO UNLOCK'}</span>
                </button>
                );
              })}
            </div>
          </section>}

          {page === 'plan' && planReady && (
            <nav className="travel-detail-shortcuts" aria-label="Open trip details">
              {['outbound journey', 'return journey', 'stays', 'local rides', 'itinerary', 'budget', 'review & book'].map((tab) => (
                <button key={tab} type="button" disabled={isSectionConfirmed(tab)} aria-label={isSectionConfirmed(tab) ? `${tab}, demo confirmed and locked` : tab} onClick={() => { setActiveTab(tab); setDetailView(tab); }}>
                  {tab}
                </button>
              ))}
            </nav>
          )}

          {working && page === 'start' && (
            <section
              className="travel-planning"
              aria-live="polite"
              aria-label="AI trip planning progress"
            >
              <div className="travel-planning-header">
                <span className="travel-planning-emblem">
                  <Sparkles size={18} />
                </span>
                <div className="travel-planning-heading">
                  <span className="travel-planning-kicker">
                    PHOENIX TRIP WORKFLOW
                  </span>
                  <h2>
                    {working
                      ? 'Phoenix is planning your trip'
                      : 'Planning paused — review and retry'}
                  </h2>
                  <p>
                    {stages.find((stage) => stage.status === 'in_progress')
                      ?.message ||
                      stages.find((stage) => stage.status === 'failed')
                        ?.message ||
                      'Your completed trip plan is ready.'}
                  </p>
                </div>
                <strong className="travel-progress-percent">
                  {planningProgress}%
                </strong>
              </div>
              <div
                className="travel-progress-track"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={planningProgress}
                aria-label="Planning progress"
              >
                <span style={{ width: `${planningProgress}%` }} />
              </div>
              <div className="travel-planning-columns">
                <ol className="travel-stage-list">
                  {stages.map((stage, index) => (
                    <li
                      className={`travel-stage travel-stage-${stage.status}`}
                      key={stage.title}
                    >
                      <span className="travel-stage-icon">
                        {stage.status === 'completed' ? (
                          <Check size={14} />
                        ) : stage.status === 'in_progress' ? (
                          <LoaderCircle size={14} className="travel-spin" />
                        ) : stage.status === 'failed' ? (
                          <X size={14} />
                        ) : (
                          <span>{String(index + 1).padStart(2, '0')}</span>
                        )}
                      </span>
                      <div className="travel-stage-copy">
                        <div>
                          <b>{stage.title}</b>
                          <small>
                            {stage.status === 'in_progress'
                              ? 'In Progress'
                              : stage.status === 'completed'
                                ? 'Completed'
                                : stage.status === 'failed'
                                  ? 'Failed'
                                  : 'Pending'}
                          </small>
                        </div>
                        <p>
                          {stage.status === 'completed' ||
                          stage.status === 'failed'
                            ? stage.message
                            : stage.task}
                        </p>
                      </div>
                    </li>
                  ))}
                </ol>
                <aside className="travel-activity-feed">
                  <span className="travel-feed-title">
                    <Clock3 size={14} /> ACTIVITY FEED
                  </span>
                  {activity.length ? (
                    activity.map((item, index) => (
                      <p key={`${index}-${item}`}>
                        <Check size={13} />
                        {item}
                      </p>
                    ))
                  ) : (
                    <p className="travel-feed-empty">
                      Completed actions will appear here as Phoenix works.
                    </p>
                  )}
                </aside>
              </div>
            </section>
          )}

          <section className={`travel-agents ${page === 'start' && !working || page === 'plan' ? 'travel-agents-hidden' : ''}`}>
            <div className="travel-section-head">
              <div>
                <span className="travel-step">02</span>
                <h2>Phoenix AI at Work</h2>
              </div>
              <span className="travel-agent-caption">
                {working
                  ? 'Working on your trip'
                  : plan
                    ? 'Planning complete'
                    : 'Standing by'}
              </span>
            </div>
            <div className="travel-agent-grid">
              {agents.map((agent) => (
                <div
                  className={`travel-agent travel-agent-${agent.stage.status === 'in_progress' ? 'working' : agent.stage.status}`}
                  key={agent.name}
                >
                  <span className="travel-agent-indicator">
                    {agent.stage.status === 'completed' ? (
                      <Check size={12} />
                    ) : agent.stage.status === 'in_progress' ? (
                      <LoaderCircle className="travel-spin" size={12} />
                    ) : agent.stage.status === 'failed' ? (
                      <X size={12} />
                    ) : (
                      <span />
                    )}
                  </span>
                  <div>
                    <strong>{agent.name}</strong>
                    <span>{agent.stage.task}</span>
                    <span className="travel-agent-result">
                      {agent.stage.message}
                    </span>
                  </div>
                  <small>
                    {agent.stage.status === 'in_progress'
                      ? 'In Progress'
                      : agent.stage.status === 'completed'
                        ? 'Completed'
                        : agent.stage.status === 'failed'
                          ? 'Failed'
                          : 'Pending'}
                  </small>
                  <em>{agent.badge}</em>
                </div>
              ))}
            </div>
            {plan && activity.length > 0 && (
              <div className="travel-completed-feed">
                <span className="travel-completed-feed-title">
                  <Clock3 size={13} /> COMPLETED WORKFLOW ACTIVITY
                </span>
                <div>
                  {activity
                    .slice()
                    .reverse()
                    .map((item, index) => (
                      <p key={`${index}-${item}`}>
                        <Check size={12} />
                        {item}
                      </p>
                    ))}
                </div>
              </div>
            )}
          </section>

          {page === 'plan' && plan && planReady && detailView ? (
            <div className="travel-detail-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setDetailView(undefined); }}>
            <section id="travel-results" className="travel-results travel-details-modal" role="dialog" aria-modal="true" aria-label={`${activeTab} trip details`}>
              <div className="travel-section-head travel-results-head">
                <div>
                  <span className="travel-step">03</span>
                <h2>{activeTab === 'outbound journey' ? `${trip.origin} → ${trip.destination}` : activeTab === 'return journey' ? `${trip.destination} → ${trip.origin}` : activeTab}</h2>
                </div>
                <span className="travel-demo-tag">SIMULATED DEMO</span>
                <button type="button" className="travel-detail-close" aria-label="Close trip details" onClick={() => setDetailView(undefined)}><X size={19} /></button>
              </div>
              <nav className="travel-tabs" aria-label="Trip details">
                {[
                  'outbound journey',
                  'return journey',
                  'stays',
                  'local rides',
                  'itinerary',
                  'budget',
                  'review & book',
                ].map((tab) => (
                  <button
                    className={`${activeTab === tab ? 'active' : ''}${isSectionConfirmed(tab) ? ' is-confirmed' : ''}`}
                    key={tab}
                    disabled={isSectionConfirmed(tab)}
                    onClick={() => { setActiveTab(tab); setDetailView(tab); }}
                  >
                    {tab}
                  </button>
                ))}
              </nav>
              {activeTab === 'outbound journey' && (
                <section className="travel-result-group">
                  <h3>
                    <Plane size={17} /> {trip.origin} to {trip.destination} · Outbound journey{' '}
                    <small>DEMO OPTIONS</small>
                  </h3>
                  <div className="travel-options">
                    {plan.transport
                      .filter((item) => item.direction === 'Outbound')
                      .map((item) => (
                        <OptionCard
                          key={item.id}
                          item={item}
                          kind="transport"
                          active={selected.outbound === item.id}
                        />
                      ))}
                  </div>
                </section>
              )}
              {activeTab === 'return journey' && (
                <section className="travel-result-group">
                  <h3>
                    <ArrowLeftRight size={17} /> {trip.destination} to {trip.origin} · Return journey{' '}
                    <small>DEMO OPTIONS</small>
                  </h3>
                  <div className="travel-options">
                    {plan.transport.filter((item) => item.direction === 'Return').map((item) => (
                      <OptionCard key={item.id} item={item} kind="transport" active={selected.inbound === item.id} />
                    ))}
                  </div>
                </section>
              )}
              {activeTab === 'stays' && (
                <section className="travel-result-group">
                  <h3>
                    <Hotel size={17} /> Places to stay{' '}
                    <small>{plan.nights} NIGHTS · DEMO</small>
                  </h3>
                  <div className="travel-options">
                    {plan.hotels.map((item) => (
                      <OptionCard
                        key={item.id}
                        item={item}
                        kind="hotel"
                        active={selected.hotel === item.id}
                      />
                    ))}
                  </div>
                </section>
              )}
              {activeTab === 'local rides' && (
                <section className="travel-result-group">
                  <h3>
                    <CarTaxiFront size={17} /> Getting around{' '}
                    <small>DEMO ESTIMATES</small>
                  </h3>
                  <div className="travel-options">
                    {plan.local.map((item) => (
                      <OptionCard
                        key={item.id}
                        item={item}
                        kind="local"
                        active={selected.local === item.id}
                      />
                    ))}
                  </div>
                </section>
              )}
              {activeTab === 'itinerary' && (
                <section className="travel-result-group">
                  <h3>
                    <CalendarDays size={17} /> Day-by-day sketch{' '}
                    <small>
                      {plan.itinerary.source.toUpperCase()} · ILLUSTRATIVE
                    </small>
                  </h3>
                  <p className="travel-itinerary-note">
                    A starting point to make your own. Check local details
                    before you go.
                  </p>
                  {plan.itinerary.warning && (
                    <p className="travel-ai-warning" role="status">
                      <Sparkles size={15} /> {plan.itinerary.warning}
                    </p>
                  )}
                  <div className="travel-itinerary">
                    {plan.itinerary.days.map((day) => (
                      <article key={day.day}>
                        <span className="travel-day-number">
                          DAY {String(day.day).padStart(2, '0')}
                        </span>
                        <h4>{day.title}</h4>
                        <div className="travel-day-slots">
                          <p>
                            <b>Morning</b>
                            {day.morning}
                          </p>
                          <p>
                            <b>Afternoon</b>
                            {day.afternoon}
                          </p>
                          <p>
                            <b>Evening</b>
                            {day.evening}
                          </p>
                        </div>
                      </article>
                    ))}
                  </div>
                </section>
              )}
              {activeTab === 'budget' && (
                <section className="travel-result-group travel-budget-page">
                  <h3><Wallet size={17} /> Budget breakdown <small>DEMO ESTIMATES</small></h3>
                  <p>For {trip.travelers} traveler{trip.travelers === 1 ? '' : 's'} on {trip.origin} ↔ {trip.destination}</p>
                  <div className="travel-budget-breakdown">
                    <div><span>Outbound + return transport</span><b>{money(selectedTransport.reduce((n, x) => n + x.price, 0))}</b></div>
                    <div><span>Hotel · {plan.nights} nights</span><b>{money(plan.hotels.find((x) => x.id === selected.hotel)?.price || 0)}</b></div>
                    <div><span>Local rides</span><b>{money(plan.local.find((x) => x.id === selected.local)?.price || 0)}</b></div>
                    <div><strong>Estimated total</strong><strong>{money(total)}</strong></div>
                    <div><span>{remaining >= 0 ? 'Budget remaining' : 'Over budget'}</span><b>{money(Math.abs(remaining))}</b></div>
                  </div>
                  <p className="travel-budget-tip"><Sparkles size={14} /> {plan.optimization.recommendation}</p>
                </section>
              )}
              {activeTab === 'review & book' && (
                <section className="travel-result-group travel-checkout-page">
                  <h3><ShieldCheck size={17} /> Review & authorize <small>SIMULATED PAYMENT</small></h3>
                  <p className="travel-checkout-notice">Phoenix has prepared your selected trip details. This demo does not connect to a payment gateway or make a real reservation.</p>
                  <div className="travel-checkout-summary">
                    <strong>{trip.origin} ↔ {trip.destination}</strong>
                    <span>Outbound + return · {trip.travelers} traveler{trip.travelers === 1 ? '' : 's'}</span>
                    <span>Transport, {plan.nights} night stay, and local rides</span>
                    <b>{money(total)}</b>
                  </div>
                  {bookedItems.has('trip-package') ? <div className="travel-trip-complete"><Check size={34} strokeWidth={3.5} /><div><strong>Demo trip already confirmed</strong><span>This trip is marked complete on this device. It will not ask you to confirm it again.</span></div></div> : <form className="travel-checkout-form" onSubmit={(event) => void authorizeDemoPayment(event)}>
                    <label>
                      Confirmation email
                      <input type="email" required autoComplete="email" placeholder="you@gmail.com" value={emailAddress} onChange={(event) => setEmailAddress(event.target.value)} />
                    </label>
                    <label>
                      Demo authorization PIN
                      <input type="password" inputMode="numeric" pattern="[0-9]{4}" maxLength={4} autoComplete="off" required value={authorizationPin} onChange={(event) => setAuthorizationPin(event.target.value.replace(/\D/g, '').slice(0, 4))} placeholder="4 digit demo code" />
                    </label>
                    <p className="travel-demo-pin-hint">Demo PIN: <b>2468</b>. Never enter a real bank, card, or UPI PIN here.</p>
                    {checkoutError && <p role="alert" className="travel-error"><X size={15} />{checkoutError}</p>}
                    <button className="travel-submit" type="submit"><ShieldCheck size={15} /> Simulate authorization · {money(total)}</button>
                  </form>}
                </section>
              )}
            </section>
            </div>
          ) : null}
        </section>

        <aside className="travel-aside travel-budget-widget">
          <button
            type="button"
            className="travel-budget-widget-toggle"
            aria-label={budgetOpen ? 'Close trip budget' : 'Open trip budget'}
            aria-expanded={budgetOpen}
            onClick={() => setBudgetOpen((open) => !open)}
          >
            {budgetOpen ? <X size={22} /> : <CircleDollarSign size={24} />}
          </button>
          {budgetOpen && <section className="travel-budget-card">
            <div className="travel-budget-top">
              <div>
                <span className="travel-aside-kicker">
                  <Wallet size={14} /> TRIP BUDGET
                </span>
                <strong>{money(trip.budget)}</strong>
              </div>
              <span className="travel-budget-icon">
                <CircleDollarSign size={22} />
              </span>
            </div>
            <div className="travel-budget-meter">
              <span style={{ width: `${progress}%` }} />
            </div>
            <div className="travel-budget-labels">
              <span>Estimated total</span>
              <strong>{money(total)}</strong>
            </div>
            <div className="travel-budget-labels">
              <span>{remaining >= 0 ? 'Left in budget' : 'Over budget'}</span>
              <strong
                className={remaining < 0 ? 'over-budget' : 'within-budget'}
              >
                {money(Math.abs(remaining))}
              </strong>
            </div>
            <div className="travel-budget-breakdown">
              <div>
                <span>Round-trip travel</span>
                <b>
                  {money(selectedTransport.reduce((n, x) => n + x.price, 0))}
                </b>
              </div>
              <div>
                <span>Stay · {plan?.nights || 0} nights</span>
                <b>
                  {money(
                    plan?.hotels.find((x) => x.id === selected.hotel)?.price ||
                      0,
                  )}
                </b>
              </div>
              <div>
                <span>Local rides</span>
                <b>
                  {money(
                    plan?.local.find((x) => x.id === selected.local)?.price ||
                      0,
                  )}
                </b>
              </div>
            </div>
            <p className="travel-budget-tip">
              <Sparkles size={14} />
              {remaining >= 0
                ? 'Your picks fit your budget.'
                : 'Choose a train, budget stay, or bike rides to bring this down.'}
            </p>
            {plan && (
              <div className="travel-optimized-total">
                <span>Lowest-cost demo combination</span>
                <strong>{money(plan.optimization.total)}</strong>
                <small>{plan.optimization.recommendation}</small>
              </div>
            )}
          </section>}
        </aside>
      </div>
      {transitioning && (
        <div className="travel-transition" role="status" aria-live="polite">
          <div className="travel-transition-orbit"><Plane size={30} /></div>
          <span>PHOENIX IS PREPARING YOUR JOURNEY</span>
          <strong>{trip.origin} <ArrowRight size={16} /> {trip.destination}</strong>
          <div className="travel-transition-track"><i /></div>
        </div>
      )}
      {pending && (
        <div className="travel-modal-backdrop" role="presentation">
          <section
            className="travel-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="travel-confirm-title"
          >
            <button
              className="travel-modal-close"
              onClick={() => setPending(undefined)}
              aria-label="Close"
            >
              <X size={18} />
            </button>
            <span className="travel-modal-icon">
              <ShieldCheck size={22} />
            </span>
            <span className="travel-demo-tag">DEMO ONLY</span>
            <h2 id="travel-confirm-title">Simulate this reservation?</h2>
            <p>
              You’re simulating <b>{pending.name}</b> for{' '}
              <b>{money(pending.price)}</b>. This will not contact a provider or
              charge you.
            </p>
            <div className="travel-modal-actions">
              <button onClick={() => setPending(undefined)}>Go back</button>
              <button
                className="travel-submit"
                onClick={() => void simulateBooking()}
              >
                Confirm demo <ArrowRight size={15} />
              </button>
            </div>
          </section>
        </div>
      )}
      {booking && (
        <div className="travel-modal-backdrop" role="presentation">
          <section
            className="travel-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="travel-done-title"
          >
            <button
              className="travel-modal-close"
              onClick={() => setBooking(undefined)}
              aria-label="Close"
            >
              <X size={18} />
            </button>
            <span className="travel-modal-icon success">
              <Check size={22} />
            </span>
            <span className="travel-demo-tag">
              SIMULATED · NOT A REAL BOOKING
            </span>
            <h2 id="travel-done-title">Demo reservation ready</h2>
            <p>
              <b>{booking.itemName}</b>
              <br />
              {money(booking.price)} · Reference {booking.reference}
            </p>
            <p className="travel-modal-footnote">{booking.message}</p>
            {bookingEmail && (
              <div className="travel-email-preview">
                <b>Confirmation email · demo preview</b>
                <span>To: {bookingEmail}</span>
                <small>This is not sent automatically. No Gmail connection is configured.</small>
                <button type="button" onClick={openGmailDraft}>Open Gmail draft <ArrowRight size={13} /></button>
              </div>
            )}
            <div className="travel-modal-actions">
              <button
                className="travel-submit"
                onClick={() => {
                  setBooking(undefined);
                  setDetailView(undefined);
                  setPending(undefined);
                }}
              >
                Done <Check size={15} />
              </button>
            </div>
          </section>
        </div>
      )}
      <div className={`travel-assistant ${assistantOpen ? 'is-open' : ''}`}>
        {assistantOpen && <section className="travel-assistant-panel" aria-label="Trip planning assistant">
          <header><span className="travel-assistant-avatar"><Bot size={19} /></span><div><strong>Phoenix trip assistant</strong><small>Ask about this plan or request a change</small></div><button type="button" onClick={() => setAssistantOpen(false)} aria-label="Close assistant"><X size={18} /></button></header>
          <div className="travel-assistant-thread" aria-live="polite">
            {assistantMessages.length === 0 && <p className="travel-assistant-welcome">I can help adjust your route, budget, stay, rides, or itinerary. Ask a question or tell me what you’d like to change.</p>}
            {assistantMessages.map((item, index) => <p key={`${item.role}-${index}`} className={`travel-assistant-message ${item.role}`}>{item.text}</p>)}
            {assistantBusy && <p className="travel-assistant-message assistant">Thinking…</p>}
          </div>
          {plan && <button type="button" className="travel-assistant-apply" onClick={applyLowestCostOptions}>Apply lowest-cost demo options</button>}
          <form onSubmit={(event) => { event.preventDefault(); void sendAssistantMessage(); }}><input aria-label="Message the trip assistant" value={assistantDraft} onChange={(event) => setAssistantDraft(event.target.value)} placeholder="What would you like to change?" /><button type="submit" disabled={assistantBusy || !assistantDraft.trim()} aria-label="Send message"><Send size={17} /></button></form>
          <small className="travel-assistant-disclaimer">AI suggestions use demo data. Nothing is booked automatically.</small>
        </section>}
        <button type="button" className="travel-assistant-toggle" onClick={() => setAssistantOpen((open) => !open)} aria-label={assistantOpen ? 'Close trip assistant' : 'Chat with trip assistant'} aria-expanded={assistantOpen}><Bot size={25} /></button>
      </div>
    </main>
  );
}
