import { Body, Controller, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import { CreateVisitDto } from './create-visit.dto';
import { VisitsService, type VisitBody } from './visits.service';

@Controller('visits')
export class VisitsController {
  constructor(private readonly visits: VisitsService) {}

  @Post()
  async create(
    @Body() body: CreateVisitDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<VisitBody> {
    const recorded = await this.visits.record(body);
    response.status(recorded.created ? 201 : 200);
    return recorded.visit;
  }
}
