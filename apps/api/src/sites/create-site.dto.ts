import { Transform } from 'class-transformer';
import { IsMongoId, IsString, Length } from 'class-validator';

export class CreateSiteDto {
  @IsMongoId()
  authorId: string;

  @IsString()
  address: string;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @Length(1, 120)
  title: string;

  @IsString()
  @Length(1, 100_000)
  html: string;
}
