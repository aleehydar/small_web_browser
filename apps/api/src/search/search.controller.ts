import { Controller, Get, Query } from '@nestjs/common';
import { SearchQueryDto } from './search-query.dto';
import { SearchService, type SearchResponse } from './search.service';

@Controller('search')
export class SearchController {
  constructor(private readonly search: SearchService) {}

  @Get()
  find(@Query() query: SearchQueryDto): Promise<SearchResponse> {
    return this.search.search(query.q);
  }
}
