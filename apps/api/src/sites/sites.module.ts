import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PeopleModule } from '../people/people.module';
import { Revision, RevisionSchema } from './revision.schema';
import { Site, SiteSchema } from './site.schema';
import { SitesController } from './sites.controller';
import { SitesService } from './sites.service';

@Module({
  imports: [
    PeopleModule,
    MongooseModule.forFeature([
      { name: Site.name, schema: SiteSchema },
      { name: Revision.name, schema: RevisionSchema },
    ]),
  ],
  controllers: [SitesController],
  providers: [SitesService],
})
export class SitesModule {}
