import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Site } from '../sites/site.schema';
import { snippet, type Segment } from './snippet';

const TOKEN = /[\p{L}\p{N}]+/gu;

export interface SearchHit {
  address: string;
  title: string;
  snippet: Segment[];
}

export interface SearchResponse {
  query: string;
  results: SearchHit[];
}

function tokensFrom(query: string): string[] {
  return [...query.matchAll(TOKEN)].slice(0, 8).map((match) => match[0]);
}

@Injectable()
export class SearchService {
  constructor(@InjectModel(Site.name) private readonly sites: Model<Site>) {}

  async search(q: string): Promise<SearchResponse> {
    const query = q.trim();
    const tokens = tokensFrom(query);
    if (tokens.length === 0) {
      return { query, results: [] };
    }
    const hits = await this.sites
      .find(
        { $text: { $search: tokens.join(' ') }, currentRevisionId: { $ne: null } },
        {
          address: 1,
          title: 1,
          text: 1,
          textScore: { $meta: 'textScore' },
        },
      )
      .sort({ textScore: { $meta: 'textScore' }, address: 1 })
      .limit(20)
      .exec();
    return {
      query,
      results: hits.map((hit) => ({
        address: hit.address,
        title: hit.title,
        snippet: snippet(hit.text, tokens),
      })),
    };
  }
}
