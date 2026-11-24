import 'reflect-metadata';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import mongoose from 'mongoose';
import { Person, PersonSchema } from './people/person.schema';
import { extractText, sanitizeHtml } from './sanitize/sanitize';
import { Revision, RevisionSchema } from './sites/revision.schema';
import { Site, SiteSchema } from './sites/site.schema';
import {
  Visit,
  VisitSchema,
  type VisitVia,
} from './visits/visit.schema';

const PEOPLE = [
  { slug: 'mira', name: 'Mira Sol' },
  { slug: 'owen', name: 'Owen Pike' },
  { slug: 'lina', name: 'Lina Voss' },
  { slug: 'jules', name: 'Jules Hart' },
  { slug: 'ned', name: 'Ned Okonkwo' },
] as const;

const SITES: {
  address: string;
  author: (typeof PEOPLE)[number]['slug'];
  title: string;
  createdAt: string;
  paragraphs: string[];
}[] = [
  {
    address: 'tidepool.zz',
    author: 'mira',
    title: 'The Still Tide Pool',
    createdAt: '2026-05-02T10:00:00.000Z',
    paragraphs: [
      'An hour before the tide turns, the pool goes quiet enough to hear a limpet move. What looks like stillness is phosphorescence waiting on the next ripple, a pale green that gathers and then refuses to commit.',
      'Mira has been writing the pool down for three summers. The phosphorescence is not a glow you can carry home. It is a decision the water makes, and only while you are looking. She counts it the way other people count weather.',
      'From the flat rock you can see the <a href="lantern.zz">channel lantern</a> and, lower down, the <a href="kelp.zz">kelp beds</a> someone has started to number. A painted board points toward <a href="saltglass.zz">salt glass</a>. Nobody has ever published a page there.',
      'Salt dries in a white line along the rim. By afternoon the line is a map of how high the last tide was willing to go, and the phosphorescence has gone back into the ordinary green.',
    ],
  },
  {
    address: 'lantern.zz',
    author: 'mira',
    title: 'The Channel Lantern',
    createdAt: '2026-05-03T10:00:00.000Z',
    paragraphs: [
      'The lantern is a brass box on an iron stem, lit by whoever remembers, which is usually Mira on the nights she sleeps in the shed. It does not mark a harbor. It marks the one bend in the channel where a boat can still turn around.',
      'She trims the wick with a knife that used to live in the <a href="kelp.zz">survey kit</a>. The flame is small on purpose. A larger one would promise a port, and this coast does not have one, only the <a href="harbor.zz">moorings Owen keeps</a> an hour downwind.',
      'On clear nights the lantern draws moths and, less helpfully, people who thought the light was a window. She walks them back to the path and points them at the pool if they ask where the light came from.',
    ],
  },
  {
    address: 'kelp.zz',
    author: 'mira',
    title: 'Counting the Kelp',
    createdAt: '2026-05-04T10:00:00.000Z',
    paragraphs: [
      'The beds run in lanes, as if someone planted them, which nobody did. Mira counts stipes at low water and writes the number in a book that no longer closes. Last spring there were four hundred and twelve. This spring the same lane held three hundred and ninety.',
      'She does not call it a decline yet. One warm week will invent a number, and a storm will spend it. The count is a way of staying. The <a href="margin.zz">margin notes</a> are where she puts the days the method failed.',
      'If you came from the <a href="tidepool.zz">pool</a>, stay on the rockweed until the lane markers. The markers are stones, not signs, because signs walk off in a winter sea.',
    ],
  },
  {
    address: 'margin.zz',
    author: 'mira',
    title: 'Margin Notes',
    createdAt: '2026-05-05T10:00:00.000Z',
    paragraphs: [
      'The book swelled with damp until the margins were the only honest part. Mira writes there when the count will not sit still: a lane she skipped, a day the fog made every stipe look like two, a rumor that the beds go on past the point.',
      'Owen read a page once and said the notes were a harbor in pencil. She let him copy the ones about ropes. Those live now in the <a href="harbor.zz">mooring book</a>, which is drier and less true.',
      'Lina asked for the page about the unfinished coast, so there is a copy folded into the <a href="atlas.zz">atlas</a>. The original stays here, because a margin is not a place you file.',
    ],
  },
  {
    address: 'harbor.zz',
    author: 'owen',
    title: 'What the Harbor Keeps',
    createdAt: '2026-05-06T10:00:00.000Z',
    paragraphs: [
      'It is not a harbor so much as a pocket the wind dislikes. Owen keeps eleven moorings and a reputation for knowing which rope will fail this week. Salt gets into the fibers, then into the ledger, then into his cuffs.',
      'The salt here is not decorative. It eats the galvanizing off the shackles and leaves a bright scar. He rinses what he can and writes down what he cannot. The <a href="ledger.zz">cooperage ledger</a> is older than his tenancy and more accurate than his memory.',
      'Boats that need glass, which is a strange need and a common one, go to the <a href="glassworks.zz">annealing shed</a>. Boats that need a miracle are pointed at a board for <a href="saltglass.zz">salt glass</a>. He has never seen the place. He doubts the board has either.',
    ],
  },
  {
    address: 'ledger.zz',
    author: 'owen',
    title: 'The Cooperage Ledger',
    createdAt: '2026-05-07T10:00:00.000Z',
    paragraphs: [
      'The cooperage closed before Owen was born, and the ledger did not. It is a list of barrels that held water, then fish, then nails, then nothing. Each line names a barrel, a year, and the person who swore it was sound.',
      'He uses the blank leaves at the back for moorings, which would offend a cooper and does not offend him. A barrel and a mooring fail for the same reason: someone skipped the hoop. The cooperage itself is a stone floor and a smell of wet oak.',
      'When a barrel still has a use, it goes to the <a href="glassworks.zz">glassworks</a> as a stand, or onto the <a href="ferry.zz">ferry</a> as a seat. Lina prefers the seat. She says a barrel tells you the crossing will be dull, which is what you want from a crossing.',
    ],
  },
  {
    address: 'glassworks.zz',
    author: 'owen',
    title: 'Annealed',
    createdAt: '2026-05-08T10:00:00.000Z',
    paragraphs: [
      'The shed anneals small things: lamp chimneys, deck prisms, the occasional pane for a window that still believes in being square. Owen learned the cooling schedule from a card nailed above the kiln. The card is more confident than the kiln.',
      'Glass wants a long night and no drafts. He bars the door and leaves the <a href="lantern.zz">channel lantern</a> to someone else on those evenings. In the morning the piece is either whole or it is a lesson. Both get written down.',
      'Lina draws the broken ones. She says a crack is a coast. The drawings end up in the <a href="atlas.zz">atlas</a>, next to shores that were never finished because the tide edited them first.',
    ],
  },
  {
    address: 'atlas.zz',
    author: 'lina',
    title: 'Unfinished Coasts',
    createdAt: '2026-05-09T10:00:00.000Z',
    paragraphs: [
      'The atlas is a folder of coasts Lina could not bear to close. Some are copied from Mira’s margin. Some are the lip of a broken prism. None of them claim to be the whole shore.',
      'She likes a map that admits what it skipped. The <a href="nightwatch.zz">night watch</a> fills in the hours the drawings cannot: who passed the bar, which light was lit, whether the channel answered. A map without those hours is a picture of a wish.',
      'There is one note in Mira’s hand about phosphorescence, a word Lina will not pretend is hers. It belongs to the <a href="tidepool.zz">pool</a>. She only copies it so the folder remembers there is a light that does not stay on paper.',
    ],
  },
  {
    address: 'nightwatch.zz',
    author: 'lina',
    title: 'Night Watch on the Bar',
    createdAt: '2026-05-10T10:00:00.000Z',
    paragraphs: [
      'The bar is a shallow the charts apologize for. Lina sits the watch with a thermos and the folder, and writes who goes over while there is still water enough to be wrong confidently. Most nights the answer is nobody, which is also worth writing.',
      'She can see the lantern when Mira remembers it, and she can hear the ferry when Lina herself is not on it. Being in two places is the occupation. The <a href="ferry.zz">last ferry</a> is a theory until someone rings the bell.',
      'Anything that does not fit the watch goes into <a href="margin.zz">Mira’s margin</a> in the morning. Lina’s rule is that a night observation may be revised by daylight, but it may not be improved.',
    ],
  },
  {
    address: 'ferry.zz',
    author: 'lina',
    title: 'The Last Ferry Before Dark',
    createdAt: '2026-05-11T10:00:00.000Z',
    paragraphs: [
      'There is one ferry, and it is last because it is the only one. It crosses to the spit and back while the light holds. After that you walk, or you stay, and staying is how half the pages on this web got written.',
      'Salt crusts the bench. Owen calls that a design. Lina calls it a ticket that proves you sat down. From the bench you can still pick out the <a href="harbor.zz">moorings</a> and, if the haze is kind, the rock above the <a href="tidepool.zz">pool</a>.',
      'A timetable tacked to the shelter names a stop at <a href="northlight.zz">north light</a>. The stop has no landing and no page. People ask for it anyway. She tells them the truth, and then she tells them the time of the last real crossing.',
    ],
  },
];

const VISITS: {
  person: (typeof PEOPLE)[number]['slug'];
  address: string;
  via: VisitVia;
  at: string;
  clientNavId: string;
}[] = [
  { person: 'jules', address: 'tidepool.zz', via: 'typed', at: '2026-06-03T14:00:00.000Z', clientNavId: 'seed-jules-01' },
  { person: 'jules', address: 'lantern.zz', via: 'link', at: '2026-06-03T14:04:00.000Z', clientNavId: 'seed-jules-02' },
  { person: 'jules', address: 'kelp.zz', via: 'link', at: '2026-06-03T14:08:00.000Z', clientNavId: 'seed-jules-03' },
  { person: 'jules', address: 'margin.zz', via: 'link', at: '2026-06-03T14:12:00.000Z', clientNavId: 'seed-jules-04' },
  { person: 'jules', address: 'harbor.zz', via: 'link', at: '2026-06-03T14:16:00.000Z', clientNavId: 'seed-jules-05' },
  { person: 'jules', address: 'ledger.zz', via: 'link', at: '2026-06-03T14:20:00.000Z', clientNavId: 'seed-jules-06' },
  { person: 'jules', address: 'glassworks.zz', via: 'link', at: '2026-06-03T14:24:00.000Z', clientNavId: 'seed-jules-07' },
  { person: 'jules', address: 'atlas.zz', via: 'link', at: '2026-06-03T14:28:00.000Z', clientNavId: 'seed-jules-08' },
  { person: 'jules', address: 'nightwatch.zz', via: 'link', at: '2026-06-03T14:32:00.000Z', clientNavId: 'seed-jules-09' },
  { person: 'jules', address: 'ferry.zz', via: 'link', at: '2026-06-03T14:36:00.000Z', clientNavId: 'seed-jules-10' },
  { person: 'jules', address: 'tidepool.zz', via: 'link', at: '2026-06-03T14:42:00.000Z', clientNavId: 'seed-jules-11' },
  { person: 'jules', address: 'glassworks.zz', via: 'search', at: '2026-06-03T14:48:00.000Z', clientNavId: 'seed-jules-12' },
  { person: 'jules', address: 'lantern.zz', via: 'history', at: '2026-06-03T14:55:00.000Z', clientNavId: 'seed-jules-13' },
  { person: 'ned', address: 'harbor.zz', via: 'typed', at: '2026-06-03T14:06:00.000Z', clientNavId: 'seed-ned-01' },
  { person: 'ned', address: 'ledger.zz', via: 'link', at: '2026-06-03T14:18:00.000Z', clientNavId: 'seed-ned-02' },
  { person: 'ned', address: 'harbor.zz', via: 'link', at: '2026-06-03T14:46:00.000Z', clientNavId: 'seed-ned-03' },
  { person: 'mira', address: 'tidepool.zz', via: 'typed', at: '2026-06-03T14:10:00.000Z', clientNavId: 'seed-mira-01' },
  { person: 'mira', address: 'margin.zz', via: 'link', at: '2026-06-03T14:26:00.000Z', clientNavId: 'seed-mira-02' },
  { person: 'mira', address: 'kelp.zz', via: 'link', at: '2026-06-03T14:52:00.000Z', clientNavId: 'seed-mira-03' },
  { person: 'owen', address: 'glassworks.zz', via: 'typed', at: '2026-06-03T14:14:00.000Z', clientNavId: 'seed-owen-01' },
  { person: 'owen', address: 'ledger.zz', via: 'link', at: '2026-06-03T14:34:00.000Z', clientNavId: 'seed-owen-02' },
  { person: 'lina', address: 'atlas.zz', via: 'typed', at: '2026-06-03T14:22:00.000Z', clientNavId: 'seed-lina-01' },
  { person: 'lina', address: 'ferry.zz', via: 'link', at: '2026-06-03T14:38:00.000Z', clientNavId: 'seed-lina-02' },
  { person: 'lina', address: 'nightwatch.zz', via: 'search', at: '2026-06-03T14:58:00.000Z', clientNavId: 'seed-lina-03' },
];

function mongoUri(): string {
  if (process.env.MONGO_URI !== undefined && process.env.MONGO_URI !== '') {
    return process.env.MONGO_URI;
  }
  const envPath = join(__dirname, '..', '..', '..', '.env');
  const text = readFileSync(envPath, 'utf8');
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.startsWith('MONGO_URI=')) {
      return trimmed.slice('MONGO_URI='.length).trim();
    }
  }
  throw new Error('MONGO_URI is not set');
}

function pageHtml(paragraphs: string[]): string {
  return paragraphs.map((paragraph) => `<p>${paragraph}</p>`).join('');
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

async function main(): Promise<void> {
  await mongoose.connect(mongoUri());
  const people = mongoose.model(Person.name, PersonSchema);
  const sites = mongoose.model(Site.name, SiteSchema);
  const revisions = mongoose.model(Revision.name, RevisionSchema);
  const visits = mongoose.model(Visit.name, VisitSchema);
  await Promise.all([
    people.createIndexes(),
    sites.createIndexes(),
    revisions.createIndexes(),
    visits.createIndexes(),
  ]);

  const personIds = new Map<string, mongoose.Types.ObjectId>();
  for (const person of PEOPLE) {
    const saved = await people
      .findOneAndUpdate(
        { slug: person.slug },
        { $set: { name: person.name }, $setOnInsert: { slug: person.slug } },
        { upsert: true, returnDocument: 'after' },
      )
      .exec();
    if (saved === null) {
      throw new Error(`could not save ${person.slug}`);
    }
    personIds.set(person.slug, saved._id);
  }

  let newSites = 0;
  for (const site of SITES) {
    const authorId = personIds.get(site.author);
    if (authorId === undefined) {
      throw new Error(`missing author ${site.author}`);
    }
    // An address that already exists is left alone, including one republished in the browser.
    const existing = await sites.findOne({ address: site.address }).exec();
    if (existing !== null) {
      continue;
    }
    const html = sanitizeHtml(pageHtml(site.paragraphs));
    const text = extractText(html);
    if (text === '') {
      throw new Error(`${site.address} sanitized to empty text`);
    }
    const createdAt = new Date(site.createdAt);
    const created = await sites.create({
      address: site.address,
      authorId,
      currentRevisionId: null,
      currentNumber: 0,
      title: site.title,
      text,
      createdAt,
    });
    const revision = await revisions.create({
      siteId: created._id,
      address: site.address,
      number: 1,
      title: site.title,
      html,
      text,
      authorId,
      createdAt,
    });
    await sites
      .updateOne(
        { _id: created._id },
        {
          $set: {
            currentRevisionId: revision._id,
            currentNumber: revision.number,
          },
        },
      )
      .exec();
    newSites += 1;
  }

  let newVisits = 0;
  for (const visit of VISITS) {
    const personId = personIds.get(visit.person);
    if (personId === undefined) {
      throw new Error(`missing person ${visit.person}`);
    }
    const site = await sites.findOne({ address: visit.address }).exec();
    if (site === null || site.currentRevisionId === null) {
      throw new Error(`missing site ${visit.address}`);
    }
    const revision = await revisions.findById(site.currentRevisionId).exec();
    if (revision === null) {
      throw new Error(`missing revision ${visit.address}`);
    }
    try {
      await visits.create({
        personId,
        address: revision.address,
        revisionId: revision._id,
        title: revision.title,
        via: visit.via,
        clientNavId: visit.clientNavId,
        at: new Date(visit.at),
      });
      newVisits += 1;
    } catch (error) {
      if (!isDuplicateKey(error)) {
        throw error;
      }
    }
  }

  console.log(
    `people ${PEOPLE.length}, sites ${newSites} new, visits ${newVisits} new`,
  );
}

void (async () => {
  try {
    await main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
})();
