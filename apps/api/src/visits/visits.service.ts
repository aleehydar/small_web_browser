import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Person } from '../people/person.schema';
import { Revision } from '../sites/revision.schema';
import { decodeCursor, encodeCursor } from './cursor';
import { CreateVisitDto } from './create-visit.dto';
import { Visit, type VisitDocument, type VisitVia } from './visit.schema';

export interface VisitBody {
  id: string;
  address: string;
  title: string;
  via: VisitVia;
  at: string;
}

export interface RecordedVisit {
  created: boolean;
  visit: VisitBody;
}

export interface HistoryPage {
  items: VisitBody[];
  nextCursor: string | null;
}

@Injectable()
export class VisitsService {
  constructor(
    @InjectModel(Visit.name) private readonly visits: Model<Visit>,
    @InjectModel(Person.name) private readonly people: Model<Person>,
    @InjectModel(Revision.name) private readonly revisions: Model<Revision>,
  ) {}

  async record(dto: CreateVisitDto): Promise<RecordedVisit> {
    const person = await this.people.findById(dto.personId).exec();
    if (person === null) {
      throw new UnprocessableEntityException('person does not exist');
    }
    const revision = await this.revisions.findById(dto.revisionId).exec();
    if (revision === null) {
      throw new UnprocessableEntityException('revision does not exist');
    }
    const existing = await this.findByNavigation(dto.personId, dto.clientNavId);
    if (existing !== null) {
      return { created: false, visit: toBody(existing) };
    }
    try {
      const created = await this.visits.create({
        personId: person._id,
        address: revision.address,
        revisionId: revision._id,
        title: revision.title,
        via: dto.via,
        clientNavId: dto.clientNavId,
        at: new Date(),
      });
      return { created: true, visit: toBody(created) };
    } catch (error) {
      if (!isDuplicateKey(error)) {
        throw error;
      }
      const raced = await this.findByNavigation(dto.personId, dto.clientNavId);
      if (raced === null) {
        throw error;
      }
      return { created: false, visit: toBody(raced) };
    }
  }

  async history(
    personId: string,
    limit: number,
    cursor?: string,
  ): Promise<HistoryPage> {
    if (!/^[0-9a-f]{24}$/i.test(personId)) {
      throw new NotFoundException();
    }
    const person = await this.people.findById(personId).exec();
    if (person === null) {
      throw new NotFoundException();
    }
    const filter: {
      personId: Types.ObjectId;
      $or?: [{ at: { $lt: Date } }, { at: Date; _id: { $lt: Types.ObjectId } }];
    } = { personId: person._id };
    if (cursor !== undefined) {
      let position: ReturnType<typeof decodeCursor>;
      try {
        position = decodeCursor(cursor);
      } catch {
        throw new BadRequestException('malformed cursor');
      }
      const at = position.at;
      filter.$or = [
        { at: { $lt: at } },
        { at, _id: { $lt: new Types.ObjectId(position.id) } },
      ];
    }
    const rows = await this.visits
      .find(filter)
      .sort({ at: -1, _id: -1 })
      .limit(limit + 1)
      .exec();
    const page = rows.slice(0, limit);
    const last = page.at(-1);
    return {
      items: page.map((visit) => toBody(visit)),
      nextCursor:
        rows.length > limit && last !== undefined
          ? encodeCursor(last.at, last._id.toString())
          : null,
    };
  }

  private findByNavigation(
    personId: string,
    clientNavId: string,
  ): Promise<VisitDocument | null> {
    return this.visits
      .findOne({ personId: new Types.ObjectId(personId), clientNavId })
      .exec();
  }
}

function toBody(visit: VisitDocument): VisitBody {
  return {
    id: visit._id.toString(),
    address: visit.address,
    title: visit.title,
    via: visit.via,
    at: visit.at.toISOString(),
  };
}

function isDuplicateKey(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) {
    return false;
  }
  const record = error as { code?: unknown; cause?: unknown };
  if (record.code === 11000) {
    return true;
  }
  if (record.cause === undefined || record.cause === error) {
    return false;
  }
  return isDuplicateKey(record.cause);
}
