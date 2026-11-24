import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Person, PersonSchema } from '../people/person.schema';
import { Revision, RevisionSchema } from '../sites/revision.schema';
import { HistoryController } from './history.controller';
import { Visit, VisitSchema } from './visit.schema';
import { VisitsController } from './visits.controller';
import { VisitsService } from './visits.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Visit.name, schema: VisitSchema },
      { name: Person.name, schema: PersonSchema },
      { name: Revision.name, schema: RevisionSchema },
    ]),
  ],
  controllers: [VisitsController, HistoryController],
  providers: [VisitsService],
})
export class VisitsModule {}
