import { IsIn, IsMongoId, Matches } from 'class-validator';
import { VISIT_VIA, type VisitVia } from './visit.schema';

export class CreateVisitDto {
  @IsMongoId()
  personId: string;

  @IsMongoId()
  revisionId: string;

  @IsIn(VISIT_VIA)
  via: VisitVia;

  @Matches(/^[A-Za-z0-9_-]{1,64}$/)
  clientNavId: string;
}
