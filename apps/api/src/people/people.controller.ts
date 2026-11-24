import { Controller, Get } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Person } from './person.schema';

@Controller('people')
export class PeopleController {
  constructor(@InjectModel(Person.name) private readonly people: Model<Person>) {}

  @Get()
  async list(): Promise<{ id: string; slug: string; name: string }[]> {
    const people = await this.people.find().sort({ name: 1 }).exec();
    return people.map((person) => ({
      id: person._id.toString(),
      slug: person.slug,
      name: person.name,
    }));
  }
}
