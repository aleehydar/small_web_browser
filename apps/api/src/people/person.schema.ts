import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

@Schema({ collection: 'people' })
export class Person {
  @Prop({ required: true, unique: true, type: String })
  slug: string;

  @Prop({ required: true, type: String })
  name: string;
}

export type PersonDocument = HydratedDocument<Person>;
export const PersonSchema = SchemaFactory.createForClass(Person);
