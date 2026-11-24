import { STATES, type Connection } from 'mongoose';
import { HealthController } from './health.controller';

describe('HealthController', () => {
  it('reports the database as up only when mongoose is connected', () => {
    const connected = new HealthController({
      readyState: STATES.connected,
    } as Connection);
    const disconnected = new HealthController({
      readyState: STATES.disconnected,
    } as Connection);

    expect(connected.getHealth()).toEqual({ ok: true, db: 'up' });
    expect(disconnected.getHealth()).toEqual({ ok: true, db: 'down' });
  });
});
