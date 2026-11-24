import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

@Schema({ collection: 'revisions' })
export class Revision {
  @Prop({ required: true, type: Types.ObjectId })
  siteId: Types.ObjectId;

  @Prop({ required: true, type: String })
  address: string;

  @Prop({ required: true, type: Number })
  number: number;

  @Prop({ required: true, type: String })
  title: string;

  @Prop({ required: true, type: String })
  html: string;

  @Prop({ required: true, type: String })
  text: string;

  @Prop({ required: true, type: Types.ObjectId })
  authorId: Types.ObjectId;

  @Prop({ required: true, type: Date })
  createdAt: Date;
}

export type RevisionDocument = HydratedDocument<Revision>;
export const RevisionSchema = SchemaFactory.createForClass(Revision);

RevisionSchema.index({ siteId: 1, number: 1 }, { unique: true });
