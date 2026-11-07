// Field Guide (导览): the shapes of a guide. Types only, no code, so both the
// server (pages, checks) and the browser (the program's scripts) can import
// them with `import type`.
//
// A guide is a folder in src/content/guides/<slug>/ (see docs/GUIDES.md):
//   guide.json · items.json · places.json · events.json · routes.json ·
//   listings.json · map.json
// Pictures and base maps are plain files in public/guides/<slug>/{img,map}/.
// Who may open which guide is in src/content/guides/access.json.
//
// Two languages: every text field `x` may have a Chinese twin `xZh`. Original
// names, addresses, titles, people and credits have no twin. A missing twin
// shows the English.
//
// Audiences: any item, place, event, day plan, route, text section, paragraph
// or list item may carry `"audience": "<id>"` (or a list of ids). It then
// appears only in the views of audiences that include that id (see
// AccessFile.audiences[].includes). Without it, everyone who may open the
// guide sees it.

export interface Bi { en: string; zh: string }

/** 'YYYY-MM-DD', a calendar date in the guide's own time zone. */
export type ISODate = string;
/** 'HH:MM', 24-hour clock, in the guide's own time zone. */
export type HHMM = string;
/** [longitude, latitude], WGS 84. */
export type LonLat = [number, number];
export type Weekday = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';
export type TierId = 'A' | 'B' | 'C';
/** What a place does on a public holiday of the guide. Default 'confirm'. */
export type HolidayPolicy = 'open' | 'closed' | 'confirm';
/** A one-day exception to the usual opening. */
export type Override = 'open' | 'closed' | 'appointment' | 'confirm';
/** Walk in, or by appointment only. Default 'walk-in'. */
export type Access = 'walk-in' | 'appointment';
export type RouteMode = 'walking' | 'transit';
/** An audience id from access.json, or several. */
export type AudienceTag = string | string[];

// ---------------------------------------------------------------------------
// Source files: what the owner edits.

/** src/content/guides/access.json */
export interface AccessFile {
  _comment?: string;
  /** Least privileged first. A password that matches several audiences opens the first. */
  audiences: AudienceRecord[];
  /** Guide slug → the audiences that may open it. */
  guides: Record<string, string[]>;
  /**
   * Guide slug → the area whose street-level tiles the Worker proxies for it,
   * [west, south, east, north] in degrees (usually the region view's area).
   * Content-free: no names, no places. Without it a guide has no tiles.
   */
  tiles?: Record<string, [number, number, number, number]>;
  /**
   * Old address → the guide's slug now ({ "paris-photo-days-2026": "paris-2026-11" }).
   * The Worker sends /guides/<old>/… there for good, and suggestions sent under
   * the old name still reach the guide (src/lib/guides/address.ts).
   */
  moved?: Record<string, string>;
}
export interface AudienceRecord {
  id: string;
  label: string;
  labelZh?: string;
  /** Name of the Cloudflare secret holding this audience's password (never the password). */
  secret: string;
  /** Audiences whose content this one also sees ("fotofilmic" includes "visitor"). */
  includes?: string[];
}

export interface Para { text: string; textZh?: string; audience?: AudienceTag }
export interface ListItem { lead?: string; leadZh?: string; text: string; textZh?: string; audience?: AudienceTag }
export interface TextSection {
  heading: string;
  headingZh?: string;
  paras?: Para[];
  items?: ListItem[];
  audience?: AudienceTag;
}

/** guide.json */
export interface GuideFile {
  _comment?: string;
  /** Full title, shown once the guide is open. */
  title: string;
  titleZh?: string;
  subtitle?: string;
  subtitleZh?: string;
  /** Neutral title and subtitle, shown before the password (the log-on box and its list of guides, the window title). */
  public: { title: string; titleZh?: string; subtitle?: string; subtitleZh?: string };
  /** Offered in the log-on box's list of guides (still locked). /guides opens the first listed guide, so an unlisted one opens only from its link. */
  listed: boolean;
  city: string;
  cityZh?: string;
  /** IANA time zone, e.g. "Europe/Paris". "Today" and day rules use it. */
  timezone: string;
  /** Shown to people: "Paris time (CET, UTC+1)". */
  timezoneLabel?: string;
  timezoneLabelZh?: string;
  /** When the facts were last checked. */
  checked: ISODate;
  /** The days the guide covers (day filter, Days view). Omit for a guide without dates. */
  window?: { start: ISODate; end: ISODate };
  /** The festival or occasion, if any. */
  event?: { name: string; nameZh?: string; start: ISODate; end: ISODate; url?: string };
  holidays?: { date: ISODate; name: string; nameZh?: string; notice?: string; noticeZh?: string }[];
  /** A, B, C: recommendation levels. `weight` drives the heat map. */
  tiers: { id: TierId; name: string; nameZh?: string; text?: string; textZh?: string; weight: number }[];
  themes: { id: string; name: string; nameZh?: string }[];
  zones: { id: string; name: string; nameZh?: string }[];
  /** Categories of listings.json records (`source` = the name used by the original source). */
  categories?: { id: string; source?: string; name: string; nameZh?: string }[];
  /** The nouns this guide uses in the interface. */
  labels: {
    item: string; itemZh?: string;          // "Exhibition"
    items: string; itemsZh?: string;        // "Exhibitions"
    subtitle?: string; subtitleZh?: string; // "Exhibition title"
    by?: string; byZh?: string;             // "Artist"
    listing?: string; listingZh?: string;   // "Official map entry"
    listings?: string; listingsZh?: string; // "Official map"
  };
  /** Page texts, in display order (section id → section). */
  texts: Record<string, TextSection>;
  links?: { label: string; labelZh?: string; url: string; audience?: AudienceTag }[];
  credits: { points?: string; pointsZh?: string; image?: string; imageZh?: string };
  map: {
    /** A place id or coordinates. If that place is hidden from an audience, the centre of the A-tier items is used. */
    centre: string | LonLat;
    /** Heat radius in metres. */
    heatRadius: number;
  };
  /**
   * Words the build guard looks for. `public`: never in any page or file
   * reachable without a password. `<audience id>`: only in the views of
   * audiences that include it.
   */
  sensitive: { public: string[]; [audience: string]: string[] };
  defaults?: { price?: string; priceZh?: string; listingNote?: string; listingNoteZh?: string };
}

/** items.json: the recommended places. */
export interface ItemsFile { _comment?: string; items: ItemRecord[] }
export interface ItemRecord {
  /** A1…A12, B1…, C1…: starts with its tier letter. */
  id: string;
  tier: TierId;
  name: string;
  /** ≤14 characters, for map labels. Default: the name, cut short. */
  short?: string;
  /** Paris: the exhibition title. */
  subtitle?: string;
  /** Paris: the artist(s). */
  by?: string;
  zone: string;
  themes: string[];
  why: string;
  whyZh?: string;
  address: string;
  hours?: string;
  hoursZh?: string;
  start?: ISODate;
  end?: ISODate;
  /** Weekdays it opens. Omit when it isn't known (no weekday rule). */
  open?: Weekday[];
  holiday?: HolidayPolicy;
  access?: Access;
  exceptions?: { date: ISODate; status: Override; note?: string; noteZh?: string }[];
  /** Time to allow, in minutes. */
  minutes?: number;
  price?: string;
  priceZh?: string;
  note?: string;
  noteZh?: string;
  /** The page this information came from. */
  sourceUrl?: string;
  links?: string[];
  /** The id of this place's record in listings.json, if any. */
  listing?: string;
  coordinates: LonLat;
  image?: { file: string; credit: string; caption?: string; alt?: string; altZh?: string };
  /** Label on the map at the opening zoom. Default: tier A. */
  label?: boolean;
  audience?: AudienceTag;
  /**
   * Suggested by someone using the guide, and published from the suggestions
   * queue (worker/publish.ts): the day, the name they asked to be credited
   * with, whether it is their own show, and the Notion page (`ref`, which
   * matches entries across runs and never reaches browsers).
   */
  suggested?: { on: ISODate; by?: string; own?: boolean; ref: string };
}

/** places.json: reference points (a workshop, a gallery, a meeting point). */
export interface PlacesFile { _comment?: string; places: PlaceRecord[] }
export interface PlaceRecord {
  /** One capital letter, also drawn on the map plate. */
  id: string;
  /** What it is: "Workshop", "Gallery", "Meet & greet". */
  label: string;
  labelZh?: string;
  name: string;
  /** ≤14 characters, for map labels. Default: the name, cut short. */
  short?: string;
  address: string;
  coordinates: LonLat;
  hours?: string;
  hoursZh?: string;
  note?: string;
  noteZh?: string;
  links?: string[];
  audience?: AudienceTag;
}

/** events.json */
export interface EventsFile { _comment?: string; events: EventRecord[]; days?: DayPlan[] }
export interface EventRecord {
  id: string;
  date: ISODate;
  /** Last day, for events over several days. */
  until?: ISODate;
  start?: HHMM;
  end?: HHMM;
  /** A place id or an item id. */
  place?: string;
  title: string;
  titleZh?: string;
  note?: string;
  noteZh?: string;
  optional?: boolean;
  audience?: AudienceTag;
}
export interface DayPlan { date: ISODate; plan: string; planZh?: string; audience?: AudienceTag }

/** routes.json */
export interface RoutesFile { _comment?: string; routes: RouteRecord[] }
export interface RouteRecord {
  id: string;
  name: string;
  nameZh?: string;
  /** "3 hours", "half day". */
  length?: string;
  lengthZh?: string;
  /** Item and place ids, in order. Stops hidden from an audience are dropped for it. */
  stops: string[];
  mode: RouteMode;
  duration?: string;
  durationZh?: string;
  when?: string;
  whenZh?: string;
  note?: string;
  noteZh?: string;
  audience?: AudienceTag;
}

/** listings.json: secondary records from an official source, in their own language. */
export interface ListingsFile {
  _comment?: string;
  source: { name: string; url?: string; checked: ISODate; lang: string; credit?: string };
  records: ListingRecord[];
}
export interface ListingRecord {
  id: string;
  name: string;
  category: string;
  coordinates: LonLat;
  /** The source's own text, lines separated by \n. */
  details: string;
  url?: string;
  /** Only where the source gives one clear date range. */
  start?: ISODate;
  end?: ISODate;
}

/** map.json: base maps (Web-Mercator image crops). */
export interface MapFile {
  _comment?: string;
  views: MapViewRecord[];
  /** Base-map credit, e.g. "© IGN 2026 · Géoplateforme / Plan IGN". */
  attribution: string;
}
export interface MapViewRecord {
  id: string;
  name: string;
  nameZh?: string;
  /** File in public/guides/<slug>/map/. */
  file: string;
  /** Web-Mercator zoom level of the image's pixels. */
  z: number;
  /** Global pixel position (at zoom z) of the image's top-left corner. */
  originX: number;
  originY: number;
  width: number;
  height: number;
}

// ---------------------------------------------------------------------------
// The view of one guide for one audience (src/lib/guides/load.ts).
// Everything hidden from the audience is already gone.

export interface DayRule {
  start?: ISODate;
  end?: ISODate;
  open?: Weekday[];
  holiday: HolidayPolicy;
  access: Access;
  exceptions: { date: ISODate; status: Override; note: Bi }[];
}

export interface Item extends DayRule {
  id: string;
  tier: TierId;
  name: string;
  short: string;
  subtitle: string;
  by: string;
  zone: string;
  themes: string[];
  why: Bi;
  address: string;
  hours: Bi;
  minutes?: number;
  price: Bi;
  note: Bi;
  sourceUrl?: string;
  links: string[];
  listing?: string;
  coordinates: LonLat;
  image?: { src: string; credit: string; caption: string; alt: Bi };
  label: boolean;
  /** Suggested by someone using the guide: `by` is "" unless they asked to be credited. */
  suggested?: { on: ISODate; by: string; own: boolean };
}

export interface Place {
  id: string;
  label: Bi;
  name: string;
  short: string;
  address: string;
  coordinates: LonLat;
  hours: Bi;
  note: Bi;
  links: string[];
}

export interface GuideEvent {
  id: string;
  date: ISODate;
  until?: ISODate;
  start?: HHMM;
  end?: HHMM;
  place?: string;
  title: Bi;
  note: Bi;
  optional: boolean;
}

export interface Route {
  id: string;
  name: Bi;
  length: Bi;
  stops: string[];
  mode: RouteMode;
  duration: Bi;
  when: Bi;
  note: Bi;
}

export interface Listing extends ListingRecord {
  /** The item that stands for this record, if any. */
  item?: string;
}

export interface MapView {
  id: string;
  name: Bi;
  /** URL of the image (behind the password). */
  src: string;
  z: number;
  originX: number;
  originY: number;
  width: number;
  height: number;
}

export interface Section { id: string; heading: Bi; paras: Bi[]; items: { lead: Bi; text: Bi }[] }

export interface GuideView {
  slug: string;
  audience: string;
  audienceLabel: Bi;
  title: Bi;
  subtitle: Bi;
  publicTitle: Bi;
  publicSubtitle: Bi;
  city: Bi;
  timezone: string;
  timezoneLabel: Bi;
  checked: ISODate;
  window?: { start: ISODate; end: ISODate; days: ISODate[] };
  event?: { name: Bi; start: ISODate; end: ISODate; url?: string };
  holidays: { date: ISODate; name: Bi; notice: Bi }[];
  tiers: { id: TierId; name: Bi; text: Bi; weight: number }[];
  themes: { id: string; name: Bi }[];
  zones: { id: string; name: Bi }[];
  categories: { id: string; name: Bi }[];
  labels: { item: Bi; items: Bi; subtitle: Bi; by: Bi; listing: Bi; listings: Bi };
  texts: Section[];
  links: { label: Bi; url: string }[];
  credits: { points: Bi; image: Bi; basemap: string };
  defaults: { price: Bi; listingNote: Bi };
  centre: LonLat;
  heatRadius: number;
  items: Item[];
  places: Place[];
  events: GuideEvent[];
  days: { date: ISODate; plan: Bi }[];
  routes: Route[];
  listings: { source: ListingsFile['source']; records: Listing[] };
  map: { views: MapView[]; attribution: string };
  /** Street-level tiles behind the password, when access.json declares bounds for the guide. */
  tiles?: TileSource;
}

/**
 * Where the browser gets street-level tiles: the Worker's proxy for this guide
 * ("/guides/<slug>/tiles/{z}/{x}/{y}.png") and the Web-Mercator zooms it serves.
 */
export interface TileSource { url: string; min: number; max: number }

/** A listed guide in the log-on box's list (no password needed: neutral only). */
export interface GuideCard {
  slug: string;
  publicTitle: Bi;
  publicSubtitle: Bi;
}

// ---------------------------------------------------------------------------
// What the browser gets: <script type="application/json" data-gd-data> inside
// the window body. Built from a GuideView, so it holds nothing hidden from the
// audience. Long texts stay in the server-rendered HTML.

export interface Payload {
  slug: string;
  audience: string;
  timezone: string;
  window?: { start: ISODate; end: ISODate; days: ISODate[] };
  holidays: { date: ISODate; name: Bi; notice: Bi }[];
  tiers: { id: TierId; name: Bi; weight: number }[];
  themes: { id: string; name: Bi }[];
  centre: LonLat;
  heatRadius: number;
  map: { views: MapView[] };
  /** Street-level tiles, when the guide has them (the map shows them once zoomed past the city picture's 1:1). */
  tiles?: TileSource;
  items: (DayRule & { id: string; tier: TierId; name: string; short: string; address: string; zone: string; themes: string[]; coordinates: LonLat; label: boolean; listing?: string })[];
  places: { id: string; label: Bi; name: string; short: string; address: string; coordinates: LonLat }[];
  listings: { id: string; name: string; category: string; coordinates: LonLat; start?: ISODate; end?: ISODate; item?: string }[];
  routes: { id: string; name: Bi; stops: string[]; mode: RouteMode }[];
  events: { id: string; date: ISODate; until?: ISODate; start?: HHMM; end?: HHMM; place?: string; title: Bi }[];
}

/** What dayStatus() says about one place on one day (src/lib/guides/core.ts). */
export type StatusCode = 'choose-day' | 'scheduled' | 'confirm' | 'appointment' | 'closed' | 'closed-weekday' | 'not-yet' | 'ended';
export interface DayStatus {
  code: StatusCode;
  /** Short words for a table cell: "Open", "Closed", "Appt"… */
  short: Bi;
  /** The full line: "Open as published (not live status)". */
  label: Bi;
  /** An extra note: the holiday's name, the exception's note. */
  note: Bi;
  /** Worth going on that day (not closed, ended or not yet open). */
  visitable: boolean;
  /** Counts in the heat map that day. */
  heat: boolean;
}
