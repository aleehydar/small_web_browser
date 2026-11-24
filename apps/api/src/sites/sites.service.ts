import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { canonicalize } from '../address/address';
import { Person } from '../people/person.schema';
import { extractText, sanitizeHtml, wrapDocument } from '../sanitize/sanitize';
import { CreateSiteDto } from './create-site.dto';
import { Revision, type RevisionDocument } from './revision.schema';
import { Site, type SiteDocument } from './site.schema';

export interface PublishedPage {
  address: string;
  revisionId: string;
  title: string;
  authorName: string;
  publishedAt: string;
  document: string;
}

@Injectable()
export class SitesService {
  constructor(
    @InjectModel(Site.name) private readonly sites: Model<Site>,
    @InjectModel(Revision.name) private readonly revisions: Model<Revision>,
    @InjectModel(Person.name) private readonly people: Model<Person>,
  ) {}

  async resolve(input: string): Promise<PublishedPage> {
    const canonical = canonicalize(input);
    const address = canonical.ok
      ? canonical.address
      : input.trim().slice(0, 200);
    if (!canonical.ok) {
      this.noSuchAddress(address);
    }
    const site = await this.sites.findOne({ address: canonical.address }).exec();
    if (
      site === null ||
      site.currentRevisionId === null ||
      site.currentRevisionId === undefined
    ) {
      this.noSuchAddress(address);
    }
    const revision = await this.revisions
      .findById(site.currentRevisionId)
      .exec();
    if (revision === null) {
      this.noSuchAddress(address);
    }
    return this.toPage(revision);
  }

  async revision(id: string): Promise<PublishedPage> {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException();
    }
    let found: RevisionDocument | null;
    try {
      found = await this.revisions.findById(id).exec();
    } catch {
      throw new NotFoundException();
    }
    if (found === null) {
      throw new NotFoundException();
    }
    return this.toPage(found);
  }

  async publish(
    dto: CreateSiteDto,
  ): Promise<{ address: string; revisionId: string }> {
    const canonical = canonicalize(dto.address);
    if (!canonical.ok) {
      throw new UnprocessableEntityException(
        'address does not canonicalize',
      );
    }
    const author = await this.people.findById(dto.authorId).exec();
    if (author === null) {
      throw new UnprocessableEntityException('author does not exist');
    }
    const html = sanitizeHtml(dto.html);
    const text = extractText(html);
    if (text === '') {
      throw new UnprocessableEntityException(
        'sanitized html has no visible text',
      );
    }
    const title = dto.title.trim();
    const address = canonical.address;
    const existing = await this.sites.findOne({ address }).exec();
    if (existing !== null) {
      if (!existing.authorId.equals(dto.authorId)) {
        throw new ConflictException(
          'address is owned by a different author',
        );
      }
      return this.appendRevision(existing, {
        address,
        title,
        html,
        text,
        authorId: author._id,
      });
    }

    // Claim the address before writing a revision. A null currentRevisionId
    // is invisible to resolve, so a half-finished publish leads nowhere.
    let site: SiteDocument;
    try {
      site = await this.sites.create({
        address,
        authorId: author._id,
        currentRevisionId: null,
        title,
        text,
        createdAt: new Date(),
      });
    } catch (error) {
      if (isDuplicateKey(error)) {
        throw new ConflictException('address is owned by a different author');
      }
      throw error;
    }
    const created = await this.revisions.create({
      siteId: site._id,
      address,
      number: 1,
      title,
      html,
      text,
      authorId: author._id,
      createdAt: new Date(),
    });
    site.currentRevisionId = created._id;
    await site.save();
    return { address, revisionId: created._id.toString() };
  }

  private async appendRevision(
    site: SiteDocument,
    content: {
      address: string;
      title: string;
      html: string;
      text: string;
      authorId: Types.ObjectId;
    },
  ): Promise<{ address: string; revisionId: string }> {
    const latest = await this.revisions
      .findOne({ siteId: site._id })
      .sort({ number: -1 })
      .exec();
    const created = await this.revisions.create({
      siteId: site._id,
      address: content.address,
      number: (latest?.number ?? 0) + 1,
      title: content.title,
      html: content.html,
      text: content.text,
      authorId: content.authorId,
      createdAt: new Date(),
    });
    site.currentRevisionId = created._id;
    site.title = content.title;
    site.text = content.text;
    await site.save();
    return { address: content.address, revisionId: created._id.toString() };
  }

  private async toPage(revision: RevisionDocument): Promise<PublishedPage> {
    const author = await this.people.findById(revision.authorId).exec();
    if (author === null) {
      throw new NotFoundException();
    }
    return {
      address: revision.address,
      revisionId: revision._id.toString(),
      title: revision.title,
      authorName: author.name,
      publishedAt: revision.createdAt.toISOString(),
      document: wrapDocument(revision.html),
    };
  }

  private noSuchAddress(address: string): never {
    throw new NotFoundException({
      statusCode: 404,
      error: 'Not Found',
      message: 'No such address',
      address,
    });
  }
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
