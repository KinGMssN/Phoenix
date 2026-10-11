import { describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import { travelRoutes } from '../src/server/travel-routes.js';

const app = new Hono().route('/api', travelRoutes());
const trip = {
  origin: 'Mumbai',
  destination: 'Jaipur',
  departure: '2030-04-12',
  returnDate: '2030-04-15',
  travelers: 2,
  budget: 42000,
};

describe('travel demo workflow', () => {
  it('builds a round trip with transport, stays, local rides, and an itinerary', async () => {
    const response = await app.request('/api/travel/plan', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(trip),
    });
    expect(response.status).toBe(200);
    const plan = await response.json();
    expect(plan.demo).toBe(true);
    expect(
      plan.transport.filter(
        (option: { direction: string }) => option.direction === 'Outbound',
      ),
    ).toHaveLength(3);
    expect(
      plan.transport.filter(
        (option: { direction: string }) => option.direction === 'Return',
      ),
    ).toHaveLength(3);
    expect(plan.hotels).toHaveLength(3);
    expect(plan.local.map((option: { mode: string }) => option.mode)).toEqual([
      'Taxi',
      'Bike ride',
    ]);
    expect(plan.itinerary.days).toHaveLength(4);
    expect(plan.optimization.total).toBe(
      plan.optimization.categories.transport +
        plan.optimization.categories.hotel +
        plan.optimization.categories.local,
    );
    expect(plan.optimization.remaining).toBe(
      trip.budget - plan.optimization.total,
    );
  });

  it('streams progress tied to each completed planning task', async () => {
    const response = await app.request('/api/travel/plan/stream', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(trip),
    });
    expect(response.status).toBe(200);
    const frames = (await response.text())
      .split(/\r?\n\r?\n/)
      .map((frame) =>
        frame
          .split(/\r?\n/)
          .find((line) => line.startsWith('data:'))
          ?.slice(5)
          .trim(),
      )
      .filter((frame): frame is string => !!frame)
      .map((frame) => JSON.parse(frame));
    const completed = frames.filter(
      (event) => event.type === 'stage' && event.status === 'completed',
    );
    expect(completed).toHaveLength(7);
    expect(completed.map((event) => event.index)).toEqual([
      0, 1, 2, 3, 4, 5, 6,
    ]);
    expect(completed[1].message).toContain('demo modes');
    expect(frames.at(-1).type).toBe('result');
  });

  it('shows a useful Groq fallback and never returns the server key', async () => {
    const originalKey = process.env.GROQ_API_KEY;
    process.env.GROQ_API_KEY = 'server-only-test-key';
    const fetch = vi
      .spyOn(globalThis, 'fetch')
      .mockRejectedValue(new Error('simulated Groq outage'));
    try {
      const response = await app.request('/api/travel/plan', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(trip),
      });
      const plan = await response.json();
      expect(plan.itinerary.source).toBe('demo planner');
      expect(plan.itinerary.warning).toContain('Groq was unavailable');
      expect(JSON.stringify(plan)).not.toContain('server-only-test-key');
      expect(fetch).toHaveBeenCalledWith(
        'https://api.groq.com/openai/v1/chat/completions',
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer server-only-test-key',
          }),
        }),
      );
    } finally {
      fetch.mockRestore();
      if (originalKey === undefined) delete process.env.GROQ_API_KEY;
      else process.env.GROQ_API_KEY = originalKey;
    }
  });

  it('rejects an invalid round trip', async () => {
    const response = await app.request('/api/travel/plan', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...trip, returnDate: trip.departure }),
    });
    expect(response.status).toBe(400);
  });

  it('rejects a departure date in the past', async () => {
    const response = await app.request('/api/travel/plan', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...trip, departure: '2020-01-01' }),
    });
    expect(response.status).toBe(400);
  });

  it('confirms a simulated reservation without making a real booking', async () => {
    const response = await app.request('/api/travel/book', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        itemId: 'flight-out',
        itemName: 'SkyHop Airways',
        category: 'transport',
        price: 9800,
        trip,
      }),
    });
    expect(response.status).toBe(201);
    const reservation = await response.json();
    expect(reservation.demo).toBe(true);
    expect(reservation.status).toBe('simulated');
    expect(reservation.reference).toMatch(/^DEMO-/);
    expect(reservation.message).toContain('No real booking');
  });
});
