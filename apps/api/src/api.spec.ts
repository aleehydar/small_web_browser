import 'reflect-metadata';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { getConnectionToken, getModelToken, MongooseModule } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import { jest } from '@jest/globals';
import { Types, type Connection, type Model } from 'mongoose';
import request from 'supertest';
import { PeopleModule } from './people/people.module';
import { Person } from './people/person.schema';
import { Revision } from './sites/revision.schema';
import { Site } from './sites/site.schema';
import { SitesModule } from './sites/sites.module';

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

  beforeAll(async () => {
    assertTestUri(TEST_URI);
    const moduleRef = await Test.createTestingModule({
      imports: [
        MongooseModule.forRoot(TEST_URI, { serverSelectionTimeoutMS: 5000 }),
        PeopleModule,
        SitesModule,
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
