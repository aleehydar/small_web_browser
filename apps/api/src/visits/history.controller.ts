import { Controller, Get, Param, Query } from '@nestjs/common';
import { HistoryQueryDto } from './history-query.dto';
import { VisitsService, type HistoryPage } from './visits.service';

@Controller('people')
export class HistoryController {
  constructor(private readonly visits: VisitsService) {}

  @Get(':id/history')
  history(
    @Param('id') id: string,
    @Query() query: HistoryQueryDto,
  ): Promise<HistoryPage> {
    return this.visits.history(id, query.limit ?? 30, query.cursor);
  }
}
