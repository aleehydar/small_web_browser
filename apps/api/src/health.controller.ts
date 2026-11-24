import { Controller, Get } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { STATES, type Connection } from 'mongoose';

@Controller('health')
export class HealthController {
  constructor(@InjectConnection() private readonly connection: Connection) {}

  @Get()
  getHealth(): { ok: true; db: 'up' | 'down' } {
    return {
      ok: true,
      db: this.connection.readyState === STATES.connected ? 'up' : 'down',
    };
  }
}
