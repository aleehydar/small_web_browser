import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

@Schema({ collection: 'sites' })
export class Site {
  @Prop({ required: true, unique: true, type: String })
  address: string;

  @Prop({ required: true, type: Types.ObjectId })
  authorId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, default: null })
  currentRevisionId: Types.ObjectId | null;

  @Prop({ type: Number, default: 0 })
  currentNumber: number;

  @Prop({ required: true, type: String })
  title: string;

  @Prop({ required: true, type: String })
  text: string;

  @Prop({ required: true, type: Date })
  createdAt: Date;
}

export type SiteDocument = HydratedDocument<Site>;
export const SiteSchema = SchemaFactory.createForClass(Site);

SiteSchema.index(
  { title: 'text', text: 'text' },
  { weights: { title: 10, text: 1 }, default_language: 'none' },
);
