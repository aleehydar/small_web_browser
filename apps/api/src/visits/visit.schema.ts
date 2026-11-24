import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';

export const VISIT_VIA = ['typed', 'link', 'search', 'history'] as const;
export type VisitVia = (typeof VISIT_VIA)[number];

@Schema({ collection: 'visits' })
export class Visit {
  @Prop({ required: true, type: MongooseSchema.Types.ObjectId })
  personId: Types.ObjectId;

  @Prop({ required: true, type: String })
  address: string;

  @Prop({ required: true, type: MongooseSchema.Types.ObjectId })
  revisionId: Types.ObjectId;

  @Prop({ required: true, type: String })
  title: string;

  @Prop({ required: true, type: String, enum: VISIT_VIA })
  via: VisitVia;

  @Prop({ required: true, type: String })
  clientNavId: string;

  @Prop({ required: true, type: Date })
  at: Date;
}

export type VisitDocument = HydratedDocument<Visit>;
export const VisitSchema = SchemaFactory.createForClass(Visit);

VisitSchema.index({ personId: 1, clientNavId: 1 }, { unique: true });
VisitSchema.index({ personId: 1, at: -1, _id: -1 });
