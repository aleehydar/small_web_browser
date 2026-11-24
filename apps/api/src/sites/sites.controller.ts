import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { CreateSiteDto } from './create-site.dto';
import { SitesService, type PublishedPage } from './sites.service';

@Controller()
export class SitesController {
  constructor(private readonly sites: SitesService) {}

  @Get('resolve')
  resolve(@Query('address') address: unknown): Promise<PublishedPage> {
    if (typeof address !== 'string') {
      throw new BadRequestException('address must be a string');
    }
    return this.sites.resolve(address);
  }

  @Get('revisions/:id')
  revision(@Param('id') id: string): Promise<PublishedPage> {
    return this.sites.revision(id);
  }

  @Post('sites')
  @HttpCode(HttpStatus.CREATED)
  publish(
    @Body() body: CreateSiteDto,
  ): Promise<{ address: string; revisionId: string }> {
    return this.sites.publish(body);
  }
}
