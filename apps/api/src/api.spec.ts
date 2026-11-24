import 'reflect-metadata';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { getConnectionToken, getModelToken, MongooseModule } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import { jest } from '@jest/globals';
import { Types, type Connection, type Model } from 'mongoose';
import request from 'supertest';
import { PeopleModule } from './people/people.module';
import { Person } from './people/person.schema';
import { SearchModule } from './search/search.module';
import { Revision } from './sites/revision.schema';
import { Site } from './sites/site.schema';
import { SitesModule } from './sites/sites.module';
import { Visit } from './visits/visit.schema';
import { VisitsModule } from './visits/visits.module';

const TEST_URI =
  process.env.MONGO_TEST_URI ?? 'mongodb://localhost:27017/smallweb_test';

function assertTestUri(uri: string): void {
  const name = new URL(uri).pathname.replace(/^\//, '');
  if (name !== 'smallweb_test') {
    throw new Error(`Refusing to use database "${name}"`);
  }
}

describe('http api', () => {
  let app: INestApplication;
  let connection: Connection;
  let people: Model<Person>;
  let visits: Model<Visit>;

  beforeAll(async () => {
    assertTestUri(TEST_URI);
    const moduleRef = await Test.createTestingModule({
      imports: [
        MongooseModule.forRoot(TEST_URI, { serverSelectionTimeoutMS: 5000 }),
        PeopleModule,
        SitesModule,
        SearchModule,
        VisitsModule,
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
    connection = app.get<Connection>(getConnectionToken());
    if (connection.db?.databaseName !== 'smallweb_test') {
      throw new Error(
        `Refusing to drop database "${connection.db?.databaseName ?? 'unknown'}"`,
      );
    }
    people = app.get<Model<Person>>(getModelToken(Person.name));
    visits = app.get<Model<Visit>>(getModelToken(Visit.name));
  }, 20000);

  beforeEach(async () => {
    if (connection.db?.databaseName !== 'smallweb_test') {
      throw new Error(
        `Refusing to drop database "${connection.db?.databaseName ?? 'unknown'}"`,
      );
    }
    await connection.dropDatabase();
    await Promise.all(
      Object.values(connection.models).map((model) => model.createIndexes()),
    );
  });

  afterAll(async () => {
    await app.close();
  });

  async function createAuthor(slug: string, name: string): Promise<string> {
    const person = await people.create({ slug, name });
    return person._id.toString();
  }

  function http(): request.Agent {
    return request(app.getHttpServer());
  }

  it('resolve returns 200 for a published site', async () => {
    const authorId = await createAuthor('ada', 'Ada Lovelace');
    const published = await http().post('/api/sites').send({
      authorId,
      address: 'tidepool.zz',
      title: 'Tides',
      html: '<p>Rising</p>',
    });
    expect(published.status).toBe(201);

    const response = await http()
      .get('/api/resolve')
      .query({ address: 'tidepool.zz' });
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      address: 'tidepool.zz',
      revisionId: published.body.revisionId,
      title: 'Tides',
      authorName: 'Ada Lovelace',
    });
    expect(response.body.document).toContain('<p>Rising</p>');
    expect(response.body.publishedAt).toBe(
      new Date(response.body.publishedAt as string).toISOString(),
    );
  });

  it('resolve returns the canonical site for an uppercase address', async () => {
    const authorId = await createAuthor('ada', 'Ada Lovelace');
    await http().post('/api/sites').send({
      authorId,
      address: 'tidepool.zz',
      title: 'Tides',
      html: '<p>Rising</p>',
    });

    const response = await http()
      .get('/api/resolve')
      .query({ address: 'TIDEPOOL.ZZ' });
    expect(response.status).toBe(200);
    expect(response.body.address).toBe('tidepool.zz');
    expect(response.body.title).toBe('Tides');
  });

  it('resolve returns 404 with the canonical address when none exists', async () => {
    const response = await http()
      .get('/api/resolve')
      .query({ address: 'MISSING.ZZ' });
    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      statusCode: 404,
      error: 'Not Found',
      message: 'No such address',
      address: 'missing.zz',
    });
  });

  it('resolve returns 404 with the trimmed input when the address is invalid', async () => {
    const response = await http()
      .get('/api/resolve')
      .query({ address: '  NOT AN ADDRESS  ' });
    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      statusCode: 404,
      error: 'Not Found',
      message: 'No such address',
      address: 'NOT AN ADDRESS',
    });

    const long = `  ${'Z'.repeat(250)}  `;
    const capped = await http().get('/api/resolve').query({ address: long });
    expect(capped.status).toBe(404);
    expect(capped.body.address).toBe('Z'.repeat(200));
  });

  it('resolve returns 400 when address is missing', async () => {
    const response = await http().get('/api/resolve');
    expect(response.status).toBe(400);
  });

  it('published document has the CSP meta first and no script', async () => {
    const authorId = await createAuthor('ada', 'Ada Lovelace');
    const published = await http().post('/api/sites').send({
      authorId,
      address: 'tidepool.zz',
      title: 'Tides',
      html: '<p>Visible</p><script>alert(1)</script>',
    });
    expect(published.status).toBe(201);

    const response = await http()
      .get('/api/resolve')
      .query({ address: 'tidepool.zz' });
    const document = response.body.document as string;
    const head = document.slice(
      document.indexOf('<head>'),
      document.indexOf('</head>'),
    );
    expect(head.startsWith(
      '<head><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'; img-src \'none\'; base-uri \'none\'; form-action \'none\'">',
    )).toBe(true);
    expect(document).not.toContain('<script');
    expect(document).toContain('<p>Visible</p>');
  });

  it('publish returns 201', async () => {
    const authorId = await createAuthor('ada', 'Ada Lovelace');
    const response = await http().post('/api/sites').send({
      authorId,
      address: '  Tidepool.zz  ',
      title: `  ${'a'.repeat(120)}  `,
      html: '<p>Hello</p>',
    });
    expect(response.status).toBe(201);
    expect(response.body.address).toBe('tidepool.zz');
    expect(response.body.revisionId).toMatch(/^[a-f0-9]{24}$/);

    const resolved = await http()
      .get('/api/resolve')
      .query({ address: 'tidepool.zz' });
    expect(resolved.body.title).toBe('a'.repeat(120));
  });

  it('publish returns 409 when another author owns the address', async () => {
    const owner = await createAuthor('ada', 'Ada Lovelace');
    const other = await createAuthor('grace', 'Grace Hopper');
    const first = await http().post('/api/sites').send({
      authorId: owner,
      address: 'tidepool.zz',
      title: 'Tides',
      html: '<p>Mine</p>',
    });
    expect(first.status).toBe(201);

    const response = await http().post('/api/sites').send({
      authorId: other,
      address: 'TIDEPOOL.ZZ',
      title: 'Theirs',
      html: '<p>Theirs</p>',
    });
    expect(response.status).toBe(409);
    expect(response.body.message).toBe(
      'address is owned by a different author',
    );
  });

  it('publish returns 422 when the address does not canonicalize', async () => {
    const authorId = await createAuthor('ada', 'Ada Lovelace');
    const response = await http().post('/api/sites').send({
      authorId,
      address: 'not a site',
      title: 'Tides',
      html: '<p>Hello</p>',
    });
    expect(response.status).toBe(422);
    expect(response.body.message).toBe('address does not canonicalize');
  });

  it('publish returns 422 when the author does not exist', async () => {
    const response = await http().post('/api/sites').send({
      authorId: new Types.ObjectId().toHexString(),
      address: 'tidepool.zz',
      title: 'Tides',
      html: '<p>Hello</p>',
    });
    expect(response.status).toBe(422);
    expect(response.body.message).toBe('author does not exist');
  });

  it('publish returns 422 when the html has no visible text', async () => {
    const authorId = await createAuthor('ada', 'Ada Lovelace');
    const response = await http().post('/api/sites').send({
      authorId,
      address: 'tidepool.zz',
      title: 'Tides',
      html: '<script>alert(1)</script>',
    });
    expect(response.status).toBe(422);
    expect(response.body.message).toBe('sanitized html has no visible text');
  });

  it('publish returns 400 when the title is longer than 120 characters', async () => {
    const authorId = await createAuthor('ada', 'Ada Lovelace');
    const response = await http().post('/api/sites').send({
      authorId,
      address: 'tidepool.zz',
      title: 'a'.repeat(121),
      html: '<p>Hello</p>',
    });
    expect(response.status).toBe(400);
  });

  it('publish returns 400 when the body has an unknown field', async () => {
    const authorId = await createAuthor('ada', 'Ada Lovelace');
    const response = await http().post('/api/sites').send({
      authorId,
      address: 'tidepool.zz',
      title: 'Tides',
      html: '<p>Hello</p>',
      extra: true,
    });
    expect(response.status).toBe(400);
  });

  it('republish keeps the previous revision fetchable', async () => {
    const authorId = await createAuthor('ada', 'Ada Lovelace');
    const first = await http().post('/api/sites').send({
      authorId,
      address: 'tidepool.zz',
      title: 'First',
      html: '<p>one</p>',
    });
    expect(first.status).toBe(201);
    const second = await http().post('/api/sites').send({
      authorId,
      address: 'tidepool.zz',
      title: 'Second',
      html: '<p>two</p>',
    });
    expect(second.status).toBe(201);
    expect(second.body.revisionId).not.toBe(first.body.revisionId);

    const current = await http()
      .get('/api/resolve')
      .query({ address: 'tidepool.zz' });
    expect(current.status).toBe(200);
    expect(current.body.revisionId).toBe(second.body.revisionId);
    expect(current.body.title).toBe('Second');
    expect(current.body.document).toContain('<p>two</p>');

    const previous = await http().get(
      `/api/revisions/${first.body.revisionId as string}`,
    );
    expect(previous.status).toBe(200);
    expect(previous.body.title).toBe('First');
    expect(previous.body.document).toContain('<p>one</p>');
    expect(previous.body.document).not.toContain('<p>two</p>');
  });

  it('concurrent claims of a new address yield one 201 and one 409', async () => {
    const ada = await createAuthor('ada', 'Ada Lovelace');
    const grace = await createAuthor('grace', 'Grace Hopper');
    const [left, right] = await Promise.all([
      http().post('/api/sites').send({
        authorId: ada,
        address: 'race.zz',
        title: 'Ada',
        html: '<p>Ada</p>',
      }),
      http().post('/api/sites').send({
        authorId: grace,
        address: 'race.zz',
        title: 'Grace',
        html: '<p>Grace</p>',
      }),
    ]);
    expect([left.status, right.status].sort((a, b) => a - b)).toEqual([
      201, 409,
    ]);
  });

  it('same author publishing a new address twice concurrently gets revisions 1 and 2', async () => {
    const authorId = await createAuthor('ada', 'Ada Lovelace');
    const [left, right] = await Promise.all([
      http().post('/api/sites').send({
        authorId,
        address: 'double.zz',
        title: 'One',
        html: '<p>One</p>',
      }),
      http().post('/api/sites').send({
        authorId,
        address: 'double.zz',
        title: 'Two',
        html: '<p>Two</p>',
      }),
    ]);
    expect(left.status).toBe(201);
    expect(right.status).toBe(201);
    const sites = app.get<Model<Site>>(getModelToken(Site.name));
    const revisions = app.get<Model<Revision>>(getModelToken(Revision.name));
    expect(await sites.countDocuments().exec()).toBe(1);
    const stored = await revisions.find().sort({ number: 1 }).exec();
    expect(stored.map((revision) => revision.number)).toEqual([1, 2]);
  });

  it('five concurrent republishes get distinct consecutive revision numbers', async () => {
    const authorId = await createAuthor('ada', 'Ada Lovelace');
    const first = await http().post('/api/sites').send({
      authorId,
      address: 'republish.zz',
      title: 'Base',
      html: '<p>Base</p>',
    });
    expect(first.status).toBe(201);
    const responses = await Promise.all(
      [1, 2, 3, 4, 5].map((n) =>
        http().post('/api/sites').send({
          authorId,
          address: 'republish.zz',
          title: `Rev ${n}`,
          html: `<p>${n}</p>`,
        }),
      ),
    );
    expect(responses.map((response) => response.status)).toEqual([
      201, 201, 201, 201, 201,
    ]);
    const revisions = app.get<Model<Revision>>(getModelToken(Revision.name));
    const stored = await revisions.find().sort({ number: 1 }).exec();
    expect(stored.map((revision) => revision.number)).toEqual([
      1, 2, 3, 4, 5, 6,
    ]);
  });

  it('a lower revision that updates the site later does not replace a higher one', async () => {
    const sites = app.get<Model<Site>>(getModelToken(Site.name));
    const revisions = app.get<Model<Revision>>(getModelToken(Revision.name));
    const original = sites.updateOne.bind(sites);
    let releaseLower = (): void => {};
    const holdLower = new Promise<void>((resolve) => {
      releaseLower = resolve;
    });
    let markLowerStarted = (): void => {};
    const lowerStarted = new Promise<void>((resolve) => {
      markLowerStarted = resolve;
    });
    let held = false;
    const spy = jest.spyOn(sites, 'updateOne').mockImplementation((...args) => {
      const query = original(...args);
      if (!held) {
        held = true;
        markLowerStarted();
        const exec = query.exec.bind(query);
        query.exec = ((...execArgs: Parameters<typeof exec>) =>
          holdLower.then(() => exec(...execArgs))) as typeof query.exec;
      }
      return query;
    });
    let lowerPublish: Promise<request.Response> | undefined;
    try {
      const authorId = await createAuthor('ada', 'Ada Lovelace');
      // .end() sends immediately. Awaiting the supertest promise would wait
      // until the held updateOne finishes, which is the signal we need first.
      lowerPublish = new Promise((resolve, reject) => {
        http()
          .post('/api/sites')
          .send({
            authorId,
            address: 'forward.zz',
            title: 'Low',
            html: '<p>low</p>',
          })
          .end((err, res) => {
            if (err) {
              reject(err);
              return;
            }
            resolve(res);
          });
      });
      let timeout: NodeJS.Timeout | undefined;
      try {
        await Promise.race([
          lowerStarted,
          new Promise<never>((_resolve, reject) => {
            timeout = setTimeout(
              () => reject(new Error('updateOne was not called')),
              5000,
            );
          }),
        ]);
      } finally {
        if (timeout !== undefined) {
          clearTimeout(timeout);
        }
      }
      const higher = await http().post('/api/sites').send({
        authorId,
        address: 'forward.zz',
        title: 'High',
        html: '<p>high</p>',
      });
      expect(higher.status).toBe(201);
      releaseLower();
      const lower = await lowerPublish;
      expect(lower.status).toBe(201);

      const higherRevision = await revisions
        .findById(higher.body.revisionId as string)
        .exec();
      const lowerRevision = await revisions
        .findById(lower.body.revisionId as string)
        .exec();
      expect(higherRevision).not.toBeNull();
      expect(lowerRevision).not.toBeNull();
      expect(higherRevision?.number).toBeGreaterThan(lowerRevision?.number ?? 0);
      const site = await sites.findOne({ address: 'forward.zz' }).exec();
      expect(site?.currentRevisionId?.toString()).toBe(
        higherRevision?._id.toString(),
      );
      expect(site?.currentNumber).toBe(higherRevision?.number);
      expect(site?.title).toBe(higherRevision?.title);
      expect(site?.text).toBe(higherRevision?.text);

      const resolved = await http()
        .get('/api/resolve')
        .query({ address: 'forward.zz' });
      expect(resolved.status).toBe(200);
      expect(resolved.body.revisionId).toBe(higher.body.revisionId);
      expect(resolved.body.title).toBe(higherRevision?.title);
    } finally {
      releaseLower();
      spy.mockRestore();
      await lowerPublish?.catch(() => undefined);
    }
  });

  it('revisions returns 404 for a malformed id', async () => {
    const response = await http().get('/api/revisions/not-an-id');
    expect(response.status).toBe(404);
  });

  it('revisions returns 404 for a 12-character id', async () => {
    const response = await http().get('/api/revisions/abcdefghijkl');
    expect(response.status).toBe(404);
  });

  it('revisions returns 404 for an unknown id', async () => {
    const response = await http().get(
      `/api/revisions/${new Types.ObjectId().toHexString()}`,
    );
    expect(response.status).toBe(404);
  });

  function body(word: string, fillerCount: number): string {
    return [word, ...Array.from({ length: fillerCount }, () => 'alpha')].join(
      ' ',
    );
  }

  async function publish(
    authorId: string,
    address: string,
    title: string,
    html: string,
  ): Promise<void> {
    const response = await http().post('/api/sites').send({
      authorId,
      address,
      title,
      html,
    });
    expect(response.status).toBe(201);
  }

  it('search ranks a title match above repeated body matches above one body match', async () => {
    const authorId = await createAuthor('ada', 'Ada Lovelace');
    const bodyA = body('kelp', 29);
    const bodyB = ['kelp', 'kelp', 'kelp', ...Array.from({ length: 27 }, () => 'alpha')].join(
      ' ',
    );
    const bodyC = body('kelp', 29);
    await publish(authorId, 'a.zz', 'kelp tide', `<p>${bodyA}</p>`);
    await publish(authorId, 'b.zz', 'sand tide', `<p>${bodyB}</p>`);
    await publish(authorId, 'c.zz', 'rock tide', `<p>${bodyC}</p>`);

    const response = await http().get('/api/search').query({ q: 'kelp' });
    expect(response.status).toBe(200);
    expect(response.body.results.map((hit: { address: string }) => hit.address)).toEqual([
      'a.zz',
      'b.zz',
      'c.zz',
    ]);
  });

  it('search follows a republish and drops the old wording', async () => {
    const authorId = await createAuthor('ada', 'Ada Lovelace');
    await publish(authorId, 'tide.zz', 'Tide', '<p>kelp forest</p>');
    const before = await http().get('/api/search').query({ q: 'kelp' });
    expect(before.body.results.map((hit: { address: string }) => hit.address)).toEqual([
      'tide.zz',
    ]);

    await publish(authorId, 'tide.zz', 'Tide', '<p>otter forest</p>');
    const kelp = await http().get('/api/search').query({ q: 'kelp' });
    expect(kelp.status).toBe(200);
    expect(kelp.body.results).toEqual([]);
    const otter = await http().get('/api/search').query({ q: 'otter' });
    expect(otter.body.results.map((hit: { address: string }) => hit.address)).toEqual([
      'tide.zz',
    ]);
  });

  it('search skips a site with no current revision', async () => {
    const authorId = await createAuthor('ada', 'Ada Lovelace');
    await publish(authorId, 'visible.zz', 'Visible kelp', '<p>kelp</p>');
    const sites = app.get<Model<Site>>(getModelToken(Site.name));
    await sites.create({
      address: 'hidden.zz',
      authorId: new Types.ObjectId(authorId),
      currentRevisionId: null,
      currentNumber: 0,
      title: 'hidden kelp',
      text: 'kelp kelp kelp',
      createdAt: new Date(),
    });

    const response = await http().get('/api/search').query({ q: 'kelp' });
    expect(response.status).toBe(200);
    expect(response.body.results.map((hit: { address: string }) => hit.address)).toEqual([
      'visible.zz',
    ]);
  });

  it('search returns an empty list when nothing matches', async () => {
    const authorId = await createAuthor('ada', 'Ada Lovelace');
    await publish(authorId, 'tide.zz', 'Tide', '<p>kelp forest</p>');
    const response = await http().get('/api/search').query({ q: 'zzzxxx' });
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ query: 'zzzxxx', results: [] });
  });

  it('search returns 400 when q is missing', async () => {
    const response = await http().get('/api/search');
    expect(response.status).toBe(400);
  });
    it('search limits q to 200 characters after trimming', async () => {
    const padded = `${' '.repeat(50)}${'a'.repeat(200)}`;
    const ok = await http().get('/api/search').query({ q: padded });
    expect(ok.status).toBe(200);
    const tooLong = await http().get('/api/search').query({ q: 'a'.repeat(201) });
    expect(tooLong.status).toBe(400);
  });

  it('search returns an empty list for a blank query', async () => {
    const response = await http().get('/api/search').query({ q: '   ' });
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ query: '', results: [] });
  });

  it('search treats a leading minus as text, not an operator', async () => {
    const authorId = await createAuthor('ada', 'Ada Lovelace');
    await publish(authorId, 'tide.zz', 'Tide', '<p>kelp forest</p>');
    const plain = await http().get('/api/search').query({ q: 'kelp' });
    const negated = await http().get('/api/search').query({ q: '-kelp' });
    expect(negated.status).toBe(200);
    expect(negated.body.results).toEqual(plain.body.results);
  });

  it('search uses only the first eight words', async () => {
    const authorId = await createAuthor('ada', 'Ada Lovelace');
    await publish(authorId, 'alpha.zz', 'Alpha', '<p>alpha</p>');
    await publish(authorId, 'hotel.zz', 'Hotel', '<p>hotel</p>');
    await publish(authorId, 'omega.zz', 'Omega', '<p>omega</p>');
    const response = await http().get('/api/search').query({
      q: 'alpha bravo charlie delta echo foxtrot golf hotel omega',
    });
    expect(response.status).toBe(200);
    const addresses = response.body.results.map(
      (hit: { address: string }) => hit.address,
    );
    expect(addresses).toContain('alpha.zz');
    expect(addresses).toContain('hotel.zz');
    expect(addresses).not.toContain('omega.zz');
  });

  it('search snippet segments are plain text and mark the query token', async () => {
    const authorId = await createAuthor('ada', 'Ada Lovelace');
    await publish(authorId, 'tide.zz', 'Tide', '<p>The Kelp forest</p>');
    const response = await http().get('/api/search').query({ q: 'kelp' });
    expect(response.status).toBe(200);
    const hit = response.body.results[0] as {
      snippet: { text: string; match: boolean }[];
    };
    expect(hit.snippet.length).toBeGreaterThan(0);
    for (const segment of hit.snippet) {
      expect(Object.keys(segment).sort()).toEqual(['match', 'text']);
      expect(typeof segment.text).toBe('string');
      expect(typeof segment.match).toBe('boolean');
    }
    const matched = hit.snippet.filter((segment) => segment.match);
    expect(matched.length).toBeGreaterThan(0);
    for (const segment of matched) {
      expect(segment.text.toLowerCase()).toBe('kelp');
    }
  });

  async function publishRevision(
    authorId: string,
    address: string,
    title: string,
  ): Promise<string> {
    const response = await http().post('/api/sites').send({
      authorId,
      address,
      title,
      html: '<p>Rising</p>',
    });
    expect(response.status).toBe(201);
    return response.body.revisionId as string;
  }

  it('post visit returns 201 with the revision address and title', async () => {
    const personId = await createAuthor('ada', 'Ada Lovelace');
    const revisionId = await publishRevision(personId, 'tidepool.zz', 'Tides');
    const response = await http().post('/api/visits').send({
      personId,
      revisionId,
      via: 'typed',
      clientNavId: 'nav-1',
    });
    expect(response.status).toBe(201);
    expect(response.body).toEqual({
      id: expect.any(String) as string,
      address: 'tidepool.zz',
      title: 'Tides',
      via: 'typed',
      at: expect.any(String) as string,
    });
    expect(Number.isNaN(Date.parse(response.body.at as string))).toBe(false);
  });

  it('post visit returns 400 when address is sent', async () => {
    const personId = await createAuthor('ada', 'Ada Lovelace');
    const revisionId = await publishRevision(personId, 'tidepool.zz', 'Tides');
    const response = await http().post('/api/visits').send({
      personId,
      revisionId,
      via: 'typed',
      clientNavId: 'nav-1',
      address: 'tidepool.zz',
    });
    expect(response.status).toBe(400);
  });

  it('replaying the same person and clientNavId returns 200 and the same id', async () => {
    const personId = await createAuthor('ada', 'Ada Lovelace');
    const revisionId = await publishRevision(personId, 'tidepool.zz', 'Tides');
    const body = {
      personId,
      revisionId,
      via: 'link',
      clientNavId: 'nav-1',
    };
    const first = await http().post('/api/visits').send(body);
    const second = await http().post('/api/visits').send(body);
    expect(first.status).toBe(201);
    expect(second.status).toBe(200);
    expect(second.body).toEqual(first.body);
    expect(await visits.countDocuments()).toBe(1);
  });

  it('twenty concurrent posts of one navigation create one visit', async () => {
    const personId = await createAuthor('ada', 'Ada Lovelace');
    const revisionId = await publishRevision(personId, 'tidepool.zz', 'Tides');
    const body = {
      personId,
      revisionId,
      via: 'search',
      clientNavId: 'nav-race',
    };
    const responses = await Promise.all(
      Array.from({ length: 20 }, () => http().post('/api/visits').send(body)),
    );
    const statuses = responses.map((response) => response.status);
    expect(statuses.filter((status) => status === 201)).toHaveLength(1);
    expect(statuses.filter((status) => status === 200)).toHaveLength(19);
    const ids = responses.map((response) => response.body.id as string);
    expect(new Set(ids).size).toBe(1);
    expect(await visits.countDocuments()).toBe(1);
  });

  it('the same clientNavId for two people creates two visits', async () => {
    const ada = await createAuthor('ada', 'Ada Lovelace');
    const grace = await createAuthor('grace', 'Grace Hopper');
    const revisionId = await publishRevision(ada, 'tidepool.zz', 'Tides');
    const first = await http().post('/api/visits').send({
      personId: ada,
      revisionId,
      via: 'typed',
      clientNavId: 'shared',
    });
    const second = await http().post('/api/visits').send({
      personId: grace,
      revisionId,
      via: 'typed',
      clientNavId: 'shared',
    });
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(first.body.id).not.toBe(second.body.id);
    expect(await visits.countDocuments()).toBe(2);
  });

  it('post visit returns 422 for an unknown person', async () => {
    const personId = await createAuthor('ada', 'Ada Lovelace');
    const revisionId = await publishRevision(personId, 'tidepool.zz', 'Tides');
    const response = await http().post('/api/visits').send({
      personId: '507f1f77bcf86cd799439011',
      revisionId,
      via: 'typed',
      clientNavId: 'nav-1',
    });
    expect(response.status).toBe(422);
  });

  it('post visit returns 422 for an unknown revision', async () => {
    const personId = await createAuthor('ada', 'Ada Lovelace');
    const response = await http().post('/api/visits').send({
      personId,
      revisionId: '507f1f77bcf86cd799439011',
      via: 'typed',
      clientNavId: 'nav-1',
    });
    expect(response.status).toBe(422);
  });

  it('post visit returns 400 for a malformed person id', async () => {
    const response = await http().post('/api/visits').send({
      personId: 'not-an-id',
      revisionId: '507f1f77bcf86cd799439011',
      via: 'typed',
      clientNavId: 'nav-1',
    });
    expect(response.status).toBe(400);
  });

  it('post visit returns 400 for a malformed revision id', async () => {
    const personId = await createAuthor('ada', 'Ada Lovelace');
    const response = await http().post('/api/visits').send({
      personId,
      revisionId: 'not-an-id',
      via: 'typed',
      clientNavId: 'nav-1',
    });
    expect(response.status).toBe(400);
  });

  it('post visit returns 400 for a bad via', async () => {
    const personId = await createAuthor('ada', 'Ada Lovelace');
    const revisionId = await publishRevision(personId, 'tidepool.zz', 'Tides');
    const response = await http().post('/api/visits').send({
      personId,
      revisionId,
      via: 'teleport',
      clientNavId: 'nav-1',
    });
    expect(response.status).toBe(400);
  });

  it('post visit returns 400 for a bad clientNavId', async () => {
    const personId = await createAuthor('ada', 'Ada Lovelace');
    const revisionId = await publishRevision(personId, 'tidepool.zz', 'Tides');
    const response = await http().post('/api/visits').send({
      personId,
      revisionId,
      via: 'typed',
      clientNavId: 'has space',
    });
    expect(response.status).toBe(400);
  });

  it('history is newest first', async () => {
    const personId = await createAuthor('ada', 'Ada Lovelace');
    const revisionId = new Types.ObjectId();
    await visits.create({
      _id: new Types.ObjectId('000000000000000000000001'),
      personId,
      address: 'old.zz',
      revisionId,
      title: 'Old',
      via: 'typed',
      clientNavId: 'old',
      at: new Date('2026-01-01T00:00:00.000Z'),
    });
    await visits.create({
      _id: new Types.ObjectId('000000000000000000000002'),
      personId,
      address: 'new.zz',
      revisionId,
      title: 'New',
      via: 'link',
      clientNavId: 'new',
      at: new Date('2026-01-03T00:00:00.000Z'),
    });
    const response = await http().get(`/api/people/${personId}/history`);
    expect(response.status).toBe(200);
    expect(
      response.body.items.map((item: { title: string }) => item.title),
    ).toEqual(['New', 'Old']);
  });

  it('history is empty when a person has no visits', async () => {
    const personId = await createAuthor('ada', 'Ada Lovelace');
    const response = await http().get(`/api/people/${personId}/history`);
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ items: [], nextCursor: null });
  });

  it('history pages of three stay complete when two visits share a timestamp', async () => {
    const personId = await createAuthor('ada', 'Ada Lovelace');
    const revisionId = new Types.ObjectId();
    const shared = new Date('2026-06-03T00:00:00.000Z');
    const rows = [
      { n: 7, at: new Date('2026-06-07T00:00:00.000Z') },
      { n: 6, at: new Date('2026-06-06T00:00:00.000Z') },
      { n: 5, at: shared },
      { n: 4, at: shared },
      { n: 3, at: new Date('2026-06-02T00:00:00.000Z') },
      { n: 2, at: new Date('2026-06-01T00:00:00.000Z') },
      { n: 1, at: new Date('2026-05-31T00:00:00.000Z') },
    ];
    for (const row of rows) {
      await visits.create({
        _id: new Types.ObjectId(row.n.toString(16).padStart(24, '0')),
        personId,
        address: `s${row.n}.zz`,
        revisionId,
        title: `T${row.n}`,
        via: 'history',
        clientNavId: `nav-${row.n}`,
        at: row.at,
      });
    }

    const seen: string[] = [];
    const pageSizes: number[] = [];
    let cursor: string | undefined;
    for (let page = 0; page < 5; page += 1) {
      const response = await http()
        .get(`/api/people/${personId}/history`)
        .query({ limit: 3, ...(cursor === undefined ? {} : { cursor }) });
      expect(response.status).toBe(200);
      const items = response.body.items as { id: string; at: string }[];
      pageSizes.push(items.length);
      seen.push(...items.map((item) => item.id));
      if (page === 0) {
        expect(items[2]?.at).toBe(shared.toISOString());
      }
      if (page === 1) {
        expect(items[0]?.at).toBe(shared.toISOString());
      }
      if (response.body.nextCursor === null) {
        expect(page).toBe(2);
        break;
      }
      cursor = response.body.nextCursor as string;
    }

    expect(pageSizes).toEqual([3, 3, 1]);
    expect(seen).toEqual(
      rows.map((row) => row.n.toString(16).padStart(24, '0')),
    );
    expect(new Set(seen).size).toBe(seen.length);
  });

  it('history does not include another person', async () => {
    const ada = await createAuthor('ada', 'Ada Lovelace');
    const grace = await createAuthor('grace', 'Grace Hopper');
    const revisionId = new Types.ObjectId();
    await visits.create({
      personId: ada,
      address: 'ada.zz',
      revisionId,
      title: 'Ada',
      via: 'typed',
      clientNavId: 'ada',
      at: new Date('2026-01-01T00:00:00.000Z'),
    });
    await visits.create({
      personId: grace,
      address: 'grace.zz',
      revisionId,
      title: 'Grace',
      via: 'typed',
      clientNavId: 'grace',
      at: new Date('2026-02-01T00:00:00.000Z'),
    });
    const response = await http().get(`/api/people/${ada}/history`);
    expect(response.status).toBe(200);
    expect(response.body.items).toEqual([
      expect.objectContaining({ address: 'ada.zz', title: 'Ada' }),
    ]);
  });

  it('history keeps the title of the visited revision after a republish', async () => {
    const personId = await createAuthor('ada', 'Ada Lovelace');
    const revisionId = await publishRevision(
      personId,
      'tidepool.zz',
      'First title',
    );
    const recorded = await http().post('/api/visits').send({
      personId,
      revisionId,
      via: 'link',
      clientNavId: 'nav-1',
    });
    expect(recorded.status).toBe(201);
    const republished = await http().post('/api/sites').send({
      authorId: personId,
      address: 'tidepool.zz',
      title: 'Second title',
      html: '<p>Later</p>',
    });
    expect(republished.status).toBe(201);
    const history = await http().get(`/api/people/${personId}/history`);
    expect(history.status).toBe(200);
    expect(history.body.items).toEqual([
      {
        id: recorded.body.id,
        address: 'tidepool.zz',
        title: 'First title',
        via: 'link',
        at: recorded.body.at,
      },
    ]);
  });

  it('history returns 404 for an unknown person', async () => {
    const response = await http().get(
      '/api/people/507f1f77bcf86cd799439011/history',
    );
    expect(response.status).toBe(404);
  });

  it('history returns 404 for a malformed id', async () => {
    const response = await http().get('/api/people/abcdefghijkl/history');
    expect(response.status).toBe(404);
  });

  it('history returns 400 for limit 0', async () => {
    const personId = await createAuthor('ada', 'Ada Lovelace');
    const response = await http()
      .get(`/api/people/${personId}/history`)
      .query({ limit: 0 });
    expect(response.status).toBe(400);
  });

  it('history returns 400 for limit 101', async () => {
    const personId = await createAuthor('ada', 'Ada Lovelace');
    const response = await http()
      .get(`/api/people/${personId}/history`)
      .query({ limit: 101 });
    expect(response.status).toBe(400);
  });

  it('history returns 400 for a garbage cursor', async () => {
    const personId = await createAuthor('ada', 'Ada Lovelace');
    const response = await http()
      .get(`/api/people/${personId}/history`)
      .query({ cursor: 'not-a-cursor' });
    expect(response.status).toBe(400);
  });

  it('people are sorted by name', async () => {
    await createAuthor('grace', 'Grace Hopper');
    await createAuthor('ada', 'Ada Lovelace');
    const response = await http().get('/api/people');
    expect(response.status).toBe(200);
    expect(response.body).toEqual([
      {
        id: expect.any(String) as string,
        slug: 'ada',
        name: 'Ada Lovelace',
      },
      {
        id: expect.any(String) as string,
        slug: 'grace',
        name: 'Grace Hopper',
      },
    ]);
  });
});
